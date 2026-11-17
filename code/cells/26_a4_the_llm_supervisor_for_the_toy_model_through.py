# @title A4. The LLM supervisor for the toy (Gemini through the same rate-limit-safe pool; same validator and probation as the rules)
from google.genai import types as _T
TOY_SYSTEM_PROMPT = (
    "You supervise a running L-BFGS geometry optimization of a tiny molecule (ammonia) with an expensive DFT energy function. "
    "You are called only when a trigger fired. You receive JSON. Reply with ONE JSON object and nothing else:\n"
    '{"action": "CONTINUE" | "SET_PARAMS" | "DISPLACE_ALONG_MODE", "maxstep": <float, only for SET_PARAMS>, "amplitude_A": <float, only for DISPLACE_ALONG_MODE>, "reason": "<one sentence naming the evidence>"}\n'
    "Rules. kind 'step': cap = current step cap (A); pinned_last5 = steps of the last five that moved by the full cap; uphill_last5 = steps with a rising energy; "
    "energy_falling_last5; oscillation. Cap too small: steps pinned at the cap while the energy keeps falling -> SET_PARAMS with a larger maxstep (at most 2x). "
    "Cap too big: energy rises or alternates, fmax wobbles -> SET_PARAMS with a smaller maxstep (at least 0.5x). Otherwise CONTINUE. "
    "kind 'final': forces are below the target; 'lowest_cm1' is the lowest vibrational wavenumber from a finite-difference Hessian. A negative value (below -50) means an imaginary "
    "mode, i.e. a saddle point and not a minimum: answer DISPLACE_ALONG_MODE with amplitude_A between 0.1 and 0.3. Otherwise CONTINUE. "
    "Never invent evidence. A wrong action is rolled back by the harness, so prefer CONTINUE when the evidence is ambiguous.")
TOY_CNT = dict(calls=0, skipped_no_trigger=0, degraded=0, bad_json=0)

def _toy_trigger(f):
    return f.get("pinned_last5", 0) >= 3 or f.get("uphill_last5", 0) >= 1 or bool(f.get("oscillation"))

def make_toy_ask(pool, label_prefix):
    def ask(kind, payload):
        if kind == "step" and not _toy_trigger(payload):
            TOY_CNT["skipped_no_trigger"] += 1; return dict(action="CONTINUE", reason="no trigger fired (no LLM call)")
        if kind == "final" and payload.get("lowest_cm1", 0.0) > -50.0:
            TOY_CNT["skipped_no_trigger"] += 1; return dict(action="CONTINUE", reason="verified minimum (no LLM call)")
        role = "strong" if kind == "final" else "fast"
        contents = [_T.Content(role="user", parts=[_T.Part.from_text(text=f"kind: {kind}\n```json\n" + json.dumps(payload, default=float) + "\n```")])]
        cfg = _T.GenerateContentConfig(system_instruction=TOY_SYSTEM_PROMPT, temperature=0.0, response_mime_type="application/json")
        TOY_CNT["calls"] += 1
        try:
            resp, meta = pool.generate(role, contents, cfg, label=f"toy/{label_prefix}/{kind}")
        except (ApiExhausted, ApiBadRequest) as e:
            TOY_CNT["degraded"] += 1; return dict(action="CONTINUE", reason=f"Gemini unavailable ({str(e)[:80]}); run flagged degraded")
        try:
            txt = (resp.text or "").strip()
            if txt.startswith("```"): txt = txt.strip("`").split("\n", 1)[1].rsplit("```", 1)[0]
            d = json.loads(txt); assert isinstance(d, dict) and "action" in d
            if d["action"] == "SET_PARAMS": d["maxstep"] = float(d["maxstep"])
            if d["action"] == "DISPLACE_ALONG_MODE": d["amplitude_A"] = float(d.get("amplitude_A", 0.3))
            d["model"] = meta.get("model"); return d
        except Exception:
            TOY_CNT["bad_json"] += 1; return dict(action="CONTINUE", reason="unparseable answer; CONTINUE")
    return ask
print("LLM supervisor ready." if AGENT_MODE == "gemini" else "AGENT_MODE is not 'gemini': the toy 'llm' arm will use the rule supervisor as a mock (wiring test).")
