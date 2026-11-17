# @title 15c. Agent timeline plot: where each decision happened on the convergence curve
import json, os, glob
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
COL = {"CONTINUE": "#9aa0a6", "SET_PARAMS": "#1a73e8", "RESET_LBFGS_MEMORY": "#e8710a", "TIGHTEN_SCF": "#188038", "DISPLACE_ALONG_MODE": "#a142f4", "SWITCH_BASIN": "#d93025"}
rows_all = []
for run in sorted(glob.glob(os.path.join(EXPERIMENT_DIR, "*_*"))):
    sp, ep = os.path.join(run, "steps.jsonl"), os.path.join(run, "events.jsonl")
    if not (os.path.exists(sp) and os.path.exists(ep)): continue
    S = [json.loads(l) for l in open(sp) if l.strip()]; E = [json.loads(l) for l in open(ep) if l.strip()]
    calls = [e for e in E if e.get("kind") == "agent_call"]
    if not calls or not S: continue
    fig, (a1, a2) = plt.subplots(2, 1, figsize=(11, 6.5), sharex=True)
    g = [s["gradients"] for s in S]
    a1.plot(g, [s["fmax"] for s in S], color="#202124", lw=1.4); a1.set_yscale("log"); a1.set_ylabel("fmax"); a1.axhline(0.02, color="#188038", ls=":", lw=1)
    E0 = min(s["energy_eV"] for s in S); a2.plot(g, [(s["energy_eV"] - E0) * 1000 for s in S], color="#202124", lw=1.4); a2.set_yscale("symlog", linthresh=1); a2.set_ylabel("energy above run minimum (meV)"); a2.set_xlabel("gradients")
    for e in calls:
        d = e.get("decision") or {}; act = d.get("action", "?"); c = COL.get(act, "#5f6368")
        for a in (a1, a2): a.axvline(e["gradients"], color=c, alpha=0.55, lw=1.2 if act != "CONTINUE" else 0.7)
    for e in E:
        if e.get("kind") == "rollback":
            for a in (a1, a2): a.axvline(e["gradients"], color="#d93025", lw=2.5)
    a1.set_title(f"{os.path.basename(run)}: agent decisions on the optimization (blue = SET_PARAMS, orange = memory reset, grey = continue, red thick = rollback)")
    fig.tight_layout(); png = os.path.join(run, "agent_timeline.png"); fig.savefig(png, dpi=130); plt.close(fig); print("Saved", png); rows_all.append(png)
if not rows_all: print("No agent decisions in this session, nothing to plot.")
else:
    try:
        import zipfile
        zp = os.path.join(RESULTS_ROOT, f"agent_timeline_{MOLECULE.lower()}_{REQUIREMENT}{RUN_TAG}.zip")
        with zipfile.ZipFile(zp, "w") as z:
            for p in rows_all: z.write(p, os.path.relpath(p, EXPERIMENT_DIR))
    except Exception: pass
