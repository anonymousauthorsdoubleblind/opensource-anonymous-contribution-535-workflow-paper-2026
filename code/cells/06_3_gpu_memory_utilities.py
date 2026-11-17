# @title 3. GPU memory utilities
import gc, os
# Compatibility fix: e3nn (used by Skala) loads a constants file with torch.load; PyTorch >= 2.6 refuses it by default
# ("Weights only load failed ... slice"). This is the standard workaround for a trusted, pip-installed package file.
os.environ["TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD"] = "1"
try:
    import torch
    try: torch.serialization.add_safe_globals([slice])
    except Exception: pass
    import cupy as cp
    HAVE_GPU_LIBS = True
except Exception:
    HAVE_GPU_LIBS = False

if HAVE_GPU_LIBS:
    os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"

    def print_gpu_memory_status():
        py_alloc = torch.cuda.memory_allocated() / 1e9
        py_res = torch.cuda.memory_reserved() / 1e9
        cp_pool = cp.get_default_memory_pool()
        print(f"   GPU memory | PyTorch active {py_alloc:.2f} GB, reserved {py_res:.2f} GB | CuPy active {cp_pool.used_bytes()/1e9:.2f} GB, pool {cp_pool.total_bytes()/1e9:.2f} GB")

    def hard_reset_gpu_allocator_pool(verbose=True):
        """Forces a complete hard-reset of the GPU memory pool ."""
        gc.collect()
        torch.cuda.empty_cache()
        torch.cuda.ipc_collect()
        cp.get_default_memory_pool().free_all_blocks()
        cp.get_default_pinned_memory_pool().free_all_blocks()
        cp.get_default_memory_pool().set_limit(0)
        cp.get_default_memory_pool().set_limit(None)
        if verbose:
            torch.cuda.synchronize()
            print(f"   GPU allocator reset: PyTorch allocated {torch.cuda.memory_allocated()/(1024**2):.1f} MB")

    def dynamic_step_evacuation():
        torch.cuda.synchronize()
        cp.cuda.Stream.null.synchronize()
        gc.collect()
        torch.cuda.empty_cache()
        cp.get_default_memory_pool().free_all_blocks()
        cp.get_default_pinned_memory_pool().free_all_blocks()
else:
    def print_gpu_memory_status(): pass
    def hard_reset_gpu_allocator_pool(verbose=True): pass
    def dynamic_step_evacuation(): gc.collect()
