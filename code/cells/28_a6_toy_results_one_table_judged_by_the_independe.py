# @title A6. Toy results: one table, judged by the independent Hessian referee (the same for every arm)
import glob
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
TOY = [json.load(open(p)) for p in sorted(glob.glob(os.path.join(TOY_DIR, "*.json"))) if os.path.basename(p) not in ("nh3_pes.json", "api_usage_toy.json", "toy_summary.json")]
rows = [d["summary"] for d in TOY]
def _line(s):
    r = s["referee"]
    return (f"{s['label']:12s} start {s.get('nudge_rms', '-')!s:>5} seed {s.get('seed', '-')!s:>3} | {s['outcome']:9s} | steps {s['steps']:3d} grads {s['gradients']:3d} | lowest mode {r['lowest_cm1']:7.0f} cm-1 "
            f"{'minimum' if r['is_minimum'] else 'SADDLE/NOT MIN'} | pinned {100*s['pinned_frac']:3.0f}% uphill {s['uphill_steps']:2d} | cap changes {s['n_cap_changes']} displaced {s['displaced']} rollbacks {s['n_rollbacks']} | LLM calls {s.get('llm', {}).get('calls', 0)}"
            + (" | DEGRADED" if s.get("degraded") else ""))
print("=== TRAP: planar NH3 (the saddle), nudged. Referee: is the end point a minimum? ===")
for s in sorted([r for r in rows if r["group"] == "saddle"], key=lambda r: (r["nudge_rms"], r["seed"], r["label"])): print(" ", _line(s))
print("\n=== STEP CAP: distorted NH3, start cap swept. Target fmax < 0.02 eV/A within the gradient budget ===")
for s in sorted([r for r in rows if r["group"] == "stepcap"], key=lambda r: (r["cap0"], r["label"])): print(f"  cap {s['cap0']:<7g}", _line(s))
sad = [r for r in rows if r["group"] == "saddle" and r["nudge_rms"] > 0]
if sad:
    for lab in ("plain", "rules", "llm"):
        g = [r for r in sad if r["label"] == lab]
        if g: print(f"\nNear-saddle starts, arm {lab}: minimum in {sum(r['referee']['is_minimum'] for r in g)} of {len(g)}; gradients {[r['gradients'] for r in g]}")
json.dump(rows, open(os.path.join(TOY_DIR, "toy_summary.json"), "w"), indent=1, default=_j)
cells = sorted({r["cap0"] for r in rows if r["group"] == "stepcap"})
if cells:
    fig, axes = plt.subplots(1, len(cells), figsize=(4.2 * len(cells), 3.4), squeeze=False)
    for ax, cap in zip(axes[0], cells):
        for d in TOY:
            s = d["summary"]
            if s["group"] != "stepcap" or s["cap0"] != cap: continue
            ax.plot([r["grads"] for r in d["steps"]], [r["fmax"] for r in d["steps"]], lw=2.0 if s["label"] in ("plain", "llm") else 1.0, label=s["label"])
        ax.axhline(FMAX_TARGET, color="#188038", ls=":"); ax.set_yscale("log"); ax.set_title(f"start cap {cap} A"); ax.set_xlabel("gradients")
    axes[0][0].set_ylabel("fmax (eV/A)"); axes[0][-1].legend(fontsize=7)
    fig.tight_layout(); fig.savefig(os.path.join(TOY_DIR, "figs", "toy_stepcap.png"), dpi=150); plt.close(fig)
print("\nSaved:", os.path.join(TOY_DIR, "toy_summary.json"))
