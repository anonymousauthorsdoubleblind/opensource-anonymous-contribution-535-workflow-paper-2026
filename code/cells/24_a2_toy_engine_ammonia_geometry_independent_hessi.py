# @title A2. Toy engine: ammonia geometry, independent Hessian referee, validator, supervisors, runner (from toy_bench.py)
import json, os, sys, time
import numpy as np
from ase import Atoms
from ase.build import molecule
from ase.optimize import LBFGS
CM1_PER_SQRT = 521.47          # sqrt(eV / (A^2 amu)) in cm^-1
FMAX_TARGET = 0.02             # eV/A, same threshold as the main study
NOISE_EV = 1e-5                # energy changes below this are treated as noise


def _j(o):
    return o.item() if hasattr(o, "item") else str(o)


# ----------------------------------------------------------------------------------------------- geometry and referee
def toy_fmax_of(forces):
    return float(np.sqrt((forces ** 2).sum(axis=1)).max())


def planar_nh3(r_nh=1.0106):
    ang = np.deg2rad([90, 210, 330])
    return Atoms("NH3", positions=[[0, 0, 0]] + [[r_nh * np.cos(a), r_nh * np.sin(a), 0.0] for a in ang])


def nudged(atoms, rms, seed):
    a = atoms.copy()
    if rms > 0:
        d = np.random.default_rng(seed).normal(size=a.positions.shape)
        d -= d.mean(axis=0)
        a.positions += d * rms / np.sqrt((d ** 2).sum(axis=1).mean())
    return a


def fd_hessian(atoms, calc, delta=0.01):
    """Cartesian Hessian (eV/A^2) from central differences of forces: 6N gradients."""
    a = atoms.copy(); a.calc = calc; n3 = 3 * len(a); H = np.zeros((n3, n3)); x0 = a.positions.copy()
    for i in range(n3):
        for s, sign in ((+1, 1), (-1, -1)):
            p = x0.copy().reshape(-1); p[i] += s * delta; a.positions = p.reshape(-1, 3)
            H[i] += -sign * a.get_forces().reshape(-1) / (2 * delta)
    a.positions = x0
    return 0.5 * (H + H.T)


def vib_modes(atoms, H):
    """Mass-weighted, translation/rotation-projected vibrational modes. Returns wavenumbers (cm^-1, negative = imaginary) and
    Cartesian displacement vectors (unit vectors in the plain Cartesian space)."""
    m = np.repeat(atoms.get_masses(), 3); sq = np.sqrt(m); Hmw = H / np.outer(sq, sq)
    pos = atoms.positions - atoms.get_center_of_mass(); n = len(atoms); basis = []
    for k in range(3):
        t = np.zeros((n, 3)); t[:, k] = 1; basis.append((t * np.sqrt(atoms.get_masses())[:, None]).reshape(-1))
    for k in range(3):
        axis = np.eye(3)[k]; r = np.cross(axis, pos); basis.append((r * np.sqrt(atoms.get_masses())[:, None]).reshape(-1))
    Q, R = np.linalg.qr(np.array(basis).T)
    keep = np.abs(np.diag(R)) > 1e-8; Q = Q[:, keep]
    P = np.eye(3 * n) - Q @ Q.T
    w, U = np.linalg.eigh(P @ Hmw @ P)
    # keep only eigenvectors that lie in the vibrational subspace (the projected-out rigid-body directions have zero overlap with it)
    comp = np.linalg.norm(P @ U, axis=0) > 0.5
    w, U = w[comp], U[:, comp]
    freq = np.sign(w) * np.sqrt(np.abs(w)) * CM1_PER_SQRT
    cart = U / sq[:, None]; cart /= np.linalg.norm(cart, axis=0)
    return freq, cart


def probe(atoms, calc):
    """Curvature probe / independent referee: finite-difference Hessian at the current geometry (6N gradients).
    Returns (evidence dict, wavenumbers, Cartesian mode vectors). Negative wavenumber = imaginary mode."""
    g0 = calc.n_gradients; H = fd_hessian(atoms, calc); freq, cart = vib_modes(atoms, H)
    return dict(lowest_cm1=float(freq.min()), is_minimum=bool(freq.min() > -50.0), n_vib=int(len(freq)), gradients=calc.n_gradients - g0), freq, cart


def referee(atoms, calc):
    return probe(atoms, calc)[0]


# ----------------------------------------------------------------------------------------------- supervisors
CAP_MIN, CAP_MAX, CAP_FACTOR = 1e-4, 0.5, 2.0


def toy_validate(action, cap, evidence):
    """Same guards for every supervisor (rules or LLM): bounded, evidence-gated. Returns (verdict, action, reasons)."""
    a = dict(action); kind = a.get("action", "CONTINUE"); why = []
    if kind == "CONTINUE": return "accepted", a, why
    if kind == "SET_PARAMS":
        new = float(a["maxstep"]); lo, hi = max(CAP_MIN, cap / CAP_FACTOR), min(CAP_MAX, cap * CAP_FACTOR)
        if not (lo <= new <= hi):
            clipped = float(np.clip(new, lo, hi)); a["maxstep"] = clipped; why.append(f"maxstep {new:.4g} clipped to {clipped:.4g}")
            return "clipped", a, why
        return "accepted", a, why
    if kind == "DISPLACE_ALONG_MODE":
        if evidence.get("lowest_cm1", 0.0) > -50.0:
            return "rejected", a, ["evidence gate: needs a negative curvature from the probe"]
        a["amplitude_A"] = float(np.clip(a.get("amplitude_A", 0.3), 0.02, 0.3)); return "accepted", a, why
    return "rejected", a, [f"unknown action {kind}"]


class RuleSupervisor:
    """Deterministic stand-in for the LLM: same observation, same actions. Used to show whether a simple rule already does the job."""
    name = "rules"
    def decide(self, f):
        if f["uphill_last5"] >= 2 or f["oscillation"]:
            return dict(action="SET_PARAMS", maxstep=f["cap"] / 2, reason="uphill/oscillating steps: halve the cap")
        if f["pinned_last5"] >= 4 and f["energy_falling_last5"] >= 4:
            return dict(action="SET_PARAMS", maxstep=f["cap"] * 2, reason="steps pinned at the cap while energy falls: double the cap")
        return dict(action="CONTINUE", reason="no trigger")
    def decide_final(self, evidence):
        if evidence["lowest_cm1"] < -50.0:
            return dict(action="DISPLACE_ALONG_MODE", amplitude_A=0.3, reason=f"imaginary mode {evidence['lowest_cm1']:.0f} cm-1 at a converged point")
        return dict(action="CONTINUE", reason="verified minimum")


class LLMSupervisor(RuleSupervisor):
    """Connect a model here. `ask(kind, payload)` must return a dict like the ones above (action + parameters + reason);
    kind is 'step' (payload = the features dict) or 'final' (payload = the curvature evidence). The harness applies the same
    validator and probation as for the rules, so a bad answer cannot do harm. Use the notebook's six-function agent or a plain
    JSON-mode call with the system prompt below."""
    name = "llm"
    SYSTEM_PROMPT = ("You supervise a running L-BFGS geometry optimization. Each call gives summary features of the last steps. "
                     "Allowed actions: CONTINUE; SET_PARAMS with maxstep (change by at most 2x); DISPLACE_ALONG_MODE only when the "
                     "curvature probe reports an imaginary mode. Cap too small: steps pinned at the cap while energy falls. Cap too big: "
                     "energy rises or alternates. Reply as JSON with action, parameters and a one-sentence reason.")
    def __init__(self, ask): self.ask = ask
    def decide(self, f): return self.ask("step", f)
    def decide_final(self, evidence): return self.ask("final", evidence)


# ----------------------------------------------------------------------------------------------- the runner
def make_opt(atoms, arm, cap, memory):
    return LBFGS(atoms, maxstep=cap, memory=memory, logfile=None, use_line_search=(arm == "linesearch"))


def features(rec, cap):
    last = rec[-5:]; dE = [r["dE"] for r in last if r["dE"] is not None]
    signs = np.sign([d for d in dE if abs(d) > NOISE_EV]); flips = int((signs[1:] != signs[:-1]).sum()) if len(signs) > 1 else 0
    return dict(cap=cap, steps=len(rec), fmax=rec[-1]["fmax"], pinned_last5=sum(r["max_move"] >= 0.95 * r["cap"] for r in last),
                uphill_last5=sum(d > NOISE_EV for d in dE), energy_falling_last5=sum(d < -NOISE_EV for d in dE),
                oscillation=bool(flips >= 3 and sum(d > NOISE_EV for d in dE) >= 1), dE_last=dE[-1] if dE else None)


def run_arm(start, arm, cap0, calc, supervisor=None, memory=20, budget=100, max_steps=400, log=print, final_check_always=False):
    atoms = start.copy(); atoms.calc = calc; calc.n_gradients = 0
    cap = cap0; dyn = make_opt(atoms, arm, cap, memory); rec, events = [], []
    probation = None; strikes = 0; cooldown = 0; sup_on = supervisor is not None; displaced = 0; verdict_end = "budget"
    prev_e = None
    for k in range(1, max_steps):
        fm = toy_fmax_of(atoms.get_forces()); e = atoms.get_potential_energy(); pos0 = atoms.positions.copy()
        rec.append(dict(step=k, energy=e, fmax=fm, cap=cap, grads=calc.n_gradients, dE=None if prev_e is None else e - prev_e, max_move=0.0))
        prev_e = e
        if fm < FMAX_TARGET:
            if (sup_on or (final_check_always and supervisor is not None)) and displaced < 2 and calc.n_gradients < budget + 60:
                ev, freq, cart = probe(atoms, calc); act = supervisor.decide_final(ev); v, act, why = toy_validate(act, cap, ev)
                events.append(dict(step=k, kind="final_check", evidence=ev, action=act, verdict=v, why=why))
                if act.get("action") == "DISPLACE_ALONG_MODE" and v == "accepted":
                    atoms.positions = atoms.positions + act["amplitude_A"] * cart[:, int(np.argmin(freq))].reshape(-1, 3)
                    dyn = make_opt(atoms, arm, cap, memory); displaced += 1; prev_e = None; probation = None; cooldown = 0; continue   # an earlier cap-change probation must not roll back the escape
            verdict_end = "converged"; break
        if calc.n_gradients >= budget: break
        if sup_on and probation is not None and k >= probation["until"]:
            ck = probation; worse = e > ck["energy"] + 1e-4 or fm > 1.5 * ck["fmax"]
            if worse:
                atoms.positions = ck["pos"].copy(); cap = ck["cap"]; dyn = make_opt(atoms, arm, cap, memory); strikes += 1; prev_e = None
                events.append(dict(step=k, kind="rollback", strikes=strikes))
                if strikes >= 2: sup_on = False; events.append(dict(step=k, kind="supervisor_off"))
            else: events.append(dict(step=k, kind="probation_kept"))
            probation = None
            if worse: continue
        if sup_on and cooldown <= 0 and probation is None and len(rec) >= 5:
            f = features(rec, cap); act = supervisor.decide(f); v, act, why = toy_validate(act, cap, {})
            events.append(dict(step=k, kind="decision", features={a: b for a, b in f.items()}, action=act, verdict=v, why=why))
            if act.get("action") == "SET_PARAMS" and v in ("accepted", "clipped") and abs(act["maxstep"] - cap) > 1e-12:
                probation = dict(until=k + 5, pos=pos0, cap=cap, energy=e, fmax=fm); cap = act["maxstep"]; dyn.maxstep = cap; cooldown = 5
        cooldown -= 1
        dyn.step(); rec[-1]["max_move"] = float(np.sqrt(((atoms.positions - pos0) ** 2).sum(axis=1)).max())
        log(f"   {arm:10s} step {k:3d}  E {e:.5f}  fmax {fm:.4f}  cap {cap:.4g}  grads {calc.n_gradients}")
    last = rec[-1]; grads = calc.n_gradients
    ref = referee(atoms, calc)
    ups = [r["dE"] for r in rec if r["dE"] is not None and r["dE"] > NOISE_EV]
    out = dict(arm=arm, cap0=cap0, memory=memory, outcome=verdict_end, steps=len(rec), gradients=grads, final_energy_eV=last["energy"], final_fmax=last["fmax"],
               pinned_frac=float(np.mean([r["max_move"] >= 0.95 * r["cap"] for r in rec[:-1]])) if len(rec) > 1 else 0.0,
               uphill_steps=len(ups), worst_rise_meV=1000 * max(ups) if ups else 0.0, referee=ref,
               n_decisions=sum(e["kind"] == "decision" for e in events), n_cap_changes=sum(e["kind"] == "decision" and e["action"].get("action") == "SET_PARAMS" and e["verdict"] != "rejected" for e in events),
               n_rollbacks=sum(e["kind"] == "rollback" for e in events), displaced=displaced,
               final_positions=atoms.positions.tolist(), start_positions=start.positions.tolist())
    return out, rec, events
