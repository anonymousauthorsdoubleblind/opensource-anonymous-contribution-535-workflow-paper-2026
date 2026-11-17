/* WP3: hessian.html (module 2). DATA_HESS, DATA_STRUCT; Replay.Mol and Replay.Chart (scans). */
(function () {
  "use strict";
  var MD = window.MD, $ = MD.$;
  if (!MD) return;
  var MOLNAME = {C10H6: "C₁₀H₆", C11H8: "C₁₁H₈"};
  var state = {mol: "C10H6", kind: "ir", sel: null, compare: false, sort: {col: 0, dir: 1}};
  var tip = null, motion = null;

  function modes() { return DATA_HESS[state.mol].modes; }
  function labelText(m) { return m.label ? String(m.label).replace("C#C", "C≡C").replace(/^C-H/, "C–H").replace("in-plane C-H", "in-plane C–H").replace(/C-C/g, "C–C") : ""; }

  /* ---------------------------------------------------------------- spectrum */
  function drawSpectrum() {
    var host = $("hs-chart"); if (!host) return;
    MD.clear(host);
    var ms = modes(), W = 760, H = 320, ml = 56, mr = 14, mt = 20, mb = 46, pw = W - ml - mr, ph = H - mt - mb, XMAX = 3400, fwhm = (DATA_HESS.broadening || {}).fwhm_cm1 || 20;
    var isIR = state.kind === "ir";
    function sx(v) { return ml + v / XMAX * pw; }
    // envelope
    var xsA = [], ys = [], x;
    for (x = 0; x <= XMAX; x += 4) {
      var s = 0;
      ms.forEach(function (m) {
        var g = MD.gauss(x, m.freq, fwhm);
        s += isIR ? m.ir * g : 100 * g / (fwhm / 2.354820045 * Math.sqrt(2 * Math.PI));
      });
      xsA.push(x); ys.push(s);
    }
    var ymaxData = isIR ? Math.max.apply(null, ms.map(function (m) { return m.ir; })) : Math.max.apply(null, ys);
    var ymax = ymaxData * 1.18, tk = MD.nice(ymax, 5);
    ymax = Math.ceil(ymax / tk) * tk;
    function sy(v) { return mt + ph - v / ymax * ph; }
    var svg = MD.svg("svg", {viewBox: "0 0 " + W + " " + H, role: "group", "aria-label": (isIR ? "Harmonic IR spectrum" : "Vibrational density of states") + " of " + MOLNAME[state.mol] + ". Sticks are modes; select one to see its row in the table."});
    // regions
    [[2000, 2300, "C≡C stretch"], [3050, 3400, "C–H stretch"]].forEach(function (r) {
      svg.appendChild(MD.svg("rect", {x: sx(r[0]), y: mt, width: sx(r[1]) - sx(r[0]), height: ph, fill: "var(--m2-soft)", opacity: 0.9}));
      svg.appendChild(MD.svg("text", {x: (sx(r[0]) + sx(r[1])) / 2, y: mt + 12, "text-anchor": "middle", "font-size": 11, cls: "md-svg-muted", text: r[2] + " region"}));
    });
    // grid + axes
    for (var v = 0; v <= ymax + 1e-9; v += tk) {
      svg.appendChild(MD.svg("line", {cls: "md-grid", x1: ml, x2: ml + pw, y1: sy(v), y2: sy(v)}));
      svg.appendChild(MD.svg("text", {x: ml - 6, y: sy(v) + 4, "text-anchor": "end", "font-size": 11, text: MD.num(v, tk < 1 ? 1 : 0)}));
    }
    for (x = 0; x <= XMAX; x += 500) {
      svg.appendChild(MD.svg("line", {cls: "md-axis", x1: sx(x), x2: sx(x), y1: mt + ph, y2: mt + ph + 4}));
      svg.appendChild(MD.svg("text", {x: sx(x), y: mt + ph + 17, "text-anchor": "middle", "font-size": 11, text: String(x)}));
    }
    svg.appendChild(MD.svg("line", {cls: "md-axis", x1: ml, x2: ml + pw, y1: mt + ph, y2: mt + ph}));
    svg.appendChild(MD.svg("text", {x: ml + pw / 2, y: H - 6, "text-anchor": "middle", "font-size": 12, text: "wavenumber (cm⁻¹)"}));
    svg.appendChild(MD.svg("text", {x: 14, y: mt + ph / 2, "text-anchor": "middle", "font-size": 12, transform: "rotate(-90 14 " + (mt + ph / 2) + ")",
      text: isIR ? "IR intensity (km mol⁻¹)" : "modes per 100 cm⁻¹"}));
    // envelope path
    var d = ys.map(function (y, i) { return (i ? "L" : "M") + sx(xsA[i]).toFixed(1) + " " + sy(y).toFixed(1); }).join("");
    svg.appendChild(MD.svg("path", {d: d, fill: "none", stroke: "var(--m2)", "stroke-width": 1.8, opacity: 0.85}));
    // sticks
    var strongest = ms.reduce(function (a, m) { return m.ir > a.ir ? m : a; }, ms[0]);
    ms.forEach(function (m, idx) {
      var top = isIR ? sy(m.ir) : sy(ymax * 0.12);
      var g = MD.svg("g", {cls: "md-stick" + (state.sel === idx ? " is-sel" : ""), tabindex: 0, role: "button", "data-i": idx,
        "aria-label": "Mode " + m.i + ", " + MD.num(m.freq, 1) + " wavenumbers, IR intensity " + MD.num(m.ir, 1) + (m.label ? ", " + labelText(m) : "")});
      g.appendChild(MD.svg("rect", {x: sx(m.freq) - 5, y: Math.min(top, mt + ph - 12) - 2, width: 10, height: Math.max(14, mt + ph - top + 2), fill: "transparent"}));
      g.appendChild(MD.svg("line", {x1: sx(m.freq), x2: sx(m.freq), y1: mt + ph, y2: top, stroke: state.sel === idx ? "var(--warn)" : "var(--m2-ink)", "stroke-width": state.sel === idx ? 3.5 : 2, "stroke-linecap": "round"}));
      g.addEventListener("click", function (e) { select(idx, true); });
      g.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(idx, true); } });
      g.addEventListener("mousemove", function (e) { tip.show("<strong>Mode " + m.i + "</strong> · " + MD.num(m.freq, 1) + " cm⁻¹<br>IR " + MD.num(m.ir, 1) + " km mol⁻¹" + (m.label ? "<br>" + MD.esc(labelText(m)) : ""), e); });
      g.addEventListener("mouseleave", function () { tip.hide(); });
      g.addEventListener("focus", function () { tip.show("<strong>Mode " + m.i + "</strong> · " + MD.num(m.freq, 1) + " cm⁻¹<br>IR " + MD.num(m.ir, 1) + " km mol⁻¹", null, g); });
      g.addEventListener("blur", function () { tip.hide(); });
      svg.appendChild(g);
    });
    // direct labels
    if (isIR) {
      svg.appendChild(MD.svg("text", {x: sx(strongest.freq) + 8, y: sy(strongest.ir) + 4, "font-size": 11.5, "font-weight": 600, text: "strongest: " + MD.num(strongest.freq, 1) + " (out-of-plane C–H wag)"}));
      ms.filter(function (m) { return m.label && /^C#C/.test(m.label); }).forEach(function (m) {
        svg.appendChild(MD.svg("text", {x: sx(m.freq), y: sy(m.ir) - 6, "text-anchor": "middle", "font-size": 11, text: "C≡C " + MD.num(m.freq, 0)}));
      });
    }
    host.appendChild(svg);
  }

  /* ---------------------------------------------------------------- table */
  function drawTable() {
    var host = $("hs-table"); if (!host) return;
    MD.clear(host);
    var ms = modes().map(function (m, i) { return {m: m, i: i}; });
    var cols = [{label: "Mode", num: true}, {label: "Wavenumber (cm⁻¹)", num: true}, {label: "IR intensity (km mol⁻¹)", num: true}, {label: "Character"}];
    if (state.compare) cols = cols.concat([{label: "B3LYP-D3(BJ) (cm⁻¹)", num: true}, {label: "overlap", num: true}, {label: "6-31+G(d,p) (cm⁻¹)", num: true}, {label: "overlap", num: true}]);
    var keyf = [function (o) { return o.m.i; }, function (o) { return o.m.freq; }, function (o) { return o.m.ir; }, function (o) { return o.m.label || ""; },
      function (o) { return o.m.b3lyp ? o.m.b3lyp.freq : -1; }, function (o) { return o.m.b3lyp ? o.m.b3lyp.overlap : -1; }, function (o) { return o.m.pople ? o.m.pople.freq : -1; }, function (o) { return o.m.pople ? o.m.pople.overlap : -1; }];
    var f = keyf[state.sort.col] || keyf[0], dir = state.sort.dir;
    ms.sort(function (a, b) { var x = f(a), y = f(b); return (x < y ? -1 : x > y ? 1 : 0) * dir; });
    function ov(s) { return s ? (s.overlap < 0.9 ? "not matched (" + MD.num(s.overlap, 2) + ")" : MD.num(s.overlap, 2)) : "–"; }
    var rows = ms.map(function (o) {
      var m = o.m, r = [String(m.i), MD.num(m.freq, 1), MD.num(m.ir, 1), labelText(m)];
      if (state.compare) r = r.concat([m.b3lyp ? MD.num(m.b3lyp.freq, 1) : "–", ov(m.b3lyp), m.pople ? MD.num(m.pople.freq, 1) : "–", ov(m.pople)]);
      return r;
    });
    var tb = MD.table(cols, rows, {sortable: function (c) { state.sort = {col: c, dir: state.sort.col === c ? -state.sort.dir : 1}; drawTable(); },
      rowAttr: function (r, ri) { var idx = ms[ri].i; return {"data-i": idx, tabindex: 0, "aria-selected": state.sel === idx ? "true" : "false", class: state.sel === idx ? "is-sel" : ""}; },
      caption: "Harmonic modes of " + MOLNAME[state.mol] + " at Skala-1.1/def2-TZVP (unscaled)"});
    tb.style.maxHeight = "420px"; tb.style.overflow = "auto";
    tb.querySelectorAll("tbody tr").forEach(function (tr) {
      var i = +tr.getAttribute("data-i");
      tr.style.cursor = "pointer";
      tr.addEventListener("click", function () { select(i, false); });
      tr.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(i, false); } });
    });
    host.appendChild(tb);
  }

  function select(idx, fromChart) {
    state.sel = idx;
    drawSpectrum();
    document.querySelectorAll("#hs-table tbody tr").forEach(function (tr) {
      var on = +tr.getAttribute("data-i") === idx; tr.classList.toggle("is-sel", on); tr.setAttribute("aria-selected", on ? "true" : "false");
      if (on && fromChart) { var w = tr.closest(".table-wrap"); if (w) w.scrollTop = Math.max(0, tr.offsetTop - w.clientHeight / 2); }
    });
    startMotion();
  }

  /* ---------------------------------------------------------------- mode motion (illustrative) */
  var anim = {raf: 0, t0: 0, mol: null, base: null, disp: null, running: false, key: null};
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function norm(a) { var l = Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
  function dist(a, b) { var d = sub(a, b); return Math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]); }
  function planeNormal(P) {
    var n = P.length, c = [0, 0, 0]; P.forEach(function (p) { c[0] += p[0] / n; c[1] += p[1] / n; c[2] += p[2] / n; });
    var C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]; P.forEach(function (p) { var q = sub(p, c); for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) C[i][j] += q[i] * q[j]; });
    // smallest eigenvector via power iteration on (tI - C)
    var t = C[0][0] + C[1][1] + C[2][2], v = [0.3, 0.5, 0.8];
    for (var k = 0; k < 200; k++) {
      var w = [0, 0, 0]; for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) w[i] += ((i === j ? t : 0) - C[i][j]) * v[j];
      v = norm(w);
    }
    return v;
  }
  function modeKind(label) {
    if (!label) return null;
    if (/^C[-–]H out-of-plane wag/.test(label)) return "wag";
    if (/^C#C stretch/.test(label)) return "cc";
    if (/^C[-–]H stretch/.test(label)) return "ch";
    return null;
  }
  function displacement(kind, sym, P) {
    var d = P.map(function () { return [0, 0, 0]; }), nrm = planeNormal(P), i, j;
    if (kind === "wag") { sym.forEach(function (s, k) { if (s === "H") d[k] = nrm.slice(); }); }
    else if (kind === "cc") {
      for (i = 0; i < sym.length; i++) for (j = i + 1; j < sym.length; j++) if (sym[i] === "C" && sym[j] === "C" && dist(P[i], P[j]) < 1.25) {
        var u = norm(sub(P[j], P[i])); d[i] = [-u[0], -u[1], -u[2]]; d[j] = u;
      }
    } else if (kind === "ch") {
      sym.forEach(function (s, k) { if (s !== "H") return; var best = -1, bd = 9; sym.forEach(function (t, q) { if (t === "C") { var dd = dist(P[k], P[q]); if (dd < bd) { bd = dd; best = q; } } }); if (best >= 0) d[k] = norm(sub(P[k], P[best])); });
    }
    return d;
  }
  function startMotion() {
    var host = $("hs-motion-mol"), txt = $("hs-motion-text"); if (!host) return;
    var m = modes()[state.sel];
    if (!m) return;
    var info = MD.num(m.freq, 1) + " cm⁻¹, IR " + MD.num(m.ir, 1) + " km mol⁻¹";
    var kind = modeKind(m.label);
    if (anim.raf) { cancelAnimationFrame(anim.raf); anim.raf = 0; }
    if (!kind) {
      txt.textContent = "Mode " + m.i + " (" + info + "): No motion is shown for this mode: its displacement pattern is not in the data pack.";
      if (anim.mol) { anim.mol.destroy(); anim.mol = null; MD.clear(host); }
      return;
    }
    if (!MD.needReplay(host, ["Mol"]) || !window.DATA_STRUCT) return;
    var S = DATA_STRUCT[state.mol], ep = S.endpoint_svp, P = ep.coords, sym = S.symbols;
    var kname = {wag: "out-of-plane C–H wag", cc: "C≡C stretch", ch: "C–H stretch"}[kind];
    txt.textContent = "Mode " + m.i + " (" + info + "): generic picture of an " + (kind === "cc" ? "" : "") + kname + ", the same for every mode of this kind.";
    if (anim.key !== state.mol + kind || !anim.mol) {
      if (anim.mol) anim.mol.destroy();
      MD.clear(host);
      anim.mol = Replay.Mol(host, {symbols: sym, coords: P, height: 300, view: "side", label: "Illustrative motion of the " + kname});
      anim.key = state.mol + kind;
    }
    anim.base = P; anim.disp = displacement(kind, sym, P);
    function pos(s) { return P.map(function (p, i) { return [p[0] + s * anim.disp[i][0], p[1] + s * anim.disp[i][1], p[2] + s * anim.disp[i][2]]; }); }
    var AMP = 0.25;
    if (MD.reduced()) {
      anim.mol.clearOverlay("ref"); anim.mol.overlay(P, {opacity: 0.35, id: "ref"}); anim.mol.setCoords(pos(AMP));
      txt.textContent += " Reduced motion is on: the picture shows the extreme displaced structure over the equilibrium structure (faint).";
      return;
    }
    anim.mol.clearOverlay("ref");
    anim.t0 = performance.now();
    function frame(t) {
      anim.raf = 0;
      var play = $("hs-motion-play");
      var rect = host.getBoundingClientRect(), vis = rect.bottom > 0 && rect.top < window.innerHeight;
      if (play && play.checked && vis && !document.hidden) anim.mol.setCoords(pos(AMP * Math.sin(2 * Math.PI * (t - anim.t0) / 1000)));
      anim.raf = requestAnimationFrame(frame);
    }
    anim.raf = requestAnimationFrame(frame);
  }

  /* ---------------------------------------------------------------- scans */
  function drawScans() {
    var host = $("sc-grid"); if (!host) return;
    MD.clear(host);
    var sc = DATA_HESS[state.scanMol || "C10H6"].scans || [];
    var tbl = [];
    sc.forEach(function (s) {
      var cell = MD.h("div", {cls: "md-cell"}); host.appendChild(cell);
      var pts = s.points.slice().sort(function (a, b) { return a.q - b.q; });
      if (window.Replay && Replay.Chart) {
        Replay.Chart(cell, {height: 190, title: "Mode " + s.mode + (s.role === "control" ? " (control mode)" : " (soft mode)"), desc: "Energy above the minimum against displacement along the mode, in units of the zero-point amplitude.",
          x: {label: "displacement q (zero-point amplitudes)", min: -3, max: 3, short: "q"}, y: {label: "ΔE (meV)", min: 0},
          series: [{id: "scan", label: "scan", x: pts.map(function (p) { return p.q; }), y: pts.map(function (p) { return p.dE_meV; }), color: "--m2", dash: "solid", width: 2, marker: "circle", end_label: false}], table: true});
      } else cell.appendChild(MD.h("p", {cls: "md-missing", text: "Replay component not loaded."}));
      tbl.push(["Mode " + s.mode, s.role === "control" ? "control" : "soft", MD.num(s.hessian_cm1, 1), MD.num(s.scan_fit_cm1, 1), MD.num(s.ratio_q3, 2)]);
    });
    var th = $("sc-table"); MD.clear(th);
    th.appendChild(MD.table([{label: "Mode"}, {label: "Role"}, {label: "Hessian wavenumber (cm⁻¹)", num: true}, {label: "Scan wavenumber (cm⁻¹)", num: true}, {label: "Ratio scan / harmonic at q = ±3", num: true}], tbl,
      {caption: "Scans of " + MOLNAME[state.scanMol || "C10H6"] + ": " + ((DATA_HESS.scan_points_above_min || "32 of 32")) + " displaced structures above the minimum"}));
  }

  /* ---------------------------------------------------------------- consistency mark chart */
  function drawCons() {
    var host = $("cons-mark"); if (!host) return;
    var c = DATA_HESS.consistency || {force_ratio: [0.9991, 1.0002]}, lo = c.force_ratio[0], hi = c.force_ratio[1];
    var W = 640, H = 90, ml = 20, mr = 20, a = 0.9980, b = 1.0030;
    function sx(v) { return ml + (v - a) / (b - a) * (W - ml - mr); }
    var svg = MD.svg("svg", {viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": "Ratio of analytic force to finite-difference slope: from " + lo + " to " + hi + ", with 1 meaning exact agreement."});
    svg.appendChild(MD.svg("line", {cls: "md-axis", x1: sx(a), x2: sx(b), y1: 52, y2: 52}));
    [0.998, 0.999, 1.0, 1.001, 1.002, 1.003].forEach(function (v) {
      svg.appendChild(MD.svg("line", {cls: "md-axis", x1: sx(v), x2: sx(v), y1: 52, y2: 58}));
      svg.appendChild(MD.svg("text", {x: sx(v), y: 74, "text-anchor": "middle", "font-size": 11, text: v.toFixed(3)}));
    });
    svg.appendChild(MD.svg("rect", {x: sx(lo), y: 38, width: sx(hi) - sx(lo), height: 14, fill: "var(--m2)"}));
    svg.appendChild(MD.svg("line", {x1: sx(1), x2: sx(1), y1: 24, y2: 56, stroke: "var(--ink)", "stroke-width": 1.5, "stroke-dasharray": "4 3"}));
    svg.appendChild(MD.svg("text", {x: sx(1), y: 18, "text-anchor": "middle", "font-size": 11.5, "font-weight": 600, text: "1 = exact agreement"}));
    svg.appendChild(MD.svg("text", {x: sx(lo) - 6, y: 34, "text-anchor": "end", "font-size": 11.5, text: lo.toFixed(4)}));
    svg.appendChild(MD.svg("text", {x: sx(hi) + 6, y: 34, "font-size": 11.5, text: hi.toFixed(4)}));
    var tbl = MD.table(["Quantity", "Value"], [["Lowest ratio, analytic force over finite-difference slope", lo.toFixed(4)], ["Highest ratio", hi.toFixed(4)], ["Exact agreement", "1"]]);
    MD.viewSwitch(host, [{value: "chart", label: "Chart", node: MD.h("div", null, [svg])}, {value: "table", label: "Table view", node: tbl}]);
  }

  MD.ready(function () {
    var host = $("hs-chart");
    if (!MD.needData(host, "DATA_HESS")) return;
    tip = MD.tip($("hs-panel").querySelector(".panel__body"));
    MD.seg($("hs-mol"), [{value: "C10H6", label: "C₁₀H₆"}, {value: "C11H8", label: "C₁₁H₈"}], state.mol, function (v) {
      state.mol = v; state.sel = strongestIdx(); state.sort = {col: 0, dir: 1}; drawSpectrum(); drawTable(); startMotion();
    });
    MD.seg($("hs-kind"), [{value: "ir", label: "IR spectrum"}, {value: "vdos", label: "Vibrational density of states"}], "ir", function (v) { state.kind = v; drawSpectrum(); });
    $("hs-compare").addEventListener("change", function (e) { state.compare = e.target.checked; drawTable(); });
    function strongestIdx() { var ms = modes(), b = 0; ms.forEach(function (m, i) { if (m.ir > ms[b].ir) b = i; }); return b; }
    state.sel = strongestIdx();
    MD.guard(host, "spectrum", drawSpectrum);
    MD.guard($("hs-table"), "mode table", drawTable);
    MD.guard($("hs-motion-mol"), "mode motion", startMotion);
    var sm = $("sc-mol");
    if (sm) { state.scanMol = "C10H6"; MD.seg(sm, [{value: "C10H6", label: "C₁₀H₆"}, {value: "C11H8", label: "C₁₁H₈"}], "C10H6", function (v) { state.scanMol = v; MD.guard($("sc-grid"), "scans", drawScans); }); }
    MD.guard($("sc-grid"), "scans", drawScans);
    MD.guard($("cons-mark"), "consistency", drawCons);
    var play = $("hs-motion-play"); if (play) play.addEventListener("change", function () { if (!play.checked && anim.mol && anim.base) anim.mol.setCoords(anim.base); });
    // micro-3 slot: hide it when the catalogue has no such figure
    var slot = $("micro3-slot");
    if (slot && !(window.DATA_FIGS && DATA_FIGS.byId && DATA_FIGS.byId["micro-3"])) slot.hidden = true;
  });
})();
