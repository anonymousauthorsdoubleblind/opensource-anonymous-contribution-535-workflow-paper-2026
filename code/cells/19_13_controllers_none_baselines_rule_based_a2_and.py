# @title 13. Controllers: none (baselines), rule-based (A2 and the offline stand-in), Gemini function calling (A3)
SYSTEM_PROMPT = """You supervise an L-BFGS geometry optimization of {FORMULA} ({DESC}) with the Skala-1.1 DFT functional.
Every gradient costs about 15-20 seconds of GPU time on the L4. Code measures everything; you only choose among remedies.

Objectives, in this order:
1. Do not end in a local valley or a wrong basin. The lowest basin and a stable SCF matter more than saving time.
2. Then minimise wall-clock time (gradient evaluations).
API latency is not a cost. Never trade objective 1 for objective 2.

How you work:
- Use the functions you are shown. Free functions (get_evidence, step_advisor, preview_displacement) can be called as needed.
  run_dft_probe and explore_surrogate cost real time: call them only with a stated reason.
- Finish EVERY decision by calling submit_action exactly once. If nothing needs changing, submit CONTINUE.
- Call each free function at most once per decision (a repeated identical call returns the same answer). Then submit.
- The rationale must be one real sentence that names the evidence. Never write 'test', 'placeholder' or similar.
- Cite evidence: list the tool results (for example "step_advisor.curvature_ratio=0.31") that justify the action. Never invent numbers.
- Never write coordinates. Moves are made only through preview_displacement ids that code has already checked.
- Prefer low-risk actions: CONTINUE, SET_PARAMS, RESET_LBFGS_MEMORY, TIGHTEN_SCF. High-risk actions (DISPLACE_ALONG_MODE, SWITCH_BASIN)
  need hard evidence (negative curvature from the soft-mode probe, or a DFT single point that prefers another basin by >= 1 kcal/mol).
- Code validates every action, including settings chosen at the start of a pass, runs it on a probation of up to 5 steps, and rolls it back if the energy rises or the force grows. After two rollbacks you are switched off.
- Per decision the step cap can at most double and the force target can be loosened at most 2x; do not take bigger swings.

Rules of thumb that the code has already checked on a surrogate:
- Step cap pinned at the limit and measured curvature matches the optimizer's (ratio 0.5-2): raise maxstep, to at most 1.5 x D90.
- Ratio above 2 or oscillation: halve maxstep and reset L-BFGS memory.
- Steps pinned AND ratio below 0.5: the curvature estimate is unreliable; the safe options are optimizer 'lbfgs_mem20' or a smaller maxstep. Do not guess other optimizers.
- Do not converge hard in the first basis: the target basis redoes it. At the end of pass 2 probe the basis switch; ratio >= 3 means skip pass 3 (steps=0).
- The last pass must reach fmax <= 0.02; that is checked by code, not by you.
"""
SYSTEM_PROMPT_V2 = SYSTEM_PROMPT
_R = [
 ("- Call each free function at most once per decision (a repeated identical call returns the same answer). Then submit.",
  "- The packet already contains the step_advisor result and the trajectory features. Normally submit in your FIRST round. Call get_evidence only for a specific topic the packet does not cover, and each free function at most once."),
 ("- Step cap pinned at the limit and measured curvature matches the optimizer's (ratio 0.5-2): raise maxstep, to at most 1.5 x D90.",
  "- Step cap pinned at the limit (cap_saturation >= 0.6) with the energy falling on every recent step (energy_falling_last5 = 5) and fmax far above target: the cap is too timid. RAISE maxstep (at most 2x per decision, to at most 0.05 A and about 1.5 x D90), and raise it again at the next trigger if the steps are still pinned. Answering CONTINUE while the steps stay pinned and fmax is above 5x target wastes gradients."),
 ("- Ratio above 2 or oscillation: halve maxstep and reset L-BFGS memory.",
  "- Ratio above 2, or oscillation together with a rising or stalled ENERGY: halve maxstep and reset L-BFGS memory. If the energy falls on every step (energy_falling_last5 = 5), fmax wobbling is just a flat valley: do NOT shrink the step and do NOT reset memory; CONTINUE or tighten the SCF instead."),
 ("- Steps pinned AND ratio below 0.5: the curvature estimate is unreliable; the safe options are optimizer 'lbfgs_mem20' or a smaller maxstep. Do not guess other optimizers.",
  "- Steps pinned AND ratio below 0.5 with a falling energy: switch to optimizer 'lbfgs_mem20' once, and raise maxstep as above. Do not guess other optimizers."),
 ("- The last pass must reach fmax <= 0.02; that is checked by code, not by you.",
  "- An SCF tolerance (conv_tol) looser than 1e-5 makes the forces noisy: tighten it when a pass needs fmax below 0.05, or when the energy changes are within 5x of the SCF noise (scf_noise_ratio < 5).\n- The last pass must reach fmax <= 0.02; that is checked by code, not by you."),
]
for a, b in _R:
    assert a in SYSTEM_PROMPT_V2, a[:40]
    SYSTEM_PROMPT_V2 = SYSTEM_PROMPT_V2.replace(a, b)
if AGENT_VERSION == "v2": SYSTEM_PROMPT = SYSTEM_PROMPT_V2
SYSTEM_PROMPT = SYSTEM_PROMPT.replace("{FORMULA}", MOLECULE).replace("{DESC}", MOL["desc"])

_ARGS_DOC = {
    "get_evidence": "FREE. More detail on one item of the packet.",
    "step_advisor": "FREE. Deterministic advice from measured curvature: suggested maxstep/fmax/conv_tol, and a forecast of steps and minutes.",
    "run_dft_probe": "EXPENSIVE (real DFT gradients). One named measurement: single_point (basin referee), basis_switch, soft_curvature, scf_stability. A reason is required.",
    "explore_surrogate": "CHEAP (xTB, minutes). task = basins (cluster of nearby minima), mode_scan (energy along one soft mode), hessian (softest modes).",
    "preview_displacement": "FREE. Builds a displaced geometry along a soft mode and checks its structure. Never applies it; returns a preview_id.",
    "submit_action": "Hands your decision to the validator. Call exactly once to finish.",
}

def build_declarations(names):
    from google.genai import types as T
    S, Ty = T.Schema, T.Type
    def obj(props, req=None): return S(type=Ty.OBJECT, properties=props, required=req or [])
    spec = {
        "get_evidence": obj({"topic": S(type=Ty.STRING, enum=["trajectory", "step_diagnostics", "atom_forces", "scf_health", "structure", "basin_table", "run_log"]),
                             "window": S(type=Ty.INTEGER, description="number of recent steps (default 10, max 40)")}, ["topic"]),
        "step_advisor": obj({"candidate_maxstep": S(type=Ty.NUMBER, description="optional step cap to forecast with")}),
        "run_dft_probe": obj({"kind": S(type=Ty.STRING, enum=["single_point", "basis_switch", "soft_curvature", "scf_stability"]),
                              "reason": S(type=Ty.STRING), "basin_ids": S(type=Ty.ARRAY, items=S(type=Ty.INTEGER))}, ["kind", "reason"]),
        "explore_surrogate": obj({"task": S(type=Ty.STRING, enum=["basins", "mode_scan", "hessian"]), "mode": S(type=Ty.INTEGER),
                                  "amplitude_A": S(type=Ty.NUMBER), "seed": S(type=Ty.INTEGER)}, ["task"]),
        "preview_displacement": obj({"mode": S(type=Ty.INTEGER), "amplitude_A": S(type=Ty.NUMBER, description="RMS displacement, 0.02-0.1"),
                                     "sign": S(type=Ty.INTEGER, description="+1 or -1")}, ["mode"]),
        "submit_action": obj({
            "action": S(type=Ty.STRING, enum=list(ACTION_RISK)),
            "params": obj({"maxstep": S(type=Ty.NUMBER), "fmax": S(type=Ty.NUMBER), "conv_tol": S(type=Ty.NUMBER), "steps": S(type=Ty.INTEGER),
                           "optimizer": S(type=Ty.STRING, enum=["lbfgs", "lbfgs_mem20"]), "preview_id": S(type=Ty.STRING), "basin_id": S(type=Ty.INTEGER)}),
            "rationale": S(type=Ty.STRING, description="one or two sentences"),
            "evidence": S(type=Ty.ARRAY, items=S(type=Ty.STRING), description="tool results that justify the action"),
            "expected": obj({"fmax_after_5_steps": S(type=Ty.NUMBER), "steps_to_target": S(type=Ty.INTEGER)})}, ["action", "rationale"]),
    }
    return [T.FunctionDeclaration(name=n, description=_ARGS_DOC[n], parameters=spec[n]) for n in names]

def packet_for(s, event):
    cfg = s.cfg; R = s.pass_recs
    return dict(event=event, molecule=dict(formula=MOLECULE, n_atoms=N_ATOMS, start=s.start, arm=s.arm),
                requirement=dict(id=REQUIREMENT, basis_path=list(BASIS_PATH), spherical_d=True),
                run=dict(pass_label=f"{s.p+1}/{len(s.schedule)}", basis=cfg.basis, total_steps=s.step_total, gradients_used=s.gradients,
                         gradient_budget=GRADIENT_BUDGET_PER_RUN, minutes_so_far=round(s.logger.t_opt() / 60, 1), agent_calls=s.agent_calls, rollbacks=s.strikes),
                settings=dict(maxstep=cfg.maxstep, steps=cfg.steps, fmax=cfg.fmax, conv_tol=cfg.conv_tol, optimizer=s.optimizer_kind, memory=s.memory),
                features={k: (round(v, 4) if isinstance(v, float) else v) for k, v in pass_features(s).items()} if R else None,
                last_8_steps=[[r["step"], round(r["dE"], 5), round(r["fmax"], 4)] for r in R[-8:]],
                structure=fingerprint(s.atoms.positions), basin=basin_summary(s) if s.basins else None,
                past_actions=s.actions[-5:], allowed_functions=ALLOWED[event],
                **({"step_advisor": _jsonable(step_advisor(s))} if AGENT_VERSION == "v2" and event in ("trigger", "pass_start", "end_of_svp") else {}))

def _decision(action="CONTINUE", params=None, rationale="", evidence=None, expected=None, **meta):
    return dict(action=action, params=params or {}, rationale=rationale, evidence=evidence or [], expected=expected or {}, **meta)

# ------------------------------------------------------------------------------------------------------------------
class NullController:
    """Baselines A0e/A0r/A0c/A1: no decisions, the schedule runs as written."""
    name = "none"
    def decide(self, event, s, tb): return _decision(rationale="baseline arm: no agent")

class RuleController:
    """Fixed if-then rules over the same six functions (arm A2, and the offline stand-in for Gemini in mock mode)."""
    name = "rules"
    def decide(self, event, s, tb):
        cfg = s.cfg
        if event == "basin_choice":
            tb.call("explore_surrogate", dict(task="basins"), event)
            if len(s.basins) < 2: return _decision(rationale="only one basin found", evidence=["explore_surrogate.basins=1"])
            r = tb.call("run_dft_probe", dict(kind="single_point", reason="DFT referee for the explored basins"), event)
            cur, best = s.current_basin, r.get("lowest_basin")
            if best is not None and best != cur and "dft_E_eV" in s.basins[best] and "dft_E_eV" in s.basins[cur] and 1000 * (s.basins[cur]["dft_E_eV"] - s.basins[best]["dft_E_eV"]) >= SWITCH_MARGIN_MEV:
                return _decision("SWITCH_BASIN", dict(basin_id=int(best)), "DFT prefers another basin by more than 1 kcal/mol", ["run_dft_probe.single_points"])
            return _decision(rationale="DFT keeps the start's basin as the lowest", evidence=["run_dft_probe.lowest_basin=%s" % best])
        if event == "pass_start":
            adv = tb.call("step_advisor", {}, event).get("suggested", {})
            diff = {k: adv[k] for k in ("maxstep", "fmax", "conv_tol") if k in adv and abs(adv[k] - getattr(cfg, k)) > 1e-12 * max(1, abs(adv[k]))}
            if diff: return _decision("SET_PARAMS", diff, "; ".join(adv.get("notes", [])) or "pass-start advice", ["step_advisor.suggested"])
            return _decision(rationale="settings already match the advice")
        if event == "end_of_svp":
            r = tb.call("run_dft_probe", dict(kind="basis_switch", reason="decide whether another first-basis pass is worth its gradients"), event)
            sug = r.get("suggestion")
            if sug == "skip_pass_3": return _decision("SET_PARAMS", dict(steps=0), f"target-basis fmax is {r['ratio']}x the first-basis fmax: forces are dominated by the basis change", [f"run_dft_probe.ratio={r['ratio']}"])
            if sug == "cut_pass_3_to_forecast": return _decision("SET_PARAMS", dict(steps=min(cfg.steps, 12)), "bases partly disagree: cut the pass", [f"run_dft_probe.ratio={r['ratio']}"])
            return _decision(rationale="bases agree: finishing the pass is cheap insurance", evidence=[f"run_dft_probe.ratio={r.get('ratio')}"])
        if event == "trigger":
            adv = tb.call("step_advisor", {}, event); rec = adv.get("recommendation", {}); ev = [f"step_advisor.curvature_ratio={adv.get('curvature_ratio')}", f"step_advisor.cap_saturation={adv.get('cap_saturation')}"]
            tr = s.last_trigger
            if rec.get("action") == "shrink_step": return _decision("RESET_LBFGS_MEMORY", dict(maxstep=rec["maxstep"]), rec["reason"], ev, dict(fmax_after_5_steps=round(s.pass_recs[-1]["fmax"], 4)))
            if rec.get("action") == "raise_cap": return _decision("SET_PARAMS", dict(maxstep=rec["maxstep"]), rec["reason"], ev)
            if rec.get("action") == "better_curvature_model" and rec.get("optimizer"): return _decision("SET_PARAMS", dict(optimizer=rec["optimizer"]), rec["reason"], ev)
            if rec.get("action") == "tighten_scf": return _decision("TIGHTEN_SCF", dict(conv_tol=max(cfg.conv_tol * 0.1, 1e-9)), rec["reason"], ev)
            if tr == "plateau" and s.pass_recs[-1]["fmax"] <= 2 * cfg.fmax and not is_last_pass(s): return _decision("END_PASS_AND_ESCALATE", {}, "flat and within 2x of the pass target", ev)
            if tr in ("oscillation", "uphill_step"): return _decision("RESET_LBFGS_MEMORY", dict(maxstep=max(0.002, cfg.maxstep / 2)), f"{tr}: smaller steps and a clean memory", ev)
            return _decision(rationale=f"trigger {tr}: advisor sees nothing to fix", evidence=ev)
        if event == "final_check":
            r = tb.call("run_dft_probe", dict(kind="soft_curvature", reason="verify the final geometry is a minimum along the 3 softest modes"), event)
            if r.get("any_negative"):
                i = int(np.argmin([m["kappa_dft_eV_A2"] for m in r["modes"]]))
                best = None
                for sg in (+1, -1):
                    pv = tb.call("preview_displacement", dict(mode=i, amplitude_A=0.05, sign=sg), event)
                    if pv.get("passes_structure_check") and (best is None or pv["xtb_energy_change_meV"] < best["xtb_energy_change_meV"]): best = pv
                if best: return _decision("DISPLACE_ALONG_MODE", dict(preview_id=best["preview_id"]), "negative curvature along a soft mode: push and re-optimize", [f"run_dft_probe.modes[{i}].kappa={r['modes'][i]['kappa_dft_eV_A2']}"])
            return _decision(rationale="curvature verified along the 3 softest modes", evidence=["run_dft_probe.any_negative=False"])
        return _decision()

PLACEHOLDER_WORDS = {"test", "placeholder", "n/a", "none", "todo", "tbd", "ok", "continue"}

class GeminiController:
    """Arm A3. Function calling with per-event allow-lists. Every call goes through the rate-limit-safe pool."""
    name = "gemini"
    def __init__(self, pool): self.pool = pool; self.fallback = RuleController()

    def decide(self, event, s, tb):
        from google.genai import types as T
        names = ALLOWED[event]; role = "strong" if event in STRONG_EVENTS else "fast"
        packet = packet_for(s, event)
        contents = [T.Content(role="user", parts=[T.Part.from_text(text="Decision needed now.\n```json\n" + json.dumps(packet, default=float) + "\n```")])]
        tools_called, models, waited, elapsed, rot, errors = [], [], 0.0, 0.0, 0, []
        seen, rationale_retry = {}, False
        def _meta(): return dict(models=models, tools_called=tools_called, api_waited_s=round(waited, 1), api_elapsed_s=round(elapsed, 1), rotations=rot, errors=errors[-4:])
        for rnd in range(MAX_TOOL_ROUNDS):
            allowed = names if rnd < MAX_TOOL_ROUNDS - 1 else ["submit_action"]          # the last round must submit
            cfg_g = T.GenerateContentConfig(system_instruction=SYSTEM_PROMPT, temperature=0.0,
                                            tools=[T.Tool(function_declarations=build_declarations(allowed))],
                                            tool_config=T.ToolConfig(function_calling_config=T.FunctionCallingConfig(mode="ANY", allowed_function_names=allowed)))
            try:
                resp, meta = self.pool.generate(role, contents, cfg_g, label=f"{s.arm}/{s.start}/{event}/round{rnd+1}")
            except ApiBadRequest as e:
                s.logger.add_api_time(elapsed + e.elapsed_s)
                s.logger.event("note", s.p + 1, s.step_total, note="Gemini rejected the request", detail=str(e)[:300])
                raise ApiExhausted("bad request: " + str(e)[:200])
            except ApiExhausted as e:
                s.logger.add_api_time(elapsed + e.elapsed_s); raise
            waited += meta.get("waited_s", 0.0); elapsed += meta.get("elapsed_s", 0.0); rot += meta.get("key_rotations", 0) + meta.get("model_rotations", 0)
            models.append(meta.get("model")); errors += meta.get("errors", [])
            parts = (resp.candidates[0].content.parts or []) if resp.candidates else []
            calls = [p.function_call for p in parts if getattr(p, "function_call", None)]
            if not calls: contents.append(T.Content(role="user", parts=[T.Part.from_text(text="Call submit_action now.")])); continue
            contents.append(resp.candidates[0].content); replies = []
            for c in calls:
                args = dict(c.args or {}); tools_called.append(c.name)
                if c.name == "submit_action":
                    rat = str(args.get("rationale", "")).strip()
                    if (len(rat) < 20 or rat.lower().strip(". ") in PLACEHOLDER_WORDS) and not rationale_retry and rnd < MAX_TOOL_ROUNDS - 1:
                        rationale_retry = True      # one retry: ask for a real sentence instead of accepting 'test'
                        replies.append(T.Part.from_function_response(name=c.name, response={"error": "The rationale is empty, too short or a placeholder. Call submit_action again with the same decision and one real sentence naming the evidence."}))
                        continue
                    if len(rat) < 20 or rat.lower().strip(". ") in PLACEHOLDER_WORDS: rat = f"(no usable rationale given: {rat!r})"
                    dec = _decision(args.get("action", "CONTINUE"), dict(args.get("params") or {}), rat, list(args.get("evidence") or []), dict(args.get("expected") or {}))
                    dec["_meta"] = _meta(); s.logger.add_api_time(elapsed); return dec
                key = (c.name, json.dumps(args, sort_keys=True, default=str))
                if key in seen: result = {"repeat": "identical call already answered in this decision; reuse the earlier result and call submit_action", "earlier_result": seen[key]}
                else: result = seen[key] = tb.call(c.name, args, event)
                replies.append(T.Part.from_function_response(name=c.name, response={"result": result}))
            contents.append(T.Content(role="user", parts=replies))
        s.logger.add_api_time(elapsed)
        return _decision(rationale="no submit_action within the tool-round limit; continuing", _meta=_meta())

print("Controllers ready: NullController, RuleController, GeminiController.")
