/* Journey of one molecule: page logic. Text lives in journey-content.js. */
(function () {
  "use strict";
  var J = window.JOURNEY, MINUS = "−";

  // ---------------------------------------------------------------- pure helpers (node-testable)
  function unflatten(flat) { var o = [], i; if (!flat) return o; if (typeof flat[0] !== "number") return flat; for (i = 0; i + 2 < flat.length; i += 3) o.push([flat[i], flat[i + 1], flat[i + 2]]); return o; }
  function range1(n) { var a = []; for (var i = 1; i <= n; i++) a.push(i); return a; }
  function fmtCap(v) { return (+v).toFixed(3); }
  var EVENT_LABEL = { basin_choice: "Choice of starting basin", pass_start: "Start of a pass", final_check: "Final check" };
  var ACTION_LABEL = { CONTINUE: "Continue", SET_PARAMS: "Change a setting", TIGHTEN_SCF: "Tighten the SCF", RESET_LBFGS_MEMORY: "Reset the L-BFGS memory", RESET_MEMORY: "Reset the L-BFGS memory" };
  function eventLabel(d) {
    if (d.event === "trigger") { var tn = String(d.trigger || "").replace(/_/g, " "); return (!tn || tn === "trigger") ? "Trigger" : "Trigger: " + tn; }
    return EVENT_LABEL[d.event] || String(d.event || "Decision").replace(/_/g, " ");
  }
  function paramsLabel(p) {
    if (!p || typeof p !== "object") return "";
    var keys = Object.keys(p).sort(function (a, b) { return (a === "maxstep" ? 0 : 1) - (b === "maxstep" ? 0 : 1); });
    return keys.map(function (k) {
      var v = p[k], mm;
      if (k === "maxstep" || k === "step_cap") return "step cap → " + fmtCap(v) + " Å";
      if (k === "memory") return "L-BFGS memory → " + v;
      if (k === "optimizer" && (mm = /^lbfgs_mem(\d+)$/.exec(String(v)))) return "L-BFGS memory → " + mm[1];
      return k + ": " + v;
    }).join(", ");
  }
  function decisionToItem(d) {
    return {
      step: d.step | 0,
      title: "Step " + (d.step | 0) + " · " + eventLabel(d),
      action: d.action,
      actionLabel: ACTION_LABEL[d.action] || d.action,
      paramsText: (d.action === "CONTINUE") ? "" : paramsLabel(d.params),
      params: d.params,
      status: d.status, outcome: d.outcome,
      rationale: d.rationale, evidence: d.evidence || [], role: d.role
    };
  }
  function marksFor(run) {
    var m = [];
    (run.decisions || []).forEach(function (d) {
      if ((d.step | 0) < 1) return;
      var p = paramsLabel(d.params);
      m.push({ i: d.step | 0, kind: "decision", label: (d.event === "trigger" ? "decision" : eventLabel(d)) + (p && d.action !== "CONTINUE" ? ": " + p : "") });
    });
    (run.probations || []).forEach(function (p) { m.push({ i: p.start_step | 0, kind: "probation", label: "probation starts" + (p.outcome === "rolled_back" ? " (rolled back)" : "") }); });
    if (run.first_below_target) m.push({ i: run.first_below_target | 0, kind: "target", label: "force target reached" });
    return m;
  }
  function releasedEnergy(run, ref, floor) {
    return (run.steps.energy_eV || []).map(function (e) { return Math.max(floor, e - ref); });
  }
  function envelope(modes, fwhm, x0, x1, dx) {
    var s = fwhm / 2.354820045, xs = [], ys = [], x, i;
    for (x = x0; x <= x1 + 1e-9; x += dx) {
      var y = 0;
      for (i = 0; i < modes.length; i++) { var d = x - modes[i].freq; if (Math.abs(d) < 6 * s) y += modes[i].ir * Math.exp(-d * d / (2 * s * s)); }
      xs.push(x); ys.push(y);
    }
    return { x: xs, y: ys };
  }
  function sticks(items, key) {   // one polyline with breaks: [x,x,null,...]
    var x = [], y = [];
    items.forEach(function (it, k) { x.push(it.x, it.x); y.push(0, it.h); if (k < items.length - 1) { x.push(null); y.push(null); } });
    return { x: x, y: y };
  }
  function motionFrames(symbols, P, kind, n, amp) {
    var pure = window.Replay && Replay._molPure, nrm = pure ? pure.baseFrame(P)[2] : [0, 0, 1], out = [], f, i, j;
    var cen = [0, 0, 0]; P.forEach(function (p) { cen[0] += p[0] / P.length; cen[1] += p[1] / P.length; cen[2] += p[2] / P.length; });
    var pairs = [], hb = [];
    for (i = 0; i < P.length; i++) for (j = i + 1; j < P.length; j++) {
      var d = Math.hypot(P[i][0] - P[j][0], P[i][1] - P[j][1], P[i][2] - P[j][2]);
      if (symbols[i] === "C" && symbols[j] === "C" && d < 1.3) pairs.push([i, j]);
      if (((symbols[i] === "H" && symbols[j] === "C") || (symbols[i] === "C" && symbols[j] === "H")) && d < 1.25) hb.push(symbols[i] === "H" ? [i, j] : [j, i]);
    }
    for (f = 0; f < n; f++) {
      var s = Math.sin(2 * Math.PI * f / n), Q = P.map(function (p) { return p.slice(); });
      if (kind === "wag") {
        for (i = 0; i < P.length; i++) { var k = symbols[i] === "H" ? 1 : -0.25; for (j = 0; j < 3; j++) Q[i][j] += nrm[j] * amp * 1.6 * k * s; }
      } else if (kind === "cc") {
        pairs.forEach(function (pr) { var a = P[pr[0]], b = P[pr[1]], dd = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) || 1;
          for (j = 0; j < 3; j++) { var u = (b[j] - a[j]) / dd; Q[pr[0]][j] -= u * amp * 0.9 * s; Q[pr[1]][j] += u * amp * 0.9 * s; } });
      } else if (kind === "ch") {
        hb.forEach(function (pr) { var h = P[pr[0]], c = P[pr[1]], dd = Math.hypot(h[0] - c[0], h[1] - c[1], h[2] - c[2]) || 1;
          for (j = 0; j < 3; j++) Q[pr[0]][j] += (h[j] - c[j]) / dd * amp * 1.2 * s; });
      }
      out.push(Q);
    }
    return out;
  }
  function matchRow(rows, mol, probe) {
    var r = null;
    (rows || []).forEach(function (x) {
      var mm = String(x.molecule).replace(/[^A-Za-z0-9]/g, "").replace(/₀/g, "0");
      if ((mm.indexOf(mol) === 0 || String(x.molecule).indexOf(mol) === 0) && String(x.probe).indexOf(probe) === 0) r = x;
    });
    return r;
  }
  window.JourneyPure = { unflatten: unflatten, range1: range1, eventLabel: eventLabel, paramsLabel: paramsLabel, decisionToItem: decisionToItem, marksFor: marksFor, releasedEnergy: releasedEnergy, envelope: envelope, sticks: sticks, motionFrames: motionFrames, matchRow: matchRow };
  if (typeof document === "undefined") return;

  // ---------------------------------------------------------------- DOM
  function h(tag, attrs, kids) {
    var e = document.createElement(tag), k;
    if (attrs) for (k in attrs) { var v = attrs[k]; if (v == null || v === false) continue; if (k === "class") e.className = v; else if (k === "html") e.innerHTML = v; else if (k === "text") e.textContent = v; else e.setAttribute(k, v === true ? "" : v); }
    (kids || []).forEach(function (c) { if (c == null) return; e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return e;
  }
  function badge(kind) {
    var b;
    if (window.Site && Site.badge) { b = Site.badge(kind); b.setAttribute("data-badge", kind); b.setAttribute("data-badge-done", "1"); return b; }
    b = h("span", { class: "badge badge--" + kind, "data-badge": kind, text: kind }); return b;
  }
  function reduced() { try { return !!(window.Site && Site.reducedMotion()); } catch (e) { return false; } }
  function pick(v, mol) { return v && typeof v === "object" && !Array.isArray(v) && (v.C10H6 !== undefined || v.C11H8 !== undefined) ? v[mol] : v; }
  function formula(m) { return m === "C10H6" ? "C<sub>10</sub>H<sub>6</sub>" : "C<sub>11</sub>H<sub>8</sub>"; }
  function hasData(name) { return !!window[name]; }
  function msg(t) { return h("p", { class: "rp-error", text: t }); }

  var $ = function (id) { return document.getElementById(id); };
  var layout = $("jy-layout"), cardsEl = $("jy-cards"), viewerEl = $("jy-viewer"), railEl = $("jy-rail");
  if (!layout || !J) return;
  var state = { mol: "C10H6", stage: 0, run: "GS", showAll: false };
  var live = { mol: null, player: null, charts: [], ticker: null, extra: [] };

  // ---------- hash
  function readHash() {
    var o = {}, hs = (location.hash || "").replace(/^#/, "");
    hs.split("&").forEach(function (p) { var kv = p.split("="); if (kv[0]) o[kv[0]] = decodeURIComponent(kv[1] || ""); });
    return o;
  }
  function writeHash() {
    var hs = "#m=" + state.mol + "&s=" + state.stage;
    try { history.replaceState(null, "", hs); } catch (e) { try { location.hash = hs; } catch (e2) {} }
  }

  // ---------- teardown / helpers for dynamic parts
  function teardown() {
    if (live.player) { try { live.player.destroy(); } catch (e) {} }
    live.charts.forEach(function (c) { try { c && c.destroy(); } catch (e) {} });
    if (live.ticker) { try { live.ticker.destroy(); } catch (e) {} }
    if (live.mol) { try { live.mol.destroy(); } catch (e) {} }
    live = { mol: null, player: null, charts: [], ticker: null, extra: [] };
  }
  function panel(title, badges, bodyNodes, foot, anchor) {
    var head = h("div", { class: "panel__head" }, [h("h4", { class: "panel__title", text: title }), h("span", { class: "cluster jy-badges" }, badges.map(badge))]);
    var body = h("div", { class: "panel__body" }, bodyNodes);
    var kids = [head, body];
    if (foot) {
      var f = h("div", { class: "panel__foot" }, [foot + " "]);
      if (anchor) f.appendChild(h("a", { href: "data.html#" + anchor, text: "Show the data" }));
      kids.push(f);
    }
    return h("section", { class: "panel jy-panel" }, kids);
  }
  function unitNote() { return h("p", { class: "jy-unitnote", text: J.unitNote }); }

  // ---------- rail
  function buildRail() {
    var stages = J.stages;
    railEl.innerHTML = "";
    var track = h("div", { class: "jy-rail__grid", role: "tablist", "aria-label": "Stages" });
    function node(s, gridCol, row) {
      var b = h("button", { type: "button", class: "jy-node", "data-stage": s.n, "data-module": s.module, role: "tab", "aria-selected": "false", id: "jy-node-" + s.n,
        "aria-label": "Stage " + s.n + ": " + s.title }, [h("span", { class: "jy-node__n", text: String(s.n) }), h("span", { class: "jy-node__t", text: s.rail })]);
      b.style.gridColumn = gridCol; b.style.gridRow = row;
      b.addEventListener("click", function () { goStage(s.n, true); });
      return b;
    }
    var cols = { 0: 1, 1: 2, 2: 3, 3: 4, 4: 6, 5: 7 };
    stages.forEach(function (s) { if (s.n <= 5) track.appendChild(node(s, String(cols[s.n]), "1")); });
    // line behind row 1
    track.appendChild(h("span", { class: "jy-rail__line jy-rail__line--main", "aria-hidden": "true" }));
    // junction
    var join = h("button", { type: "button", class: "jy-join", "aria-expanded": "false", "aria-controls": "jy-join-text", "aria-label": "Routes meet at def2-TZVP. Show details." }, [h("span", { class: "jy-join__dot" }), h("span", { class: "jy-join__t", text: "routes meet at def2-TZVP" })]);
    join.style.gridColumn = "5"; join.style.gridRow = "1";
    track.appendChild(join);
    // second track
    track.appendChild(h("span", { class: "jy-rail__line jy-rail__line--hand", "aria-hidden": "true" }));
    track.appendChild(h("span", { class: "jy-rail__hand", text: "hand-set route" }));
    track.appendChild(h("span", { class: "jy-rail__up", "aria-hidden": "true" }));
    var s6 = node(stages[6], "5", "2"); track.appendChild(s6);
    railEl.appendChild(track);
    var jt = h("p", { class: "jy-join__text", id: "jy-join-text", hidden: true, text: J.strandBanner });
    railEl.appendChild(jt);
    join.addEventListener("click", function () { var o = join.getAttribute("aria-expanded") === "true"; join.setAttribute("aria-expanded", o ? "false" : "true"); jt.hidden = o; });
    railEl.addEventListener("keydown", function (e) {
      if (!e.target.classList.contains("jy-node")) return;
      var k = e.key, n = state.stage;
      if (k === "ArrowRight" || k === "ArrowDown") n = Math.min(6, n + 1); else if (k === "ArrowLeft" || k === "ArrowUp") n = Math.max(0, n - 1); else if (k === "Home") n = 0; else if (k === "End") n = 6; else return;
      e.preventDefault(); goStage(n, true); var nb = $("jy-node-" + n); if (nb) nb.focus();
    });
    function mark() {
      Array.prototype.forEach.call(railEl.querySelectorAll(".jy-node"), function (b) {
        var on = +b.getAttribute("data-stage") === state.stage;
        b.classList.toggle("is-current", on); b.setAttribute("aria-selected", on ? "true" : "false"); b.tabIndex = on ? 0 : -1;
        if (on) b.setAttribute("aria-current", "step"); else b.removeAttribute("aria-current");
        b.classList.toggle("is-done", +b.getAttribute("data-stage") < state.stage && +b.getAttribute("data-stage") < 6);
      });
    }
    buildRail.mark = mark;
  }

  // ---------- cards (static text, rendered for the current molecule)
  function listFor(s, mol) {
    var nums = s.numbers, out = [];
    if (Array.isArray(nums)) out = nums.map(function (x) { return pick(x, mol); });
    else if (nums) out = (nums[mol] || []).concat(nums.both || []);
    return out.filter(Boolean);
  }
  function blockHead(t) { return h("h3", { class: "jy-h", text: t }); }
  function buildCards() {
    cardsEl.innerHTML = "";
    var mol = state.mol;
    J.stages.forEach(function (s, idx) {
      var chip = h("span", { class: "chip" + (s.module ? " chip--m" + s.module : ""), text: s.chip });
      var head = h("div", { class: "jy-stage__head" }, [chip, h("span", { class: "jy-stage__sec", text: "(" + s.section + ")" })]);
      var card = h("article", { class: "jy-stage card", id: "stage-" + s.n, "data-stage": s.n, "data-module": s.module, "aria-labelledby": "stage-" + s.n + "-h" });
      if (s.banner) card.appendChild(h("div", { class: "callout callout--note jy-banner" }, [h("strong", { class: "callout__label", text: "Where this was computed" }), h("p", { text: J.strandBanner })]));
      card.appendChild(head);
      card.appendChild(h("h2", { class: "jy-stage__title", id: "stage-" + s.n + "-h", html: "<span class=\"jy-stage__num\">" + s.n + "</span> " + s.title }));
      var badges = h("div", { class: "cluster jy-stage__badges" }, s.badges.map(badge));
      if (s.badgeNote) badges.appendChild(h("span", { class: "jy-note", text: s.badgeNote }));
      card.appendChild(badges);
      card.appendChild(blockHead("Input")); card.appendChild(h("p", { html: pick(s.input, mol) }));
      card.appendChild(blockHead("Compute")); card.appendChild(h("p", { html: pick(s.compute, mol) }));
      card.appendChild(blockHead("Output"));
      card.appendChild(h("div", { class: "jy-out", id: "jy-out-" + s.n }));
      card.appendChild(h("div", { class: "callout callout--why" }, [h("strong", { class: "callout__label", text: "Why here" }), h("p", { html: s.why })]));
      card.appendChild(blockHead("Numbers"));
      card.appendChild(h("ul", { class: "jy-numbers" }, listFor(s, mol).map(function (t) { return h("li", { html: t }); })));
      card.appendChild(h("div", { class: "callout callout--limit" }, [h("strong", { class: "callout__label", text: "Limit" }), h("p", { html: pick(s.limit, mol) })]));
      if (s.side) card.appendChild(h("a", { class: "card card--link jy-side", href: s.side.href }, [h("strong", { text: "Side branch" }), h("span", { text: " " + s.side.text })]));
      if (s.n === 3) card.appendChild(h("p", { class: "jy-handover", text: J.handover }));
      if (s.deeper && s.deeper.length) card.appendChild(h("p", { class: "jy-deeper" }, [h("strong", { text: "Go deeper: " })].concat(s.deeper.map(function (d, i) { return h("span", null, [i ? " · " : "", h("a", { href: d[1], text: d[0] })]); }))));
      var nav = h("div", { class: "jy-stage__nav" });
      var prev = h("button", { type: "button", class: "btn btn--ghost", text: "← Previous", disabled: idx === 0 });
      var next = h("button", { type: "button", class: "btn btn--primary", text: idx === 6 ? "Finish" : "Next →" });
      prev.addEventListener("click", function () { goStage(idx - 1, true, true); });
      next.addEventListener("click", function () { if (idx === 6) { var c = $("jy-closing"); if (c) { c.hidden = false; c.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "start" }); } } else goStage(idx + 1, true, true); });
      nav.appendChild(prev); nav.appendChild(h("span", { class: "jy-stage__count", text: "Stage " + s.n + " of 6" })); nav.appendChild(next);
      card.appendChild(nav);
      cardsEl.appendChild(card);
    });
    // closing card
    var cl = J.closing, lines = cl.lines.map(function (l) {
      var M = (window.SITE && SITE.MODULES && SITE.MODULES[l[0]]) || {};
      return h("li", { class: "jy-close__line" }, [h("span", { class: "chip chip--m" + l[0], text: "Module " + l[0] + (M.name ? " · " + M.name.replace(/ module$/, "") : "") }),
        h("p", { class: "jy-close__q", text: M.question || "" }), h("p", { class: "jy-close__a", html: l[1] })]);
    });
    var closing = h("section", { class: "jy-closing card", id: "jy-closing", "aria-labelledby": "jy-closing-h" }, [
      h("h2", { id: "jy-closing-h", text: cl.title }), h("ul", { class: "jy-close__list" }, lines),
      h("div", { class: "callout callout--scope", "data-scope-note": "" }),
      h("p", { class: "cluster" }, cl.links.map(function (l) { return h("a", { class: "btn btn--ghost", href: l[1], text: l[0] }); }))
    ]);
    var scope = closing.querySelector("[data-scope-note]");
    var sl = (window.SITE && SITE.SCOPE_LINE) || "Case study of two hydrocarbons, single runs per arm. Screening is not demonstrated. No speed-up is claimed.";
    scope.appendChild(h("strong", { class: "callout__label", text: "Scope" })); scope.appendChild(h("p", { text: sl }));
    closing.hidden = true;
    cardsEl.appendChild(closing);
  }

  function applyVisibility() {
    Array.prototype.forEach.call(cardsEl.querySelectorAll(".jy-stage"), function (c) { c.hidden = !state.showAll && +c.getAttribute("data-stage") !== state.stage; });
    var cl = $("jy-closing"); if (cl) cl.hidden = !(state.showAll || state.stage === 6);
    layout.setAttribute("data-module", String(J.stages[state.stage].module));
    layout.classList.toggle("is-all", state.showAll);
    var sb = $("jy-showall"); if (sb) sb.setAttribute("aria-pressed", state.showAll ? "true" : "false");
    if (buildRail.mark) buildRail.mark();
  }

  // ---------------------------------------------------------------- viewer panel
  function buildViewerShell(stage) {
    viewerEl.innerHTML = "";
    var slot = h("div", { class: "jy-vslot" });
    var views = h("div", { class: "seg jy-views", role: "radiogroup", "aria-label": "Viewing direction" });
    ["top", "side", "tilt"].forEach(function (v) {
      var b = h("button", { type: "button", role: "radio", "aria-checked": "false", "data-view": v, text: v.charAt(0).toUpperCase() + v.slice(1) });
      views.appendChild(b);
    });
    var cap = h("p", { class: "jy-vcap", "aria-live": "off" });
    var extra = h("div", { class: "jy-vextra" });
    var pl = h("div", { class: "jy-vplayer" });
    var bad = h("span", { class: "cluster jy-badges" }, stage.badges.map(badge));
    var head = h("div", { class: "panel__head" }, [h("h2", { class: "panel__title jy-vtitle", text: "Structure viewer" }), bad]);
    var body = h("div", { class: "panel__body" }, [slot, h("div", { class: "jy-vtools" }, [views, extra]), cap, pl]);
    var foot = h("div", { class: "panel__foot" }, [h("span", { class: "jy-vfoot" }), " ", h("a", { href: "data.html#" + stage.dataAnchor, text: "Show the data" })]);
    var pnl = h("section", { class: "panel jy-vpanel" }, [head, body, foot]);
    viewerEl.appendChild(pnl);
    return { slot: slot, views: views, cap: cap, extra: extra, player: pl, badges: bad, foot: foot.firstChild };
  }
  function structOK(m) { return window.DATA_STRUCT && DATA_STRUCT[m] && DATA_STRUCT[m].symbols; }
  function mountViewer(shell, coords, view, o) {
    o = o || {};
    var m = state.mol, sym = (DATA_STRUCT[m] || {}).symbols;
    if (!sym || !coords) { shell.slot.appendChild(msg("Structure data are not available.")); return null; }
    var mv = Replay.Mol(shell.slot, { symbols: sym, coords: coords, height: o.height || viewerHeight(), view: view, colorBy: o.colorBy || null, label: o.label || "Structure of " + m });
    live.mol = mv;
    function setSeg(v) { Array.prototype.forEach.call(shell.views.children, function (b) { b.setAttribute("aria-checked", b.getAttribute("data-view") === v ? "true" : "false"); b.tabIndex = b.getAttribute("data-view") === v ? 0 : -1; }); }
    setSeg(view);
    shell.views.onclick = function (e) { var b = e.target.closest("button"); if (!b || !mv) return; mv.setView(b.getAttribute("data-view")); setSeg(b.getAttribute("data-view")); };
    shell.views.onkeydown = function (e) {
      var k = e.key; if (k !== "ArrowRight" && k !== "ArrowLeft") return; e.preventDefault();
      var arr = Array.prototype.slice.call(shell.views.children), cur = arr.findIndex(function (b) { return b.getAttribute("aria-checked") === "true"; });
      var nx = arr[(cur + (k === "ArrowRight" ? 1 : -1) + arr.length) % arr.length]; nx.click(); nx.focus();
    };
    return mv;
  }
  function viewerHeight() { return window.innerWidth < 1000 ? Math.max(120, Math.min(220, Math.round(window.innerHeight * 0.2))) : 380; }
  function toggleBtn(label, onChange, pressed) {
    var b = h("button", { type: "button", class: "btn btn--ghost jy-toggle", "aria-pressed": pressed ? "true" : "false", text: label });
    b.addEventListener("click", function () { var on = b.getAttribute("aria-pressed") !== "true"; b.setAttribute("aria-pressed", on ? "true" : "false"); onChange(on); });
    return b;
  }

  // ---------------------------------------------------------------- stage content
  function runsOf(mol) { return window["DATA_TRAJ_" + mol]; }
  function stage0(shell, out) {
    var m = state.mol, S = DATA_STRUCT[m], mv = null;
    shell.cap.textContent = "Start R1: the file that enters the journey. Colour shows the height above or below the mean ring plane (blue below, red above).";
    shell.foot.textContent = "Data: start coordinates (xyz).";
    if (!structOK(m)) { out.appendChild(msg("Structure data are not available.")); return; }
    mv = mountViewer(shell, S.R1.coords, "side", { colorBy: "height" });
    var colorOn = true;
    shell.extra.appendChild(toggleBtn("Colour by height", function (on) { colorOn = on; mv.setColorBy(on ? "height" : null); }, true));
    shell.extra.appendChild(toggleBtn("Compare with the relaxed structure", function (on) { if (on) mv.overlay(S.endpoint_svp.coords, { opacity: 0.35, id: "ref" }); else mv.clearOverlay("ref"); }, false));
    var P = S.R1.coords, lines = [String(S.symbols.length), "R1, start structure (Skala-1.1 pilot input)"];
    for (var i = 0; i < 4; i++) lines.push(S.symbols[i].padEnd(2) + " " + P[i].map(function (v) { var t = (+v).toFixed(6); return (v < 0 ? "" : " ") + t; }).join("  "));
    lines.push("… " + S.symbols.length + " atoms");
    out.appendChild(h("pre", { class: "code jy-xyz", tabindex: "0", "aria-label": "First lines of the start .xyz file", text: lines.join("\n") }));
  }

  function stage1(shell, out) {
    var m = state.mol, T = runsOf(m), run = T && T.runs && T.runs.GS;
    shell.cap.textContent = "The search does not move the Skala-1.1 start.";
    shell.foot.textContent = "Data: GFN2-xTB basin note and the logged choice of basin (run GS).";
    if (!run) { out.appendChild(msg("Run data are not available.")); return; }
    mountViewer(shell, T.start.coords, "side", { colorBy: "height" });
    var b = run.basin || { seeds: 13, basins_found: 1 };
    var tbl = h("table", { class: "table table--compact" }, [
      h("thead", null, [h("tr", null, ["Basin", "Found by", "Shape", "Chosen"].map(function (t) { return h("th", { scope: "col", text: t }); }))]),
      h("tbody", null, [h("tr", null, [h("td", { class: "num", text: "0" }), h("td", { text: b.seeds + " of " + b.seeds + " seeds" }), h("td", { text: "planar" }), h("td", { text: "yes" })])])]);
    var dec = (run.decisions || []).filter(function (d) { return d.event === "basin_choice"; })[0];
    var tk = h("div", { class: "jy-ticker" });
    var kids = [h("div", { class: "table-wrap" }, [tbl])];
    var pnl = panel("Candidate basins and the logged choice", ["logged"], kids.concat([tk]), "Data: run GS, basin note and decision at step 0.", "traj");
    out.appendChild(pnl);
    if (dec) {
      var it = decisionToItem(dec); it.title = "Step 0 · " + eventLabel(dec); it.step = 0;
      live.ticker = Replay.Ticker(tk, { items: [it], emptyText: "No decision logged." });
      if (live.ticker) { live.ticker.setStep(0); live.ticker.showAll(true); }
    } else tk.appendChild(msg("The logged decision is not available."));
  }

  function stage2(shell, out) {
    var m = state.mol, T = runsOf(m);
    if (!T || !T.runs) { out.appendChild(msg("Run data are not available.")); return; }
    var G = window.DATA_GRID && DATA_GRID.runs && DATA_GRID.runs[m + "_R1_A3p"];
    var keys = ["GS", "PS"].filter(function (k) { return T.runs[k]; });
    if (m === "C11H8" && G) keys.push("GRID");
    if (keys.indexOf(state.run) < 0) state.run = "GS";
    var names = { GS: "Supervised run", PS: "Plain run, same settings", GRID: "Handed-over run (charts only)" };
    var seg = h("div", { class: "seg jy-runsel", role: "radiogroup", "aria-label": "Run to replay" });
    keys.forEach(function (k) {
      var b = h("button", { type: "button", role: "radio", "aria-checked": k === state.run ? "true" : "false", tabindex: k === state.run ? "0" : "-1", "data-run": k, text: names[k] });
      seg.appendChild(b);
    });
    seg.addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; state.run = b.getAttribute("data-run"); renderStage(true); });
    seg.addEventListener("keydown", function (e) {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return; e.preventDefault();
      var i = keys.indexOf(state.run), n = keys[(i + (e.key === "ArrowRight" ? 1 : -1) + keys.length) % keys.length];
      state.run = n; renderStage(true); var nb = cardsEl.querySelector('.jy-runsel [data-run="' + n + '"]'); if (nb) nb.focus();
    });
    out.appendChild(seg);

    var isGrid = state.run === "GRID";
    var run = isGrid ? G : T.runs[state.run];
    var other = isGrid ? null : T.runs[state.run === "GS" ? "PS" : "GS"];
    var ref = T.runs.GS;
    var n = run.n_steps, X = range1(n);
    var hasFrames = !isGrid && run.frames && run.frames.length;
    shell.foot.textContent = isGrid ? "Data: main-grid run (charts only)." : "Data: step-cap sweep, run " + state.run + ", start cap 0.005 Å.";

    // viewer
    var frames0 = null, mv = null, pl = null;
    if (hasFrames) {
      shell.cap.textContent = isGrid ? "" : "Replay of logged coordinates: frame 0 is the start structure, frame k the geometry after step k.";
      mv = mountViewer(shell, T.start.coords, "tilt", { colorBy: "height" });
      shell.extra.appendChild(toggleBtn("Colour by height", function (on) { mv.setColorBy(on ? "height" : null); }, true));
    } else {
      shell.cap.textContent = isGrid ? "The structure shown is the start; the charts and the decision list are drawn from the logged step values of this run." : "";
      mv = mountViewer(shell, T.start.coords, "tilt", { colorBy: "height" });
      if (isGrid && mv) mv.setNote("Per-step coordinates were not stored for this run.");
    }
    if (isGrid && window.DATA_GRID && DATA_GRID.caveat) out.appendChild(h("div", { class: "callout callout--note" }, [h("strong", { class: "callout__label", text: "Main-grid caveat" }), h("p", { text: DATA_GRID.caveat })]));

    // series
    var selS = state.run === "PS" ? "plain" : "sup";
    function ser(run_, id, label, plain, thin, field, tr) {
      var y = (run_.steps ? run_.steps[field] : run_[field]) || [];
      if (tr) y = tr(y);
      return { id: id, label: label, x: range1(y.length), y: y, color: plain ? "--c-plain" : "--c-sup", dash: plain ? "dashed" : "solid", width: thin ? 1.4 : 2.4, step: field === "cap_A", marker: plain ? "square" : null };
    }
    var selPlain = state.run === "PS", selLabel = isGrid ? "Handed-over run" : (selPlain ? "Plain run" : "Supervised run");
    function seriesFor(fieldRun, field, tr) {
      var arr = [];
      if (other) arr.push(ser(other, "other", other === T.runs.PS ? "Plain run" : "Supervised run", other === T.runs.PS, true, field, tr));
      arr.push(ser(run, "sel", selLabel, selPlain, false, field, tr));
      return arr;
    }
    var xmax = Math.max(n, other ? other.n_steps : 0);
    var fm = seriesFor(run, "fmax_eVA");
    // chart A
    var holdA = h("div"), holdB = h("div"), holdC = h("div");
    var target = (window.DATA_META && DATA_META.force_target_eVA) || 0.038;
    var vl = run.first_below_target ? [{ x: run.first_below_target, label: "target reached, step " + run.first_below_target }] : [];
    var bands = (run.probations || []).map(function (p) { return { x0: p.start_step, x1: p.end_step, label: "probation, steps " + p.start_step + " to " + p.end_step + (p.outcome === "rolled_back" ? " (rolled back)" : " (kept)"), kind: p.outcome === "rolled_back" ? "warn" : "probation" }; });
    var pts = (run.decisions || []).filter(function (d) { return d.step >= 1 && d.event === "trigger"; }).map(function (d) { return { x: d.step, series: "sel", label: "Step " + d.step + ": " + eventLabel(d) + (paramsLabel(d.params) ? ", " + paramsLabel(d.params) : ""), kind: "decision" }; });
    var fmin = 0.01;
    var chA = Replay.Chart(holdA, { height: 230, title: "Largest force", hideTitle: true, desc: "Largest force on any atom at each optimizer step, on a logarithmic axis, with the force target of 0.038 eV per angstrom.",
      x: { label: "optimizer step", min: 1, max: xmax, short: "Step" }, y: { label: "f_max (eV Å⁻¹)", log: true, min: fmin, max: 5 },
      series: fm, hlines: [{ y: target, label: "force target " + target + " eV Å⁻¹", dash: "dashed" }], vlines: vl, bands: bands, points: pts, cursor: true, table: true, clipY: true });
    var capMax = 0.06;
    var chB = Replay.Chart(holdB, { height: 190, title: "Step cap", hideTitle: true, desc: "The largest distance any atom may move per step, in angstrom, as logged at each step.",
      x: { label: "optimizer step", min: 1, max: xmax, short: "Step" }, y: { label: "step cap (Å)", min: 0, max: capMax },
      series: seriesFor(run, "cap_A"), hlines: [{ y: 0.05, label: "upper bound of the guard, 0.05 Å", dash: "dashed" }], vlines: [], bands: bands, cursor: true, table: true, clipY: true });
    var finalE = T.runs.GS.final_energy_eV;
    var chC = Replay.Chart(holdC, { height: 190, title: "Energy still to be released", hideTitle: true, desc: "Energy above the final energy of the supervised run, in electronvolts, on a logarithmic axis, clipped below 0.0001 eV.",
      x: { label: "optimizer step", min: 1, max: xmax, short: "Step" }, y: { label: "energy above final (eV)", log: true, min: 1e-4, max: 100 },
      series: seriesFor(run, "energy_eV", function (y) { return y.map(function (e) { return Math.max(1e-4, e - finalE); }); }), cursor: true, table: true, clipY: true });
    live.charts = [chA, chB, chC];
    out.appendChild(panel("Largest force", ["logged"], [holdA, unitNote()], "Data: logged step values, f_max converted to eV Å⁻¹.", "traj"));
    out.appendChild(panel("Step cap", ["logged"], [holdB], "Data: logged step cap per step.", "traj"));
    out.appendChild(panel("Energy still to be released", ["logged"], [holdC], "Data: logged energies.", "traj"));

    // ticker
    var tk = h("div", { class: "jy-ticker" });
    var items = (run.decisions || []).map(decisionToItem);
    var tnote = h("p", { class: "jy-tnote", text: "Decisions of the supervision layer, from the log. Click a decision to jump to its step." });
    out.appendChild(panel("Decisions at the guard", ["logged"], [tnote, tk], "Data: logged decisions, validator verdicts and probation outcomes.", "traj"));
    var tkr = Replay.Ticker(tk, { items: items, emptyText: "A plain run has no decisions: L-BFGS runs with fixed settings.", onSelect: function (i, it) { if (pl) { pl.pause(); pl.seek(it.step); } } });
    live.ticker = tkr;

    // player (frame k = after step k; 0 = start)
    var total = n + 1;
    function onFrame(i) {
      if (hasFrames && mv) { mv.setCoords(i === 0 ? T.start.coords : (run.frames[i - 1] ? unflatten(run.frames[i - 1]) : null) || T.start.coords); }
      live.charts.forEach(function (c) { if (c) c.setCursor(i === 0 ? null : i); });
      if (tkr) tkr.setStep(i);
    }
    var markKey = marksFor(run);
    pl = Replay.Player(shell.player, {
      n: total, fps: 10, loop: false, start: 0, ariaLabel: "Replay controls for " + selLabel.toLowerCase(),
      label: function (i) {
        var cap = run.steps && run.steps.cap_A ? run.steps.cap_A[Math.max(0, i - 1)] : null;
        var f = run.steps && run.steps.fmax_eVA ? run.steps.fmax_eVA[Math.max(0, i - 1)] : null;
        if (i === 0) return "Start structure, before step 1 of " + n;
        return "Step " + i + " of " + n + (f != null ? " · fₘₐₓ " + (+f).toPrecision(3).replace("-", MINUS) + " eV Å⁻¹" : "") + (cap != null ? " · cap " + fmtCap(cap) + " Å" : "");
      },
      marks: markKey, onFrame: onFrame
    });
    live.player = pl;
    var onCur = function (x) { if (pl) { pl.pause(); pl.seek(Math.round(x)); } };
    live.charts.forEach(function (c) { if (c) c.onCursor(onCur); });
    shell.player.appendChild(h("p", { class: "jy-legend-marks" }, [h("span", { class: "rp-key" }, [h("i"), " decision"]), " ", h("span", { class: "rp-key" }, [h("i", { style: "background:var(--accent)" }), " probation starts"]), " ", h("span", { class: "rp-key" }, [h("i", { style: "background:var(--ok);height:12px" }), " force target reached"])]));
    if (reduced()) pl.seek(total - 1); else onFrame(0);
    if (!hasFrames && !isGrid) shell.player.appendChild(msg("No coordinates for this run."));
  }

  function stage3(shell, out) {
    var m = state.mol, T = runsOf(m), run = T && T.runs && T.runs.GS;
    shell.foot.textContent = "Data: last logged frame of run GS and the logged final check.";
    if (!run || !run.frames) { out.appendChild(msg("Run data are not available.")); return; }
    var last = unflatten(run.frames[run.frames.length - 1]);
    var mv = mountViewer(shell, last, "top", { colorBy: "height", label: "End point of the supervised run of " + m });
    shell.cap.textContent = "The last frame of the supervised run, which has reached the force target.";
    var cnt = 0;
    var tg = toggleBtn("Overlay the end points of all sweep runs that reached the target", function (on) {
      if (!mv) return;
      if (on) { cnt = 0; Object.keys(T.runs).forEach(function (k) { var r = T.runs[k]; if (r.converged && !r.destroyed && r.frames && r.frames.length) { cnt++; mv.overlay(unflatten(r.frames[r.frames.length - 1]), { opacity: 0.35, id: "o" + k }); } }); shell.cap.textContent = "Overlaid: the end points of " + cnt + " sweep runs that reached the force target (faint)."; }
      else { mv.clearOverlay(); shell.cap.textContent = "The last frame of the supervised run, which has reached the force target."; }
    }, false);
    shell.extra.appendChild(tg);
    var fc = run.final_check || {};
    var probe = h("p", { class: "cluster" }, [h("span", { class: "chip chip--ok", text: "✓ Curvature probe: no negative curvature" }), h("span", { class: "chip", text: run.n_steps + " steps, last frame shown" })]);
    if (fc.curvature_any_negative === true) probe.firstChild.className = "chip chip--warn", probe.firstChild.textContent = "Curvature probe: negative curvature found";
    var tk = h("div", { class: "jy-ticker" });
    out.appendChild(panel("Final check of the end point", ["logged"], [probe, tk], "Data: run GS, final check and curvature probe.", "traj"));
    var it = { step: run.n_steps, title: "Step " + run.n_steps + " · Final check", rationale: fc.rationale || (run.decisions || []).filter(function (d) { return d.event === "final_check"; }).map(function (d) { return d.rationale; })[0], evidence: fc.evidence || [], role: "check model", quoteHead: "Reason written by the model (logged)" };
    if (it.rationale) { live.ticker = Replay.Ticker(tk, { items: [it] }); if (live.ticker) { live.ticker.setStep(it.step); live.ticker.showAll(true); } }
    else tk.appendChild(msg("The logged final check is not available."));
  }

  function stage4(shell, out) {
    var m = state.mol, S = DATA_STRUCT[m], Hs = window.DATA_HESS && DATA_HESS[m];
    shell.foot.textContent = "Data: structure handed over by module 1; Hessian modes (tables).";
    if (!structOK(m)) { out.appendChild(msg("Structure data are not available.")); return; }
    var P = S.endpoint_svp.coords, mv = mountViewer(shell, P, "top", { colorBy: null });
    shell.cap.textContent = "Shown: the def2-SVP end point handed over by module 1";
    // motion
    var motionBadge = badge("illustrative"); motionBadge.hidden = true; shell.badges.appendChild(motionBadge);
    var seg = h("div", { class: "seg jy-motion", role: "radiogroup", "aria-label": "Illustrative motion" });
    var kinds = [["none", "Still"], ["wag", J.modeLabels.wag], ["cc", J.modeLabels.cc], ["ch", J.modeLabels.ch]];
    kinds.forEach(function (k) { seg.appendChild(h("button", { type: "button", role: "radio", "aria-checked": k[0] === "none" ? "true" : "false", tabindex: k[0] === "none" ? "0" : "-1", "data-k": k[0], text: k[1] })); });
    shell.extra.appendChild(h("p", { class: "jy-motionlabel", text: "Illustrative motion of a mode kind:" }));
    shell.extra.appendChild(seg);
    var pl = null;
    function setMotion(k) {
      Array.prototype.forEach.call(seg.children, function (b) { var on = b.getAttribute("data-k") === k; b.setAttribute("aria-checked", on ? "true" : "false"); b.tabIndex = on ? 0 : -1; });
      if (pl) { pl.destroy(); pl = null; live.player = null; }
      shell.player.innerHTML = "";
      motionBadge.hidden = k === "none";
      if (k === "none") { mv.setCoords(P); shell.cap.textContent = "Shown: the def2-SVP end point handed over by module 1"; return; }
      shell.cap.textContent = "Illustrative replay: the motion is drawn by a rule for this kind of mode, with exaggerated size. It is not computed from the eigenvectors of the Hessian.";
      var fr = motionFrames(S.symbols, P, k, 24, 0.12);
      pl = Replay.Player(shell.player, { n: fr.length, fps: 12, loop: true, ariaLabel: "Illustrative motion controls", label: function (i) { return J.modeLabels[k] + ", illustrative, frame " + (i + 1) + " of " + fr.length; }, onFrame: function (i) { mv.setCoords(fr[i]); } });
      live.player = pl;
      if (reduced()) pl.seek(6);
    }
    seg.addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) setMotion(b.getAttribute("data-k")); });
    seg.addEventListener("keydown", function (e) {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return; e.preventDefault();
      var arr = Array.prototype.slice.call(seg.children), i = arr.findIndex(function (b) { return b.getAttribute("aria-checked") === "true"; });
      var nb = arr[(i + (e.key === "ArrowRight" ? 1 : -1) + arr.length) % arr.length]; setMotion(nb.getAttribute("data-k")); nb.focus();
    });

    if (!Hs || !Hs.modes) { out.appendChild(msg("Hessian data are not available.")); return; }
    var nm = Hs.n_modes || Hs.modes.length;
    out.appendChild(h("p", { class: "cluster" }, [h("span", { class: "chip chip--ok", text: "✓ 0 imaginary modes of " + nm })]));
    // IR chart
    var modes = Hs.modes, maxIr = 0; modes.forEach(function (x) { if (x.ir > maxIr) maxIr = x.ir; });
    var env = envelope(modes, 20, 0, 3400, 5);
    var st = sticks(modes.map(function (x) { return { x: x.freq, h: x.ir }; }));
    var top = maxIr * 1.18;
    var strongest = modes.reduce(function (a, b) { return b.ir > a.ir ? b : a; }, modes[0]);
    var cc = modes.filter(function (x) { return x.freq > 1950 && x.freq < 2350; });
    var pts = [{ x: strongest.freq, y: strongest.ir, label: "out-of-plane C–H wag, " + strongest.freq.toFixed(1), text: true }];
    cc.forEach(function (x) { pts.push({ x: x.freq, y: Math.max(x.ir, top * 0.03), label: "C≡C stretch, " + x.freq.toFixed(1), marker: true }); });
    if (cc.length) pts.push({ x: cc[0].freq, y: top * 0.2, label: "C≡C stretch: " + cc.map(function (x) { return x.freq.toFixed(1); }).join(" and ") + " cm⁻¹", text: true, marker: false });
    var hold = h("div");
    var chart = Replay.Chart(hold, { height: 250, title: "Harmonic IR spectrum", hideTitle: true, desc: "Stick spectrum of harmonic frequencies with their IR intensities and a 20 reciprocal-centimetre Gaussian envelope, from 0 to 3400 reciprocal centimetres.",
      x: { label: "wavenumber (cm⁻¹)", min: 0, max: 3400, short: "cm⁻¹" }, y: { label: "IR intensity (km mol⁻¹)", min: 0, max: top },
      series: [{ id: "env", label: "Envelope, 20 cm⁻¹ FWHM", x: env.x, y: env.y, color: "--c-calc", width: 1.6, dash: "dashed", end_label: false, table: false, readout: false, area: true },
        { id: "st", label: "Modes", x: st.x, y: st.y, color: "--m2", width: 1.8, end_label: false, table: false, readout: false }],
      bands: [{ x0: 2000, x1: 2300, label: "C≡C region", kind: "probation", show_label: true }, { x0: 3000, x1: 3300, label: "C–H stretch region", kind: "probation", show_label: true }],
      points: pts, cursor: false, table: true,
      tableData: { head: ["Frequency (cm⁻¹)", "IR intensity (km mol⁻¹)"], rows: modes.map(function (x) { return [x.freq.toFixed(1), x.ir.toFixed(1)]; }) } });
    live.charts = [chart];
    out.appendChild(panel("Harmonic IR spectrum", ["tables"], [hold, h("p", { class: "jy-unitnote", text: "Sticks: one per vibrational mode. Line: Gaussian envelope of 20 cm⁻¹ full width at half maximum. Harmonic, unscaled frequencies." })], "Data: Skala-1.1/def2-TZVP Hessian modes.", "hessian"));
    var ni = Hs.n_imag || {};
    function nz(v) { return v == null ? "0" : String(v); }
    out.appendChild(h("div", { class: "table-wrap" }, [h("table", { class: "table table--compact" }, [
      h("caption", { text: "Imaginary modes in three setups" }),
      h("thead", null, [h("tr", null, [h("th", { scope: "col", text: "Setup" }), h("th", { scope: "col", class: "num", text: "Imaginary modes" })])]),
      h("tbody", null, [["Skala-1.1/def2-TZVP", ni.skala_tzvp], ["B3LYP-D3(BJ)/def2-TZVP", ni.b3lyp_tzvp], ["Skala-1.1/6-31+G(d,p)", ni.skala_pople]].map(function (r) { return h("tr", null, [h("td", { text: r[0] }), h("td", { class: "num", text: nz(r[1]) })]); }))])]));
  }

  // mirrored stick spectrum on a reversed axis, drawn with Replay.Chart (x.min > x.max)
  function nmrChart(hold, nuc, m, N) {
    var sig = ((N.signals || {})[m] || {})[nuc] || [];
    var ax = nuc === "C13" ? (N.axis && N.axis.C13) : (N.axis && N.axis.H1 && N.axis.H1[m]);
    if (!sig.length || !ax) { hold.appendChild(msg("NMR data are not available.")); return null; }
    var off = (N.off_scale || {})[m];
    var lo = Math.min(ax[0], ax[1]), hi = Math.max(ax[0], ax[1]);
    var inr = function (v) { return v >= lo && v <= hi; };
    var exp = sticks(sig.filter(function (s) { return inr(s.exp); }).map(function (s) { return { x: s.exp, h: 1 }; }));
    var calc = sticks(sig.filter(function (s) { return inr(s.P1); }).map(function (s) { return { x: s.P1, h: -1 }; }));
    var sym = nuc === "C13" ? "¹³C" : "¹H";
    return Replay.Chart(hold, { height: 200, hideTitle: true, title: sym + " shifts: measured (up) and computed on the Skala-1.1 geometry, probe P1 (down)",
      desc: "Mirrored stick spectra of measured and computed shifts, with the chemical shift axis running from high to low ppm.",
      x: { label: "δ (ppm)", min: hi, max: lo, short: "δ" }, y: { min: -1.35, max: 1.35, hide: true },
      series: [{ id: "exp", label: "Measured", x: exp.x, y: exp.y, color: "--c-exp", width: 2.4, end_label: false, readout: false, table: false },
        { id: "calc", label: "Computed (P1)", x: calc.x, y: calc.y, color: "--c-calc", width: 2.4, dash: "dashed", end_label: false, readout: false, table: false }],
      hlines: [{ y: 0, label: "", dash: "solid" }],
      points: [{ x: hi - (hi - lo) * 0.02, y: 1.18, label: "Measured", text: true, marker: false, series: "exp" }, { x: hi - (hi - lo) * 0.02, y: -1.2, label: "Computed (P1)", text: true, marker: false, series: "calc" }],
      cursor: false, table: true,
      tableData: { head: ["Signal", "Measured (ppm)", "P1 (ppm)", "P2 (ppm)"], rows: sig.map(function (s) { return [s.label, (+s.exp).toFixed(2), (+s.P1).toFixed(2), s.P2 != null ? (+s.P2).toFixed(2) : "n/a"]; }) } });
  }
  function maeBars(rows, limit, unit, nucLabel) {
    // rows: [{label, v}] horizontal bars with a limit tick; P1 solid, P2 hatched
    var NS = "http://www.w3.org/2000/svg", w = 340, rh = 26, ml = 86, mr = 62, mt = 20, H = mt + rows.length * rh + 24, xmax = limit * 1.12;
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 " + w + " " + H); svg.setAttribute("width", "100%"); svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", nucLabel + " mean absolute error against a limit of " + limit + " " + unit + ": " + rows.map(function (r) { return r.label + " " + r.v; }).join(", "));
    svg.style.maxWidth = "420px"; svg.style.display = "block";
    function e(tag, a, parent) { var n = document.createElementNS(NS, tag); for (var k in a) n.setAttribute(k, a[k]); (parent || svg).appendChild(n); return n; }
    var id = "jy-hatch-" + Math.floor(Math.random() * 1e6);
    var defs = e("defs", {}); var pat = e("pattern", { id: id, width: 6, height: 6, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" }, defs);
    e("rect", { width: 6, height: 6, fill: "var(--surface)" }, pat); e("rect", { width: 2.6, height: 6, fill: "var(--m3)" }, pat);
    var sx = function (v) { return ml + v / xmax * (w - ml - mr); };
    rows.forEach(function (r, i) {
      var y = mt + i * rh;
      var t = e("text", { x: ml - 8, y: y + 15, "text-anchor": "end", fill: "var(--ink)", "font-size": 12 }); t.textContent = r.label;
      e("rect", { x: ml, y: y + 4, width: Math.max(1, sx(r.v) - ml), height: 16, fill: r.hatch ? "url(#" + id + ")" : "var(--m3)", stroke: "var(--m3)", "stroke-width": 1.5 });
      var v = e("text", { x: w - mr + 10, y: y + 16, fill: "var(--ink)", "font-size": 12.5, "font-weight": 600 }); v.textContent = r.v.toFixed(unit === "ppm" && limit < 1 ? 3 : 2);
    });
    e("line", { x1: sx(limit), x2: sx(limit), y1: mt - 6, y2: H - 18, stroke: "var(--ink)", "stroke-width": 1.4, "stroke-dasharray": "5 3" });
    var lt = e("text", { x: sx(limit), y: H - 4, "text-anchor": "middle", fill: "var(--ink)", "font-size": 11 }); lt.textContent = "limit " + limit + " ppm";
    e("line", { x1: ml, x2: ml, y1: mt - 6, y2: H - 18, stroke: "var(--muted)" });
    var ttl = e("text", { x: ml, y: 11, fill: "var(--muted)", "font-size": 11 }); ttl.textContent = nucLabel + " mean absolute error (ppm)";
    return svg;
  }
  function stage5(shell, out) {
    var m = state.mol, S = DATA_STRUCT[m], N = window.DATA_NMR;
    shell.foot.textContent = "Data: Skala-1.1/6-31+G(d,p) geometry; shifts from tables.";
    if (!structOK(m)) { out.appendChild(msg("Structure data are not available.")); return; }
    mountViewer(shell, S.pople.coords, "top", {});
    shell.cap.textContent = "Shown: the geometry on which the shieldings were computed (Skala-1.1/6-31+G(d,p)).";
    if (!N) { out.appendChild(msg("NMR data are not available.")); return; }
    var hC = h("div"), hH = h("div");
    var cC = nmrChart(hC, "C13", m, N), cH = nmrChart(hH, "H1", m, N);
    live.charts = [cC, cH];
    var offs = N.off_scale && N.off_scale[m];
    var kidsC = [hC]; if (offs) kidsC.push(h("p", { class: "jy-unitnote", text: "The " + offs.label + " signal at " + (+offs.exp).toFixed(1) + " ppm (computed " + (+offs.P1).toFixed(1) + " ppm) is off scale." }));
    out.appendChild(panel("¹³C shifts", ["tables"], kidsC, "Data: measured and computed shifts (tables).", "nmr"));
    out.appendChild(panel("¹H shifts", ["tables"], [hH], "Data: measured and computed shifts (tables).", "nmr"));
    var T = N.table1 || [], p1 = matchRow(T, m, "P1"), p2 = matchRow(T, m, "P2");
    var fb = { C10H6: { c: [1.95, 1.77], h: [0.169, 0.108] }, C11H8: { c: [1.30, 1.37], h: [0.120, 0.082] } }[m];
    var c1 = p1 && p1.c13_mae != null ? +p1.c13_mae : fb.c[0], c2 = p2 && p2.c13_mae != null ? +p2.c13_mae : fb.c[1];
    var h1 = p1 && p1.h1_mae != null ? +p1.h1_mae : fb.h[0], h2 = p2 && p2.h1_mae != null ? +p2.h1_mae : fb.h[1];
    var lc = (N.limits && N.limits.C13_mae) || 2.0, lh = (N.limits && N.limits.H1_mae) || 0.2;
    var bars = h("div", { class: "jy-mae" }, [
      maeBars([{ label: "B3LYP (P1)", v: c1 }, { label: "PBE0 (P2)", v: c2, hatch: true }], lc, "ppm", "¹³C"),
      maeBars([{ label: "B3LYP (P1)", v: h1 }, { label: "PBE0 (P2)", v: h2, hatch: true }], lh, "ppm", "¹H")]);
    out.appendChild(panel("Mean absolute error against the recommended limits", ["tables"], [bars, h("p", { class: "jy-unitnote", text: "Bars: P1 solid, P2 hatched. The dashed line marks the limit of Parmar et al." })], "Data: Table 1 of the manuscript, rebuilt from tabulated values.", "nmr"));
  }

  function stage6(shell, out) {
    var m = state.mol, S = DATA_STRUCT[m], PR = window.DATA_PROPS;
    shell.foot.textContent = "Data: structure of the agent route (orientation only); properties from tables.";
    if (!structOK(m)) { out.appendChild(msg("Structure data are not available.")); return; }
    mountViewer(shell, S.endpoint_svp.coords, "top", {});
    shell.cap.textContent = "For orientation only: the structure of the agent route. The properties were computed on the hand-set minimum, which lies " + (m === "C10H6" ? "0.004" : "0.007") + " Å from it after re-optimization at def2-TZVP.";
    if (!PR || !PR.relaxation || !PR.relaxation[m]) { out.appendChild(msg("Property data are not available.")); return; }
    var R = PR.relaxation[m], rows = R.rows.filter(function (r) { return !r.ref && (r.method === "Skala-1.1" || r.method === "ωB97M-V"); });
    // diverging bars, both bars neutral, pattern differs
    var NS = "http://www.w3.org/2000/svg", w = 420, rh = 38, mt = 26, H = mt + rows.length * rh + 30;
    var lim = Math.max.apply(null, rows.map(function (r) { return Math.abs(r.dev); })) * 1.4 || 1, cx = w / 2 + 20, half = (w - 150) / 2;
    var svg = document.createElementNS(NS, "svg"); svg.setAttribute("viewBox", "0 0 " + w + " " + H); svg.setAttribute("width", "100%"); svg.style.maxWidth = "520px"; svg.style.display = "block"; svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "Relaxation energy, deviation from CCSD(T) in kcal per mole: " + rows.map(function (r) { return r.method + " " + (r.dev > 0 ? "+" : "") + r.dev; }).join(", "));
    function e(tag, a) { var n = document.createElementNS(NS, tag); for (var k in a) n.setAttribute(k, a[k]); svg.appendChild(n); return n; }
    var pid = "jy-pat-" + Math.floor(Math.random() * 1e6), defs = e("defs", {}), pat = document.createElementNS(NS, "pattern");
    pat.setAttribute("id", pid); pat.setAttribute("width", 6); pat.setAttribute("height", 6); pat.setAttribute("patternUnits", "userSpaceOnUse"); pat.setAttribute("patternTransform", "rotate(45)");
    var r1 = document.createElementNS(NS, "rect"); r1.setAttribute("width", 6); r1.setAttribute("height", 6); r1.setAttribute("fill", "var(--surface)");
    var r2 = document.createElementNS(NS, "rect"); r2.setAttribute("width", 2.6); r2.setAttribute("height", 6); r2.setAttribute("fill", "var(--muted)");
    pat.appendChild(r1); pat.appendChild(r2); defs.appendChild(pat);
    var tt = e("text", { x: 4, y: 14, fill: "var(--muted)", "font-size": 11 }); tt.textContent = "Deviation from CCSD(T), kcal mol⁻¹";
    rows.forEach(function (r, i) {
      var y = mt + i * rh, x = cx + r.dev / lim * half;
      var lab = e("text", { x: 4, y: y + 22, fill: "var(--ink)", "font-size": 12.5 }); lab.textContent = r.method;
      e("rect", { x: Math.min(cx, x), y: y + 6, width: Math.max(1, Math.abs(x - cx)), height: 22, fill: i ? "url(#" + pid + ")" : "var(--muted)", stroke: "var(--muted)", "stroke-width": 1.5 });
      var vt = e("text", { x: r.dev >= 0 ? x + 6 : x - 6, y: y + 22, "text-anchor": r.dev >= 0 ? "start" : "end", fill: "var(--ink)", "font-size": 12.5, "font-weight": 600 });
      vt.textContent = (r.dev >= 0 ? "+" : MINUS) + Math.abs(r.dev).toFixed(2);
    });
    e("line", { x1: cx, x2: cx, y1: mt - 4, y2: H - 22, stroke: "var(--ink)", "stroke-width": 1.4 });
    var z = e("text", { x: cx, y: H - 6, "text-anchor": "middle", fill: "var(--muted)", "font-size": 11 }); z.textContent = "CCSD(T): " + R.rows[0].dE.toFixed(2) + " kcal mol⁻¹ (reference, 0)";
    out.appendChild(panel("Relaxation energy: deviation from CCSD(T)", ["tables"], [svg, h("p", { class: "jy-unitnote", text: "Both bars share one neutral colour and are not ordered by size. Skala-1.1 solid, ωB97M-V hatched. A case study of one geometry pair." })], "Data: relaxation energies of the manuscript (tables).", "props"));
    out.appendChild(h("div", { class: "stat-row" }, [h("div", { class: "stat" }, [h("span", { class: "stat__num", text: "R² > 0.999" }), h("span", { class: "stat__label", html: "Meta-Löwdin charges: Skala-1.1 against ωB97M-V, " + formula(m) })])]));
    if (window.Site && Site.fig) { try { out.appendChild(Site.fig("fig18", { size: "m" })); } catch (e2) {} }
  }

  var STAGE_FN = [stage0, stage1, stage2, stage3, stage4, stage5, stage6];

  // ---------------------------------------------------------------- render / navigation
  function renderStage(keepScroll) {
    teardown();
    var s = J.stages[state.stage];
    Array.prototype.forEach.call(cardsEl.querySelectorAll(".jy-out"), function (o) { if (o.id !== "jy-out-" + state.stage) { /* keep static of others empty */ o.innerHTML = ""; } });
    var out = $("jy-out-" + state.stage); out.innerHTML = "";
    var shell = buildViewerShell(s);
    try {
      if (!window.Replay || !Replay.Mol) { out.appendChild(msg("The replay components did not load.")); }
      else if (!window["DATA_TRAJ_" + state.mol] && state.stage > 0 && state.stage < 4) out.appendChild(msg("Run data are not available."));
      else STAGE_FN[state.stage](shell, out);
    } catch (e) { out.appendChild(msg("This stage could not be drawn (" + e.message + ").")); if (window.console) console.error(e); }
    applyVisibility();
    var t = $("jy-live"); if (t) t.textContent = "Stage " + state.stage + ": " + s.title + ", " + state.mol.replace("C10H6", "C10H6");
  }
  function goStage(n, push, scroll) {
    n = Math.max(0, Math.min(6, n | 0));
    state.stage = n; writeHash(); renderStage();
    if (scroll) { var top = cardsEl.getBoundingClientRect().top + window.scrollY - (offsetTopPx() + 8); if (window.innerWidth < 1000) top = layout.getBoundingClientRect().top + window.scrollY - offsetTopPx(); window.scrollTo({ top: Math.max(0, top), behavior: reduced() ? "auto" : "smooth" }); }
  }
  function offsetTopPx() { var hd = document.querySelector(".site-header"), r = $("jy-rail"); return (hd ? hd.offsetHeight : 56) + (r && window.innerWidth >= 1000 ? r.offsetHeight : 0); }
  function setMol(m, noRender) {
    if (m !== "C10H6" && m !== "C11H8") m = "C10H6";
    state.mol = m; state.run = "GS";
    Array.prototype.forEach.call($("jy-mol").querySelectorAll("button"), function (b) { var on = b.getAttribute("data-mol") === m; b.setAttribute("aria-checked", on ? "true" : "false"); b.tabIndex = on ? 0 : -1; });
    if (noRender) return;
    writeHash(); buildCards(); applyVisibility(); renderStage(); if (window.Site && Site.onReady) { /* terms/figures in cards are plain */ }
  }
  function measure() {
    var hd = document.querySelector(".site-header");
    layout.style.setProperty("--jy-head", (hd ? hd.offsetHeight : 56) + "px");
    layout.style.setProperty("--jy-rail", (railEl.offsetHeight) + "px");
  }

  function init() {
    var hs = readHash();
    if (hs.m) state.mol = hs.m === "C11H8" ? "C11H8" : "C10H6";
    if (hs.s != null && !isNaN(+hs.s)) state.stage = Math.max(0, Math.min(6, +hs.s | 0));
    var molSeg = $("jy-mol");
    molSeg.addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) setMol(b.getAttribute("data-mol")); });
    molSeg.addEventListener("keydown", function (e) {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return; e.preventDefault();
      var arr = Array.prototype.slice.call(molSeg.querySelectorAll("button")), i = arr.findIndex(function (b) { return b.getAttribute("aria-checked") === "true"; });
      var nb = arr[(i + 1) % arr.length]; setMol(nb.getAttribute("data-mol")); nb.focus();
    });
    var sa = $("jy-showall");
    if (sa) sa.addEventListener("click", function () { state.showAll = !state.showAll; applyVisibility(); });
    buildRail();
    setMol(state.mol, true);
    buildCards();
    var cl = $("jy-closing");
    renderStage();
    measure(); window.addEventListener("resize", measure); window.addEventListener("load", measure);
    window.addEventListener("hashchange", function () {
      var o = readHash(), m = o.m === "C11H8" ? "C11H8" : "C10H6", s = Math.max(0, Math.min(6, (+o.s | 0) || 0));
      var molChanged = m !== state.mol, stageChanged = s !== state.stage;
      state.stage = s;
      if (molChanged) setMol(m); else if (stageChanged) renderStage();
    });
    document.addEventListener("site:motion", function () { renderStage(); });
    document.addEventListener("visibilitychange", function () { if (document.hidden && live.player) live.player.pause(); });
    // global key convenience: space on the viewer panel toggles the player
    viewerEl.addEventListener("keydown", function (e) { if (e.key === " " && e.target === viewerEl && live.player) { e.preventDefault(); live.player.toggle(); } });
    var doc = document.documentElement; doc.setAttribute("data-journey-ready", "1");
  }
  if (window.Site && Site.onReady) Site.onReady(init); else if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
