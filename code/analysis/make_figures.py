"""Figures for the agent-vs-baseline NH3 saddle paper. Run after collect_logs.py, from the package root:
    python scripts/make_figures.py
Writes figures/fig{1..6}_*.{png,pdf,svg} (PNG at 600 dpi)."""
import json, os
import numpy as np
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW, DER, OUT = f"{ROOT}/data/raw", f"{ROOT}/data/derived", f"{ROOT}/figures"; os.makedirs(OUT, exist_ok=True)
plt.rcParams.update({"font.size": 9, "axes.spines.top": False, "axes.spines.right": False, "savefig.dpi": 600, "svg.fonttype": "none"})
AG, BL, RED, GRN, INK = "#d9822b", "#7a7a7a", "#c0392b", "#2e8b57", "#333333"
REP = {"R1": f"{RAW}/repeat1_notebook1", "R2": f"{RAW}/repeat2_notebook2"}
L = lambda rep, k: json.load(open(f"{REP[rep]}/{k}.json"))
meta = json.load(open(f"{DER}/run_outcomes.json")); EMIN = meta["E_min_eV"]; ES = meta["barrier_meV"]; rows = meta["runs"]
pes = json.load(open(f"{REP['R1']}/nh3_pes.json"))
def save(fig, name): [fig.savefig(f"{OUT}/{name}.{x}", bbox_inches="tight") for x in ("png", "pdf", "svg")]; plt.close(fig)

# ---------------------------------------------------------------- Fig 1: the challenge (concept) and how it plays out on NH3
fig = plt.figure(figsize=(7.4, 6.3))
gs = fig.add_gridspec(2, 2, height_ratios=[1, 1.08], hspace=0.32, wspace=0.12)
axA, axB, axC = fig.add_subplot(gs[0, 0]), fig.add_subplot(gs[0, 1]), fig.add_subplot(gs[1, :])
for ax in (axA, axB): ax.set_xlim(-1.25, 1.25); ax.set_ylim(-1.7, 1.95); ax.axis("off")
x = np.linspace(-1.05, 1.05, 300)
# A: false stop on a hilltop (saddle)
yA = 2.4 * (x**2 - 0.55)**2; axA.plot(x, yA, color=INK, lw=1.4)
axA.plot(0, 2.4 * 0.55**2 + 0.1, "o", ms=9, mfc=BL, mec=RED, mew=1.6, zorder=5)
axA.annotate("", xy=(0.70, 0.17), xytext=(0.1, 0.85), arrowprops=dict(arrowstyle="-|>", color=AG, lw=1.6, ls="--", connectionstyle="arc3,rad=-0.3"))
axA.plot(0.742, 0.1, "D", ms=7, color=AG, mec=GRN, mew=1.4, zorder=5)
axA.text(0, 1.2, "plain L-BFGS stops here:\nforces ≈ 0, reports converged", ha="center", fontsize=6.6, color=INK)
axA.text(0.74, -0.32, "agent: displace along the mode", ha="center", fontsize=6.3, color=AG)
axA.set_title("A. False stop on a hilltop (saddle point)", fontsize=8.2, loc="left", weight="bold")
axA.text(-1.2, -1.22, "Hidden fact: one direction still curves downhill.\nEvidence the agent needs: the curvature probe shows an\nimaginary mode (lowest wavenumber below −50 cm⁻¹).\nAgent action: DISPLACE_ALONG_MODE, then re-optimize.", fontsize=6.3, va="center")
axA.text(1.22, 1.85, "tested on NH$_3$", ha="right", fontsize=6.6, color="white", weight="bold", bbox=dict(boxstyle="round,pad=0.3", fc=GRN, ec="none"))
# B: stuck in a shallower valley
yB = 1.6 * (x**2 - 0.55)**2 - 0.45 * x; axB.plot(x, yB, color=INK, lw=1.4)
i1 = np.argmin(np.where(x < 0, yB, 9)); i2 = np.argmin(np.where(x > 0, yB, 9))
axB.plot(x[i1], yB[i1] + 0.1, "o", ms=9, mfc=BL, mec=GRN, mew=1.6, zorder=5); axB.plot(x[i2], yB[i2] + 0.1, "o", ms=9, mfc="white", mec=GRN, mew=1.6, zorder=5)
axB.text(x[i1] + 0.25, yB[i1] + 0.98, "plain L-BFGS stuck here:\na true but higher minimum", ha="center", fontsize=6.6)
axB.text(x[i2], yB[i2] - 0.3, "lower valley", ha="center", fontsize=6.6, color=GRN)
axB.set_title("B. Stuck in a shallower valley (local minimum)", fontsize=8.2, loc="left", weight="bold")
axB.text(-1.2, -1.22, "Hidden fact: a lower minimum lies over a barrier.\nEvidence the agent needs: an energy comparison that prefers\nthe other valley; the curvature probe is silent here\n(every mode is real). Agent action: switch basin.", fontsize=6.3, va="center")
axB.text(1.22, 1.85, "not testable on NH$_3$", ha="right", fontsize=6.6, color="white", weight="bold", bbox=dict(boxstyle="round,pad=0.3", fc=BL, ec="none"))
# C: ammonia, the real curve (Skala-1.1/def2-SVP scan)
h = np.array([p["h"] for p in pes]); e = np.array([p["E_rel_kcal"] for p in pes])
hh = np.concatenate([-h[::-1], h[1:]]); ee = np.concatenate([e[::-1], e[1:]]); xs = np.linspace(-0.6, 0.6, 300); cf = np.polyfit(hh, ee, 6)
axC.plot(xs, np.polyval(cf, xs), color=INK, lw=1.5); axC.plot(hh, ee, "o", color=INK, ms=2.8)
axC.plot(0, 7.4 + 0.35, "o", ms=10, mfc=BL, mec=RED, mew=1.8, zorder=5)
axC.text(0, 8.35, "planar saddle, 7.4 kcal/mol: 8 of 10 plain L-BFGS runs stop here\n(referee: imaginary mode −906 to −910 cm⁻¹)", ha="center", fontsize=6.8)
axC.annotate("", xy=(0.40, 0.75), xytext=(0.05, 7.1), arrowprops=dict(arrowstyle="-|>", color=AG, lw=1.8, ls="--", connectionstyle="arc3,rad=-0.25"))
axC.plot(0.418, 0.3, "D", ms=8, color=AG, mec=GRN, mew=1.5, zorder=5)
axC.text(0.62, 4.6, "agent-guided run:\n(1) forces fall below target on the saddle\n(2) code probes the curvature: imaginary mode\n(3) Gemini answers DISPLACE_ALONG_MODE, 0.2 Å\n(4) L-BFGS rolls downhill\n(5) probe again: all modes real, run stops", fontsize=6.4, color=INK, va="center",
         bbox=dict(boxstyle="round,pad=0.4", fc="#fbeee0", ec=AG, lw=0.8))
axC.text(0.418, -1.0, "6 of 6 agent runs end here\n(+1118 to +1128 cm⁻¹)", ha="center", fontsize=6.6, color=GRN, va="top")
axC.text(-0.418, -1.0, "mirror-image well,\nequally correct", ha="center", fontsize=6.6, color=BL, va="top")
axC.set_xlim(-0.66, 1.1); axC.set_ylim(-3.0, 9.6); axC.set_xticks([-0.6, -0.4, -0.2, 0, 0.2, 0.4, 0.6]); axC.set_xlabel("N height above the H$_3$ plane, $h$ (Å)  [scan mirrored]", fontsize=7.5)
axC.set_ylabel("relaxed energy (kcal/mol)", fontsize=7.5); axC.tick_params(labelsize=7); axC.set_yticks([0, 2, 4, 6, 8])
axC.set_title("C. Ammonia (Skala-1.1/def2-SVP): the hilltop trap is real; the two wells are equal, so no shallower valley", fontsize=8.0, loc="left", weight="bold")
save(fig, "fig1_challenge_schematic")

# ---------------------------------------------------------------- Fig 2: how the agent works (schematic)
fig, ax = plt.subplots(figsize=(7.4, 3.7)); ax.set_xlim(0, 104); ax.set_ylim(-6, 52); ax.axis("off")
def box(x, y, w, h, t, fc="#f7f7f7", ec=INK, fs=7):
    ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.4,rounding_size=1.2", fc=fc, ec=ec, lw=0.9))
    ax.text(x + w / 2, y + h / 2, t, ha="center", va="center", fontsize=fs)
def arr(x1, y1, x2, y2, t="", c=INK, dy=2.2, cs=None):
    ax.add_patch(FancyArrowPatch((x1, y1), (x2, y2), arrowstyle="-|>", mutation_scale=9, lw=0.9, color=c, connectionstyle=cs or "arc3"))
    if t: ax.text((x1 + x2) / 2, max(y1, y2) + dy, t, ha="center", va="bottom", fontsize=6, color=c)
W = 17; X = [1, 29, 57, 85]
box(X[0], 34, W, 11, "L-BFGS step\n(Skala-1.1 energy\n+ forces)", fc="#eef3f8")
box(X[1], 34, W, 11, "Monitor (code):\npinned / uphill /\noscillation", fc="#eef3f8")
box(X[2], 34, W, 11, "Gemini (fast)\nreads features,\nreturns one typed\nJSON action", fc="#fbeee0", ec=AG)
box(X[3], 34, W, 11, "Validator +\n5-step probation;\nrollback if the\nrun gets worse", fc="#eaf4ee", ec=GRN)
arr(X[0]+W+.8, 39.5, X[1]-.8, 39.5); arr(X[1]+W+.8, 39.5, X[2]-.8, 39.5, "trigger"); arr(X[2]+W+.8, 39.5, X[3]-.8, 39.5, "CONTINUE /\nSET_PARAMS")
arr(X[3]+W/2, 33.2, X[0]+W/2+3, 33.2, cs="arc3,rad=-0.12"); ax.text(52, 25.8, "next step (no call when no trigger fires)", ha="center", fontsize=6.2)
box(X[0], 6, W, 11, "fmax < 0.02 eV/Å\n(apparent\nconvergence)", fc="#fdecea", ec=RED)
box(X[1], 6, W, 11, "Curvature probe\n(code): Hessian,\nlowest mode", fc="#eef3f8")
box(X[2], 6, W, 11, "Gemini (strong)\nreads the probe,\nreturns one typed\nJSON action", fc="#fbeee0", ec=AG)
box(X[3], 6, W, 11, "DISPLACE 0.2 Å\nalong the imaginary\nmode; restart\nL-BFGS", fc="#eaf4ee", ec=GRN)
arr(X[0]+4, 33.4, X[0]+4, 17.6); ax.text(X[0]+5, 27.5, "forces\nbelow\ntarget", fontsize=6.2, va="center")
arr(X[0]+W+.8, 11.5, X[1]-.8, 11.5); arr(X[1]+W+.8, 11.5, X[2]-.8, 11.5); arr(X[2]+W+.8, 11.5, X[3]-.8, 11.5)
ax.text((X[1]+W+X[2])/2, 4.2, "mode\n< −50 cm⁻¹", ha="center", va="top", fontsize=6); ax.text((X[2]+W+X[3])/2, 4.2, "evidence-\ngated", ha="center", va="top", fontsize=6)
arr(X[3]+W-3, 17.6, X[3]+W-3, 33.4); ax.text(X[3]+W-4, 27.5, "keep\noptimizing", fontsize=6.2, va="center", ha="right")
ax.text(X[1]+W/2, -4.5, "mode > −50 cm⁻¹ → verified minimum, run ends (no call)", ha="center", fontsize=6.6, color=GRN, weight="bold")
ax.text(0, 50, "Code measures; Gemini chooses one typed action; guards bound the effect; the model never writes coordinates.", fontsize=7, color=INK, style="italic")
save(fig, "fig2_agent_loop")

# ---------------------------------------------------------------- Fig 2: double well and where every run ended
h = np.array([p["h"] for p in pes]); e = np.array([p["E_rel_kcal"] for p in pes])
hh = np.concatenate([-h[::-1], h[1:]]); ee = np.concatenate([e[::-1], e[1:]]); xs = np.linspace(-0.6, 0.6, 300); cf = np.polyfit(hh, ee, 6)
fig, ax = plt.subplots(figsize=(6.8, 3.1))
ax.plot(xs, np.polyval(cf, xs), color=INK, lw=1.4); ax.plot(hh, ee, "o", color=INK, ms=3.2)
bad = [r for r in rows if r["verdict"] == "SADDLE"]; good = [r for r in rows if r["verdict"] == "minimum"]
for i, r in enumerate(bad): ax.plot(0, 9.3 + 0.55 * i, "o", color=BL, mec=RED, mew=1.4, ms=6)
ag = [r for r in good if r["arm_short"] == "agent"]; pl = [r for r in good if r["arm_short"] != "agent"]
for i, r in enumerate(ag): ax.plot(0.372 + 0.036 * (i % 3), 1.0 + 0.6 * (i // 3), "D", color=AG, mec=GRN, mew=1.3, ms=6)
for i, r in enumerate(pl): ax.plot(0.372 + 0.036 * i, 2.3, "o", color=BL, mec=GRN, mew=1.3, ms=6)
ax.text(0.05, 9.3 + 0.55 * (len(bad) - 1) / 2, f"{len(bad)} baseline runs stopped on the saddle\n(plain m20 ×4, m1 ×2, m100, line search)", fontsize=7.2, va="center")
ax.text(0.62, 1.6, f"pyramidal minimum:\nall {len(ag)} agent-guided runs\n+ {len(pl)} lucky plain runs", fontsize=7.2, va="center")
ax.annotate("planar saddle\n7.4 kcal/mol (323 meV)", xy=(0, 7.4), xytext=(-0.42, 8.9), fontsize=7.2, ha="center", arrowprops=dict(arrowstyle="-", lw=0.6, color="#555"))
ax.set_xlabel("N height above the H$_3$ plane, $h$ (Å)  [scan mirrored]"); ax.set_ylabel("relaxed energy (kcal/mol)")
ax.set_xlim(-0.65, 1.12); ax.set_ylim(-0.4, 9.3 + 0.55 * len(bad) + 0.2)
ax.legend(handles=[Line2D([], [], marker="o", ls="", color=BL, ms=6, label="baseline L-BFGS"), Line2D([], [], marker="D", ls="", color=AG, ms=6, label="agent-guided (Gemini)"),
                   Line2D([], [], marker="o", ls="", mfc="white", mec=RED, mew=1.4, label="referee: saddle"), Line2D([], [], marker="o", ls="", mfc="white", mec=GRN, mew=1.4, label="referee: minimum")],
          fontsize=6.8, frameon=False, loc="center right", bbox_to_anchor=(1.0, 0.6))
save(fig, "fig3_double_well_endpoints")

# ---------------------------------------------------------------- Fig 3: outcome grid
starts = [("saddle_n0.0_s11", "exact saddle"), ("saddle_n0.01_s21", "nudge 0.01 Å, seed 21"), ("saddle_n0.01_s22", "nudge 0.01 Å, seed 22")]
arms = [("plain", "plain L-BFGS\nmemory 20"), ("plain_m1", "plain\nmemory 1"), ("plain_m100", "plain\nmemory 100"), ("linesearch_m20", "line search\nmemory 20"), ("llm", "agent-guided\n(Gemini)")]
fig, axs = plt.subplots(1, 2, figsize=(7.2, 2.6), sharey=True)
for ax, (rep, t) in zip(axs, [("R1", "repeat 1 (notebook 1)"), ("R2", "repeat 2 (notebook 2)")]):
    for i, (sk, sl) in enumerate(starts):
        for j, (ak, al) in enumerate(arms):
            p = f"{REP[rep]}/{sk}_{ak}.json"
            if not os.path.exists(p):
                ax.add_patch(plt.Rectangle((j, i), .94, .9, fc="#f2f2f2", ec="none")); ax.text(j+.47, i+.45, "not run", ha="center", va="center", fontsize=5.8, color="#999"); continue
            s = json.load(open(p))["summary"]; m = s["referee"]["is_minimum"]
            ax.add_patch(plt.Rectangle((j, i), .94, .9, fc=GRN if m else RED, ec="none", alpha=.88))
            ax.text(j+.47, i+.45, f"{'minimum' if m else 'SADDLE'}\n{s['referee']['lowest_cm1']:+.0f} cm$^{{-1}}$", ha="center", va="center", fontsize=5.6, color="white")
    ax.set_xlim(0, len(arms)); ax.set_ylim(len(starts), 0); ax.tick_params(length=0)
    ax.set_xticks([j+.47 for j in range(len(arms))]); ax.set_xticklabels([a[1] for a in arms], fontsize=6)
    ax.set_yticks([i+.45 for i in range(len(starts))]); ax.set_yticklabels([s[1] for s in starts], fontsize=7)
    [sp.set_visible(False) for sp in ax.spines.values()]; ax.set_title(t, fontsize=8.5)
fig.tight_layout(); save(fig, "fig4_outcome_grid")

# ---------------------------------------------------------------- Fig 4: navigation traces, baseline vs agent
cases = [("R1", "saddle_n0.0_s11", "(a) exact saddle (repeat 1)"), ("R2", "saddle_n0.01_s21", "(b) nudge, seed 21 (repeat 2)"), ("R2", "saddle_n0.01_s22", "(c) nudge, seed 22 (repeat 2)")]
def marks(ax, r, fm):
    for e in r["events"]:
        y = fm.get(e["step"]); a = e.get("action") or {}
        if y is None: continue
        if e["kind"] == "final_check": ax.plot(e["step"], y, "v" if not e["evidence"]["is_minimum"] else "^", ms=7, mfc=RED if not e["evidence"]["is_minimum"] else GRN, mec=AG, zorder=5)
        elif e["kind"] == "decision" and a.get("action") == "SET_PARAMS": ax.plot(e["step"], y, "D", ms=4.5, mfc="white", mec=AG, mew=1.2, zorder=5)
        elif e["kind"] == "rollback": ax.plot(e["step"], y, "x", ms=6, color=AG, mew=1.5, zorder=5)
fig, axs = plt.subplots(2, 3, figsize=(7.4, 4.6), sharex="col")
for c, (rep, k, t) in enumerate(cases):
    for arm, col in (("plain", BL), ("llm", AG)):
        r = L(rep, f"{k}_{arm}"); st = r["steps"]; x = [q["step"] for q in st]; s = r["summary"]
        E = np.maximum((np.array([q["energy"] for q in st]) - EMIN) * 1000, .05); F = [q["fmax"] for q in st]
        kw = dict(color=col, lw=1.3, marker="o" if len(x) < 3 else None, ms=4.5)
        axs[0, c].plot(x, E, label=f"{'baseline' if arm == 'plain' else 'agent'}: {'minimum' if s['referee']['is_minimum'] else 'SADDLE'} ({s['referee']['lowest_cm1']:+.0f})", **kw); axs[1, c].plot(x, F, **kw)
        if arm == "llm": marks(axs[1, c], r, {q["step"]: q["fmax"] for q in st})
    axs[0, c].axhline(ES, color=RED, lw=.6, alpha=.7); axs[0, c].text(.02, .93, "saddle energy", transform=axs[0, c].get_yaxis_transform(), fontsize=6.3, color=RED, va="top")
    axs[0, c].set_yscale("log"); axs[0, c].set_title(t, fontsize=8, loc="left"); axs[0, c].legend(fontsize=5.9, frameon=False, loc="lower left")
    axs[1, c].axhline(.02, color="k", lw=.6, ls="--"); axs[1, c].set_yscale("log"); axs[1, c].set_xlabel("optimizer step")
axs[0, 0].set_ylabel("E − E$_{min}$ (meV)"); axs[1, 0].set_ylabel("fmax (eV/Å); dashed = target")
fig.legend(handles=[Line2D([], [], marker="v", ls="", mfc=RED, mec=AG, ms=7, label="probe: imaginary mode → agent displaces"), Line2D([], [], marker="^", ls="", mfc=GRN, mec=AG, ms=7, label="probe: minimum confirmed"),
                    Line2D([], [], marker="D", ls="", mfc="white", mec=AG, ms=4.5, label="agent changes step cap"), Line2D([], [], marker="x", ls="", color=AG, ms=6, label="probation failed → rollback")],
           fontsize=6.5, frameon=False, loc="lower center", ncol=4)
fig.tight_layout(rect=(0, .05, 1, 1)); save(fig, "fig5_navigation_traces")

# ---------------------------------------------------------------- Fig 5: what the agent decided, step by step (repeat 2)
fig, axs = plt.subplots(3, 1, figsize=(7.2, 5.4), sharex=True)
for ax, (rep, k, t) in zip(axs, cases):
    r = L("R2", f"{k}_llm"); st = r["steps"]; x = [q["step"] for q in st]; cap = {q["step"]: q["cap"] for q in st}
    ax.step(x, [cap[i] for i in x], where="post", color=AG, lw=1.3); ax.set_ylim(0, 0.2); ax.set_yticks([0, 0.05, 0.1]); ax.set_ylabel("step cap (Å)", fontsize=7)
    ax.text(0.005, 1.0, t.split(" (")[0] + " (repeat 2)", transform=ax.transAxes, fontsize=7.5, va="bottom")
    pb = L("R2", f"{k}_plain")["summary"]; ax.axvline(pb["steps"], color=BL, lw=1, ls=":")
    ax.text(pb["steps"] + 0.4, 0.075, f"baseline stops\non the saddle\n({pb['referee']['lowest_cm1']:+.0f} cm⁻¹)", fontsize=6, color=BL, va="center")
    for e in r["events"]:
        a = e.get("action") or {}; s_ = e["step"]
        if e["kind"] == "decision" and "no LLM call" not in a.get("reason", ""):
            ax.plot(s_, 0.012, "D" if a["action"] == "SET_PARAMS" else "o", ms=5.5 if a["action"] == "SET_PARAMS" else 4.5, mfc=AG if a["action"] == "SET_PARAMS" else "white", mec=AG, zorder=5)
        if e["kind"] == "final_check":
            neg = not e["evidence"]["is_minimum"]
            ax.plot(s_, 0.18 if neg else 0.145, "v" if neg else "^", ms=8, mfc=RED if neg else GRN, mec=AG, zorder=5)
            ax.text(s_ + 0.7, 0.18 if neg else 0.145, f"{e['evidence']['lowest_cm1']:+.0f} cm⁻¹ → " + ("displace 0.2 Å" if neg else "verified minimum, end"), fontsize=6.2, va="center", ha="left")
        if e["kind"] == "rollback": ax.plot(s_, cap.get(s_, 0.05), "x", ms=7, color=RED, mew=1.6, zorder=6)
        if e["kind"] == "probation_kept": ax.plot(s_, cap.get(s_, 0.05) + 0.012, marker="$✓$", ms=6, color=GRN, ls="")
axs[-1].set_xlabel("optimizer step"); axs[-1].set_xlim(0, 52)
fig.legend(handles=[Line2D([], [], color=AG, lw=1.3, label="step cap set by the agent"), Line2D([], [], marker="o", ls="", mfc="white", mec=AG, label="Gemini call → CONTINUE"),
                    Line2D([], [], marker="D", ls="", mfc=AG, mec=AG, label="Gemini call → SET_PARAMS"), Line2D([], [], marker="v", ls="", mfc=RED, mec=AG, ms=7, label="probe → Gemini → DISPLACE"),
                    Line2D([], [], marker="^", ls="", mfc=GRN, mec=AG, ms=7, label="probe: minimum (no call)"), Line2D([], [], marker="x", ls="", color=RED, ms=6, label="probation failed → rollback"),
                    Line2D([], [], marker="$✓$", ls="", color=GRN, ms=6, label="probation kept")], fontsize=6.3, frameon=False, loc="lower center", ncol=4)
fig.tight_layout(rect=(0, .09, 1, 1)); save(fig, "fig6_agent_decision_timeline")

print("figures written")
