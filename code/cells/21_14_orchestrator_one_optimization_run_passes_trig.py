# @title 14. Orchestrator: one optimization run (passes, triggers, agent calls, probation, rollback, evaluation, summary)
import traceback, shutil

def _fmt_min(sec): return f"{sec/60:.1f} min"

def make_controller(arm, pool):
    kind = ARM_SPEC[arm]["agent"]
    if kind is None: return NullController()
    if kind == "rules" or AGENT_MODE == "mock": return RuleController()
    return GeminiController(pool)

def call_agent(s, controller, tb, event):
    """One agent decision: ask -> validate -> return the cleaned decision (or None). Never raises."""
    if not s.agent_enabled or s.agent_calls >= s.max_agent_calls: return None
    s.agent_calls += 1; n = s.agent_calls; s.event_name = event; t0 = time.time()
    print(f"   [agent #{n}] event '{event}' at pass {s.p+1}, step {s.step_total} ... asking {controller.name}")
    try:
        dec = controller.decide(event, s, tb)
    except ApiExhausted as e:
        s.degraded_calls += 1
        s.logger.event("agent_call", s.p + 1, s.step_total, trigger=event, status="degraded", detail=str(e)[:300])
        print(f"   [agent #{n}] Gemini unavailable ({str(e)[:120]}). Continuing with CONTINUE; this run is flagged 'degraded' and will be re-run later.")
        return None
    except Exception as e:
        s.agent_errors += 1
        s.logger.event("agent_call", s.p + 1, s.step_total, trigger=event, status="error", detail=f"{type(e).__name__}: {str(e)[:300]}")
        print(f"   [agent #{n}] controller error {type(e).__name__}: {str(e)[:150]} -> CONTINUE")
        return None
    meta = dec.pop("_meta", {})
    s.logger.event("agent_call", s.p + 1, s.step_total, trigger=event, status="ok", controller=controller.name, decision=_jsonable(dec),
                   seconds=round(time.time() - t0, 1), **_jsonable(meta))
    status, clean, notes = validate(s, dec, event)
    s.logger.event("validator", s.p + 1, s.step_total, status=status, notes=notes, action=dec.get("action"), params=_jsonable(dec.get("params")))
    act = dict(n=n, step=s.step_total, pass_id=s.p + 1, event=event, action=dec.get("action"), params=_jsonable(dec.get("params")), status=status, rationale=dec.get("rationale", "")[:160])
    if status == "rejected":
        s.actions.append(dict(act, outcome="rejected")); print(f"   [agent #{n}] {dec.get('action')} REJECTED by the validator: {'; '.join(notes)}"); return None
    s.actions.append(dict(act, outcome="pending"))
    print(f"   [agent #{n}] proposes {clean['action']} {clean.get('params') or ''} ({status}). Why: {dec.get('rationale','')[:140]}")
    return clean

def resolve_probation(s, eng, force=False):
    pr = s.probation
    if pr is None or (s.step_total < pr["end"] and not force): return
    ck = pr["ck"]; E, f = s.pass_recs[-1]["E"], s.pass_recs[-1]["fmax"]
    ok = (E <= ck["E"] + max(5 * scf_noise_eV(s.cfg), 1e-4)) and (f <= 1.5 * ck["fmax"] + 1e-9)
    s.logger.event("probation", s.p + 1, s.step_total, outcome="kept" if ok else "rolled_back", action=pr["action"], E_change_eV=E - ck["E"], fmax_before=ck["fmax"], fmax_after=f,
                   start_gradients=pr["g0"], start_t_opt_s=pr["t0"])
    s.actions[pr["idx"]]["outcome"] = "kept" if ok else "rolled_back"; s.probation = None
    if ok: print(f"   probation passed for {pr['action']}: energy {E - ck['E']:+.4f} eV, fmax {ck['fmax']:.3f} -> {f:.3f}"); return
    s.strikes += 1; rollback(s, eng, ck); s.logger.event("rollback", s.p + 1, s.step_total, strikes=s.strikes, level=pr.get("level", "trigger"))
    if pr.get("level") == "pass": s.pass_recs = []; s.cooldown = COOLDOWN_STEPS
    print(f"   probation FAILED for {pr['action']} (energy {E - ck['E']:+.4f} eV): rolled back. Strike {s.strikes} of 2.")
    if s.strikes >= 2:
        s.agent_enabled = False
        for i in range(s.p, len(s.schedule)):
            for k in ("maxstep", "steps", "fmax", "conv_tol", "grid_level"): setattr(s.schedule[i], k, getattr(s.baseline_schedule[i], k))
        s.logger.event("note", s.p + 1, s.step_total, note="agent switched off after two rollbacks; baseline settings finish the run")
        print("   Two rollbacks: the agent is switched off for the rest of this run; the baseline settings finish it.")

def run_pass(s, controller, tb, label=""):
    cfg = s.cfg; i = s.p
    cache = s.probe_cache.get("basis_switch")
    if cache is not None and cfg.basis == BASIS_PATH[1] and np.allclose(cache["pos"], s.atoms.positions) and cache["conv_tol"] == cfg.conv_tol:
        s.atoms.calc = cache["calc"]; print("   reusing the basis-switch probe as step 0 of this pass (no gradient wasted)")
    else:
        s.atoms.calc = s.new_calculator(cfg.basis, cfg.conv_tol, cfg.grid_level)
    s.probe_cache.pop("basis_switch", None)
    s.pass_recs = []; s.cooldown = 0; s.probation = None; s.end_pass = False
    s.logger.event("pass_start", i + 1, s.step_total, settings=asdict(cfg), label=label)
    print(f"\n=== Pass {i+1}/{len(s.schedule)} {label}| {cfg.basis} | maxstep {cfg.maxstep:.4f} A | up to {cfg.steps} steps | stop at fmax {cfg.fmax:.3f} | conv_tol {cfg.conv_tol:.0e} ===")
    hard_reset_gpu_allocator_pool(verbose=False); dynamic_step_evacuation()
    eng = StepEngine(s); s.engine = eng; tb.engine_ref = eng
    pa = getattr(s, "pass_action", None); s.pass_action = None
    if pa is not None and cfg.steps > 0:
        # Pass-start / basis-switch decisions get the same probation as mid-pass ones. The reference energy and force come from THIS pass's own
        # calculator (same basis), so the comparison never crosses a basis switch. A failed probation restores the baseline settings and optimizer.
        ck = checkpoint(s); ck.update(cfg=pa["base_cfg"], optimizer_kind=pa["optimizer_kind"], memory=pa["memory"])
        s.probation = dict(end=s.step_total + min(PROBATION_STEPS, cfg.steps), ck=ck, action=pa["action"], idx=pa["idx"], g0=s.gradients,
                           t0=round(s.logger.t_opt(), 2), level="pass")
    while True:
        if s.stop_flag: break
        if len(s.pass_recs) >= cfg.steps: print(f"   pass budget of {cfg.steps} steps used"); break
        if s.gradients >= GRADIENT_BUDGET_PER_RUN: s.stop_flag = "gradient budget reached"; break
        f_now = fmax_of(s.atoms.get_forces())
        if f_now <= cfg.fmax: print(f"   fmax {f_now:.4f} is already below the pass target {cfg.fmax}"); break
        rec = eng.take_step()
        print(f"   pass {i+1} step {rec['step_in_pass']:3d} | E {rec['E']:.5f} eV (dE {rec['dE']:+.5f}) | fmax {rec['fmax']:.4f} (target {cfg.fmax}) | move {rec['move']:.4f}/{cfg.maxstep:.4f} A | "
              f"{s.gradients} gradients | {_fmt_min(s.logger.t_opt())}")
        dynamic_step_evacuation()
        s.cooldown = max(0, s.cooldown - 1)
        resolve_probation(s, eng)
        if rec["fmax"] <= cfg.fmax: print(f"   pass target reached (fmax {rec['fmax']:.4f})"); break
        if s.agent_enabled and s.cooldown == 0 and s.probation is None:
            trig = detect_trigger(s)
            if trig:
                s.last_trigger = trig; s.logger.event("trigger", i + 1, s.step_total, trigger=trig, features=_jsonable(pass_features(s)))
                print(f"   trigger: {trig}")
                dec = call_agent(s, controller, tb, "trigger")
                if dec and dec["action"] != "CONTINUE":
                    ck = checkpoint(s); idx = len(s.actions) - 1; apply_action(s, eng, dec)
                    s.logger.event("action_applied", i + 1, s.step_total, action=dec["action"], params=_jsonable(dec.get("params")))
                    if dec["action"] in ("SET_PARAMS", "RESET_LBFGS_MEMORY", "TIGHTEN_SCF"):
                        s.probation = dict(end=s.step_total + PROBATION_STEPS, ck=ck, action=dec["action"], idx=idx, g0=s.gradients, t0=round(s.logger.t_opt(), 2))
                    else: s.actions[idx]["outcome"] = "applied"
                    s.cooldown = COOLDOWN_STEPS
                elif dec: s.actions[-1]["outcome"] = "continue"
                s.cooldown = max(s.cooldown, COOLDOWN_STEPS)        # never ask again within the cool-down
                s.quiet[trig] = s.step_total + ((25 if AGENT_VERSION == 'v2' else 15) if (dec is None or dec['action'] == 'CONTINUE') else 8)   # nor about this same condition for a while
    if s.probation is not None and s.pass_recs: resolve_probation(s, eng, force=True)
    F = s.atoms.get_forces()
    s.logger.event("pass_end", i + 1, s.step_total, steps=len(s.pass_recs), fmax=fmax_of(F), energy_eV=float(s.atoms.get_potential_energy()), target_met=bool(fmax_of(F) <= cfg.fmax))
    return fmax_of(F)

def evaluate_final(s):
    """Same curvature check for EVERY arm, charged to 'evaluation', not to the optimization cost."""
    if s.final_curv is not None and s.final_curv["at_step"] == s.step_total: return
    g0 = s.gradients; s.cfg = s.cfg or s.schedule[-1]
    print("\n--- Evaluation (same for all arms, not counted in compute): curvature check along the 3 softest modes ---")
    try:
        probe_soft_curvature(s)
        for m in s.final_curv["modes"]: print(f"   xTB curvature {m['xtb_curvature_eV_A2']} -> DFT kappa {m['kappa_dft_eV_A2']} eV/A^2 ({'NEGATIVE' if m['negative'] else 'ok'})")
    except Exception as e:
        print("   curvature check failed:", repr(e)[:150]); s.final_curv = None
    s.eval_gradients = s.gradients - g0

def run_one(arm, start, run_dir, pool=None):
    spec = ARM_SPEC[arm]; schedule = schedule_for(arm, start)
    meta = dict(arm=arm, arm_label=spec["label"], start=start, requirement=REQUIREMENT, basis_path=list(BASIS_PATH), backend=BACKEND, agent_mode=(AGENT_MODE if spec["agent"] == "gemini" else spec["agent"]), agent_version=AGENT_VERSION,
                spherical_d=SPHERICAL_D, nudge_rms_A=NUDGE_RMS_A, force_unit_fix=FORCE_UNIT_FIX,
                force_convention="eV/A (corrected)" if FORCE_UNIT_FIX else "legacy: Eh/Bohr x 27.211386 labelled eV/A (about 1.89x smaller than true eV/A)",
                schedule=[asdict(p) for p in schedule], random_seed=(RANDOM_SEED_BASE + START_INDEX[start]) if spec["schedule"] == "random" else None,
                optimizer_memory=spec["memory"], warm_start=bool(WARM_START and spec["warm"]), endpoint_fmax=ENDPOINT_FMAX, gradient_budget=GRADIENT_BUDGET_PER_RUN,
                models=dict(fast=MODEL_FAST, pro=MODEL_PRO, strong=MODEL_STRONG) if spec["agent"] == "gemini" else None, gpu=GPU_NAME,
                time_accounting="t_opt_s = wall time minus time spent waiting for the Gemini API (rate limits, back-off, latency)")
    shutil.rmtree(run_dir, ignore_errors=True)
    lg = RunLogger(run_dir, meta); s = RunState(arm, start, schedule, lg); reset_warm_start(); s.atoms = start_atoms(start)
    controller = make_controller(arm, pool); tb = Toolbox(s, None); status = "finished"
    print("\n" + "#" * 100 + f"\n# RUN: arm {arm} ({spec['label']}) | start {start} | requirement {REQUIREMENT} | {BACKEND}\n" + "#" * 100)
    try:
        s.cfg = s.schedule[0]; s.atoms.calc = s.new_calculator(s.cfg.basis, s.cfg.conv_tol, s.cfg.grid_level)
        if spec["explore"]:
            print("--- Explore stage (xTB surrogate): basins near the start, then the agent chooses the target basin ---")
            ensure_explored(s)
            s.surr_H = xtb_hessian(s.basins[s.current_basin]["pos"]); s.surr_pre = surrogate_preconditioner(None, H=s.surr_H)
            dec = call_agent(s, controller, tb, "basin_choice")
            if dec and dec["action"] != "CONTINUE":
                apply_action(s, None, dec); s.actions[-1]["outcome"] = "applied"; s.logger.event("action_applied", 0, 0, action=dec["action"], params=_jsonable(dec.get("params")))
            elif dec: s.actions[-1]["outcome"] = "continue"
        for p in range(len(s.schedule)):
            s.p = p; s.cfg = s.schedule[p]
            if s.agent_enabled:
                evname = "end_of_svp" if (p == 2 and BASIS_PATH[0] != BASIS_PATH[1]) else "pass_start"
                s.pass_action = None
                dec = call_agent(s, controller, tb, evname)
                if dec and dec["action"] != "CONTINUE":
                    base = replace(s.cfg); kind0, mem0 = s.optimizer_kind, s.memory
                    apply_action(s, None, dec); s.actions[-1]["outcome"] = "applied"; s.logger.event("action_applied", p + 1, s.step_total, action=dec["action"], params=_jsonable(dec.get("params")))
                    if dec["action"] in ("SET_PARAMS", "RESET_LBFGS_MEMORY", "TIGHTEN_SCF") and s.cfg.steps > 0:
                        s.pass_action = dict(idx=len(s.actions) - 1, base_cfg=base, optimizer_kind=kind0, memory=mem0, action=dec["action"])
                elif dec: s.actions[-1]["outcome"] = "continue"
            if s.cfg.steps <= 0:
                s.logger.event("pass_end", p + 1, s.step_total, steps=0, skipped=True); print(f"\n=== Pass {p+1}/{len(s.schedule)} skipped (0 steps) ==="); continue
            run_pass(s, controller, tb)
            if s.stop_flag: status = "stopped: " + s.stop_flag; break
        reps = 0
        while status == "finished" and not SMOKE_TEST and fmax_of(s.atoms.get_forces()) > ENDPOINT_FMAX and reps < 3:
            reps += 1; s.p = len(s.schedule) - 1; last = s.schedule[-1]
            s.cfg = replace(last, fmax=ENDPOINT_FMAX, steps=max(last.steps, 25)); s.schedule[-1] = s.cfg
            run_pass(s, controller, tb, label=f"(repeat {reps}: the final criterion fmax<={ENDPOINT_FMAX} is not met yet) ")
            if s.stop_flag: status = "stopped: " + s.stop_flag
        if status == "finished" and s.agent_enabled:
            s.p = len(s.schedule) - 1; s.cfg = s.schedule[-1]
            dec = call_agent(s, controller, tb, "final_check")
            if dec and dec["action"] == "DISPLACE_ALONG_MODE":
                apply_action(s, None, dec); s.actions[-1]["outcome"] = "applied"; s.logger.event("action_applied", s.p + 1, s.step_total, action=dec["action"], params=_jsonable(dec.get("params")))
                s.cfg = replace(s.schedule[-1], fmax=ENDPOINT_FMAX, steps=max(s.schedule[-1].steps, 40)); s.schedule[-1] = s.cfg; s.final_curv = None
                run_pass(s, controller, tb, label="(re-optimization after the displacement) ")
            elif dec: s.actions[-1]["outcome"] = "continue"
        s.t_opt_end = lg.t_opt(); g_opt = s.gradients
        evaluate_final(s)
    except Exception as e:
        status = f"error: {type(e).__name__}: {str(e)[:200]}"; print("RUN ERROR:\n", traceback.format_exc()[-1500:])
        s.t_opt_end = s.t_opt_end or lg.t_opt(); g_opt = s.gradients
    return finish_run(s, lg, run_dir, status, g_opt)

def finish_run(s, lg, run_dir, status, g_opt):
    a = s.atoms; pos = a.positions.copy()
    try: F = a.get_forces(); fm = fmax_of(F); E = float(a.get_potential_energy())
    except Exception: fm, E = None, None
    fp = fingerprint(pos, E)
    kappas = [m["kappa_dft_eV_A2"] for m in s.final_curv["modes"]] if s.final_curv else None
    degraded = s.degraded_calls > 0
    summary = dict(arm=s.arm, arm_label=s.spec["label"], start=s.start, requirement=REQUIREMENT, backend=BACKEND, status=status,
                   converged=bool(fm is not None and fm <= ENDPOINT_FMAX and status == "finished"), final_energy_eV=E, final_fmax=fm,
                   gradients_optimization=g_opt, gradients_evaluation=s.eval_gradients, gradients_total=s.gradients, scf_calls_total=s.scf_total,
                   minutes_optimization=round(s.t_opt_end / 60, 2), minutes_api_wait_excluded=round(lg.api_s / 60, 2), minutes_total_wall=round(lg.t_wall() / 60, 2),
                   steps_total=s.step_total, passes_with_steps=len({r["pass_id"] for r in s.recs}), final_structure=fp,
                   curvature_kappa_eV_A2=kappas, curvature_any_negative=(s.final_curv["any_negative"] if s.final_curv else None),
                   switched_basin=s.switched_basin, basins_found=(len(s.basins) if s.basins else None),
                   scf_not_converged_steps=sum(1 for r in s.recs if not r["scf_converged"]),
                   agent=dict(enabled_at_end=s.agent_enabled, calls=s.agent_calls, rollbacks=s.strikes, degraded_calls=s.degraded_calls, controller_errors=s.agent_errors,
                              actions=[{k: v for k, v in x.items()} for x in s.actions]),
                   agent_integrity=("degraded" if degraded else "ok" if s.spec["agent"] else "not_applicable"),
                   mean_seconds_per_gradient=round(float(np.mean([r["wall_s"] for r in s.recs])), 2) if s.recs else None)
    (Path(run_dir) / "summary.json").write_text(json.dumps(summary, indent=2, default=float))
    from ase.io import write as ase_write
    ase_write(str(Path(run_dir) / "final.xyz"), Atoms(SYMBOLS, positions=pos))
    lg.close()
    print(f"\n>>> {s.arm} on {s.start}: {status} | E {E} eV | fmax {fm} | {g_opt} gradients (+{s.eval_gradients} evaluation) | {summary['minutes_optimization']} min optimization "
          f"(+{summary['minutes_api_wait_excluded']} min of API time excluded) | integrity {summary['agent_integrity']}")
    return summary

print("Orchestrator ready.")
