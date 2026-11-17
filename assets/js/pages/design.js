(function(){
"use strict";
var host = document.getElementById("pg-diagram"); if(!host) return;
var NS = "http://www.w3.org/2000/svg";
var C = "code.html#f=cells/";
var STATES = [
  {id:"step", label:"L-BFGS step", x:20, y:40, code:"cell 11", href:C+"17_11_l_bfgs_step_engine_and_the_six_functions_mode.py",
   text:"L-BFGS moves every atom, one step, with the settings in force. The controller never writes coordinates.",
   ex:"Steps 1 to 6 ran at the step cap of 0.005 Å; fₘₐₓ fell from 3.57 to 3.08 eV Å⁻¹ (logged 1.889 to 1.631)."},
  {id:"monitor", label:"Monitor", x:250, y:40, code:"cell 10", href:C+"16_10_run_state_per_step_monitor_triggers_and_the_s.py",
   text:"After each step, plain code computes features over a five-step window and checks six stall triggers. No trigger: back to the next step.",
   ex:"After step 6 the steps were pinned at the cap (cap saturation 1.0) while the energy fell on every step: trigger “curvature mismatch”."},
  {id:"packet", label:"Trigger and packet", x:480, y:40, code:"cell 10", href:C+"16_10_run_state_per_step_monitor_triggers_and_the_s.py",
   text:"A packet of features goes to the controller together with the recommendation of the deterministic step advisor.",
   ex:"The advisor was asked about a cap of 0.010 Å; its curvature ratio was 0.03."},
  {id:"controller", label:"Controller proposes", x:480, y:150, code:"cell 13", href:C+"19_13_controllers_none_baselines_rule_based_a2_and.py",
   text:"The controller answers with exactly one typed action from a closed list of eight, and a written reason.",
   ex:"Action SET_PARAMS: step cap 0.005 → 0.010 Å, L-BFGS memory 20. Reason: steps pinned at the limit, energy falling every step, curvature ratio 0.03."},
  {id:"validator", label:"Validator", x:250, y:150, code:"cell 12", href:C+"18_12_actions_validator_bounds_plausibility_evidenc.py",
   text:"The validator passes, clips or rejects the proposal. The step cap may at most double and never exceeds 0.05 Å.",
   ex:"Verdict: accepted, no notes. The cap doubled, within the bound."},
  {id:"probation", label:"Probation", x:20, y:150, code:"cell 12", href:C+"18_12_actions_validator_bounds_plausibility_evidenc.py",
   text:"An accepted change runs for five steps from a checkpoint, with a record of energy and fₘₐₓ before it.",
   ex:"Steps 6 to 11 ran at the new cap."},
  {id:"verdict", label:"Keep or roll back", x:20, y:260, code:"cell 12", href:C+"18_12_actions_validator_bounds_plausibility_evidenc.py",
   text:"The change is kept, or rolled back if the energy or fₘₐₓ worsened beyond set tolerances. After two rollbacks the controller is switched off and the original schedule resumes.",
   ex:"Outcome: kept. Energy change −0.368 eV; fₘₐₓ fell from 3.08 to 1.87 eV Å⁻¹ (logged 1.631 to 0.991). The run reached the force target at step 60."}
];
function mk(tag, attrs, parent){ var n = document.createElementNS(NS, tag); for(var k in attrs) n.setAttribute(k, attrs[k]); if(parent) parent.appendChild(n); return n; }
var svg = mk("svg", {viewBox:"0 0 700 340", role:"group", "aria-label":"State diagram of one supervised step. Seven states; use Tab to move between them and Enter to select."});
var defs = mk("defs", {}, svg);
var mrk = mk("marker", {id:"pg-arrow", viewBox:"0 0 10 10", refX:"9", refY:"5", markerWidth:"7", markerHeight:"7", orient:"auto-start-reverse"}, defs);
mk("path", {d:"M0 0 L10 5 L0 10 z", fill:"currentColor", style:"color:var(--muted)"}, mrk);
var W = 200, H = 52, edges = {};
function by(id){ return STATES.filter(function(s){ return s.id === id; })[0]; }
function edge(key, d, label, lx, ly){
  var p = mk("path", {d:d, class:"pg-edge", "marker-end":"url(#pg-arrow)"}, svg); edges[key] = p;
  if(label){ var t = mk("text", {x:lx, y:ly, class:"pg-elabel", "text-anchor":"middle"}, svg); t.textContent = label; }
}
edge("step-monitor", "M220 66 H250", null);
edge("monitor-packet", "M450 66 H480", null,0,0);
edge("monitor-step", "M350 40 C350 6 120 6 120 40", "no trigger: next step", 235, 14);
edge("packet-controller", "M580 92 V150", null);
edge("controller-validator", "M480 176 H450", null);
edge("validator-probation", "M250 176 H220", null,0,0);
edge("probation-verdict", "M120 202 V260", null);
edge("verdict-step", "M20 286 H6 V66 H20", "next step", 60, 318);
var nodes = {};
STATES.forEach(function(s, i){
  var g = mk("g", {class:"pg-node", tabindex:"0", role:"button", "aria-label":(i+1) + " of 7: " + s.label, "data-id":s.id}, svg);
  mk("rect", {x:s.x, y:s.y + 0, width:W, height:H, rx:8}, g);
  var t = mk("text", {x:s.x + W/2, y:s.y + 24, "text-anchor":"middle"}, g); t.textContent = (i+1) + ". " + s.label;
  var t2 = mk("text", {x:s.x + W/2, y:s.y + 42, "text-anchor":"middle", style:"font-weight:400;font-size:10.5px;fill:var(--muted)"}, g); t2.textContent = s.code;
  g.addEventListener("click", function(){ go(i); });
  g.addEventListener("keydown", function(e){ if(e.key === "Enter" || e.key === " "){ e.preventDefault(); go(i); } });
  nodes[s.id] = g;
});
var rb = mk("text", {x:250, y:290, class:"pg-elabel", "text-anchor":"start"}, svg); rb.textContent = "after two rollbacks: controller off, original schedule";
host.appendChild(svg);

var cur = 0, showEx = false;
var pT = document.getElementById("pg-p-title"), pX = document.getElementById("pg-p-text"), pE = document.getElementById("pg-p-ex"), pEt = document.getElementById("pg-p-extext"),
    pC = document.getElementById("pg-p-code"), pN = document.getElementById("pg-pcount");
var EDGE_OF = ["monitor-step","step-monitor","monitor-packet","packet-controller","controller-validator","validator-probation","probation-verdict"];
function go(i){
  cur = Math.max(0, Math.min(STATES.length - 1, i)); var s = STATES[cur];
  Object.keys(nodes).forEach(function(k){ nodes[k].classList.toggle("is-active", k === s.id); });
  Object.keys(edges).forEach(function(k){ edges[k].classList.remove("is-active"); });
  var inc = ["step-monitor","monitor-packet","packet-controller","controller-validator","validator-probation","probation-verdict","verdict-step"][cur - 1];
  if(inc && edges[inc]) edges[inc].classList.add("is-active");
  pT.textContent = (cur + 1) + ". " + s.label; pX.textContent = s.text;
  pEt.textContent = s.ex; pE.hidden = false;
  pC.href = s.href; pC.textContent = "code.html, " + s.code;
  pN.textContent = "State " + (cur + 1) + " of " + STATES.length;
  document.getElementById("pg-prev").disabled = cur === 0;
  document.getElementById("pg-next").textContent = cur === STATES.length - 1 ? "Start again" : "Next";
}
document.getElementById("pg-next").addEventListener("click", function(){ go(cur === STATES.length - 1 ? 0 : cur + 1); });
document.getElementById("pg-prev").addEventListener("click", function(){ go(cur - 1); });
go(0);
})();
