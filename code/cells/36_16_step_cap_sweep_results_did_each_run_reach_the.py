# @title 16. Step-cap sweep results: did each run reach the target, and what did the agent change?
import glob, collections
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
SW = {}
for run in sorted(glob.glob(os.path.join(EXPERIMENT_DIR, "*_" + STARTS[0]))):
    arm = os.path.basename(run).rsplit("_", 1)[0]
    if arm not in ARM_SPEC or not os.path.exists(os.path.join(run, "summary.json")): continue
    d = load_run(run); SW[arm] = d
def first_cross(d):
    for i, r in enumerate(d["steps"], 1):
        if r["fmax"] <= ENDPOINT_FMAX: return i, r["gradients"]
    return None, None
rows = []
for arm, d in SW.items():
    S, E, sm = d["steps"], d["events"], d["summary"]; fc_step, fc_grad = first_cross(d)
    dE = [S[i]["energy_eV"] - S[i-1]["energy_eV"] for i in range(1, len(S))]; ups = [x for x in dE if x > 1e-3]
    changes = [(e.get("step"), (e.get("params") or {}).get("maxstep")) for e in E if e.get("kind") == "action_applied" and e.get("action") == "SET_PARAMS" and (e.get("params") or {}).get("maxstep") is not None]
    trig = collections.Counter(e.get("trigger") for e in E if e.get("kind") == "trigger")
    rows.append(dict(arm=arm, label=ARM_SPEC[arm]["label"], converged=sm.get("converged"), status=sm.get("status"), steps=sm.get("steps_total"), grads=sm.get("gradients_optimization"),
                     first_cross_step=fc_step, first_cross_grad=fc_grad, final_fmax=sm.get("final_fmax"), final_E=sm.get("final_energy_eV"),
                     pinned_pct=round(100 * float(np.mean([r["max_move"] >= 0.95 * r["maxstep"] for r in S])), 0) if S else None,
                     uphill_steps=len(ups), worst_rise_meV=round(1000 * max(ups), 1) if ups else 0.0, cap_changes=changes, triggers=dict(trig),
                     agent_calls=sum(e.get("kind") == "agent_call" and e.get("status") == "ok" for e in E), rollbacks=sum(e.get("kind") == "rollback" for e in E),
                     negative_curvature=sm.get("curvature_any_negative"), degraded=sm.get("agent_integrity") == "degraded"))
order = ["PS", "GS", "GS2", "PM", "GM", "GM2", "PB", "GB", "GB2"]
rows.sort(key=lambda r: order.index(r["arm"]) if r["arm"] in order else 99)
print(f"{'arm':4s} {'reached':8s} {'first<=0.02 (step/grad)':24s} {'steps':5s} {'grads':5s} {'pinned%':7s} {'uphill':6s} {'worst rise meV':14s} {'agent calls':11s} cap changes (step, new cap)")
for r in rows:
    print(f"{r['arm']:4s} {str(r['converged']):8s} {str(r['first_cross_step'])+'/'+str(r['first_cross_grad']):24s} {str(r['steps']):5s} {str(r['grads']):5s} {str(r['pinned_pct']):7s} {r['uphill_steps']:6d} {r['worst_rise_meV']:14.1f} {r['agent_calls']:11d} {r['cap_changes']}"
          + ("  DEGRADED" if r["degraded"] else ""))
json.dump(rows, open(os.path.join(EXPERIMENT_DIR, "sweep_summary.json"), "w"), indent=1, default=float)
fig, axes = plt.subplots(1, 3, figsize=(15, 3.8), sharey=True)
for ax, (c, cap) in zip(axes, SWEEP_CAPS.items()):
    for arm in (f"P{c}", f"G{c}", f"G{c}2"):
        if arm not in SW: continue
        S = SW[arm]["steps"]; ax.plot([r["gradients"] for r in S], [r["fmax"] for r in S], lw=2 if arm[0] == "P" else 1.3, label=arm, color="#202124" if arm[0] == "P" else None)
        for e in SW[arm]["events"]:
            if e.get("kind") == "action_applied" and e.get("action") == "SET_PARAMS": ax.axvline(e["gradients"], color="#1a73e8", alpha=0.35, lw=1)
    ax.axhline(ENDPOINT_FMAX, color="#188038", ls=":"); ax.set_yscale("log"); ax.set_title(f"start cap {cap} A ({'too small' if c == 'S' else 'reasonable' if c == 'M' else 'too big'})"); ax.set_xlabel("gradients"); ax.legend(fontsize=8)
axes[0].set_ylabel("fmax"); fig.tight_layout(); os.makedirs(os.path.join(EXPERIMENT_DIR, "figures"), exist_ok=True)
fig.savefig(os.path.join(EXPERIMENT_DIR, "figures", "sweep_fmax.png"), dpi=150); plt.show()
print("Reading guide: plain = black. Blue verticals = logged cap changes (SET_PARAMS) by the agent. These are single runs (two agent repeats on some cells): a pilot, not statistics.")
print("The plain arms here use memory 20 and the warm start, so any difference to the agent is NOT explained by those two settings.")
