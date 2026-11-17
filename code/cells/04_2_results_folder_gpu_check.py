# @title 2. Results folder, GPU check
import os, json, time, platform
RESULTS_ROOT = os.path.join(RESULTS_ROOT, f"agentic_skala_{MOLECULE.lower()}")   # one folder per molecule
EXPERIMENT_DIR = os.path.join(RESULTS_ROOT, ("SMOKE_" if SMOKE_TEST else "N1_" if N1_TEST else "") + f"requirement_{REQUIREMENT}" + RUN_TAG + ("" if BACKEND == "skala" else "_STANDIN"))
os.makedirs(EXPERIMENT_DIR, exist_ok=True)
print("Every run writes readable JSON files under:", EXPERIMENT_DIR)

GPU_NAME = "none"
try:
    import torch
    if torch.cuda.is_available():
        GPU_NAME = torch.cuda.get_device_name(0)
        print(f"GPU: {GPU_NAME} ({torch.cuda.get_device_properties(0).total_memory/1e9:.0f} GB)")
        if "L4" not in GPU_NAME:
            print("Note: this notebook was written for the L4 GPU; other GPUs work but timings will differ.")
    elif BACKEND == "skala":
        raise RuntimeError("BACKEND='skala' needs a GPU. Run it on a GPU machine.")
except ImportError:
    if BACKEND == "skala":
        raise
import importlib.metadata as _imd
def _pkg(p):
    try: return _imd.version(p)
    except Exception: return None
json.dump({"gpu": GPU_NAME, "python": platform.python_version(), "started": time.strftime("%Y-%m-%dT%H:%M:%S"),
           "packages": {p: _pkg(p) for p in ("skala", "skala-cuda12x", "gpu4pyscf-cuda12x", "pyscf", "torch", "cupy-cuda12x", "e3nn", "ase", "google-genai")}},
          open(os.path.join(EXPERIMENT_DIR, "environment.json"), "w"), indent=2)
