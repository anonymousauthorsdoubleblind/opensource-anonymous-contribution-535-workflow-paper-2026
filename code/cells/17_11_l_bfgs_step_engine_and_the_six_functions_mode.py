# @title 11. L-BFGS step engine and the six functions Gemini may call (+ per-event allow-lists, validator)
import time, copy
from ase.optimize import LBFGS, BFGS

KAPPA_TOL = 0.02          # eV/A^2: a measured curvature below -KAPPA_TOL along a soft mode means "not a minimum"

# ----------------------------------------------------------------------------------------------------------------
class StepEngine:
    """Thin wrapper over ASE's optimizer so the orchestrator can change the step cap, reset the memory, or swap in the
    surrogate-Hessian optimizer between steps without touching ASE internals."""
    def __init__(self, state):
        self.s = state; self.build()

    def build(self):
        s = self.s; cfg = s.cfg
        if s.optimizer_kind == "surrogate_bfgs":
            try:
                if s.surr_pre is None: s.surr_pre = surrogate_preconditioner(s.atoms.positions)
                self.dyn = BFGS(s.atoms, maxstep=cfg.maxstep, logfile=None); self.dyn.H0 = s.surr_pre.copy()
                return
            except Exception as e:
                print(f"   surrogate-Hessian optimizer unavailable ({type(e).__name__}); using L-BFGS memory 20 instead")
                s.optimizer_kind, s.memory = "lbfgs", max(s.memory, 20)
        self.dyn = LBFGS(s.atoms, maxstep=cfg.maxstep, memory=s.memory, logfile=None)

    def set_maxstep(self, ms): self.s.cfg.maxstep = float(ms); self.dyn.maxstep = float(ms)
    def reset_memory(self):    self.build()

    def take_step(self):
        s = self.s; a = s.atoms
        pos0 = a.positions.copy(); F0 = a.get_forces().copy(); E0 = float(a.get_potential_energy()); t0 = time.time()
        self.dyn.step()
        F1 = a.get_forces(); E1 = float(a.get_potential_energy())
        disp = a.positions - pos0; sv = disp.reshape(-1); ss = float(sv @ sv)
        k_ass = float(F0.reshape(-1) @ sv / ss) if ss > 0 else None
        k_meas = float((F0 - F1).reshape(-1) @ sv / ss) if ss > 0 else None
        wall = time.time() - t0
        s.sec_per_grad = wall if s.sec_per_grad is None else 0.7 * s.sec_per_grad + 0.3 * wall
        sc = getattr(a.calc, "last_scf", {}) or {}
        rec = dict(step=s.step_total + 1, pass_id=s.p + 1, step_in_pass=len(s.pass_recs) + 1, E=E1, dE=E1 - E0, fmax=fmax_of(F1),
                   move=float(np.linalg.norm(disp, axis=1).max()), maxstep=float(s.cfg.maxstep), k_assumed=k_ass, k_meas=k_meas,
                   ratio=(k_meas / k_ass) if (k_ass and k_ass > 0 and k_meas is not None) else None,
                   pred_dE=(-0.5 * float(F0.reshape(-1) @ sv)), scf_cycles=sc.get("cycles"), scf_converged=bool(sc.get("converged", True)),
                   wall_s=wall, warm_used=sc.get("warm_start_used"), pos=a.positions.copy())
        s.step_total += 1; s.recs.append(rec); s.pass_recs.append(rec)
        s.logger.grad = s.gradients; s.logger.scf = s.scf_total
        s.logger.step(rec["pass_id"], rec["step"], E1, rec["fmax"], rec["move"], rec["maxstep"], s.cfg.fmax, s.cfg.conv_tol, basis=s.cfg.basis,
                      scf_cycles=rec["scf_cycles"], positions=a.positions, dE_eV=rec["dE"], k_meas=k_meas, k_assumed=k_ass,
                      optimizer=s.optimizer_kind, memory=s.memory)
        return rec

# ----------------------------------------------------------------------------------------------------------------
# The six functions. Every function returns a small JSON-safe dict.
PROBE_KINDS = {"basin_choice": ["single_point"], "end_of_svp": ["basis_switch"], "final_check": ["soft_curvature", "scf_stability"]}
ALLOWED = {   # which functions each event may use (the model is only shown these)
    "basin_choice": ["get_evidence", "explore_surrogate", "run_dft_probe", "submit_action"],
    "pass_start":   ["get_evidence", "step_advisor", "submit_action"],
    "trigger":      ["get_evidence", "step_advisor", "preview_displacement", "submit_action"],
    "end_of_svp":   ["get_evidence", "step_advisor", "run_dft_probe", "submit_action"],
    "final_check":  ["get_evidence", "run_dft_probe", "preview_displacement", "submit_action"],
}
STRONG_EVENTS = {"basin_choice", "final_check"}   # high-stakes events go to the strongest model first

def _r(x, n=5):
    return None if x is None else round(float(x), n)

class Toolbox:
    def __init__(self, state, engine_ref):
        self.s, self.engine_ref = state, engine_ref; self.event = None; self.calls = []

    def call(self, name, args, event):
        self.event = event
        try:
            fn = getattr(self, "tool_" + name)
            out = fn(**{k: v for k, v in (args or {}).items()})
        except Exception as e:
            out = {"error": f"{type(e).__name__}: {str(e)[:200]}"}
        self.calls.append(name)
        self.s.logger.event("tool_call", self.s.p + 1, self.s.step_total, tool=name, args=_jsonable(args), result_keys=list(out)[:8], event=event)
        return out

    # 1 -----------------------------------------------------------------------------------------------------------
    def tool_get_evidence(self, topic="trajectory", window=10):
        s = self.s; window = int(min(max(window, 1), 40)); R = s.pass_recs[-window:]
        if topic == "trajectory":
            return dict(pass_id=s.p + 1, rows=[dict(step=r["step"], dE_eV=_r(r["dE"], 6), fmax=_r(r["fmax"]), move_A=_r(r["move"], 4)) for r in R])
        if topic == "step_diagnostics":
            return dict(rows=[dict(step=r["step"], k_assumed=_r(r["k_assumed"], 2), k_measured=_r(r["k_meas"], 2), ratio=_r(r["ratio"], 2), maxstep=_r(r["maxstep"], 4)) for r in R])
        if topic == "atom_forces":
            F = np.linalg.norm(s.forces, axis=1); order = np.argsort(-F)[:8]
            return dict(top_atoms=[dict(index=int(i), element=SYMBOLS[i], force=_r(F[i])) for i in order])
        if topic == "scf_health":
            return dict(rows=[dict(step=r["step"], converged=r["scf_converged"], cycles=r["scf_cycles"], warm_start_used=r.get("warm_used")) for r in R])
        if topic == "structure":
            return fingerprint(s.atoms.positions)
        if topic in ("basin", "basin_table"):
            return basin_summary(s)
        if topic == "run_log":
            return dict(actions=s.actions[-8:], strikes=s.strikes, agent_calls=s.agent_calls, gradients=s.gradients)
        return {"error": "unknown topic", "topics": ["trajectory", "step_diagnostics", "atom_forces", "scf_health", "structure", "basin_table", "run_log"]}

    # 2 -----------------------------------------------------------------------------------------------------------
    def tool_step_advisor(self, candidate_maxstep=None, candidate_steps=None):
        cand = {}
        if candidate_maxstep: cand["maxstep"] = candidate_maxstep
        s = self.s
        if not s.pass_recs:
            adv = pass_start_advice(s); return dict(kind="pass_start", suggested=adv)
        return step_advisor(s, cand or None)

    # 3 -----------------------------------------------------------------------------------------------------------
    def tool_run_dft_probe(self, kind="single_point", reason="", basin_ids=None):
        s = self.s
        if kind not in PROBE_KINDS.get(self.event, []): return {"error": f"probe '{kind}' is not allowed for event '{self.event}'", "allowed": PROBE_KINDS.get(self.event, [])}
        if not reason: return {"error": "a reason is required for a DFT probe"}
        g0, scf0, t0 = s.gradients, s.scf_total, time.time()
        if kind == "single_point": out = probe_single_points(s, basin_ids)
        elif kind == "basis_switch": out = probe_basis_switch(s)
        elif kind == "soft_curvature": out = probe_soft_curvature(s)
        else: out = dict(available=False, note="SCF stability analysis is not wired into this notebook; flag for a manual check if the gap is small.")
        out["cost"] = dict(gradients=s.gradients - g0, scf_calls=s.scf_total - scf0, seconds=round(time.time() - t0, 1))
        s.logger.grad = s.gradients; s.logger.event("probe", s.p + 1, s.step_total, probe=kind, reason=reason, result=_jsonable(out))
        return out

    # 4 -----------------------------------------------------------------------------------------------------------
    def tool_explore_surrogate(self, task="basins", mode=0, amplitude_A=0.1, seed=0):
        s = self.s
        if task == "basins":
            if s.basins is None: ensure_explored(s)
            return basin_summary(s)
        if task == "hessian":
            modes = s.modes or surrogate_modes(s.atoms.positions)[0]
            return dict(softest_modes=[dict(mode=i, curvature_eV_A2=_r(m["curvature_eV_A2"], 3), out_of_plane_share=_r(m["out_of_plane_share"], 2)) for i, m in enumerate(modes)])
        if task == "mode_scan":
            modes = s.modes or surrogate_modes(s.atoms.positions)[0]; v = modes[int(mode)]["vec"].reshape(-1, 3); x0 = s.atoms.positions
            amps = [-2, -1, 0, 1, 2]; e = [xtb_energy(x0 + a * amplitude_A * np.sqrt(N_ATOMS) * v) for a in amps]
            return dict(mode=int(mode), rms_amplitudes_A=[a * amplitude_A for a in amps], xtb_energy_eV_relative=[_r(x - e[2], 5) for x in e])
        return {"error": "unknown task", "tasks": ["basins", "mode_scan", "hessian"]}

    # 5 -----------------------------------------------------------------------------------------------------------
    def tool_preview_displacement(self, mode=0, amplitude_A=0.05, sign=1):
        s = self.s; modes = s.modes or surrogate_modes(s.atoms.positions)[0]; s.modes = modes
        v = modes[int(mode)]["vec"].reshape(-1, 3); x0 = s.atoms.positions
        x1 = x0 + (1 if sign >= 0 else -1) * amplitude_A * np.sqrt(N_ATOMS) * v          # amplitude = RMS displacement (A)
        pid = f"disp{len(s.pending_geoms)}"; s.pending_geoms[pid] = x1
        chk = dict(preview_id=pid, max_atom_shift_A=_r(np.linalg.norm(x1 - x0, axis=1).max(), 3), min_pair_distance_A=_r(min_pair_distance(x1), 3),
                   bond_graph_ok=same_bond_graph(x1), plane_rms_A=_r(plane_rms(x1), 4), xtb_energy_change_meV=_r(1000 * (xtb_energy(x1) - xtb_energy(x0)), 3))
        chk["passes_structure_check"] = bool(chk["bond_graph_ok"] and chk["max_atom_shift_A"] <= 0.3 and chk["min_pair_distance_A"] >= 0.7)
        return chk

def _jsonable(o):
    try: return json.loads(json.dumps(o, default=lambda x: float(x) if np.isscalar(x) else str(x)))
    except Exception: return str(o)[:300]

# ---- helpers behind the functions ------------------------------------------------------------------------------
def ensure_explored(s):
    t0 = time.time(); s.basins, s.modes = explore_basins(s.atoms.positions, seed=0)
    s.current_basin = 0 if s.basins else None; s.target_basin = s.current_basin
    s.logger.event("note", s.p + 1, s.step_total, note="surrogate exploration done", basins=len(s.basins), seconds=round(time.time() - t0, 1))
    print(f"   Explore: {len(s.basins)} distinct xTB basin(s) from {sum(b['n_seeds'] for b in s.basins)} seeds ({time.time()-t0:.0f}s); "
          + "; ".join(f"#{b['id']}: +{b['rel_xtb_meV']:.1f} meV, planarity {b['plane_rms_A']:.3f} A, {b['n_seeds']} seeds" for b in s.basins[:4]))

def basin_summary(s):
    if s.basins is None: return {"note": "run explore_surrogate(task='basins') first"}
    return dict(current_basin=s.current_basin, target_basin=s.target_basin, basins=[dict(id=b["id"], xtb_rel_meV=_r(b["rel_xtb_meV"], 2), plane_rms_A=_r(b["plane_rms_A"], 4),
                rmsd_to_planar_ref_A=_r(b["rmsd_to_ref_A"], 4), n_seeds=b["n_seeds"], dft_rel_meV=_r(b.get("dft_rel_meV"), 2)) for b in s.basins[:6]],
                geometry_now=dict(nearest_basin=nearest_basin(s), plane_rms_A=_r(plane_rms(s.atoms.positions), 4) if s.atoms is not None else None))

def nearest_basin(s):
    if not s.basins or s.atoms is None: return None
    d = [(rmsd_sym(b["pos"], s.atoms.positions), b["id"]) for b in s.basins]; d.sort()
    return dict(id=d[0][1], rmsd_A=_r(d[0][0], 3))

def probe_single_points(s, basin_ids=None):
    """DFT single-point energies (first basis) at the surrogate basin geometries: the DFT referee for close basins."""
    ensure_explored(s) if s.basins is None else None
    ids = list(dict.fromkeys(list(basin_ids or [b["id"] for b in s.basins[:3]]) + [s.current_basin])); calc = s.new_calculator(BASIS_PATH[0], 1e-6); res = []
    for i in ids:
        b = s.basins[int(i)]; a = Atoms(SYMBOLS, positions=b["pos"]); a.calc = calc
        b["dft_E_eV"] = float(a.get_potential_energy()); res.append(b)
    e0 = min(b["dft_E_eV"] for b in res)
    for b in res: b["dft_rel_meV"] = 1000 * (b["dft_E_eV"] - e0)
    best = min(res, key=lambda b: b["dft_E_eV"]); s.target_basin = best["id"]
    return dict(single_points=[dict(basin=b["id"], dft_rel_meV=_r(b["dft_rel_meV"], 2), xtb_rel_meV=_r(b["rel_xtb_meV"], 2)) for b in res],
                lowest_basin=best["id"], same_order_as_xtb=bool(best["id"] == s.basins[0]["id"]))

def probe_basis_switch(s):
    if BASIS_PATH[0] == BASIS_PATH[1]: return dict(available=False, note="both requirements use different bases only after pass 3")
    cfg_t = s.schedule[3]; a = s.atoms.copy(); calc = s.new_calculator(BASIS_PATH[1], cfg_t.conv_tol); a.calc = calc
    ft, fs = fmax_of(a.get_forces()), fmax_of(s.forces); r = ft / fs
    s.probe_cache["basis_switch"] = dict(pos=s.atoms.positions.copy(), calc=calc, atoms=a, conv_tol=cfg_t.conv_tol)
    sug = "skip_pass_3" if r >= 3 else ("finish_pass_3" if r < 1.5 else "cut_pass_3_to_forecast")
    return dict(fmax_first_basis=_r(fs), fmax_target_basis=_r(ft), ratio=_r(r, 2), suggestion=sug,
                note="ratio>=3: forces are dominated by the basis change, so more first-basis steps are wasted; <1.5: the bases agree")

def probe_soft_curvature(s, n_modes=3, delta=0.02):
    """Hessian-free minimum check: DFT gradient at x and at x + delta*v for each of the 3 softest xTB modes v.
    kappa = -(F(x+delta v) - F(x)).v / delta   (eV/A^2; negative = not a minimum along that mode). 4 gradients, conv_tol 1e-8."""
    pos = s.atoms.positions.copy(); modes, _ = surrogate_modes(pos, n_modes)
    calc = s.new_calculator(s.cfg.basis, 1e-8); a = Atoms(SYMBOLS, positions=pos); a.calc = calc; F0 = a.get_forces().copy()
    xa = xtb_atoms(pos); Fx0 = xa.get_forces().copy(); out = []
    for m in modes:
        v = m["vec"]; a.positions = pos + delta * v.reshape(-1, 3); dF = (a.get_forces() - F0).reshape(-1)
        xa.positions = pos + delta * v.reshape(-1, 3); dFx = (xa.get_forces() - Fx0).reshape(-1)
        kappa = float(-(dF @ v) / delta); cosine = float(dF @ dFx / (np.linalg.norm(dF) * np.linalg.norm(dFx) + 1e-30))
        out.append(dict(xtb_curvature_eV_A2=_r(m["curvature_eV_A2"], 3), kappa_dft_eV_A2=_r(kappa, 4), out_of_plane_share=_r(m["out_of_plane_share"], 2), force_change_cosine_with_xtb=_r(cosine, 2), negative=bool(kappa < -KAPPA_TOL)))
    s.modes = modes
    s.final_curv = dict(modes=out, any_negative=any(o["negative"] for o in out), at_step=s.step_total, vecs=[m["vec"] for m in modes], pos=pos)
    return dict(modes=out, any_negative=s.final_curv["any_negative"], note="verified along the 3 softest surrogate modes; this is not a frequency calculation")

print("Step engine and the six functions are defined.")
