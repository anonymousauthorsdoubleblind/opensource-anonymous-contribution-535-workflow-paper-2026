# @title 6. Settings per pass: expert-tuned (A0e), untuned random draw (A0r), cautious novice (A0c)
from dataclasses import dataclass, asdict, replace

@dataclass
class PassSettings:
    basis: str
    maxstep: float          # A, largest atomic move per step
    steps: int              # step budget of the pass
    fmax: float             # pass ends when the largest atomic force is below this
    conv_tol: float         # SCF energy tolerance (Eh)
    grid_level: int = 3

# expert_hand_tuned_custom_runtime_settings (passes 1-3) and the JSON run's settings (passes 4-6): hand-tuned from observation
EXPERT_HAND_TUNED_CUSTOM_RUNTIME_SETTINGS = [(0.025, 50, 0.10, 1e-4), (0.010, 100, 0.05, 1e-5), (0.001, 100, 0.01, 1e-6),
          (0.010, 100, 0.10, 1e-6), (0.006, 100, 0.03, 1e-6), (0.001, 100, 0.02, 1e-6)]

def _with_basis(rows):
    b = BASIS_PATH
    return [PassSettings(b[0] if i < 3 else b[1], ms, st, fm, ct) for i, (ms, st, fm, ct) in enumerate(rows)]

# Deliberately poor, written down before any run: stress test only (arm A0p / A3p), never a baseline claim.
POOR_PRACTICE_CUSTOM_RUNTIME_SETTINGS = [(0.002, 60, 0.10, 1e-4), (0.050, 40, 0.02, 1e-3), (0.020, 60, 0.005, 1e-3),
                                         (0.002, 60, 0.10, 1e-5), (0.050, 40, 0.01, 1e-3), (0.010, 100, 0.02, 1e-5)]

def expert_schedule():   return _with_basis(EXPERT_HAND_TUNED_CUSTOM_RUNTIME_SETTINGS)
def poor_schedule():     return _with_basis(POOR_PRACTICE_CUSTOM_RUNTIME_SETTINGS)
def cautious_schedule(): return _with_basis([(0.005, 200, ENDPOINT_FMAX, 1e-6)] * 6)

# Random ranges, written down BEFORE any Skala run and never re-rolled after seeing an outcome
RANDOM_RANGES = dict(maxstep_A=(0.002, 0.05), steps=[25, 50, 100, 150, 200], fmax_passes_1_to_5=(0.01, 0.2),
                     pass6_fmax=ENDPOINT_FMAX, conv_tol=(1e-8, 1e-4))
def random_schedule(seed):   # = random_custom_runtime_settings
    r = np.random.default_rng(seed)
    ms = np.exp(r.uniform(np.log(0.002), np.log(0.05), 6))                       # log-uniform step caps
    st = r.choice(RANDOM_RANGES["steps"], 6)                                       # step budgets
    fm = np.sort(np.exp(r.uniform(np.log(0.01), np.log(0.2), 5)))[::-1]            # fmax falls (never rises)
    fm = np.append(fm, ENDPOINT_FMAX)                                              # same final criterion for every arm
    ct = np.sort(np.exp(r.uniform(np.log(1e-8), np.log(1e-4), 6)))[::-1]           # SCF tolerance tightens
    r2 = lambda x, n: float(f"{x:.{n}g}")                                        # readable numbers: 2 significant digits
    return _with_basis([(r2(a, 2), int(b), r2(c, 2), r2(d, 1)) for a, b, c, d in zip(ms, st, fm, ct)])

ARM_SPEC = {
    "A0e": dict(label="Expert-tuned baseline", schedule="expert",   memory=1,            warm=False, agent=None,     explore=False),
    "A0r": dict(label="Untuned baseline",      schedule="random",   memory=1,            warm=False, agent=None,     explore=False),
    "A0c": dict(label="Cautious novice",       schedule="cautious", memory=1,            warm=False, agent=None,     explore=False),
    "A0p": dict(label="Poor-practice stress test", schedule="poor",     memory=1,            warm=False, agent=None,     explore=False),
    "A3p": dict(label="Gemini agent from poor setup", schedule="poor",  memory=FIXES_MEMORY, warm=True,  agent="gemini", explore=True),
    "AF":  dict(label="Fault injection (safety test)", schedule="expert", memory=FIXES_MEMORY, warm=True, agent="faulty", explore=True),
    "A1":  dict(label="Baseline plus fixes",   schedule="random",   memory=FIXES_MEMORY, warm=True,  agent=None,     explore=False),
    "A2":  dict(label="Rule-adaptive",         schedule="random",   memory=FIXES_MEMORY, warm=True,  agent="rules",  explore=True),
    "A3":  dict(label="Gemini agent",          schedule="random",   memory=FIXES_MEMORY, warm=True,  agent="gemini", explore=True),
}
START_INDEX = {n: i for i, n in enumerate(["R1", "R2", "R3", "R4", "R5", "Q1", "P0"])}
RANDOM_SEED_BASE = 5000

def schedule_for(arm, start):
    kind = ARM_SPEC[arm]["schedule"]
    sched = {"expert": expert_schedule, "cautious": cautious_schedule, "poor": poor_schedule}.get(kind, lambda: random_schedule(RANDOM_SEED_BASE + START_INDEX[start]))()
    if SMOKE_TEST:
        sched = [replace(s, steps=min(s.steps, 4)) for s in sched]
    if arm == "AF":      # fault-injection test: short passes, all six pass starts must be reached
        sched = [replace(s, steps=min(s.steps, 10)) for s in sched]
    return sched

print("Random baseline ranges (fixed before any Skala run):", RANDOM_RANGES)
for _s in STARTS[:1]:
    print(f"Untuned draw for start {_s} (seed {RANDOM_SEED_BASE + START_INDEX[_s]}):")
    for i, p in enumerate(random_schedule(RANDOM_SEED_BASE + START_INDEX[_s]), 1):
        print(f"   pass {i}: {p.basis:12s} maxstep {p.maxstep:.4f} A | steps {p.steps:3d} | fmax {p.fmax:.3f} | conv_tol {p.conv_tol:.1e}")
# ---- Part B: step-cap sweep arms (all with L-BFGS memory FIXES_MEMORY = 20 and the density warm start, like the earlier agent arms) ----
# A cell = one starting cap. P = plain optimizer (no agent, a memory-20 + warm-start control), G = Gemini agent (same package as A3/A3p), G2 = second agent repeat.
SWEEP_CAPS = {"S": 0.005, "M": 0.025, "B": 0.3}     # too small | reasonable | too big (A, largest atomic move per step), the same cap in all six passes
for _c, _cap in SWEEP_CAPS.items():
    _sched = f"cap:{_cap}"
    ARM_SPEC[f"P{_c}"]  = dict(label=f"Plain L-BFGS, cap {_cap} A, memory {FIXES_MEMORY}, warm start", schedule=_sched, memory=FIXES_MEMORY, warm=True, agent=None,     explore=False)
    ARM_SPEC[f"G{_c}"]  = dict(label=f"Gemini agent from cap {_cap} A",                                  schedule=_sched, memory=FIXES_MEMORY, warm=True, agent="gemini", explore=True)
    ARM_SPEC[f"G{_c}2"] = dict(label=f"Gemini agent from cap {_cap} A (repeat)",                         schedule=_sched, memory=FIXES_MEMORY, warm=True, agent="gemini", explore=True)
_schedule_for_old = schedule_for
def schedule_for(arm, start):
    kind = ARM_SPEC[arm]["schedule"]
    if isinstance(kind, str) and kind.startswith("cap:"):
        sched = _with_basis([(float(kind[4:]), 200, ENDPOINT_FMAX, 1e-6)] * 6)      # uniform cap, endpoint criterion in every pass (like the cautious novice, but with the swept cap)
        return [replace(s, steps=min(s.steps, 4)) for s in sched] if SMOKE_TEST else sched
    return _schedule_for_old(arm, start)
print("Sweep arms:", {k: v["label"] for k, v in ARM_SPEC.items() if k[0] in "PG" and k[1:2] in SWEEP_CAPS})
