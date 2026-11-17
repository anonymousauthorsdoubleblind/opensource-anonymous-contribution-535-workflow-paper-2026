# @title 15b. LLM call report (API usage, retries, full prompt/answer log of the agent)
import json, os, zipfile, collections
log_path = os.path.join(EXPERIMENT_DIR, "llm_calls.jsonl")
rows = [json.loads(l) for l in open(log_path)] if os.path.exists(log_path) else []
if not rows:
    print("No Gemini calls were logged in this session (arms without the agent make no calls).")
else:
    by = collections.defaultdict(lambda: collections.Counter())
    for r in rows:
        m = r.get("meta") or {}; k = (r["label"].split("/")[0] + "/" + r["label"].split("/")[1], m.get("model") or "-")
        c = by[k]; c["calls"] += 1; c["ok"] += int(r["ok"]); c["failed"] += int(not r["ok"])
        c["extra_attempts"] += max(0, (m.get("attempts") or 1) - 1); c["errors"] += len(m.get("errors") or [])
        c["key_or_model_rotations"] += (m.get("key_rotations") or 0) + (m.get("model_rotations") or 0)
        c["waited_s"] += m.get("waited_s") or 0; c["latency_s"] += m.get("latency_s") or 0
        t = r.get("tokens") or {}
        for kk in ("prompt", "output", "thinking", "total"): c["tok_" + kk] += t.get(kk) or 0
    print(f"{'run / model':46s} calls ok fail retries errors rot  wait_s  lat_s  tok_in tok_out tok_think")
    for (run, model), c in sorted(by.items()):
        print(f"{run + ' / ' + model:46s} {c['calls']:5d} {c['ok']:2d} {c['failed']:4d} {c['extra_attempts']:7d} {c['errors']:6d} {c['key_or_model_rotations']:3d} {c['waited_s']:7.0f} {c['latency_s']:6.0f} {c['tok_prompt']:7d} {c['tok_output']:7d} {c['tok_thinking']:8d}")
    errs = [(r["label"], e) for r in rows for e in ((r.get("meta") or {}).get("errors") or [])] + [(r["label"], r["error"]) for r in rows if r.get("error")]
    print(f"\nAll error / retry messages ({len(errs)}):"); [print("  ", l, "->", e) for l, e in errs[:40]]
    # human-readable transcript: every decision with the exact packet the agent saw and what it answered
    md = ["# Agent transcript (prompt in, answer out)\n", "System prompt: llm_system_prompt.txt\n"]
    for i, r in enumerate(rows, 1):
        md.append(f"\n## {i}. {r['label']} | {r['role']} | {(r.get('meta') or {}).get('model')} | ok={r['ok']} | tokens={r.get('tokens')}\n")
        if r.get("error"): md.append(f"ERROR: {r['error']}\n")
        for turn in r["prompt"][-2:]:
            for p in turn["parts"]: md.append(f"**{turn['role']} (sent)**:\n```\n{json.dumps(p, indent=1, default=str)[:6000]}\n```\n")
        for p in (r.get("answer") or {}).get("parts", []): md.append(f"**model (answered)**:\n```\n{json.dumps(p, indent=1, default=str)[:3000]}\n```\n")
    open(os.path.join(EXPERIMENT_DIR, "agent_transcript.md"), "w").write("\n".join(md))
    # ---- proper JSON: llm_calls.json (exact prompts and responses) and llm_calls_brief.json (one short line per call) ----
    def _brief_answer(ans):
        out = []
        for part in (ans or {}).get("parts", []):
            if "function_call" in part:
                a = part.get("args") or {}
                if part["function_call"] == "submit_action":
                    out.append(dict(tool="submit_action", action=a.get("action"), params=a.get("params"), rationale=str(a.get("rationale", ""))[:240], evidence=a.get("evidence")))
                else: out.append(dict(tool=part["function_call"], args=a))
            elif "text" in part: out.append(dict(text=str(part["text"])[:300]))
        return out
    def _brief_prompt(prompt):
        last = (prompt or [{}])[-1]; out = []
        for part in last.get("parts", []):
            if "function_response" in part: out.append(dict(tool_result=part["function_response"], summary=json.dumps(part.get("response"), default=str)[:300]))
            elif "text" in part: out.append(dict(text=str(part["text"])[:300]))
        return dict(turns_in_conversation=len(prompt or []), last_turn_role=last.get("role"), last_turn=out)
    sys_txt = open(os.path.join(EXPERIMENT_DIR, "llm_system_prompt.txt")).read() if os.path.exists(os.path.join(EXPERIMENT_DIR, "llm_system_prompt.txt")) else None
    full, brief = [], []
    for i, r in enumerate(rows, 1):
        m = r.get("meta") or {}; lab = r["label"].split("/")
        head = dict(call=i, time=r.get("t"), arm=lab[0], start=lab[1] if len(lab) > 1 else None, event=lab[2] if len(lab) > 2 else None,
                    round=lab[3] if len(lab) > 3 else None, role=r.get("role"), model=m.get("model"), ok=r.get("ok"), error=r.get("error"),
                    attempts=m.get("attempts"), retries_errors=m.get("errors"), latency_s=m.get("latency_s"), waited_s=m.get("waited_s"), tokens=r.get("tokens"))
        brief.append(dict(head, sent=_brief_prompt(r.get("prompt")), received=_brief_answer(r.get("answer"))))
        full.append(dict(head, sent_last_turn_exact=(r.get("prompt") or [{}])[-1], prompt_full_exact=r.get("prompt"), response_exact=r.get("answer"), response_brief=_brief_answer(r.get("answer"))))
    json.dump(dict(system_prompt_file="llm_system_prompt.txt", system_prompt=sys_txt, n_calls=len(full), calls=full), open(os.path.join(EXPERIMENT_DIR, "llm_calls.json"), "w"), indent=1, default=str)
    json.dump(dict(n_calls=len(brief), calls=brief), open(os.path.join(EXPERIMENT_DIR, "llm_calls_brief.json"), "w"), indent=1, default=str)
    print(f"Wrote llm_calls.json (exact prompts and responses, {len(full)} calls) and llm_calls_brief.json (short form).")
    zp = os.path.join(RESULTS_ROOT, f"llm_log_{MOLECULE.lower()}_{REQUIREMENT}{RUN_TAG}.zip")
    with zipfile.ZipFile(zp, "w", zipfile.ZIP_DEFLATED) as z:
        for f in ("llm_calls.json", "llm_calls_brief.json", "llm_calls.jsonl", "llm_system_prompt.txt", "agent_transcript.md", "api_usage.json"):
            if os.path.exists(os.path.join(EXPERIMENT_DIR, f)): z.write(os.path.join(EXPERIMENT_DIR, f), f)
    print(f"\nLog zip written: {zp} ({os.path.getsize(zp)/1e6:.1f} MB): llm_calls.json and llm_calls_brief.json (proper JSON, every call), llm_calls.jsonl (raw), agent_transcript.md (readable), llm_system_prompt.txt, api_usage.json")
