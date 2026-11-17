# Source code of the agentic optimizer module

Source code of the supervised Skala-1.1 geometry optimizer (driver, rule-based and language-model function-calling controllers, validator, probation and rollback, starting geometries) as two notebooks, plus log-analysis scripts. MIT license.

The published copy differs from the run copy only in environment handling: storage mount, secret lookup and download helpers were replaced by local equivalents. The optimizer, controllers and guard are unchanged. See `SCRUB-NOTES.md`.

## Use

- Open one notebook on a machine with a GPU. Set the environment variable `LLM_API_KEY` (optionally `LLM_API_KEY_2`) only if you run the language-model controller; plain runs and rules runs need no key and no network.
- Results are written under `./results` (setting `RESULTS_ROOT`, cell 1).
- Wiring check: `TOY_SIZE = "quick"`, `TOY_MAX_MINUTES = 5` (cell A1) and `RUN_MODE = "smoke"` (cell 1).
- The language model is a third-party service and is not redistributed. Its decisions depend on the model version and are not bit-reproducible.

## Files

| Path | What |
|---|---|
| `notebooks/agentic_skala_optimizer_C10H6.ipynb` | The notebook for C10H6 (16 atoms) |
| `notebooks/agentic_skala_optimizer_C11H8.ipynb` | The same notebook set to C11H8 (19 atoms) |
| `cells/NN_<title>.py` | One file per code cell of the C10H6 notebook; NN is the cell index in the notebook |
| `cells/C11H8_differences.diff` | Differences between the code cells of the two notebooks |
| `analysis/collect_logs.py`, `analysis/make_figures.py` | Log-analysis scripts for the ammonia saddle test; they read `data/raw/...` relative to the working folder |
| `SCRUB-NOTES.md` | What differs from the run copy |
| `LICENSE` | MIT |

## Cell map (cell numbers are the titles in the notebook)

| What | Cell | Note |
|---|---|---|
| Skala-1.1 GPU calculator | 4 | GPU4PySCF calculator behind ASE |
| Starting geometries (R1 to R5, Q1, P0) | 5a | fixed files, identical for every arm |
| Geometry helpers: bond graph, planarity | 5b | used by the validator and the final check |
| Settings per pass | 6 | hand schedules and the step-cap sweep arms |
| Run logger | 7 | observer only: readable JSON for every run |
| Model client | 8 | rate limits and retries; the model is called only at a trigger or a pass boundary |
| GFN2-xTB basin search (surrogate tools) | 9 | 13 seeds; does not relax the Skala-1.1 start |
| Run state, per-step monitor, triggers, step advisor | 10 | the six stall triggers; the deterministic advisor |
| L-BFGS step engine and the six functions the model may call | 11 | allow-list of functions per event |
| Actions, validator, probation and rollback | 12 | bounds: cap at most doubles, never above 0.05 Å; five-step probation |
| Controllers: none, rule-based, language model | 13 | the controller is a setting |
| Orchestrator: one optimization run | 14 | passes, triggers, calls, guard |
| Ammonia saddle test (compact module) | A1 to A6 | independent finite-difference Hessian as referee |
| Experiment grid and reports | 14b, 15, 15b, 15c, 16 | preflight, resumable runs, call report |
