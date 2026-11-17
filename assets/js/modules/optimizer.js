/* WP3: optimizer.html (module 1). Uses Replay.Chart/Player/Ticker/Mol and DATA_SWEEP, DATA_GUARD, DATA_NH3, DATA_H2O2, DATA_TRAJ_*, DATA_GRID. */
(function () {
  "use strict";
  var MD = window.MD, $ = MD.$;
  if (!MD) return;

  var UNIT_FMAX = "f_max (eV Å⁻¹)";

  /* ---------------------------------------------------------------- 1. step-cap sweep */
  function buildSweep() {
    var host = $("sweep-grid");
    if (!host) return;
    if (!MD.needData(host, "DATA_SWEEP") || !MD.needReplay(host, ["Chart", "Player"])) return;
    var runs = DATA_SWEEP.runs, caps = [0.005, 0.025, 0.3], mols = ["C10H6", "C11H8"];
    var MOLNAME = {C10H6: "C₁₀H₆", C11H8: "C₁₁H₈"};
    var ARMS = {
      0.005: [["PS", "Plain", "--c-plain", "dashed", 2], ["GS", "Supervised", "--c-sup", "solid", 2.4], ["GS2", "Supervised, repeat", "--c-sup2", "solid", 1.4]],
      0.025: [["PM", "Plain", "--c-plain", "dashed", 2], ["GM", "Supervised", "--c-sup", "solid", 2.4]],
      0.3: [["PB", "Plain", "--c-plain", "dashed", 2], ["GB", "Supervised", "--c-sup", "solid", 2.4], ["GB2", "Supervised, repeat", "--c-sup2", "solid", 1.4]]
    };
    MD.clear(host);
    var charts = [], tracks = [];
    function xs(n) { var a = [], i; for (i = 1; i <= n; i++) a.push(i); return a; }
    function mk(run, id, label, color, dash, width, marker) {
      var y = run.fmax_eVA; return {id: id, label: label, x: xs(y.length), y: y, color: color, dash: dash, width: width, marker: marker || null, end_label: id !== "sup2"};
    }
    function cellSeries(mol, cap, withAse) {
      var arr = [], pts = [];
      ARMS[cap].forEach(function (a) {
        var r = runs[mol + "_" + a[0]]; if (!r) return;
        var id = a[0] === "GS2" || a[0] === "GB2" ? "sup2" : (a[2] === "--c-plain" ? "plain" : "sup");
        arr.push(mk(r, id, a[1], a[2], a[3], a[4]));
        if (r.first_below_target) pts.push({x: r.first_below_target, series: id, label: "step " + r.first_below_target, kind: "target"});
      });
      if (mol === "C10H6" && cap === 0.005 && runs.C10H6_RS) {
        arr.push(mk(runs.C10H6_RS, "rules", "Rules run", "--c-rules", "dotted", 2, "square"));
        if (runs.C10H6_RS.first_below_target) pts.push({x: runs.C10H6_RS.first_below_target, series: "rules", label: "step " + runs.C10H6_RS.first_below_target, kind: "target"});
      }
      if (withAse && runs.C10H6_PD) {
        arr.push(mk(runs.C10H6_PD, "ase", "Plain, ASE defaults", "--c-default", "dashdot", 2));
        if (runs.C10H6_PD.first_below_target) pts.push({x: runs.C10H6_PD.first_below_target, series: "ase", label: "step " + runs.C10H6_PD.first_below_target, kind: "target"});
      }
      return {series: arr, points: pts};
    }
    function firstLine(mol, cap) {
      var parts = [];
      ARMS[cap].forEach(function (a) {
        var r = runs[mol + "_" + a[0]]; if (!r) return;
        parts.push(a[1] + ": " + (r.first_below_target ? "step " + r.first_below_target : (r.destroyed ? "structure lost" : "not within 149 steps")));
      });
      if (mol === "C10H6" && cap === 0.005 && runs.C10H6_RS) parts.push("Rules run: step " + runs.C10H6_RS.first_below_target);
      return "First step below the target. " + parts.join(" · ");
    }
    mols.forEach(function (mol) {
      caps.forEach(function (cap) {
        var destroyed = mol === "C11H8" && cap === 0.3;
        var cell = MD.h("div", {cls: "md-cell"});
        if (destroyed) cell.appendChild(MD.h("span", {cls: "chip chip--warn", text: "Structure destroyed at the first step, in all three runs"}));
        var cv = MD.h("div"); cell.appendChild(cv);
        cell.appendChild(MD.h("p", {cls: "md-cell__first", text: firstLine(mol, cap)}));
        host.appendChild(cell);
        var xmax = destroyed ? 20 : 150;
        var cs = cellSeries(mol, cap, false);
        var c = Replay.Chart(cv, {
          height: 180, title: MOLNAME[mol] + ", starting cap " + cap + " Å", desc: "Largest force against optimizer step for the runs of this cell.",
          x: {label: "optimizer step", min: 1, max: xmax}, y: {label: UNIT_FMAX, log: true, min: 0.01, max: 5},
          series: cs.series, hlines: [{y: 0.038, label: "target 0.038", dash: "dashed"}], points: cs.points, cursor: true, table: true, clipY: true
        });
        if (c) { charts.push({c: c, xmax: xmax}); tracks.push({c: c, mol: mol, cap: cap, cellSeries: cellSeries}); }
      });
    });
    // legend
    var lg = $("sweep-legend");
    if (lg) {
      MD.clear(lg);
      lg.appendChild(MD.legendItem("--c-plain", "dashed", "Plain L-BFGS"));
      lg.appendChild(MD.legendItem("--c-sup", "solid", "Supervised run (agent)"));
      lg.appendChild(MD.legendItem("--c-sup2", "solid", "Supervised, repeat"));
      lg.appendChild(MD.legendItem("--c-rules", "dotted", "Rules run (no language model)", "square"));
      lg.appendChild(MD.legendItem("--c-default", "dashdot", "Plain at the ASE defaults"));
      lg.appendChild(MD.h("span", {text: "◆ first step below the force target; dashed line: target 0.038 eV Å⁻¹"}));
    }
    var ase = $("sweep-ase");
    if (ase) ase.addEventListener("change", function () {
      tracks.forEach(function (t) {
        if (t.mol === "C10H6" && t.cap === 0.005) { var s = t.cellSeries(t.mol, t.cap, ase.checked); t.c.update({series: s.series, points: s.points}); }
      });
    });
    var ph = $("sweep-player");
    if (ph) {
      Replay.Player(ph, {n: 150, fps: 10, label: function (i) { return "Step " + (i + 1) + " of 150"; }, ariaLabel: "Replay of the sweep runs",
        onFrame: function (i) { charts.forEach(function (o) { if (i + 1 <= o.xmax) o.c.setCursor(i + 1); }); }});
    }
  }

  /* held-at-cap bars (own SVG, with table view) */
  function buildCapBars() {
    var host = $("cap-bars");
    if (!host) return;
    var hc = window.DATA_SWEEP && DATA_SWEEP.held_at_cap;
    var data = hc || {C10H6: {plain_pct: 100, supervised_range_pct: [30, 40]}, C11H8: {plain_pct: 95, supervised_range_pct: [30, 40]}};
    var W = 560, H = 190, ml = 150, mr = 20, mt = 14, pw = W - ml - mr;
    function sx(v) { return ml + v / 100 * pw; }
    var svg = MD.svg("svg", {viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": "Share of steps held at the cap. Plain runs: 100 percent for C10H6 and 95 percent for C11H8. Supervised runs: 30 to 40 percent."});
    var t, y = mt, rowH = 30, mols = [["C10H6", "C₁₀H₆"], ["C11H8", "C₁₁H₈"]];
    [0, 25, 50, 75, 100].forEach(function (v) {
      svg.appendChild(MD.svg("line", {cls: "md-grid", x1: sx(v), x2: sx(v), y1: mt - 4, y2: H - 30}));
      svg.appendChild(MD.svg("text", {x: sx(v), y: H - 14, "text-anchor": "middle", "font-size": 11, text: v + "%"}));
    });
    svg.appendChild(MD.svg("text", {x: ml + pw / 2, y: H - 1, "text-anchor": "middle", "font-size": 11, text: "share of steps held at the step cap"}));
    mols.forEach(function (m) {
      var d = data[m[0]];
      svg.appendChild(MD.svg("text", {x: ml - 10, y: y + 36, "text-anchor": "end", "font-size": 13, "font-weight": 700, text: m[1]}));
      // plain bar (dashed outline, grey)
      svg.appendChild(MD.svg("rect", {x: sx(0), y: y + 4, width: sx(d.plain_pct) - sx(0), height: 22, fill: "var(--c-plain)", "fill-opacity": 0.22, stroke: "var(--c-plain)", "stroke-width": 2, "stroke-dasharray": "6 4"}));
      svg.appendChild(MD.svg("text", {x: sx(d.plain_pct) - 6, y: y + 19, "text-anchor": "end", "font-size": 12, "font-weight": 600, text: "Plain " + d.plain_pct + "%"}));
      // supervised range
      var r = d.supervised_range_pct;
      svg.appendChild(MD.svg("rect", {x: sx(r[0]), y: y + 34, width: sx(r[1]) - sx(r[0]), height: 22, fill: "var(--c-sup)", "fill-opacity": 0.85}));
      svg.appendChild(MD.svg("line", {x1: sx(0), x2: sx(r[0]), y1: y + 45, y2: y + 45, stroke: "var(--c-sup)", "stroke-width": 1.5, "stroke-dasharray": "2 3"}));
      svg.appendChild(MD.svg("text", {x: sx(r[1]) + 6, y: y + 50, "font-size": 12, "font-weight": 600, text: "Supervised " + r[0] + " to " + r[1] + "%"}));
      y += 74;
    });
    var tbl = MD.table(["Molecule", "Plain run", "Supervised runs"], mols.map(function (m) {
      var d = data[m[0]]; return [m[1], d.plain_pct + "%", d.supervised_range_pct[0] + " to " + d.supervised_range_pct[1] + "%"];
    }), {caption: "Share of steps held at the cap, runs started at 0.005 Å"});
    MD.viewSwitch(host, [{value: "chart", label: "Chart", node: MD.h("div", null, [svg])}, {value: "table", label: "Table view", node: tbl}]);
  }

  /* ---------------------------------------------------------------- 2. guard: browsable decisions */
  var EVENT_LABEL = {basin_choice: "Choice of starting basin", pass_start: "Start of a pass", final_check: "Final check"};
  var ACTION_LABEL = {CONTINUE: "Continue", SET_PARAMS: "Change a setting", TIGHTEN_SCF: "Tighten the SCF", RESET_LBFGS_MEMORY: "Reset the L-BFGS memory"};
  function decisionTitle(d) {
    var ev = d.event === "trigger" ? "Trigger: " + String(d.trigger || "").replace(/_/g, " ") : (EVENT_LABEL[d.event] || d.event);
    return "Step " + d.step + " · " + ev;
  }
  function actionText(d) {
    var a = ACTION_LABEL[d.action] || d.action || "";
    if (d.action === "SET_PARAMS" && d.params && d.params.maxstep !== undefined) a += " (step cap → " + d.params.maxstep + " Å)";
    return a;
  }
  function buildGuardList() {
    var host = $("guard-list");
    if (!host) return;
    if (!MD.needReplay(host, ["Ticker"])) return;
    var all = [], mols = ["C10H6", "C11H8"], sets = {C10H6: window.DATA_TRAJ_C10H6, C11H8: window.DATA_TRAJ_C11H8};
    var ARM_LABEL = {GS: "supervised, cap 0.005 Å", GS2: "supervised repeat, cap 0.005 Å", GM: "supervised, cap 0.025 Å", GB: "supervised, cap 0.3 Å", GB2: "supervised repeat, cap 0.3 Å"};
    var MOLNAME = {C10H6: "C₁₀H₆", C11H8: "C₁₁H₈"};
    mols.forEach(function (m) {
      var d = sets[m]; if (!d || !d.runs) return;
      Object.keys(ARM_LABEL).forEach(function (arm) {
        var r = d.runs[arm]; if (!r || !r.decisions) return;
        var items = r.decisions.map(function (dec) {
          return {step: dec.step, title: decisionTitle(dec), action: dec.action, actionLabel: actionText(dec), params: dec.params, status: dec.status,
                  outcome: dec.outcome, rationale: dec.rationale, evidence: dec.evidence, role: dec.role, _kind: dec.action};
        });
        all.push({mol: m, arm: arm, label: MOLNAME[m] + ", " + ARM_LABEL[arm], items: items});
      });
    });
    if (!all.length) { host.innerHTML = '<p class="md-missing">Decision data not loaded.</p>'; return; }
    var selM = $("gl-mol"), selR = $("gl-run"), selA = $("gl-act"), cnt = $("gl-count");
    function opt(sel, v, t) { sel.appendChild(MD.h("option", {value: v, rich: t})); }
    opt(selM, "all", "All molecules"); mols.forEach(function (m) { opt(selM, m, MOLNAME[m]); });
    opt(selR, "all", "All runs"); Object.keys(ARM_LABEL).forEach(function (a) { opt(selR, a, ARM_LABEL[a]); });
    opt(selA, "all", "All actions");
    var kinds = {}; all.forEach(function (r) { r.items.forEach(function (i) { kinds[i._kind] = 1; }); });
    Object.keys(kinds).forEach(function (k) { opt(selA, k, ACTION_LABEL[k] || k); });
    function draw() {
      MD.clear(host); var total = 0;
      all.forEach(function (r) {
        if (selM.value !== "all" && r.mol !== selM.value) return;
        if (selR.value !== "all" && r.arm !== selR.value) return;
        var items = r.items.filter(function (i) { return selA.value === "all" || i._kind === selA.value; });
        if (!items.length) return;
        total += items.length;
        host.appendChild(MD.h("h4", {cls: "md-cell__title", rich: r.label + " (" + items.length + ")"}));
        var box = MD.h("div"); host.appendChild(box);
        var t = Replay.Ticker(box, {items: items, emptyText: "No decision matches these filters."});
        if (t && t.showAll) t.showAll(true);
      });
      if (!total) host.appendChild(MD.h("p", {cls: "md-missing", text: "No decision matches these filters."}));
      if (cnt) cnt.textContent = total + " of " + all.reduce(function (s, r) { return s + r.items.length; }, 0) + " decisions shown";
    }
    [selM, selR, selA].forEach(function (s) { s.addEventListener("change", draw); });
    draw();
  }

  /* ---------------------------------------------------------------- 3. saddle tests */
  function interp(xs, ys, x) {
    // xs ascending
    if (x <= xs[0]) return ys[0];
    for (var i = 1; i < xs.length; i++) if (x <= xs[i]) { var f = (x - xs[i - 1]) / (xs[i] - xs[i - 1] || 1); return ys[i - 1] + f * (ys[i] - ys[i - 1]); }
    return ys[ys.length - 1];
  }
  function fmtCm(x) { return (x < 0 ? "−" : "+") + Math.abs(Math.round(x)) + " cm⁻¹"; }
  var ARM_NAME = {plain: "Plain run", supervised: "Supervised run", rules: "Rules run"};
  var START_NAME = {"exact saddle": "Exact saddle", "displaced a": "Displaced structure a", "displaced b": "Displaced structure b"};

  function buildNH3() {
    var host = $("nh3-player");
    if (!host || !MD.needData(host, "DATA_NH3")) return;
    var D = DATA_NH3, runs = D.runs;
    buildNH3Matrix(D);
    if (!MD.needReplay(host, ["Mol", "Chart", "Player", "Ticker"])) return;
    // profile: h ascending 0..hmin, E_rel descending
    var pes = D.pes.slice().sort(function (a, b) { return a.h_A - b.h_A; });
    var H = pes.map(function (p) { return p.h_A; }), E = pes.map(function (p) { return p.E_rel_meV; }), R = pes.map(function (p) { return p.r_NH_A; });
    var Esad = E[0], bi = 0;
    E.forEach(function (e, i) { if (e < E[bi]) bi = i; });
    function hOfE(e) { // branch 0 <= h <= h_min, energy falls with h
      var k; if (e >= E[0]) return H[0]; if (e <= E[bi]) return H[bi];
      for (k = 1; k <= bi; k++) if (e >= E[k]) { var f = (E[k - 1] - e) / (E[k - 1] - E[k] || 1); return H[k - 1] + f * (H[k] - H[k - 1]); }
      return H[bi];
    }
    function nh3(h) {
      var r = interp(H, R, Math.abs(h)), rho = Math.sqrt(Math.max(0.01, r * r - h * h)), c = [[0, 0, h]], k;
      for (k = 0; k < 3; k++) { var a = k * 2 * Math.PI / 3; c.push([rho * Math.cos(a), rho * Math.sin(a), 0]); }
      return c;
    }
    var sel = $("nh3-run"), runBox = {};
    var groups = {};
    runs.forEach(function (r, i) {
      var g = (START_NAME[r.start] || r.start) + " · session " + r.session;
      (groups[g] = groups[g] || []).push([r, i]);
    });
    Object.keys(groups).forEach(function (g) {
      var og = MD.h("optgroup", {label: g});
      groups[g].forEach(function (pair) {
        var r = pair[0];
        og.appendChild(MD.h("option", {value: pair[1], text: ARM_NAME[r.arm] + (r.variant ? " (" + r.variant + ")" : "") + " · " + r.n_steps + " steps"}));
      });
      sel.appendChild(og);
    });
    var molHost = $("nh3-mol"), chHost = $("nh3-charts"), tkHost = $("nh3-ticker"), vd = $("nh3-verdict");
    var mol = Replay.Mol(molHost, {symbols: ["N", "H", "H", "H"], coords: nh3(H[H.length - 1]), height: 280, view: "side", label: "Ammonia, picture placed from the logged energy"});
    var player = null, cEn = null, cPr = null, tick = null, hs = [];
    var hmax = H[H.length - 1];
    function load(idx) {
      var r = runs[idx], en = r.steps.energy_eV, n = en.length, k;
      var last = en[n - 1];
      var Emin_abs = r.verdict === "minimum" ? last : last - Esad / 1000;
      hs = en.map(function (e) { return hOfE((e - Emin_abs) * 1000); });
      var rel = en.map(function (e) { return (e - Emin_abs) * 1000; });
      vd.className = "chip md-verdict " + (r.verdict === "minimum" ? "chip--ok" : "chip--warn");
      vd.textContent = r.verdict === "minimum" ? "✓ Minimum: lowest mode " + fmtCm(r.lowest_cm1) : "✗ Stopped on the saddle point: lowest mode " + fmtCm(r.lowest_cm1);
      MD.clear(chHost);
      var cA = MD.h("div"), cB = MD.h("div"); chHost.appendChild(cA); chHost.appendChild(cB);
      var px = [], py = [];
      for (k = H.length - 1; k >= 1; k--) { px.push(-H[k]); py.push(E[k]); }
      for (k = 0; k < H.length; k++) { px.push(H[k]); py.push(E[k]); }
      cPr = Replay.Chart(cA, {height: 170, title: "Inversion profile (relaxed)", desc: "Energy against the height of N above the H plane, both wells.",
        x: {label: "N height h (Å)", min: -hmax * 1.05, max: hmax * 1.05, short: "h"}, y: {label: "energy above minimum (meV)", min: 0, max: Esad * 1.1},
        series: [{id: "pes", label: "relaxed profile", x: px, y: py, color: "--c-sup", dash: "solid", width: 2, marker: "circle", end_label: false}], cursor: true, table: true});
      var xs = en.map(function (_, i) { return i + 1; });
      cEn = Replay.Chart(cB, {height: 170, title: "Energy of the logged run", desc: "Logged energy above the final energy of the run, per step.",
        x: {label: "optimizer step", min: 1, max: Math.max(2, n)}, y: {label: "energy above the end (meV)", min: Math.min(0, Math.min.apply(null, rel)), max: Math.max(1, Math.max.apply(null, rel)) * 1.05},
        series: [{id: "e", label: ARM_NAME[r.arm], x: xs, y: rel, color: r.arm === "plain" ? "--c-plain" : "--c-sup", dash: r.arm === "plain" ? "dashed" : "solid", width: 2, end_label: false}], cursor: true, table: true});
      // ticker: events + decision_log
      MD.clear(tkHost);
      var items = [], logged = {}, seed = /displaced a/.test(r.start) ? "seed 21" : /displaced b/.test(r.start) ? "seed 22" : null;
      var KIND = {final_check: "Final check", decision: "Decision"};
      if (r.arm === "supervised") (D.decision_log || []).forEach(function (d) {
        var same = d.session === r.session && (d.start === r.start || (seed && d.start.indexOf(seed) >= 0));
        if (!same) return;
        logged[d.step] = 1;
        items.push({step: d.step, title: "Step " + d.step + " · " + (KIND[d.event] || d.event), action: d.action, actionLabel: d.action, rationale: d.reason,
          evidence: d.evidence ? [String(d.evidence)] : [], role: d.role, quoteHead: d.role === "no model call" ? "Reason (logged, rule-based)" : "Reason written by the model (logged)"});
      });
      (r.events || []).forEach(function (e) {
        if (logged[e.step]) return;
        items.push({step: e.step, title: "Step " + e.step + " · " + (KIND[e.kind] || e.kind), action: e.action, actionLabel: e.action,
          rationale: "Verdict: " + (e.verdict || "n/a") + (e.lowest_cm1 !== undefined && e.lowest_cm1 !== null ? "; lowest mode " + fmtCm(e.lowest_cm1) : "") + ".", quoteHead: "Logged event"});
      });
      tick = Replay.Ticker(tkHost, {items: items, emptyText: r.arm === "plain" ? "A plain run has no decisions: L-BFGS runs with fixed settings, and no curvature probe." : "No logged decision or probe result for this run."});
      if (player) player.destroy();
      MD.clear(host);
      player = Replay.Player(host, {n: n, fps: 6, ariaLabel: "Replay of the ammonia run", label: function (i) { return "Step " + (i + 1) + " of " + n + " · N height " + hs[i].toFixed(2) + " Å (placed from energy)"; },
        onFrame: function (i) { mol.setCoords(nh3(hs[i])); if (cEn) cEn.setCursor(i + 1); if (cPr) cPr.setCursor(hs[i]); if (tick) tick.setStep(i + 1); }});
      player.seek(0);
    }
    sel.addEventListener("change", function () { load(+sel.value); });
    // default: first supervised run from the exact saddle
    var def = 0; runs.forEach(function (r, i) { if (!def && r.arm === "supervised" && r.start === "exact saddle") def = i; });
    sel.value = def; load(def);
  }

  function buildNH3Matrix(D) {
    var host = $("nh3-matrix"); if (!host) return;
    var runs = D.runs, starts = ["exact saddle", "displaced a", "displaced b"], arms = ["plain", "supervised", "rules"];
    var rows = [];
    starts.forEach(function (st) {
      ["S1", "S2"].forEach(function (ses) {
        var sub = runs.filter(function (r) { return r.start === st && r.session === ses; });
        if (!sub.length) return;
        var row = [(START_NAME[st] || st) + ", session " + ses];
        arms.forEach(function (a) {
          var box = MD.h("div");
          sub.filter(function (r) { return r.arm === a; }).forEach(function (r) {
            var ok = r.verdict === "minimum";
            box.appendChild(MD.h("span", {cls: "md-run " + (ok ? "md-run--min" : "md-run--saddle"),
              text: (ok ? "✓ minimum" : "✗ saddle") + ", " + r.n_steps + (r.n_steps === 1 ? " step" : " steps") + (r.variant ? " (" + r.variant + ")" : "")}));
          });
          if (!box.firstChild) box.appendChild(document.createTextNode("–"));
          row.push({node: box});
        });
        rows.push(row);
      });
    });
    var c = D.counts || {};
    var pl = runs.filter(function (r) { return r.arm === "plain"; }), onS = pl.filter(function (r) { return r.verdict === "saddle"; }).length;
    var sup = runs.filter(function (r) { return r.arm === "supervised"; }), supMin = sup.filter(function (r) { return r.verdict === "minimum"; }).length;
    var ru = runs.filter(function (r) { return r.arm === "rules"; }), ruMin = ru.filter(function (r) { return r.verdict === "minimum"; }).length;
    MD.clear(host);
    host.appendChild(MD.table(["Start and session", "Plain run", "Supervised run", "Rules run"], rows, {}));
    host.appendChild(MD.h("p", {cls: "md-small", text: "Totals from the runs above: plain " + onS + " of " + pl.length + " stopped on the saddle point; supervised " + supMin + " of " + sup.length + " ended in a minimum; rules " + ruMin + " of " + ru.length + " ended in a minimum."}));
    host.firstChild.classList.add("md-matrix");
  }

  function mkH2O2(dihedralDeg) {
    var OO = 1.45, OH = 0.97, ang = 100 * Math.PI / 180, d = dihedralDeg * Math.PI / 180;
    var o1 = [-OO / 2, 0, 0], o2 = [OO / 2, 0, 0];
    var h1 = [o1[0] + OH * Math.cos(ang), OH * Math.sin(ang), 0];
    var h2 = [o2[0] - OH * Math.cos(ang), OH * Math.sin(ang) * Math.cos(d), OH * Math.sin(ang) * Math.sin(d)];
    return [o1, o2, h1, h2];
  }
  function buildH2O2() {
    var host = $("h2o2-player");
    if (!host || !MD.needData(host, "DATA_H2O2")) return;
    var D = DATA_H2O2, runs = D.runs;
    // table first (no replay needed)
    var mt = $("h2o2-matrix");
    if (mt) {
      MD.clear(mt);
      mt.appendChild(MD.table(["Run", "Arm", "Steps", "Dihedral, start → end (°)", "Energy above minimum (kcal mol⁻¹)", "Verdict", "Lowest mode (cm⁻¹)"], runs.map(function (r, i) {
        return [r.id || ("run " + (i + 1)), ARM_NAME[r.arm] || r.arm, String(r.n_steps), MD.num(r.dihedral_start, 1) + " → " + MD.num(r.dihedral_final, 1), MD.num(r.above_min_kcal, 2),
          r.verdict === "minimum" ? "✓ minimum" : "✗ saddle", MD.minus(Math.round(r.lowest_cm1))];
      }), {caption: "The nine hydrogen peroxide runs (logged by the compact test engine)"}));
    }
    if (!MD.needReplay(host, ["Mol", "Chart", "Player"])) return;
    var sel = $("h2o2-run"), vd = $("h2o2-verdict"), mol = Replay.Mol($("h2o2-mol"), {symbols: ["O", "O", "H", "H"], coords: mkH2O2(180), height: 280, view: "tilt", label: "Hydrogen peroxide, drawn from the logged dihedral"});
    runs.forEach(function (r, i) { sel.appendChild(MD.h("option", {value: i, text: (ARM_NAME[r.arm] || r.arm) + " · start " + (r.start !== undefined ? r.start : Math.round(r.dihedral_start) + "°") + " · " + r.n_steps + " steps"})); });
    var player = null, c1, c2, log;
    function load(i) {
      var r = runs[i]; log = r.log; var n = log.length;
      vd.className = "chip md-verdict " + (r.verdict === "minimum" ? "chip--ok" : "chip--warn");
      vd.textContent = r.verdict === "minimum" ? "✓ Minimum: lowest mode " + fmtCm(r.lowest_cm1) : "✗ Stopped on the saddle point: lowest mode " + fmtCm(r.lowest_cm1);
      var box = $("h2o2-charts"); MD.clear(box);
      var a = MD.h("div"), b = MD.h("div"); box.appendChild(a); box.appendChild(b);
      var idx = log.map(function (_, k) { return k + 1; }), emin = Math.min.apply(null, log.map(function (q) { return q[2]; }));
      var col = r.arm === "plain" ? "--c-plain" : "--c-sup", dash = r.arm === "plain" ? "dashed" : "solid";
      c1 = Replay.Chart(a, {height: 160, title: "Dihedral H–O–O–H", desc: "Logged dihedral angle per log index.", x: {label: "log index", min: 1, max: Math.max(2, n)}, y: {label: "dihedral (°)", min: 90, max: 190},
        series: [{id: "d", label: "dihedral", x: idx, y: log.map(function (q) { return q[1]; }), color: col, dash: dash, width: 2, end_label: false}], cursor: true, table: true});
      var rel = log.map(function (q) { return (q[2] - emin) * 1000; });
      c2 = Replay.Chart(b, {height: 160, title: "Energy", desc: "Logged energy above the lowest logged value of this run.", x: {label: "log index", min: 1, max: Math.max(2, n)}, y: {label: "energy above lowest logged (meV)", min: 0, max: Math.max(1, Math.max.apply(null, rel)) * 1.05},
        series: [{id: "e", label: "energy", x: idx, y: rel, color: col, dash: dash, width: 2, end_label: false}], cursor: true, table: true});
      if (player) player.destroy();
      MD.clear(host);
      player = Replay.Player(host, {n: n, fps: 5, ariaLabel: "Replay of the hydrogen peroxide run", label: function (k) { return "Log index " + (k + 1) + " of " + n + " · dihedral " + log[k][1].toFixed(1) + "°"; },
        onFrame: function (k) { mol.setCoords(mkH2O2(log[k][1])); c1 && c1.setCursor(k + 1); c2 && c2.setCursor(k + 1); }});
      player.seek(0);
    }
    sel.addEventListener("change", function () { load(+sel.value); });
    var def = 0; runs.forEach(function (r, i) { if (!def && r.arm === "supervised") def = i; });
    sel.value = def; load(def);
  }

  function buildTabs() {
    var tabs = document.querySelectorAll(".md-tabs .tab");
    function show(t) {
      tabs.forEach(function (x) {
        var on = x === t; x.setAttribute("aria-selected", on ? "true" : "false"); x.tabIndex = on ? 0 : -1;
        var pane = document.getElementById(x.getAttribute("aria-controls")); if (pane) pane.hidden = !on;
      });
      document.dispatchEvent(new Event("resize")); window.dispatchEvent(new Event("resize"));
    }
    tabs.forEach(function (t, i) {
      t.addEventListener("click", function () { show(t); });
      t.addEventListener("keydown", function (e) {
        if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); var n = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length]; n.focus(); show(n); }
      });
    });
    var lazy = false;
    tabs.forEach(function (t) { t.addEventListener("click", function () { if (t.id === "tab-h2o2" && !lazy) { lazy = true; MD.guard($("h2o2-player"), "h2o2", buildH2O2); } }); });
    // H2O2 built lazily on first open (hidden panels have zero width)
    window.__md_h2o2_lazy = function () { if (!lazy) { lazy = true; MD.guard($("h2o2-player"), "h2o2", buildH2O2); } };
  }

  /* ---------------------------------------------------------------- 4. one structure */
  function buildOverlay() {
    var host = $("ov-viewer");
    if (!host) return;
    var sets = {C10H6: window.DATA_TRAJ_C10H6, C11H8: window.DATA_TRAJ_C11H8};
    if (!sets.C10H6 && !sets.C11H8) { MD.needData(host, "DATA_TRAJ_C10H6"); return; }
    if (!MD.needReplay(host, ["Mol"])) return;
    var cur = null, viewer = null, names = {C10H6: "C₁₀H₆", C11H8: "C₁₁H₈"};
    function show(m) {
      var d = sets[m]; if (!d) return;
      var keys = Object.keys(d.runs).filter(function (k) { var r = d.runs[k]; return r.converged && !r.destroyed && r.frames && r.frames.length; });
      if (!keys.length) return;
      function last(k) { var f = d.runs[k].frames; return f[f.length - 1]; }
      if (viewer) viewer.destroy();
      MD.clear(host);
      viewer = Replay.Mol(host, {symbols: d.symbols, coords: last(keys[0]), height: 470, view: "top", colorBy: null, label: "End points of " + keys.length + " sweep runs of " + names[m] + ", overlaid"});
      keys.slice(1).forEach(function (k, i) { viewer.overlay(last(k), {opacity: 0.35, id: "r" + i}); });
      $("ov-note").textContent = keys.length + " runs overlaid: " + keys.join(", ") + ". They are visually indistinguishable.";
      cur = m;
    }
    var avail = ["C10H6", "C11H8"].filter(function (m) { return sets[m]; });
    var segHost = $("ov-mol");
    var s = MD.seg(segHost, avail.map(function (m) { return {value: m, label: names[m]}; }), avail[0], show);
    show(avail[0]);
  }

  function buildGrid() {
    var host = $("grid-chart");
    if (!host || !MD.needData(host, "DATA_GRID") || !MD.needReplay(host, ["Chart"])) return;
    var R = DATA_GRID.runs, a = R.C10H6_R1_A3p, b = R.C10H6_R1_A0p, c = R.C10H6_R1_A0r;
    if (!a || !b || !c) { host.textContent = "Run data missing."; return; }
    var ref = a.energy_eV[a.energy_eV.length - 1];
    function ser(r, id, label, col, dash, w) {
      var y = r.energy_eV.map(function (e) { return Math.max(1e-4, e - ref); });
      return {id: id, label: label, x: y.map(function (_, i) { return i + 1; }), y: y, color: col, dash: dash, width: w, end_label: true};
    }
    Replay.Chart(host, {height: 260, title: "Energy still to be released, C₁₀H₆ from start R1", desc: "Energy above the final energy of the supervised run, against optimizer step, logarithmic scale.",
      x: {label: "optimizer step", min: 1, max: 150}, y: {label: "energy above supervised end (eV)", log: true, min: 1e-4, max: 5},
      series: [ser(a, "a", "Supervised, weak hand schedule", "--c-sup", "solid", 2.4), ser(b, "b", "Plain, weak hand schedule", "--c-plain", "dashed", 2), ser(c, "c", "Plain, random schedule", "--c-default", "dashdot", 2)],
      cursor: true, table: true, clipY: true});
  }

  MD.ready(function () {
    MD.guard($("sweep-grid"), "sweep", buildSweep);
    MD.guard($("cap-bars"), "cap bars", buildCapBars);
    MD.guard($("guard-list"), "guard list", buildGuardList);
    buildTabs();
    MD.guard($("nh3-player"), "ammonia", buildNH3);
    MD.guard($("ov-viewer"), "overlay", buildOverlay);
    MD.guard($("grid-chart"), "grid", buildGrid);
    // H2O2 table is cheap and replay-free; the replay itself waits for the first tab open
    var t = document.getElementById("tab-h2o2");
    if (t) t.addEventListener("click", function () { window.__md_h2o2_lazy && window.__md_h2o2_lazy(); });
  });
})();
