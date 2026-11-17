/* WP3: properties.html (module 4). DATA_PROPS. Own SVG bars; no Replay dependency. */
(function () {
  "use strict";
  var MD = window.MD, $ = MD.$;
  if (!MD) return;
  var ORDER = ["Skala-1.1", "ωB97M-V", "CCSD", "HF"];
  var MOLNAME = {C10H6: "C₁₀H₆", C11H8: "C₁₁H₈"};

  function find(rows, name) { for (var i = 0; i < rows.length; i++) if (rows[i].method === name) return rows[i]; return null; }

  function draw() {
    var host = $("cc-chart"), P = DATA_PROPS.relaxation;
    var W = 760, ml = 120, mr = 150, AX = 12, rowH = 28, gap = 46, pw = W - ml - mr;
    function sx(v) { return ml + (v + AX) / (2 * AX) * pw; }
    var mols = ["C11H8", "C10H6"], H = mols.length * (ORDER.length * rowH + gap) + 40;
    var svg = MD.svg("svg", {viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": "Deviation of the relaxation energy from CCSD(T) in kilocalories per mole for Skala-1.1, wB97M-V, CCSD and HF, for two molecules."});
    svg.appendChild(MD.svg("defs", null, [MD.svg("pattern", {id: "md-hatch4", width: 6, height: 6, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)"}, [
      MD.svg("rect", {width: 6, height: 6, fill: "var(--surface)"}), MD.svg("line", {x1: 0, y1: 0, x2: 0, y2: 6, stroke: "var(--m4)", "stroke-width": 2.5})])]));
    var y = 6;
    mols.forEach(function (m) {
      var d = P[m]; if (!d) return;
      svg.appendChild(MD.svg("text", {x: 4, y: y + 12, "font-size": 14, "font-weight": 700, text: MOLNAME[m] + " · CCSD(T) relaxation energy " + MD.num((find(d.rows, "CCSD(T)") || {}).dE, 2) + " kcal mol⁻¹"}));
      var top = y + 22;
      [-10, -5, 0, 5, 10].forEach(function (v) {
        svg.appendChild(MD.svg("line", {cls: "md-grid", x1: sx(v), x2: sx(v), y1: top - 4, y2: top + ORDER.length * rowH, opacity: v === 0 ? 0 : 1}));
        svg.appendChild(MD.svg("text", {x: sx(v), y: top + ORDER.length * rowH + 14, "text-anchor": "middle", "font-size": 11, text: MD.signed(v, 0).replace("+0", "0")}));
      });
      ORDER.forEach(function (name, i) {
        var r = find(d.rows, name); if (!r) return;
        var yy = top + i * rowH, v = r.dev, cut = Math.abs(v) > AX, vv = cut ? AX * Math.sign(v) : v;
        var x0 = sx(0), x1 = sx(vv), isF = i < 2;
        var fill = isF ? (i === 0 ? "var(--m4)" : "url(#md-hatch4)") : "var(--muted)";
        svg.appendChild(MD.svg("text", {x: ml - 8, y: yy + 17, "text-anchor": "end", "font-size": 12.5, text: name}));
        svg.appendChild(MD.svg("rect", {x: Math.min(x0, x1), y: yy + 3, width: Math.max(1.5, Math.abs(x1 - x0)), height: 20, fill: fill, "fill-opacity": isF ? 1 : 0.7, stroke: isF ? "var(--m4)" : "var(--muted)", "stroke-width": 1.5}));
        if (cut) { // break marks at the cut end
          [-4, 4].forEach(function (o) { svg.appendChild(MD.svg("line", {x1: x1 - 4 + o, x2: x1 + 4 + o, y1: yy + 1, y2: yy + 25, stroke: "var(--bg)", "stroke-width": 3})); });
        }
        var txt = MD.signed(v, 2) + (r.pct ? " (" + r.pct + "%)" : "") + (cut ? " · off scale" : "");
        var right = v >= 0;
        svg.appendChild(MD.svg("text", {x: right ? x1 + 6 : x1 - 6, y: yy + 17, "text-anchor": right ? "start" : "end", "font-size": 12, "font-weight": 600, text: txt}));
      });
      svg.appendChild(MD.svg("line", {x1: sx(0), x2: sx(0), y1: top - 6, y2: top + ORDER.length * rowH, stroke: "var(--ink)", "stroke-width": 1.6}));
      svg.appendChild(MD.svg("text", {x: sx(0) + 5, y: top - 8, "font-size": 11, cls: "md-svg-muted", text: "CCSD(T) = 0"}));
      y = top + ORDER.length * rowH + gap - 8;
    });
    svg.appendChild(MD.svg("text", {x: ml + pw / 2, y: H - 2, "text-anchor": "middle", "font-size": 11.5, text: "deviation of ΔE from CCSD(T) (kcal mol⁻¹)"}));
    // table
    var tbox = MD.h("div");
    mols.forEach(function (m) {
      var d = P[m]; if (!d) return;
      tbox.appendChild(MD.table(["Method", {label: "ΔE (kcal mol⁻¹)", num: true}, {label: "Deviation from CCSD(T) (kcal mol⁻¹)", num: true}],
        d.rows.map(function (r) { return [r.method, MD.num(r.dE, 2), r.ref ? "reference" : MD.signed(r.dev, 2) + (r.pct ? " (" + r.pct + "%)" : "")]; }),
        {caption: (m === "C11H8" ? "Table 3" : "Table 4") + ": relaxation energy of the " + MOLNAME[m] + " pair (Kabsch RMSD " + MD.num(d.rmsd_A, 3) + " Å, angle rms " + MD.num(d.angle_rms_deg, 1) + "°)"}));
    });
    MD.clear(host);
    var vs = MD.viewSwitch(host, [{value: "chart", label: "Deviation chart", node: MD.h("div", null, [svg])}, {value: "table", label: "Show ΔE values", node: tbox}]);
  }

  MD.ready(function () {
    var host = $("cc-chart");
    if (!MD.needData(host, "DATA_PROPS")) return;
    MD.guard(host, "CCSD(T) bars", draw);
    var v = $("cc-view"); if (v) { v.parentNode.hidden = true; }
  });
})();
