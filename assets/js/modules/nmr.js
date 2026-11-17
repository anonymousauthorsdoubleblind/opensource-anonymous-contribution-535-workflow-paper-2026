/* WP3: nmr.html (module 3). DATA_NMR. Own SVG renderer (reversed ppm axis); no Replay dependency. */
(function () {
  "use strict";
  var MD = window.MD, $ = MD.$;
  if (!MD) return;
  var MOLNAME = {C10H6: "C₁₀H₆", C11H8: "C₁₁H₈"};
  var state = {mol: "C11H8", probe: "P1"};
  var tip = null;

  function nuc(n) { return n === "C13" ? "¹³C" : "¹H"; }
  function range(n) { var a = DATA_NMR.axis[n]; return Array.isArray(a) ? a : a[state.mol]; }

  function panel(svgParent, n, y0, h, W, ml, mr) {
    var sig = DATA_NMR.signals[state.mol][n] || [], P = state.probe, pw = W - ml - mr;
    var r = range(n), hi = r[0], lo = r[1];
    function sx(v) { return ml + (hi - v) / (hi - lo) * pw; }
    var base = y0 + h / 2, stick = h / 2 - 40;
    var g = MD.svg("g");
    g.appendChild(MD.svg("text", {x: ml, y: y0 + 4, "font-size": 13, "font-weight": 700, text: nuc(n) + " shifts (ppm)"}));
    g.appendChild(MD.svg("text", {x: ml + pw, y: y0 + 4, "text-anchor": "end", "font-size": 11, cls: "md-svg-muted", text: "experiment up, computed (" + P + ") down"}));
    g.appendChild(MD.svg("line", {cls: "md-axis", x1: ml, x2: ml + pw, y1: base, y2: base}));
    // ticks along baseline, labels at bottom
    var step = (hi - lo) > 60 ? 10 : (hi - lo) > 25 ? 5 : (hi - lo) > 8 ? 1 : 0.5, v;
    for (v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) {
      g.appendChild(MD.svg("line", {cls: "md-grid", x1: sx(v), x2: sx(v), y1: y0 + 14, y2: y0 + h + 2, opacity: 0.6}));
      g.appendChild(MD.svg("text", {x: sx(v), y: y0 + h + 16, "text-anchor": "middle", "font-size": 11, text: MD.num(v, step < 1 ? 1 : 0)}));
    }
    var off = [];
    sig.forEach(function (s, i) {
      var calc = s[P], exp = s.exp;
      if (exp > hi || exp < lo || calc > hi || calc < lo) { off.push(s); return; }
      var err = calc - exp;
      var grp = MD.svg("g", {cls: "md-stick", tabindex: 0, role: "button", "data-n": n, "data-i": i,
        "aria-label": nuc(n) + " signal " + s.label + ": measured " + MD.num(exp, 2) + " ppm, computed " + MD.num(calc, 2) + " ppm, error " + MD.signed(err, 2) + " ppm"});
      grp.appendChild(MD.svg("rect", {x: sx(exp) - 6, y: base - stick - 14, width: 12, height: stick + 14, fill: "transparent"}));
      grp.appendChild(MD.svg("rect", {x: sx(calc) - 6, y: base, width: 12, height: stick + 6, fill: "transparent"}));
      grp.appendChild(MD.svg("line", {x1: sx(exp), x2: sx(exp), y1: base, y2: base - stick, stroke: "var(--c-exp)", "stroke-width": 2.6, "stroke-linecap": "round"}));
      grp.appendChild(MD.svg("line", {x1: sx(calc), x2: sx(calc), y1: base, y2: base + stick, stroke: "var(--c-calc)", "stroke-width": 2.6, "stroke-linecap": "round"}));
      grp.appendChild(MD.svg("line", {x1: sx(exp), x2: sx(calc), y1: base, y2: base, stroke: "var(--m3)", "stroke-width": 3, opacity: 0.35}));
      var lab = MD.svg("text", {x: sx(exp), y: base - stick - 4, "font-size": 10, "text-anchor": "start", transform: "rotate(-60 " + sx(exp) + " " + (base - stick - 4) + ")", text: s.label});
      grp.appendChild(lab);
      function show(e) { tip.show("<strong>" + MD.esc(s.label) + "</strong> (" + nuc(n) + ")<br>measured " + MD.num(exp, 2) + " ppm<br>computed " + MD.num(calc, 2) + " ppm (" + P + ")<br>error " + MD.signed(err, 2) + " ppm", e, grp); grp.classList.add("is-sel"); }
      function hide() { tip.hide(); grp.classList.remove("is-sel"); }
      grp.addEventListener("mousemove", show); grp.addEventListener("mouseleave", hide); grp.addEventListener("focus", function () { show(null); }); grp.addEventListener("blur", hide);
      g.appendChild(grp);
    });
    svgParent.appendChild(g);
    return off;
  }

  function drawSticks() {
    var host = $("nm-sticks"), W = 760, ml = 30, mr = 16;
    MD.clear(host);
    var off = [];
    var svg = MD.svg("svg", {viewBox: "0 0 " + W + " 500", role: "group", "aria-label": "Mirrored stick spectra of " + MOLNAME[state.mol] + ": measured shifts up, computed shifts down, ppm axis from high to low."});
    off = off.concat(panel(svg, "C13", 6, 210, W, ml, mr).map(function (s) { return [nuc("C13"), s]; }));
    off = off.concat(panel(svg, "H1", 262, 210, W, ml, mr).map(function (s) { return [nuc("H1"), s]; }));
    svg.setAttribute("viewBox", "0 0 " + W + " 496");
    host.appendChild(svg);
    if (off.length) host.appendChild(MD.h("p", {cls: "md-small", text: "Off scale and not drawn: " + off.map(function (o) {
      return o[0] + " " + o[1].label + " at " + MD.num(o[1].exp, 1) + " ppm measured, " + MD.num(o[1][state.probe], 1) + " ppm computed with " + state.probe; }).join("; ") + "."}));
  }

  function drawTable() {
    var host = $("nm-table"); if (!host) return;
    MD.clear(host);
    var rows = [];
    ["C13", "H1"].forEach(function (n) {
      (DATA_NMR.signals[state.mol][n] || []).forEach(function (s) {
        rows.push([nuc(n), s.label, MD.num(s.exp, 2), MD.num(s.P1, 2), MD.signed(s.err_P1 !== undefined ? s.err_P1 : s.P1 - s.exp, 2), s.P2 !== undefined ? MD.num(s.P2, 2) : "–", s.P2 !== undefined ? MD.signed(s.err_P2 !== undefined ? s.err_P2 : s.P2 - s.exp, 2) : "–"]);
      });
    });
    var cols = ["Nucleus", "Signal", {label: "Measured (ppm)", num: true}, {label: "P1 B3LYP (ppm)", num: true}, {label: "Error P1 (ppm)", num: true}, {label: "P2 PBE0 (ppm)", num: true}, {label: "Error P2 (ppm)", num: true}];
    var t = MD.table(cols, rows, {caption: "All signals of " + MOLNAME[state.mol] + ", computed minus measured. Conditions: " + ((DATA_NMR.conditions || {})[state.mol] || "")});
    t.style.maxHeight = "380px"; t.style.overflow = "auto";
    var d = MD.h("details", {cls: "md-details", open: ""}, [MD.h("summary", {text: "Table view: all signals, both probes, with errors"}), t]);
    host.appendChild(d);
  }

  function drawMae() {
    var host = $("nm-mae"); if (!host) return;
    var rows = DATA_NMR.table1, lim = DATA_NMR.limits;
    var W = 760, ml = 120, mr = 70, rowH = 26;
    var panels = [["C13", "c13_mae", lim.C13_mae, 2.4, "¹³C MAE (ppm)"], ["H1", "h1_mae", lim.H1_mae, 0.24, "¹H MAE (ppm)"]];
    var H = 2 * (rows.length * rowH + 62);
    var svg = MD.svg("svg", {viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": "Mean absolute errors of the four molecule and probe combinations against the published limits of 2.0 ppm for carbon-13 and 0.2 ppm for hydrogen."});
    var y = 8;
    var pat = MD.svg("defs", null, [MD.svg("pattern", {id: "md-hatch", width: 6, height: 6, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)"}, [
      MD.svg("rect", {width: 6, height: 6, fill: "var(--surface)"}), MD.svg("line", {x1: 0, y1: 0, x2: 0, y2: 6, stroke: "var(--m3)", "stroke-width": 2.5})])]);
    svg.appendChild(pat);
    panels.forEach(function (p) {
      var pw = W - ml - mr, key = p[1], mx = p[3];
      function sx(v) { return ml + v / mx * pw; }
      svg.appendChild(MD.svg("text", {x: ml, y: y + 12, "font-size": 13, "font-weight": 700, text: p[4]}));
      var top = y + 22;
      rows.forEach(function (r, i) {
        var yy = top + i * rowH, v = r[key];
        svg.appendChild(MD.svg("text", {x: ml - 8, y: yy + 16, "text-anchor": "end", "font-size": 12, text: MOLNAME[r.molecule] + " " + r.probe}));
        svg.appendChild(MD.svg("rect", {x: ml, y: yy + 3, width: Math.max(1, sx(v) - ml), height: 18, fill: r.probe === "P1" ? "var(--m3)" : "url(#md-hatch)", stroke: "var(--m3)", "stroke-width": 1.5}));
        svg.appendChild(MD.svg("text", {x: sx(v) + 6, y: yy + 17, "font-size": 12, "font-weight": 600, stroke: "var(--bg)", "stroke-width": 4, "paint-order": "stroke", text: MD.num(v, key === "c13_mae" ? 2 : 3)}));
      });
      var bot = top + rows.length * rowH;
      svg.appendChild(MD.svg("line", {cls: "md-axis", x1: ml, x2: ml, y1: top, y2: bot}));
      svg.appendChild(MD.svg("line", {x1: sx(p[2]), x2: sx(p[2]), y1: top - 6, y2: bot + 2, stroke: "var(--warn)", "stroke-width": 2, "stroke-dasharray": "5 3"}));
      svg.appendChild(MD.svg("text", {x: sx(p[2]) + 5, y: top - 8, "font-size": 11.5, "font-weight": 600, fill: "var(--warn)", text: "limit " + MD.num(p[2], 1) + " ppm"}));
      y = bot + 28;
    });
    var tbl = MD.table(["System", "Probe", {label: "¹³C MAE (ppm)", num: true}, {label: "¹H MAE (ppm)", num: true}], rows.map(function (r) { return [MOLNAME[r.molecule], r.probe, MD.num(r.c13_mae, 2), MD.num(r.h1_mae, 3)]; }),
      {caption: "MAE against the limits: ¹³C below 2.0 ppm, ¹H below 0.2 ppm (Parmar et al.)"});
    MD.viewSwitch(host, [{value: "chart", label: "Chart", node: MD.h("div", null, [svg])}, {value: "table", label: "Table view", node: tbl}]);
  }

  MD.ready(function () {
    var host = $("nm-sticks");
    if (!MD.needData(host, "DATA_NMR")) return;
    tip = MD.tip($("nm-panel").querySelector(".panel__body"));
    MD.seg($("nm-mol"), [{value: "C11H8", label: "C₁₁H₈"}, {value: "C10H6", label: "C₁₀H₆"}], state.mol, function (v) { state.mol = v; drawSticks(); drawTable(); });
    MD.seg($("nm-probe"), [{value: "P1", label: "P1 · B3LYP"}, {value: "P2", label: "P2 · PBE0"}], state.probe, function (v) { state.probe = v; drawSticks(); });
    MD.guard(host, "sticks", drawSticks);
    MD.guard($("nm-table"), "table", drawTable);
    MD.guard($("nm-mae"), "MAE bars", drawMae);
  });
})();
