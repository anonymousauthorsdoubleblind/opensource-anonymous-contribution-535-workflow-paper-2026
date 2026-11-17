# @title 12. Actions, validator (bounds, plausibility, evidence gate), probation and rollback
ACTION_RISK = {"CONTINUE": "none", "SET_PARAMS": "low", "RESET_LBFGS_MEMORY": "low", "TIGHTEN_SCF": "low",
               "END_PASS_AND_ESCALATE": "medium", "STOP_AND_FLAG": "medium", "DISPLACE_ALONG_MODE": "high", "SWITCH_BASIN": "high"}
OPTIMIZERS = {None, "lbfgs", "lbfgs_mem20", "surrogate_bfgs"}
SWITCH_MARGIN_MEV = 43.0     # 1 kcal/mol: a DFT referee must prefer another basin by at least this much

def max_conv_tol(fmax):
    return 1e-4 if fmax >= 0.08 else 1e-5 if fmax >= 0.03 else 1e-6

def is_last_pass(s): return s.p >= len(s.schedule) - 1

def validate(s, dec, event):
    """-> (status, cleaned_decision, notes). status: accepted | clipped | rejected. Nothing reaches the optimizer unvalidated."""
    notes = []; a = (dec or {}).get("action"); p = dict((dec or {}).get("params") or {}); ev = list((dec or {}).get("evidence") or [])
    if a not in ACTION_RISK: return "rejected", None, [f"unknown action {a!r}"]
    cfg = s.cfg; last = is_last_pass(s)
    if a in ("SET_PARAMS", "RESET_LBFGS_MEMORY", "TIGHTEN_SCF"):
        out = {}
        if "maxstep" in p:
            hi = min(0.05, max(2 * cfg.maxstep, 0.02))          # at most double the current cap per decision (never above 0.05)
            v = float(np.clip(float(p["maxstep"]), 0.001, hi));  notes += [f"maxstep clipped to {v:.4f}"] if abs(v - float(p["maxstep"])) > 1e-12 else []; out["maxstep"] = v
        if "fmax" in p:
            v = float(np.clip(float(p["fmax"]), 0.005, min(0.5, 2 * cfg.fmax)))   # may loosen the target at most 2x per decision
            if last: v = min(v, ENDPOINT_FMAX)
            notes += [f"fmax set to {v}"] if abs(v - float(p["fmax"])) > 1e-12 else []; out["fmax"] = v
        if "steps" in p:
            rem = max(0, GRADIENT_BUDGET_PER_RUN - s.gradients); v = int(max(0, min(int(p["steps"]), rem)))
            if last and v == 0: v = 1; notes.append("the final pass cannot be skipped")
            notes += [f"steps set to {v}"] if v != int(p["steps"]) else []; out["steps"] = v
        fm = out.get("fmax", cfg.fmax); ct_req = float(p.get("conv_tol", cfg.conv_tol)); ct = min(ct_req, max_conv_tol(fm))
        if last: ct = min(ct, 1e-6)
        if ct != cfg.conv_tol or "conv_tol" in p: out["conv_tol"] = ct
        if ct != ct_req: notes.append(f"conv_tol tightened to {ct:.0e} to match fmax {fm}")
        if "grid_level" in p: out["grid_level"] = int(np.clip(int(p["grid_level"]), 3, 4))
        if p.get("optimizer") not in OPTIMIZERS: return "rejected", None, [f"unknown optimizer {p.get('optimizer')!r}"]
        if p.get("optimizer") == "surrogate_bfgs": notes.append("optimizer surrogate_bfgs dropped: not validated on DFT forces"); p["optimizer"] = None
        if p.get("optimizer"): out["optimizer"] = p["optimizer"]
        if a == "TIGHTEN_SCF" and "conv_tol" not in out: out["conv_tol"] = max(cfg.conv_tol * 0.1, 1e-9)
        clean = dict(dec, params=out)
        return ("clipped" if notes else "accepted"), clean, notes
    if a == "END_PASS_AND_ESCALATE":
        fnow = s.pass_recs[-1]["fmax"] if s.pass_recs else None
        if last and (fnow is None or fnow > cfg.fmax): return "rejected", None, ["the final pass cannot be ended before its target is met"]
        if fnow is None or not (pass_features(s).get("plateau") or fnow <= 2 * cfg.fmax): return "rejected", None, ["evidence gate: needs a plateau flag or fmax within 2x of the pass target"]
        return "accepted", dec, notes
    if a == "DISPLACE_ALONG_MODE":
        pid = p.get("preview_id"); x1 = s.pending_geoms.get(pid)
        if x1 is None: return "rejected", None, ["no such preview_id: call preview_displacement first"]
        if not (np.linalg.norm(x1 - s.atoms.positions, axis=1).max() <= 0.3 and min_pair_distance(x1) >= 0.7 and same_bond_graph(x1)):
            return "rejected", None, ["physical plausibility: shift <= 0.3 A, no pair < 0.7 A, bond graph unchanged"]
        neg = bool(s.final_curv and s.final_curv["any_negative"]); locked = plane_rms(s.atoms.positions) < 1e-3
        if not (neg or locked): return "rejected", None, ["evidence gate: needs negative curvature from the soft-mode probe, or an exactly planar (symmetry-locked) geometry"]
        return "accepted", dec, notes
    if a == "SWITCH_BASIN":
        bid = p.get("basin_id")
        if s.basins is None or bid is None or not (0 <= int(bid) < len(s.basins)): return "rejected", None, ["unknown basin_id"]
        b = s.basins[int(bid)]; cur = s.basins[s.current_basin or 0]
        if "dft_E_eV" not in b or "dft_E_eV" not in cur: return "rejected", None, ["evidence gate: needs DFT single points on both basins (run_dft_probe single_point)"]
        if 1000 * (cur["dft_E_eV"] - b["dft_E_eV"]) < SWITCH_MARGIN_MEV: return "rejected", None, [f"evidence gate: DFT must prefer the new basin by >= {SWITCH_MARGIN_MEV} meV"]
        return "accepted", dec, notes
    return "accepted", dec, notes     # CONTINUE, STOP_AND_FLAG

def checkpoint(s):
    return dict(pos=s.atoms.positions.copy(), E=float(s.atoms.get_potential_energy()), fmax=fmax_of(s.forces), cfg=replace(s.cfg),
                optimizer_kind=s.optimizer_kind, memory=s.memory, step=s.step_total)

def apply_action(s, eng, dec):
    """Executes a VALIDATED decision. eng is the StepEngine (None before a pass has started)."""
    a, p = dec["action"], dec.get("params") or {}; cfg = s.cfg; rebuild = False; new_calc = False
    if a in ("SET_PARAMS", "RESET_LBFGS_MEMORY", "TIGHTEN_SCF"):
        for k in ("fmax", "steps"):
            if k in p: setattr(cfg, k, p[k])
        for k in ("conv_tol", "grid_level"):
            if k in p and p[k] != getattr(cfg, k): setattr(cfg, k, p[k]); new_calc = True
        if "maxstep" in p: cfg.maxstep = float(p["maxstep"]); rebuild = rebuild or False
        if p.get("optimizer"):
            if p["optimizer"] == "lbfgs_mem20": s.optimizer_kind, s.memory = "lbfgs", max(s.memory, 20)
            else: s.optimizer_kind = p["optimizer"]
            rebuild = True
        if a == "RESET_LBFGS_MEMORY": rebuild = True
        if new_calc and s.atoms is not None: s.atoms.calc = s.new_calculator(cfg.basis, cfg.conv_tol, cfg.grid_level)
        if eng is not None:
            if rebuild: eng.build()
            elif "maxstep" in p: eng.set_maxstep(cfg.maxstep)
    elif a == "END_PASS_AND_ESCALATE": s.end_pass = True
    elif a == "DISPLACE_ALONG_MODE":
        s.atoms.set_positions(s.pending_geoms[p["preview_id"]]); s.rerun_last_pass = True
        if eng is not None: eng.build()
    elif a == "SWITCH_BASIN":
        s.atoms.set_positions(s.basins[int(p["basin_id"])]["pos"]); s.current_basin = s.target_basin = int(p["basin_id"]); s.switched_basin = True
        if eng is not None: eng.build()
    elif a == "STOP_AND_FLAG": s.stop_flag = (dec.get("rationale") or "agent requested stop")

def rollback(s, eng, ck):
    s.atoms.set_positions(ck["pos"]); s.optimizer_kind, s.memory = ck["optimizer_kind"], ck["memory"]
    tol_changed = (ck["cfg"].conv_tol, ck["cfg"].grid_level) != (s.cfg.conv_tol, s.cfg.grid_level)
    for k in ("maxstep", "steps", "fmax", "conv_tol", "grid_level"): setattr(s.cfg, k, getattr(ck["cfg"], k))
    if tol_changed: s.atoms.calc = s.new_calculator(s.cfg.basis, s.cfg.conv_tol, s.cfg.grid_level)
    eng.build()
print("Validator and action machinery ready.")
