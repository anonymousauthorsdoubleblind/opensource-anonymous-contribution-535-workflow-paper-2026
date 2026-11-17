"""Step 1-3 of the analysis: collect every ammonia (NH3) toy log, keep only the agent-guided (Gemini) runs and the plain
L-BFGS baselines, and write the derived data and the paper's tables.
Usage (from the package root):  python scripts/collect_logs.py
Inputs : data/raw/repeat{1,2}_notebook{1,2}/*.json, data/raw/repeat2_pre_fix_discarded/*.json, data/raw/gemini_call_logs/*.jsonl
Outputs: data/derived/*.csv|json and tables/T*.md|csv"""
import json, glob, os, csv, statistics as st
import numpy as np
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW, DER, TAB = f"{ROOT}/data/raw", f"{ROOT}/data/derived", f"{ROOT}/tables"
os.makedirs(DER, exist_ok=True); os.makedirs(TAB, exist_ok=True)
REP = {"R1": f"{RAW}/repeat1_notebook1", "R2": f"{RAW}/repeat2_notebook2"}
START = {"saddle_n0.0_s11": "exact saddle", "saddle_n0.01_s21": "nudge 0.01 Å, seed 21", "saddle_n0.01_s22": "nudge 0.01 Å, seed 22"}
ARM = {"plain": "baseline: plain L-BFGS, memory 20", "plain_m1": "baseline: plain L-BFGS, memory 1", "plain_m100": "baseline: plain L-BFGS, memory 100",
       "linesearch_m20": "baseline: line-search L-BFGS, memory 20", "llm": "agent-guided (Gemini)"}
SHORT = {"plain": "plain m20", "plain_m1": "plain m1", "plain_m100": "plain m100", "linesearch_m20": "line search m20", "llm": "agent"}

def height(pos):
    p = np.array(pos); n, H = p[0], p[1:]
    v = np.cross(H[1] - H[0], H[2] - H[0]); v /= np.linalg.norm(v)
    return abs(float(np.dot(n - H.mean(0), v)))

def split(key):
    for s in START:
        if key.startswith(s + "_"): return s, key[len(s) + 1:]

runs = {}
for rep, d in REP.items():
    for f in sorted(glob.glob(f"{d}/saddle_*.json")):
        k = os.path.basename(f)[:-5]; s, a = split(k); runs[(rep, s, a)] = json.load(open(f))
pre = json.load(open(f"{RAW}/repeat2_pre_fix_discarded/saddle_n0.01_s22_llm.json"))
pes = json.load(open(f"{REP['R1']}/nh3_pes.json"))
EMIN = min(r["summary"]["final_energy_eV"] for r in runs.values() if r["summary"]["referee"]["is_minimum"])
E_SADDLE = pes[0]["E_eV"]

def write(name, rows, cols, md_title=None, md_cols=None):
    with open(f"{TAB}/{name}.csv" if md_title else f"{DER}/{name}.csv", "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=cols); w.writeheader(); [w.writerow({c: r.get(c, "") for c in cols}) for r in rows]
    if md_title:
        mc = md_cols or cols
        lines = [f"**{md_title}**", "", "| " + " | ".join(mc) + " |", "|" + "---|" * len(mc)]
        lines += ["| " + " | ".join(str(r.get(c, "")) for c in mc) + " |" for r in rows]
        open(f"{TAB}/{name}.md", "w").write("\n".join(lines) + "\n")

# ---------------------------------------------------------------- per-run outcomes (T2) and all steps
out, steps = [], []
order = [(rep, s, a) for s in START for a in ARM for rep in REP if (rep, s, a) in runs]
for key in order:
    rep, s, a = key; r = runs[key]; m = r["summary"]; ev = r["events"]
    probes = [e for e in ev if e["kind"] == "final_check"]
    row = dict(repeat=rep, start=START[s], arm=ARM[a], arm_short=SHORT[a], memory=m["memory"], outcome=m["outcome"],
               verdict="minimum" if m["referee"]["is_minimum"] else "SADDLE", lowest_mode_cm1=round(m["referee"]["lowest_cm1"]),
               steps=m["steps"], gradients=m["gradients"], probe_gradients=24 * len(probes), probes=len(probes),
               final_h_A=round(height(m["final_positions"]), 3), start_h_A=round(height(m["start_positions"]), 3),
               E_above_min_meV=round((m["final_energy_eV"] - EMIN) * 1000, 2), final_fmax=round(m["final_fmax"], 4),
               uphill_steps=m["uphill_steps"], gemini_calls=m["llm"]["calls"], displacements=m["displaced"], rollbacks=m["n_rollbacks"],
               cap_changes=m["n_cap_changes"])
    out.append(row)
    for q in r["steps"]:
        steps.append(dict(repeat=rep, start=START[s], arm=SHORT[a], step=q["step"], energy_eV=q["energy"], E_above_min_meV=round((q["energy"] - EMIN) * 1000, 4),
                          fmax=q["fmax"], cap_A=q["cap"], gradients_so_far=q["grads"]))
json.dump(dict(E_min_eV=EMIN, E_saddle_scan_eV=E_SADDLE, barrier_meV=(E_SADDLE - EMIN) * 1000, runs=out), open(f"{DER}/run_outcomes.json", "w"), indent=1)
write("all_step_records", steps, list(steps[0].keys()))
t2c = ["repeat", "start", "arm_short", "verdict", "lowest_mode_cm1", "steps", "gradients", "probes", "final_h_A", "E_above_min_meV"]
write("T2_every_run", out, list(out[0].keys()), "Table S2. Every saddle-start run (agent-guided and baselines), judged by the independent Hessian referee.", t2c)

# ---------------------------------------------------------------- T3 tally
t3 = []
for a in ARM:
    rr = [o for o in out if o["arm"] == ARM[a]]
    if not rr: continue
    t3.append(dict(arm=ARM[a], runs=len(rr), at_minimum=sum(o["verdict"] == "minimum" for o in rr), on_saddle=sum(o["verdict"] == "SADDLE" for o in rr),
                   gradients_range=f"{min(o['gradients'] for o in rr)}–{max(o['gradients'] for o in rr)}",
                   final_h_range_A=f"{min(o['final_h_A'] for o in rr):.3f}–{max(o['final_h_A'] for o in rr):.3f}"))
write("T3_tally", t3, list(t3[0].keys()), "Table S3. Outcome tally, agent-guided optimizer against the baselines.")

# ---------------------------------------------------------------- Gemini call log (toy calls only)
calls = []
for nb, rep in (("notebook1", "R1"), ("notebook2", "R2")):
    for l in open(f"{RAW}/gemini_call_logs/{nb}_all_calls.jsonl"):
        c = json.loads(l)
        if not c.get("label", "").startswith("toy/"): continue
        _, run, kind = c["label"].split("/")
        status = "reported"
        if rep == "R2" and "s22" in run and c["t"] < "2026-11-07": status = "discarded (pre-fix attempt)"
        payload = json.loads(c["prompt"][0]["parts"][0]["text"].split("```json\n", 1)[1].rsplit("```", 1)[0])
        ans = json.loads(c["answer"]["parts"][0]["text"])
        calls.append(dict(repeat=rep, status=status, time=c["t"], run=run.replace("_llm", ""), start=START[run.replace("_llm", "")], kind=kind,
                          model=c["meta"]["model"], ok=c["ok"], latency_s=c["meta"]["latency_s"], prompt_tokens=c["tokens"]["prompt"],
                          output_tokens=c["tokens"]["output"], evidence=json.dumps(payload), action=ans.get("action"),
                          parameter=ans.get("maxstep", ans.get("amplitude_A", "")), reason=ans.get("reason", "")))
write("gemini_toy_calls", calls, list(calls[0].keys()))
json.dump(calls, open(f"{DER}/gemini_toy_calls.json", "w"), indent=1)

# ---------------------------------------------------------------- T4 call accounting per agent run (reported runs)
t4 = []
for rep in REP:
    for s in START:
        cc = [c for c in calls if c["repeat"] == rep and c["run"] == s and c["status"] == "reported"]
        r = runs[(rep, s, "llm")]; ev = r["events"]
        acts = [e for e in ev if e.get("action")]
        t4.append(dict(repeat=rep, start=START[s], gemini_calls=len(cc), step_trigger_calls=sum(c["kind"] == "step" for c in cc),
                       probe_result_calls=sum(c["kind"] == "final" for c in cc),
                       answered_CONTINUE=sum(c["action"] == "CONTINUE" for c in cc), answered_SET_PARAMS=sum(c["action"] == "SET_PARAMS" for c in cc),
                       answered_DISPLACE=sum(c["action"] == "DISPLACE_ALONG_MODE" for c in cc),
                       rejected_by_validator=sum(e.get("verdict") == "rejected" for e in acts),
                       steps_without_call=r["summary"]["llm"]["skipped_no_trigger"],
                       median_latency_s=round(st.median([c["latency_s"] for c in cc]), 1), failed_calls=sum(not c["ok"] for c in cc)))
tot = {k: sum(x[k] for x in t4) for k in t4[0] if k not in ("repeat", "start", "median_latency_s")}
tot.update(repeat="all", start="6 runs", median_latency_s=round(st.median([c["latency_s"] for c in calls if c["status"] == "reported"]), 1))
t4.append(tot)
write("T4_gemini_call_accounting", t4, list(t4[0].keys()), "Table S4. Gemini calls and answers in the six reported agent-guided runs.")

# ---------------------------------------------------------------- T5 full decision log of every agent run (each model answer + probes + guard events)
t5 = []
def decision_rows(rep, s, r, status):
    rows = []; prev_disp = None
    for e in r["events"]:
        a = e.get("action") or {}; k = e["kind"]
        if k == "decision" and a.get("action") == "CONTINUE" and "no LLM call" in a.get("reason", ""): continue
        if k == "decision":
            f = e["features"]; ev = f"fmax {f['fmax']:.3f}, cap {f['cap']:.3g} Å, pinned {f['pinned_last5']}/5, uphill {f['uphill_last5']}/5, oscillation {f['oscillation']}"
            what = a.get("action") + (f" → cap {a['maxstep']:.3g} Å" if a.get("action") == "SET_PARAMS" else "")
        elif k == "final_check":
            ev = f"probe: lowest mode {e['evidence']['lowest_cm1']:+.0f} cm⁻¹ ({'minimum' if e['evidence']['is_minimum'] else 'imaginary mode'})"
            what = a.get("action") + (f" {a['amplitude_A']} Å" if a.get("action") == "DISPLACE_ALONG_MODE" else "")
        elif k == "rollback": ev, what = "probation: run got worse", "ROLLBACK to checkpoint"
        elif k == "probation_kept": ev, what = "probation: run did not get worse", "change kept"
        elif k == "supervisor_off": ev, what = "two failed probations", "cap changes switched off"
        else: continue
        rows.append(dict(repeat=rep, status=status, start=START[s], step=e["step"], event=k, evidence=ev, action=what,
                         verdict=e.get("verdict", ""), model=a.get("model", "(no call)" if k == "final_check" else ""), reason=a.get("reason", "")))
    return rows
for rep in REP:
    for s in START: t5 += decision_rows(rep, s, runs[(rep, s, "llm")], "reported")
t5 += decision_rows("R2", "saddle_n0.01_s22", pre, "discarded (pre-fix harness)")
write("T5_full_agent_decision_log", t5, list(t5[0].keys()), "Table S5 (full). Every model answer, probe and guard event in every agent-guided run.",
      ["repeat", "status", "start", "step", "event", "evidence", "action", "verdict", "reason"])

# ---------------------------------------------------------------- T6 probe record
t6 = []
for rep in REP:
    for s in START:
        for e in runs[(rep, s, "llm")]["events"]:
            if e["kind"] == "final_check":
                t6.append(dict(repeat=rep, start=START[s], step=e["step"], lowest_mode_cm1=round(e["evidence"]["lowest_cm1"], 1),
                               reading="imaginary mode (saddle)" if not e["evidence"]["is_minimum"] else "minimum",
                               agent_action=e["action"]["action"], amplitude_A=e["action"].get("amplitude_A", ""), verdict=e["verdict"],
                               model=e["action"].get("model", "(no call needed)")))
write("T6_curvature_probes", t6, list(t6[0].keys()), "Table S6. Every curvature probe in the reported agent-guided runs and the agent's answer.")

# ---------------------------------------------------------------- T7 reproducibility across repeats
t7 = []
for s in START:
    for a in ("plain", "llm"):
        x, y = runs[("R1", s, a)]["summary"], runs[("R2", s, a)]["summary"]
        t7.append(dict(start=START[s], arm=ARM[a], repeat1=f"{'minimum' if x['referee']['is_minimum'] else 'SADDLE'}, {x['steps']} steps",
                       repeat2=f"{'minimum' if y['referee']['is_minimum'] else 'SADDLE'}, {y['steps']} steps",
                       same_verdict=x["referee"]["is_minimum"] == y["referee"]["is_minimum"],
                       final_energy_difference_meV=round(abs(x["final_energy_eV"] - y["final_energy_eV"]) * 1000, 4)))
write("T7_reproducibility", t7, list(t7[0].keys()), "Table S7. Same start, same code, two sessions: does the verdict repeat?")

# ---------------------------------------------------------------- T8 cost
t8 = []
for o in out:
    if o["arm_short"] in ("plain m20", "agent"):
        t8.append(dict(repeat=o["repeat"], start=o["start"], arm=o["arm"], verdict=o["verdict"], optimizer_gradients=o["gradients"] - o["probe_gradients"],
                       probe_gradients=o["probe_gradients"], total_gradients=o["gradients"]))
write("T8_cost", t8, list(t8[0].keys()), "Table S8. Gradient cost (referee Hessian excluded for every arm).")
# pre-fix discarded run summary
pm = pre["summary"]
json.dump(dict(note="Repeat-2 seed-22 agent-guided run under the first harness, discarded after the fix and rerun.", outcome=pm["outcome"], steps=pm["steps"],
               gradients=pm["gradients"], lowest_mode_cm1=pm["referee"]["lowest_cm1"], displacements_requested=sum(1 for e in pre["events"] if e["kind"] == "final_check" and e["action"]["action"] == "DISPLACE_ALONG_MODE"),
               rollbacks=pm["n_rollbacks"]), open(f"{DER}/pre_fix_discarded_run.json", "w"), indent=1)
print("E_min", EMIN, "barrier meV", (E_SADDLE - EMIN) * 1000); print("calls", len(calls), "reported", sum(c['status'] == 'reported' for c in calls))
for t in (t3, t4[-1:], t6): print(json.dumps(t, ensure_ascii=False))
