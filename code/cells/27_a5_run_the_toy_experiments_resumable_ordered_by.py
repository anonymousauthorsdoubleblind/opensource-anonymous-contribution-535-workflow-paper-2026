# @title A5. Run the toy experiments (resumable; ordered by priority; time-guarded)
TOY_POOL = GeminiPool() if AGENT_MODE == "gemini" else None
T0_TOY = time.time()

def _sup(kind, key):
    if kind == "rules": return RuleSupervisor()
    if kind == "llm":
        return LLMSupervisor(make_toy_ask(TOY_POOL, key)) if TOY_POOL is not None else RuleSupervisor()     # mock mode: rules stand in for the LLM
    return None

def toy_run(key, group, start, arm, cap0, memory, sup_kind, extra):
    path = os.path.join(TOY_DIR, key + ".json")
    if os.path.exists(path):
        d = json.load(open(path))
        if not (RERUN_DEGRADED and d["summary"].get("degraded")):
            print(f"[skip] {key}: already done"); return d
        print(f"[redo] {key}: earlier run lost LLM answers to API limits")
    for k in TOY_CNT: TOY_CNT[k] = 0
    sup = _sup(sup_kind, key); t0 = time.time()
    out, rec, ev = run_arm(start, "linesearch" if arm == "linesearch" else "plain", cap0, TOY_CALC, sup, memory=memory, budget=TOY_BUDGET_GRADIENTS,
                           log=lambda *a: None, final_check_always=bool(TOY_FINAL_CHECK_ALWAYS and sup is not None))
    out.update(key=key, group=group, arm=arm, supervisor=sup_kind, wall_s=round(time.time() - t0, 1), llm=dict(TOY_CNT), degraded=bool(TOY_CNT["degraded"]), **extra)
    json.dump(dict(summary=out, steps=rec, events=ev), open(path, "w"), default=_j)
    r = out["referee"]
    print(f"[done] {key:34s} {out['outcome']:9s} steps {out['steps']:3d} grads {out['gradients']:3d} (+{r['gradients']} referee) | lowest mode {r['lowest_cm1']:8.0f} cm-1 "
          f"| {'MINIMUM' if r['is_minimum'] else 'NOT A MINIMUM'} | cap changes {out['n_cap_changes']} | LLM calls {TOY_CNT['calls']} | {out['wall_s']:.0f} s")
    return dict(summary=out, steps=rec, events=ev)

q = TOY_SIZE == "quick"
sad_starts = [(0.0, 11), (0.01, 21), (0.01, 22)] + ([] if q else [(0.002, 11), (0.01, 23), (0.01, 24), (0.05, 11)])
PLAN = []   # (key, group, start, arm, cap0, memory, supervisor, extra) in priority order
for nudge, seed in sad_starts:                                           # 1. the trap
    st = nudged(planar_nh3(R_PLANAR), nudge, seed=seed); tag = f"n{nudge}_s{seed}"
    for arm, sup in (("plain", None), ("rules", "rules"), ("llm", "llm")):
        PLAN.append((f"saddle_{tag}_{arm}", "saddle", st, arm if arm == "plain" else "plain", 0.1, TOY_MEMORY, sup, dict(nudge_rms=nudge, seed=seed, label=arm)))
st0 = nudged(planar_nh3(R_PLANAR), 0.0, seed=11)                          # memory and line-search controls at the exact saddle (cheap)
for arm, mem in (("plain", 1), ("plain", 100), ("linesearch", TOY_MEMORY)):
    PLAN.append((f"saddle_n0.0_s11_{arm}_m{mem}", "saddle", st0, arm, 0.1, mem, None, dict(nudge_rms=0.0, seed=11, label=f"{arm}_m{mem}")))
cap_start = nudged(molecule("NH3"), 0.15, seed=7)                         # 2. the step cap
def cap_cell(cap, full_arms):
    arms = [("plain", None, TOY_MEMORY, "plain"), ("rules", "rules", TOY_MEMORY, "rules"), ("llm", "llm", TOY_MEMORY, "llm")]
    if full_arms: arms += [("plain", None, 1, "plain_m1"), ("plain", None, 100, "plain_m100"), ("linesearch", None, TOY_MEMORY, "linesearch")]
    for arm, sup, mem, lab in arms:
        PLAN.append((f"cap{cap}_{lab}", "stepcap", cap_start, arm, cap, mem, sup, dict(label=lab)))
for cap, full_arms in ([(0.002, True), (0.0005, False), (0.05, False)] if q else [(0.002, True), (0.0005, True), (0.01, False), (0.05, False), (0.2, False), (0.6, False)]):
    cap_cell(cap, full_arms)

if not TOY_ENABLED:
    print("TOY_ENABLED is False: Part A skipped.")
else:
    s0 = time.time(); a = nudged(molecule("NH3"), 0.1, 1); a.calc = TOY_CALC; a.get_forces(); t_g = time.time() - s0
    print(f"One NH3 gradient takes about {t_g:.1f} s here (first call includes start-up). Plan: {len(PLAN)} runs; each run uses up to {TOY_BUDGET_GRADIENTS} gradients plus a 24-gradient referee.")
    for i, (key, group, st, arm, cap0, mem, sup, extra) in enumerate(PLAN):
        if (time.time() - T0_TOY) / 60 > TOY_MAX_MINUTES:
            print(f"TIME GUARD: {TOY_MAX_MINUTES} min reached after {i} of {len(PLAN)} runs. The remaining runs are skipped; run the cell again to continue them."); break
        toy_run(key, group, st, arm, cap0, mem, sup, extra)
        if i % 8 == 7:
            try: hard_reset_gpu_allocator_pool(verbose=False)
            except Exception: pass
    if TOY_POOL is not None:
        json.dump({k: (round(v, 1) if isinstance(v, float) else v) for k, v in TOY_POOL.stats.items()}, open(os.path.join(TOY_DIR, "api_usage_toy.json"), "w"), indent=2)
    print(f"\nToy runs finished in {(time.time()-T0_TOY)/60:.1f} min.")
