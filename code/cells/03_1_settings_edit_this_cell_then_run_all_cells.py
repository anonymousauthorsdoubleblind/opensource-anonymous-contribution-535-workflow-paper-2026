# @title 1. Settings: edit this cell, then run all cells
# Which molecule (one session per molecule; results go to separate folders) ----
MOLECULE = "C10H6"        # "C10H6" (16 atoms)  |  "C11H8" (19 atoms)
RUN_MODE = "n1"         # "smoke" = 1 start, 2 arms, <= 4 steps per pass (wiring check, minutes)
                          # "n1"    = 1 start (R3), arms A0e/A0r/A1/A3, full steps: the go/no-go run (printed at the end)
                          # "full"  = all starts in STARTS below

# What to run ---------------------------------------------------------------
REQUIREMENT = "R0"        # "R0" = def2-SVP only (fast screen, about 20 min per run)  |  "R1" = def2-SVP then 6-31+G(d,p)  |  "R2" = def2-SVP then def2-TZVP
ARMS   = ["A0e", "A0r", "A1", "A2", "A3"]          # optional extras: "A0c" cautious novice, "A0p" deliberately poor schedule, "A3p" Gemini agent started from the poor schedule
STARTS = ["R1", "R2", "R3", "R4", "R5", "Q1", "P0"]  # five designed starts + two controls (Q1 squeezed, P0 relaxed reference), all nudged
RUN_TAG = "_A100_toy_C10H6_sweep"             # suffix for the results folder: set when one experiment is split over two sessions
R0_GRADIENT_BUDGET = 150   # gradient cap per run when REQUIREMENT == 'R0' (the first screen used 150; runs that need more are then recorded as not converged)
N1_START = "R1"          # start used in "n1" mode ("P0" = relaxed reference: used for the replication check)
N1_ARMS_OVERRIDE = ["PS","GS","PB","GB","GS2","GB2","PM","GM"]   # step-cap sweep arms, in priority order (defined in the settings-per-pass cell)   # e.g. ["A0e", "A1"] to run only some of the four go/no-go arms in this session
SMOKE_TEST = RUN_MODE == "smoke"
N1_TEST = RUN_MODE == "n1"

# Where the chemistry runs --------------------------------------------------
BACKEND    = "skala"      # "skala" = real Skala-1.1 DFT on the GPU (L4 GPU)
                          # "standin_xtb" = CPU dry run with GFN2-xTB instead of DFT (wiring test only, NOT a result)
AGENT_MODE = "gemini"     # "gemini" = live Gemini function calling | "mock" = rule-based stand-in (no API)

# Golden rule (fixed, do not change) -----------------------------------------
SPHERICAL_D = True        # pure (spherical) d functions in EVERY basis (PySCF cart=False)
NUDGE_RMS_A = 0.01        # the start files are already nudged out of perfect symmetry by this RMS (A)

# Skala compatibility ---------------------------------------------------------
# Earlier code set small_rho_cutoff = 1e-10 (drops grid points with negligible density). Skala 2026.9 (the current
# standard install) rejects such pruned grids ("Grid size mismatch"). 0.0 keeps the full grid: works on 2026.9, energies differ from
# the pruned grid only at the level of the discarded density. To reproduce earlier numbers exactly, pin the Skala version
# of that run (install cell: !pip install skala-cuda12x==<version>) and set this back to 1e-10.
SMALL_RHO_CUTOFF_L3 = 0.0

# Optimizer and budget ---------------------------------------------------------
GRADIENT_BUDGET_PER_RUN = 400   # one gradient is about 15-20 s on the L4, so 400 is about 2 h per run at most
FORCE_UNIT_FIX = False    # False = legacy force convention (eV/Bohr labelled eV/A), kept so thresholds match the reported runs
WARM_START = True         # arms A1-A3: reuse the previous density as the SCF guess (falls back to 'minao' if it fails)
FIXES_MEMORY = 20         # arms A1-A3: L-BFGS memory (A0 arms use 1)
ENDPOINT_FMAX = 0.02      # common endpoint for every arm (same units as the thresholds above)
PROBATION_STEPS = 5
COOLDOWN_STEPS = 5

# Gemini: rotation, back-off and patience ---------------------------------------
GEMINI_KEY_SECRETS = ["LLM_API_KEY", "LLM_API_KEY_2"]   # environment variable names (one or two keys)
MODEL_FAST   = "gemini-3.8-flash"     # routine in-loop calls
MODEL_PRO    = "gemini-pro-latest"    # middle tier; edit to the available Pro model ID
MODEL_STRONG = "gemini-4-argon"       # high-stakes calls (basin choice, negative curvature)
API_PATIENCE_S    = 1800   # wait at most this long for ONE decision before the run is flagged 'degraded'
API_BACKOFF_BASE_S = 5     # first back-off; doubles each failed round (with jitter)
API_BACKOFF_MAX_S  = 180
API_MODEL_ROTATE_AFTER = 2 # failed rounds on the primary model (both keys) before trying the next model
AGENT_VERSION = "v2"      # "v1" = logic of the first runs (kept for reproducibility) | "v2" = refined: advisor in the packet, no shrinking while the energy falls, step ramp-up, fewer calls
MAX_TOOL_ROUNDS = 6 if AGENT_VERSION == "v1" else 4        # function-calling rounds per decision
RERUN_DEGRADED = True      # on re-running this notebook, redo runs whose agent calls were degraded by API limits

# Results folder ---------------------------------------------------------------------
RESULTS_ROOT = "./results"   # results folder
assert MOLECULE in ("C10H6", "C11H8"), "MOLECULE must be 'C10H6' or 'C11H8'"
assert RUN_MODE in ("smoke", "n1", "full"), "RUN_MODE must be 'smoke', 'n1' or 'full'"

# Per-molecule facts (the geometry itself comes from the starts cell) -----------------------------
MOL_PROFILES = {
    "C10H6": dict(n_atoms=16, desc="a didehydroannulene ring, 16 atoms, planar",
                  plane_atoms=None,            # planarity is measured over all atoms
                  permute_symmetry=True,       # ring symmetry: RMSD may relabel equivalent atoms
                  nao={"def2-svp": 170, "6-31+g(d,p)": 210, "def2-tzvp": 346}),
    "C11H8": dict(n_atoms=19, desc="an annulene derivative with a CH2 group, 19 atoms; ten ring carbons are planar and the CH2 hydrogens sit out of that plane",
                  plane_atoms=list(range(10)), # planarity is measured over the ten ring carbons (atoms 0-9 of every start file)
                  permute_symmetry=False,      # no usable symmetry: RMSD does not relabel atoms
                  nao={"def2-svp": 194, "6-31+g(d,p)": 238, "def2-tzvp": 389}),
}
MOL = MOL_PROFILES[MOLECULE]

if SMOKE_TEST:
    STARTS, ARMS = ["R3"], ["A0e", "A3"]
elif N1_TEST:
    STARTS, ARMS = [N1_START], (N1_ARMS_OVERRIDE or ["A0e", "A1", "A3", "A0r"])    # go/no-go set: expert, random, random+fixes, random+fixes+Gemini (A2 added later if go)

BASIS_PATH = {"R0": ("def2-svp", "def2-svp"), "R1": ("def2-svp", "6-31+g(d,p)"), "R2": ("def2-svp", "def2-tzvp")}[REQUIREMENT]
if REQUIREMENT == "R0":
    GRADIENT_BUDGET_PER_RUN = R0_GRADIENT_BUDGET     # fast screen: a run that is not converged after 150 gradients counts as not converged
print(f"Molecule {MOLECULE} | run mode {RUN_MODE}")
print(f"Requirement {REQUIREMENT}: passes 1-3 in {BASIS_PATH[0]}, passes 4-6 in {BASIS_PATH[1]} | backend={BACKEND} | agent={AGENT_MODE}")
print(f"Arms: {ARMS} | starts: {STARTS} | spherical d: {SPHERICAL_D} | start nudge: {NUDGE_RMS_A} A RMS")
if SMOKE_TEST:
    print("SMOKE TEST = WIRING ONLY: 4 steps per pass is far too short to show any benefit of the agent. Do not read results from it.")
if BACKEND != "skala":
    print("WARNING: BACKEND is not 'skala'. Numbers from this run are a wiring test only and must not be reported.")
