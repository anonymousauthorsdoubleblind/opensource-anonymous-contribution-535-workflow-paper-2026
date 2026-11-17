# @title A1. Toy settings (Part A: ammonia, known double-well potential)
TOY_ENABLED = True            # False skips Part A and goes straight to the molecule sweep
TOY_SIZE = "quick"            # "quick" = about 2000 gradients | "full" = about 4000 gradients (more starts, caps and seeds)
TOY_MAX_MINUTES = 20          # time guard: runs are ordered by priority; when the guard is reached the remaining toy runs are skipped (and re-attempted on the next execution)
TOY_BUDGET_GRADIENTS = 100    # gradient budget per toy run (the independent referee after each run is extra and counted separately)
TOY_MEMORY = FIXES_MEMORY     # L-BFGS memory of the supervised arm and of the main plain arm (20, as in the earlier agent arms)
TOY_FINAL_CHECK_ALWAYS = True # the supervised arms run the curvature check at every apparent convergence, even after a supervisor has switched itself off
TOY_DIR = os.path.join(EXPERIMENT_DIR, "toy")
os.makedirs(TOY_DIR, exist_ok=True)
# Runs made with an earlier toy engine (a probation of an earlier cap change could roll back a displacement). They are deleted ONCE so that they are redone with the fixed engine.
TOY_REDO_KEYS = []
_redo_marker = os.path.join(TOY_DIR, "_redo_done_displacement_fix.txt")
if TOY_REDO_KEYS and not os.path.exists(_redo_marker):
    for _k in TOY_REDO_KEYS:
        _p = os.path.join(TOY_DIR, _k + ".json")
        if os.path.exists(_p): os.remove(_p); print("Deleted for redo (old engine):", _k)
    open(_redo_marker, "w").write("deleted: " + ", ".join(TOY_REDO_KEYS))
print(f"Toy: size={TOY_SIZE}, time guard {TOY_MAX_MINUTES} min, budget {TOY_BUDGET_GRADIENTS} gradients per run, memory {TOY_MEMORY}. Results: {TOY_DIR}")
print("Toy forces are in true eV/A (the production calculator labels eV/Bohr as eV/A; the toy needs true forces for the Hessian referee).")
