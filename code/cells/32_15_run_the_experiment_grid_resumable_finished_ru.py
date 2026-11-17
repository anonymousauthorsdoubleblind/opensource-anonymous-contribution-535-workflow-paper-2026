# @title 15. Run the experiment grid (resumable: finished runs are skipped after a disconnect)
import glob
index_path = os.path.join(EXPERIMENT_DIR, "results_index.json")
pool = None
if AGENT_MODE == "gemini" and any(ARM_SPEC[a]["agent"] == "gemini" for a in ARMS):
    pool = GeminiPool()

def _load_summary(run_dir):
    f = os.path.join(run_dir, "summary.json")
    return json.load(open(f)) if os.path.exists(f) else None

RESULTS = []
FAIL_FAST = False
t_grid = time.time()
for start in STARTS:
    for arm in ARMS:
        run_dir = os.path.join(EXPERIMENT_DIR, f"{arm}_{start}")
        old = _load_summary(run_dir)
        if old and old.get("status") == "finished" and not (RERUN_DEGRADED and old.get("agent_integrity") == "degraded"):
            print(f"[skip] {arm} / {start}: already finished ({old['gradients_optimization']} gradients)"); RESULTS.append(old); continue
        if old and old.get("agent_integrity") == "degraded": print(f"[redo] {arm} / {start}: earlier run lost agent decisions to API limits")
        summ = run_one(arm, start, run_dir, pool)
        RESULTS.append(summ)
        if N1_TEST and arm == "A0e" and not summ.get("converged"):
            print("\nFAIL FAST: the expert schedule A0e did not converge, so the remaining arms are skipped. Fix that first (see the go/no-go summary).")
            FAIL_FAST = True
            break
        json.dump(RESULTS, open(index_path, "w"), indent=2, default=float)        # readable index, updated after every run
        hard_reset_gpu_allocator_pool(verbose=False)
if pool is not None:
    usage = {k: (round(v, 1) if isinstance(v, float) else v) for k, v in pool.stats.items()}
    json.dump(dict(gemini_usage=usage, note="waited_s is API back-off time; it is excluded from every wall-clock metric"), open(os.path.join(EXPERIMENT_DIR, "api_usage.json"), "w"), indent=2)
    print("\nGemini usage:", usage)
json.dump(RESULTS, open(index_path, "w"), indent=2, default=float)
print(f"\nGrid finished in {(time.time()-t_grid)/60:.1f} min. Index: {index_path}")
