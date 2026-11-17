# @title 8. Rate-limit-safe Gemini client: key rotation, model rotation, exponential back-off
import os, re, time, random, json
from collections import defaultdict

class ApiExhausted(Exception):
    """No Gemini answer within API_PATIENCE_S. The orchestrator flags the run 'degraded' (it is never counted silently).
    .elapsed_s = time spent inside the pool (excluded from the wall-clock metrics)."""
    elapsed_s = 0.0

class ApiBadRequest(Exception):
    """The request itself was rejected (schema/argument error). Retrying cannot help."""
    elapsed_s = 0.0

def _load_keys(secret_names):
    """Reads keys from environment variables. Keys are never printed; only 'key1', 'key2' labels."""
    keys = []
    for name in secret_names:
        val = os.environ.get(name)
        if val: keys.append((f"key{len(keys)+1}({name})", val))
    return keys

def _retry_after_s(err_text):
    m = re.search(r"retry(?:Delay)?\D{0,12}?([0-9]+(?:\.[0-9]+)?)\s*s", err_text, re.I)
    return float(m.group(1)) if m else None

def _classify(exc):
    """-> 'rate' | 'server' | 'dead_model' | 'bad_key' | 'bad_request' | 'other'"""
    txt = f"{type(exc).__name__} {exc}"
    code = getattr(exc, "code", None) or getattr(exc, "status_code", None)
    low = txt.lower()
    if code == 429 or "resource_exhausted" in low or "quota" in low or "rate limit" in low or "too many requests" in low: return "rate"
    if code in (500, 502, 503, 504) or "unavailable" in low or "overloaded" in low or "deadline" in low or "timed out" in low or "timeout" in low or "internal" in low: return "server"
    if code == 404 or "not_found" in low or "is not found" in low: return "dead_model"
    if code in (401, 403) or "api key" in low and "invalid" in low or "permission_denied" in low: return "bad_key"
    if code == 400 or "invalid_argument" in low: return "bad_request"
    return "other"

class GeminiPool:
    """One object that every agent call goes through.

    Policy (designed so a low-tier, shared, rate-limited account does not change WHAT the agent decides, only WHEN):
      1. A rate-limit on one key -> immediately try the same model on the other key.
      2. Both keys limited -> exponential back-off with jitter (honouring the server's retry-after hint).
      3. After API_MODEL_ROTATE_AFTER failed rounds on the preferred model -> rotate to the next model in the role's list,
         but return to the preferred model as soon as its cool-down ends.
      4. Past API_PATIENCE_S -> raise ApiExhausted (the run is flagged 'degraded' and re-run later if RERUN_DEGRADED).
    All waiting happens while the optimizer is paused, so the DFT trajectory is unaffected; the waiting time is logged and
    is subtracted from every wall-clock metric (t_opt_s), so a slow account does not penalise the agent arm."""

    ROLE_MODELS = {"fast": [MODEL_FAST, MODEL_PRO, MODEL_STRONG], "strong": [MODEL_STRONG, MODEL_PRO, MODEL_FAST]}

    def __init__(self, key_secrets=GEMINI_KEY_SECRETS, sleep=time.sleep, now=time.time, verbose=True):
        self.keys = _load_keys(key_secrets)
        if not self.keys: raise RuntimeError("No API key found. Set the environment variable LLM_API_KEY (and LLM_API_KEY_2).")
        from google import genai
        self._genai = genai
        self.clients = {}
        self.cool = {}                         # (model, key_index) -> time when usable again
        self.dead_models, self.dead_keys = set(), set()
        self.sleep, self.now, self.verbose = sleep, now, verbose
        self.next_key = 0
        self.stats = defaultdict(float)        # calls, ok, rate_limited, server_errors, key_rotations, model_rotations, waited_s, latency_s
        if verbose: print(f"Gemini pool ready: {len(self.keys)} key(s) {[k[0] for k in self.keys]} | models fast={self.ROLE_MODELS['fast']}")

    def _client(self, ki):
        if ki not in self.clients: self.clients[ki] = self._genai.Client(api_key=self.keys[ki][1])
        return self.clients[ki]

    def _usable_keys(self, model):
        ks = [ki for ki in range(len(self.keys)) if ki not in self.dead_keys and self.cool.get((model, ki), 0) <= self.now()]
        return sorted(ks, key=lambda ki: (ki - self.next_key) % len(self.keys))     # alternate keys

    # ---- raw call log: every API call (prompt, answer, tokens, retries) goes to llm_calls.jsonl in the experiment folder ----
    @staticmethod
    def _ser_content(c):
        out = []
        for p in (getattr(c, "parts", None) or []):
            if getattr(p, "function_call", None): out.append(dict(function_call=p.function_call.name, args=dict(p.function_call.args or {})))
            elif getattr(p, "function_response", None): out.append(dict(function_response=p.function_response.name, response=p.function_response.response))
            elif getattr(p, "text", None): out.append(dict(text=p.text))
        return dict(role=getattr(c, "role", None), parts=out)

    def _log_call(self, role, contents, config, label, resp, meta, error=None):
        try:
            d = globals().get("EXPERIMENT_DIR")
            if not d: return
            os.makedirs(d, exist_ok=True)
            sp = os.path.join(d, "llm_system_prompt.txt")
            if not os.path.exists(sp) and getattr(config, "system_instruction", None): open(sp, "w").write(str(config.system_instruction))
            um = getattr(resp, "usage_metadata", None) if resp is not None else None
            rec = dict(t=time.strftime("%Y-%m-%d %H:%M:%S"), label=label, role=role, ok=error is None, error=error,
                       tokens=dict(prompt=getattr(um, "prompt_token_count", None), output=getattr(um, "candidates_token_count", None),
                                   thinking=getattr(um, "thoughts_token_count", None), total=getattr(um, "total_token_count", None)) if um else None,
                       meta={k: v for k, v in (meta or {}).items()},
                       prompt=[self._ser_content(c) for c in contents],
                       answer=self._ser_content(resp.candidates[0].content) if (resp is not None and resp.candidates) else None)
            with open(os.path.join(d, "llm_calls.jsonl"), "a") as f: f.write(json.dumps(rec, default=str) + "\n")
        except Exception as e:
            if self.verbose: print("   (llm log write skipped:", str(e)[:100], ")")

    def generate(self, role, contents, config, label=""):
        """Returns (response, meta); meta has model, key, latency, waited_s, elapsed_s (everything spent in here), rotations, attempts, errors.
        On failure raises ApiExhausted/ApiBadRequest carrying .elapsed_s."""
        t0_all = self.now()
        try:
            resp, meta = self._generate(role, contents, config, label)
            meta["elapsed_s"] = round(self.now() - t0_all, 2)
            self._log_call(role, contents, config, label, resp, meta); return resp, meta
        except (ApiExhausted, ApiBadRequest) as e:
            e.elapsed_s = self.now() - t0_all
            self._log_call(role, contents, config, label, None, dict(elapsed_s=round(e.elapsed_s, 1)), error=f"{type(e).__name__}: {str(e)[:300]}"); raise

    def _generate(self, role, contents, config, label=""):
        t_start, waited, attempts, backoff = self.now(), 0.0, 0, API_BACKOFF_BASE_S
        mfail = defaultdict(int)               # consecutive failed rounds per model within this decision
        rot_key = rot_model = 0
        meta = dict(role=role, errors=[])
        while True:
            if self.now() - t_start > API_PATIENCE_S:
                self.stats["exhausted"] += 1
                raise ApiExhausted(f"no answer within {API_PATIENCE_S}s; last errors: {meta['errors'][-3:]}")
            if len(self.dead_keys) == len(self.keys): raise ApiExhausted("every API key was rejected (invalid or no permission)")
            order = [m for m in self.ROLE_MODELS[role] if m not in self.dead_models]
            if not order: raise ApiExhausted("every model in the rotation reported 'not found'")
            # a short cool-down on the preferred model is waited out (so the decision comes from the same model whenever possible)
            pref = order[0]
            if mfail[pref] < API_MODEL_ROTATE_AFTER and not self._usable_keys(pref):
                soon = min((self.cool.get((pref, ki), 0) for ki in range(len(self.keys)) if ki not in self.dead_keys), default=self.now()) - self.now()
                if 0 < soon <= 30:
                    w = soon + 0.5
                    if self.verbose: print(f"   API: {pref} cooling for {soon:.0f}s -> waiting for it (same model keeps the decision comparable)")
                    self.sleep(w); waited += w; self.stats["waited_s"] += w
                    continue
            # stay on the preferred model until it has failed API_MODEL_ROTATE_AFTER rounds, then use the next one
            pick = next((m for m in order if self._usable_keys(m) and mfail[m] < API_MODEL_ROTATE_AFTER), None)
            if pick is not None:
                if pick != order[0] and mfail[order[0]] >= API_MODEL_ROTATE_AFTER:
                    rot_model += 1; self.stats["model_rotations"] += 1
                    if self.verbose: print(f"   API: {order[0]} stays limited -> using {pick} for this decision")
                round_ok = False
                for ki in self._usable_keys(pick):
                    attempts += 1; self.stats["calls"] += 1; t0 = self.now()
                    try:
                        resp = self._client(ki).models.generate_content(model=pick, contents=contents, config=config)
                        lat = self.now() - t0; self.stats["ok"] += 1; self.stats["latency_s"] += lat; self.next_key = ki
                        meta.update(model=pick, key=self.keys[ki][0], latency_s=round(lat, 2), waited_s=round(waited, 1), attempts=attempts,
                                    key_rotations=rot_key, model_rotations=rot_model, preferred_model=order[0], used_fallback_model=(pick != self.ROLE_MODELS[role][0]))
                        return resp, meta
                    except Exception as e:
                        kind = _classify(e); hint = _retry_after_s(str(e))
                        meta["errors"].append(f"{self.keys[ki][0]}/{pick}: {kind}")
                        if kind == "bad_request": raise ApiBadRequest(str(e)[:400])
                        if kind == "dead_model":
                            self.dead_models.add(pick); rot_model += 1; self.stats["model_rotations"] += 1
                            if self.verbose: print(f"   API: model {pick} is not available for this account -> rotating to the next model")
                            break
                        if kind == "bad_key":
                            self.dead_keys.add(ki); rot_key += 1; self.stats["key_rotations"] += 1
                            if self.verbose: print(f"   API: {self.keys[ki][0]} was rejected -> using the other key only")
                            continue
                        self.stats["rate_limited" if kind == "rate" else "server_errors"] += 1
                        self.cool[(pick, ki)] = self.now() + max(hint or 0.0, backoff if kind == "rate" else 3.0)
                        self.next_key = (ki + 1) % len(self.keys); rot_key += 1; self.stats["key_rotations"] += 1
                        if self.verbose: print(f"   API: {kind} limit on {self.keys[ki][0]} / {pick} -> trying the other key (server retry hint: {hint})")
                else:
                    mfail[pick] += 1                     # every usable key failed this round
                continue
            # nothing usable right now: wait (exponential back-off), then start a fresh cycle from the preferred model
            soonest = min((self.cool.get((m, ki), 0) for m in order for ki in range(len(self.keys)) if ki not in self.dead_keys), default=self.now())
            wait = min(API_BACKOFF_MAX_S, max(backoff, soonest - self.now())) * random.uniform(0.9, 1.1)
            if self.verbose: print(f"   API: all keys/models limited -> waiting {wait:.0f}s (optimizer paused; this time is excluded from the metrics)")
            self.sleep(wait); waited += wait; self.stats["waited_s"] += wait
            backoff = min(API_BACKOFF_MAX_S, backoff * 2); mfail.clear()

print("Rate-limit-safe Gemini client defined (keys are read only when the agent first runs).")
