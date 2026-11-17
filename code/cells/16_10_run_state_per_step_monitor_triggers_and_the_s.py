# @title 10. Run state, per-step monitor, triggers, and the step_advisor function (all plain code, zero cost)
import numpy as np

class RunState:
    """Everything the orchestrator, the monitor and the six functions share for ONE run."""
    def __init__(self, arm, start, schedule, logger):
        self.arm, self.start, self.spec = arm, start, ARM_SPEC[arm]
        self.schedule = [replace(s) for s in schedule]          # mutable copy: agent actions edit this
        self.baseline_schedule = [replace(s) for s in schedule] # what the baseline would have used
        self.logger = logger
        self.atoms = None; self.calcs = []; self.p = 0; self.cfg = None
        self.recs, self.pass_recs = [], []
        self.step_total = 0
        self.optimizer_kind, self.memory = "lbfgs", self.spec["memory"]
        self.agent_enabled = self.spec["agent"] is not None
        self.agent_calls = 0; self.degraded_calls = 0; self.strikes = 0
        self.actions = []                                        # every proposed action and its fate
        self.cooldown = 0; self.probation = None
        self.basins = None; self.modes = None; self.current_basin = None; self.target_basin = None
        self.switched_basin = False
        self.surr_H = None; self.surr_pre = None
        self.final_curv = None; self.pending_geoms = {}; self.probe_cache = {}
        self.sec_per_grad = None; self.t_last_step = None
        self.event_name = None; self.api_log = []
        self.t_opt_end = None; self.eval_gradients = 0
        self.last_trigger = None; self.end_pass = False; self.rerun_last_pass = False; self.stop_flag = None; self.engine = None
        self.agent_errors = 0; self.max_agent_calls = 25; self.quiet = {}

    @property
    def gradients(self): return int(sum(c.n_gradients for c in self.calcs))
    @property
    def scf_total(self): return int(sum(c.n_scf for c in self.calcs))
    @property
    def forces(self): return self.atoms.get_forces()
    @property
    def target_fmax(self): return self.cfg.fmax
    def new_calculator(self, basis, conv_tol, grid_level=3):
        c = make_calculator(basis, conv_tol, grid_level, warm_start=(WARM_START and self.spec["warm"]))
        self.calcs.append(c); return c

def scf_noise_eV(cfg): return max(cfg.conv_tol * HARTREE_TO_EV, 1e-9)

def pass_features(state):
    """Trajectory features of the current pass (5-step window), computed after every step."""
    R, cfg = state.pass_recs, state.cfg; n = len(R); f = [r["fmax"] for r in R]
    out = dict(steps_in_pass=n, fmax_now=f[-1] if n else None, fmax_target=cfg.fmax, maxstep=cfg.maxstep)
    if n >= 2:
        ratios = [f[i] / f[i - 1] for i in range(max(1, n - 5), n) if f[i - 1] > 0]
        out["decay_per_step"] = float(np.exp(np.mean(np.log(ratios))))
        out["uphill_fmax_last4"] = int(sum(f[i] > f[i - 1] for i in range(max(1, n - 4), n)))
        out["oscillation_index"] = out["uphill_fmax_last4"] / min(4, n - 1)
        out["dE_last_eV"] = R[-1]["dE"]
    if n >= 1:
        out["cap_saturation"] = float(np.mean([r["move"] >= 0.95 * r["maxstep"] for r in R[-5:]]))
    out["plateau"] = bool(n >= 6 and f[-1] / f[-6] > 0.9 and f[-1] > cfg.fmax)
    out["energy_falling_last5"] = int(sum(r["dE"] < 0 for r in R[-5:]))       # steps (of the last 5) that lowered the energy
    out["dE_mean_last5_over_noise"] = round(float(np.mean([abs(r["dE"]) for r in R[-5:]])) / scf_noise_eV(cfg), 1) if n else None
    out["scf_converged_last"] = R[-1]["scf_converged"] if n else None
    return out

def detect_trigger(state):
    """-> trigger name or None. Cheap, runs every step. No trigger before 6 steps in a pass (except an SCF failure).
    A condition the agent has just looked at (and answered CONTINUE, or acted on) stays quiet for a while (state.quiet)."""
    R, cfg = state.pass_recs, state.cfg; n = len(R)
    if n == 0: return None
    if not R[-1]["scf_converged"]: return "scf_not_converged"
    if n < 6: return None
    ft = pass_features(state); noise = scf_noise_eV(cfg); found = []
    if R[-1]["dE"] > max(5 * noise, 1e-3): found.append("uphill_step")
    falling = AGENT_VERSION == "v2" and ft.get("energy_falling_last5", 0) >= min(5, n) and (ft.get("dE_mean_last5_over_noise") or 0) > 5
    if ft.get("uphill_fmax_last4", 0) >= 3 and not falling: found.append("oscillation")       # v2: fmax wobbling while the energy keeps falling is not oscillation
    ks = [r["ratio"] for r in R[-2:] if r.get("ratio") is not None]
    if len(ks) == 2 and (np.median(ks) < 0.25 or np.median(ks) > 2.0): found.append("curvature_mismatch")
    if ft["plateau"] and not falling: found.append("plateau")
    if ft.get("cap_saturation", 0) >= 1.0 and R[-1]["fmax"] > 3 * cfg.fmax: found.append("steps_pinned_at_cap")
    for name in found:
        if state.quiet.get(name, 0) <= state.step_total: return name
    return None

def step_advisor(state, candidate=None):
    """Deterministic advice from the measured curvature. Free (no DFT). Returns suggested settings plus a forecast."""
    cfg, R = state.cfg, state.pass_recs
    ms = float((candidate or {}).get("maxstep", cfg.maxstep)); F = state.forces
    valid = [r for r in R[-6:] if r.get("k_meas") is not None and r.get("k_assumed", 0) > 0]
    reasons, conf = [], "ok"
    if len(valid) < 3: conf = "low"; reasons.append("fewer than 3 usable steps")
    if valid:
        k_meas = float(np.median([r["k_meas"] for r in valid[-3:]])); k_ass = float(np.median([r["k_assumed"] for r in valid[-3:]]))
        ratio = float(np.median([r["ratio"] for r in valid[-3:]]))
    else:
        k_meas = k_ass = ratio = None
        if state.surr_H is not None:
            fv = F.reshape(-1); k_meas = float(fv @ state.surr_H @ fv / (fv @ fv)); reasons.append("curvature from the surrogate Hessian")
    k_eff = float(np.clip(k_meas if k_meas is not None else 30.0, 0.2, 80.0))
    D90 = float(np.percentile(np.linalg.norm(F, axis=1) / k_eff, 90))
    cap = float(np.mean([r["move"] >= 0.95 * r["maxstep"] for r in R[-5:]])) if R else 0.0
    last2 = R[-2:]
    pred_bad = len(last2) == 2 and all(r.get("pred_dE") and r["pred_dE"] < 0 and r["dE"] > 0.25 * r["pred_dE"] for r in last2)
    noise_ratio = float(np.median([abs(r["dE"]) for r in R[-3:]]) / scf_noise_eV(cfg)) if len(R) >= 3 else None
    if ratio is not None and not (0.3 <= ratio <= 3): conf = "low"; reasons.append("curvature ratio outside 0.3-3")
    if noise_ratio is not None and noise_ratio < 5: conf = "low"; reasons.append("energy changes are near the SCF noise")
    falling5 = bool(R) and sum(r["dE"] < 0 for r in R[-5:]) >= min(5, len(R)) and (noise_ratio or 0) > 5
    rec = dict(action="keep", maxstep=ms, reset_memory=False, optimizer=None, tighten_conv_tol=False, reason="settings look appropriate")
    if (ratio is not None and ratio > 2) or pred_bad:
        rec.update(action="shrink_step", maxstep=max(0.002, ms / 2), reset_memory=True, reason="steps overshoot the measured curvature (ratio>2 or energy drop under a quarter of predicted)")
    elif cap >= 0.6 and ratio is not None and 0.5 <= ratio <= 2:
        new = min(0.05, 1.5 * D90, 2 * ms)
        if new > 1.05 * ms: rec.update(action="raise_cap", maxstep=new, reason=f"{cap:.0%} of recent steps sit at the cap and the curvature model is right (ratio {ratio:.2f})")
    elif AGENT_VERSION == "v2" and cap >= 0.6 and falling5 and ms < 0.05 and R[-1]["fmax"] > 5 * cfg.fmax:
        new = min(0.05, 2 * ms, max(1.5 * D90, 1.2 * ms))
        rec.update(action="raise_cap", maxstep=new, reason="steps sit at the cap, the energy fell on every recent step and fmax is far above target: the step cap is too timid (raise again, probation checks it)")
    elif cap >= 0.6 and ratio is not None and ratio < 0.5:
        opt = "lbfgs_mem20" if state.memory < 10 else None      # surrogate_bfgs is not recommended: never validated on DFT forces
        rec.update(action="better_curvature_model", optimizer=opt, reason="steps are capped AND the optimizer's curvature is much too high (ratio<0.5): the model is the problem")
    elif noise_ratio is not None and noise_ratio < 5 and cfg.conv_tol > 1e-8 and R and R[-1]["fmax"] > cfg.fmax:
        rec.update(action="tighten_scf", tighten_conv_tol=True, reason="energy changes are within 5x of the SCF noise")
    fnow = R[-1]["fmax"] if R else float(np.linalg.norm(F, axis=1).max())
    decay = float(np.clip(pass_features(state).get("decay_per_step", 0.9), 0.5, 0.98)) if len(R) >= 2 else 0.9
    n_decay = np.log(max(cfg.fmax / fnow, 1e-9)) / np.log(decay) if fnow > cfg.fmax else 0.0
    steps_to_target = int(min(999, np.ceil(max(n_decay, D90 / max(rec["maxstep"], 1e-6)))))
    spg = state.sec_per_grad or 40.0
    return dict(computed_at_step=state.step_total, cap_saturation=round(cap, 2),
                k_assumed_eV_A2=None if k_ass is None else round(k_ass, 2), k_measured_eV_A2=None if k_meas is None else round(k_meas, 2),
                curvature_ratio=None if ratio is None else round(ratio, 2), D90_A=round(D90, 4),
                scf_noise_ratio=None if noise_ratio is None else round(noise_ratio, 1), recommendation=rec,
                forecast=dict(steps_to_target=steps_to_target, minutes=round(steps_to_target * spg / 60, 1)),
                confidence=conf, confidence_notes=reasons)

def pass_start_advice(state):
    """Recommended settings for the pass about to start (code-side evidence only): loose early passes, no over-converging in the
    first basin, step cap sized from the best curvature estimate available."""
    cfg, i = state.cfg, state.p
    adv = dict(maxstep=cfg.maxstep, steps=cfg.steps, fmax=cfg.fmax, conv_tol=cfg.conv_tol, notes=[])
    in_first_basis = cfg.basis == BASIS_PATH[0] and BASIS_PATH[0] != BASIS_PATH[1]
    last_pass = (i >= len(state.schedule) - 1)
    if in_first_basis and i == 0 and cfg.fmax < 0.1: adv["fmax"] = 0.1; adv["notes"].append("pass 1 only needs to remove the strain")
    if in_first_basis and i == 1 and cfg.fmax < 0.05: adv["fmax"] = 0.05; adv["notes"].append("converging harder in the cheaper basis is wasted: the target basis redoes it")
    if (not in_first_basis) and not last_pass and cfg.fmax < 3 * ENDPOINT_FMAX: adv["fmax"] = 3 * ENDPOINT_FMAX; adv["notes"].append("intermediate target-basis pass: the last pass sets the final accuracy")
    if last_pass: adv["fmax"] = min(cfg.fmax, ENDPOINT_FMAX)
    # curvature estimate: measured in the previous pass if there is one, otherwise the surrogate Hessian
    F = state.forces; prev = [r for r in state.recs[-6:] if r.get("k_meas")]
    if prev: k = float(np.clip(np.median([r["k_meas"] for r in prev[-3:]]), 0.2, 80)); src = "measured in the previous pass"
    elif state.surr_H is not None: fv = F.reshape(-1); k = float(np.clip(fv @ state.surr_H @ fv / (fv @ fv), 0.2, 80)); src = "surrogate Hessian"
    else: k, src = None, None
    if k:
        D90 = float(np.percentile(np.linalg.norm(F, axis=1) / k, 90))
        adv["maxstep"] = float(np.clip(1.5 * D90, 0.005, 0.05)); adv["notes"].append(f"step cap sized from D90 = {D90:.3f} A ({src})")
    adv["conv_tol"] = float(min(cfg.conv_tol, 1e-4 if adv["fmax"] >= 0.08 else 1e-5 if adv["fmax"] >= 0.03 else 1e-6))
    return adv

print("Monitor, triggers and step_advisor ready.")
