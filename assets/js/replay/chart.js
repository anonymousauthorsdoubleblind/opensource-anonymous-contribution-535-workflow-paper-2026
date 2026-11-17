/* Replay.Chart: SVG line chart, theme-aware, with cursor, direct labels and a table view. */
(function () {
  "use strict";
  var R = (window.Replay = window.Replay || {});
  var NS = "http://www.w3.org/2000/svg";
  var MINUS = "−";
  var DASH = { solid: "", dashed: "7 4", dotted: "1.5 3.5", dashdot: "8 3 1.5 3" };
  var uid = 0;

  // ---------- pure helpers (also used by the node smoke test) ----------
  function niceNum(x, round) {
    var e = Math.floor(Math.log(x) / Math.LN10), f = x / Math.pow(10, e), nf;
    if (round) nf = f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10; else nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
    return nf * Math.pow(10, e);
  }
  function linTicks(lo, hi, target) {
    if (lo > hi) { var t = lo; lo = hi; hi = t; }
    if (!(hi > lo)) return [lo];
    var step = niceNum((hi - lo) / Math.max(2, (target || 6) - 1), true);
    var first = Math.ceil(lo / step - 1e-9) * step, out = [];
    for (var v = first; v <= hi + step * 1e-9; v += step) out.push(+v.toPrecision(12));
    return out;
  }
  function logTicks(lo, hi) {
    if (lo > hi) { var t = lo; lo = hi; hi = t; }
    var major = [], minor = [];
    var e0 = Math.floor(Math.log10(lo) + 1e-9), e1 = Math.ceil(Math.log10(hi) - 1e-9);
    for (var e = e0; e <= e1; e++) {
      var d = Math.pow(10, e);
      if (d >= lo * (1 - 1e-9) && d <= hi * (1 + 1e-9)) major.push(+d.toPrecision(12));
      for (var m = 2; m < 10; m++) { var v = m * d; if (v > lo && v < hi) minor.push(+v.toPrecision(12)); }
    }
    return { major: major, minor: minor };
  }
  function fmtNum(v) {
    if (v === 0) return "0";
    var a = Math.abs(v), s;
    if (a >= 1e5 || a < 1e-3) {
      var ex = Math.floor(Math.log10(a) + 1e-9), co = +(a / Math.pow(10, ex)).toPrecision(3);
      var sup = String(ex).replace(/-/g, "\u207b").replace(/\d/g, function (d) { return "\u2070\u00b9\u00b2\u00b3\u2074\u2075\u2076\u2077\u2078\u2079".charAt(+d); });
      return (v < 0 ? MINUS : "") + (co === 1 ? "" : co + "\u00d7") + "10" + sup;
    }
    s = String(+v.toPrecision(6));
    return s.replace("-", MINUS);
  }
  function fmtVal(v) {
    if (v == null || !isFinite(v)) return "n/a";
    var a = Math.abs(v), s;
    if (a === 0) s = "0";
    else if (a >= 1000) s = String(Math.round(v));
    else if (a >= 100) s = v.toFixed(1);
    else if (a >= 1) s = v.toFixed(3);
    else if (a >= 0.001) s = v.toFixed(4);
    else s = v.toExponential(2);
    return s.replace("-", MINUS);
  }
  function makeScale(d0, d1, p0, p1, log) {
    // maps data -> pixel; d0,d1 may be reversed
    if (log) { var l0 = Math.log(d0), l1 = Math.log(d1); return function (v) { return p0 + (Math.log(v) - l0) / (l1 - l0) * (p1 - p0); }; }
    return function (v) { return p0 + (v - d0) / (d1 - d0) * (p1 - p0); };
  }
  function spreadLabels(ys, minGap, lo, hi) {
    // ys: array of {y, i}; returns new y per i with at least minGap between neighbours, inside [lo, hi]
    var a = ys.slice().sort(function (p, q) { return p.y - q.y; }), k;
    for (k = 0; k < a.length; k++) a[k].ny = a[k].y;
    for (var pass = 0; pass < 40; pass++) {
      var moved = false;
      for (k = 1; k < a.length; k++) {
        var gap = a[k].ny - a[k - 1].ny;
        if (gap < minGap - 0.01) { var s = (minGap - gap) / 2; a[k - 1].ny -= s; a[k].ny += s; moved = true; }
      }
      for (k = 0; k < a.length; k++) a[k].ny = Math.max(lo, Math.min(hi, a[k].ny));
      if (!moved) break;
    }
    var out = {}; a.forEach(function (o) { out[o.i] = o.ny; }); return out;
  }
  R._chartPure = { linTicks: linTicks, logTicks: logTicks, makeScale: makeScale, spreadLabels: spreadLabels, fmtNum: fmtNum, niceNum: niceNum };

  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    if (attrs) for (var k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function html(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function cssVar(n, fb) {
    try {
      if (!n) return fb;
      if (n.charAt(0) !== "-") return n;
      if (window.Site && Site.cssVar) { var v = Site.cssVar(n); if (v) return v; }
      var s = getComputedStyle(document.documentElement).getPropertyValue(n).trim();
      return s || fb;
    } catch (e) { return fb; }
  }

  function markerPath(kind, x, y, r) {
    switch (kind) {
      case "square": return "M" + (x - r) + " " + (y - r) + "h" + 2 * r + "v" + 2 * r + "h" + (-2 * r) + "z";
      case "triangle": return "M" + x + " " + (y - r * 1.2) + "L" + (x + r * 1.1) + " " + (y + r * 0.9) + "L" + (x - r * 1.1) + " " + (y + r * 0.9) + "z";
      case "diamond": return "M" + x + " " + (y - r * 1.3) + "L" + (x + r * 1.3) + " " + y + "L" + x + " " + (y + r * 1.3) + "L" + (x - r * 1.3) + " " + y + "z";
      default: return "M" + (x - r) + " " + y + "a" + r + " " + r + " 0 1 0 " + 2 * r + " 0a" + r + " " + r + " 0 1 0 " + (-2 * r) + " 0z";
    }
  }

  R.Chart = function (container, options) {
    var o = options || {};
    var id = "rp-ch-" + (++uid);
    var root = html("div", "rp-chart");
    function cssVar(n, fb) {   // scoped: reads tokens where the chart sits, so a module accent set on a wrapper is honoured
      try {
        if (!n) return fb;
        if (n.charAt(0) !== "-") return n;
        var s = getComputedStyle(root.isConnected ? root : document.documentElement).getPropertyValue(n).trim();
        return s || fb;
      } catch (e) { return fb; }
    }
    var head = html("div", "rp-chart__head");
    var titleEl = html("div", "rp-chart__title"); head.appendChild(titleEl);
    var tools = html("div", "rp-chart__tools");
    var tblBtn = html("button", "btn btn--ghost rp-chart__tblbtn", "View as table"); tblBtn.type = "button"; tblBtn.setAttribute("aria-pressed", "false");
    if (o.table !== false) tools.appendChild(tblBtn);
    head.appendChild(tools);
    var readout = html("div", "rp-chart__readout"); readout.setAttribute("aria-hidden", "true");
    var plotWrap = html("div", "rp-chart__plot");
    var legend = html("ul", "rp-chart__legend");
    var tableWrap = html("div", "table-wrap rp-chart__table"); tableWrap.hidden = true;
    root.appendChild(head); root.appendChild(readout); root.appendChild(plotWrap); root.appendChild(legend); root.appendChild(tableWrap);
    container.appendChild(root);

    var cursorX = null, cbs = [], destroyed = false, svg = null, geom = null, showTable = false, rafId = 0;
    var cursorLine = null, cursorDots = [];

    function opt(k) { return o[k]; }
    function axisDomain(ax, key) {
      var a = ax || {}, lo = a.min, hi = a.max;
      if (lo == null || hi == null) {
        var mn = Infinity, mx = -Infinity;
        (o.series || []).forEach(function (s) { (s[key] || []).forEach(function (v) { if (v != null && isFinite(v) && (!a.log || v > 0)) { if (v < mn) mn = v; if (v > mx) mx = v; } }); });
        if (!isFinite(mn)) { mn = 0; mx = 1; }
        if (lo == null) lo = mn; if (hi == null) hi = mx;
      }
      return [lo, hi];
    }

    function seriesLabelsOn(s) { return s.end_label !== false && s.label; }
    function nearestIndex(s, xv) {
      var xs = s.x, best = -1, bd = Infinity;
      for (var i = 0; i < xs.length; i++) { var d = Math.abs(xs[i] - xv); if (d < bd) { bd = d; best = i; } }
      return best;
    }

    function render() {
      if (destroyed) return;
      var w = Math.max(320, Math.round(plotWrap.clientWidth || container.clientWidth || 600));
      var h = o.height || 220;
      var ink = cssVar("--ink", "#1b2333"), muted = cssVar("--muted", "#586279"), line = cssVar("--line", "#d4dae6"), surf = cssVar("--surface", "#f6f8fb");
      var warn = cssVar("--warn", "#b94a1b"), accent = cssVar("--accent", cssVar("--link", "#1d4f99"));
      var series = o.series || [];
      // right margin for end labels
      var endLabs = series.filter(seriesLabelsOn);
      var maxLab = 0; endLabs.forEach(function (s) { maxLab = Math.max(maxLab, s.label.length); });
      var mr = endLabs.length && w >= 480 ? Math.min(150, 14 + maxLab * 6.2) : 14;
      var ml = (o.y && o.y.hide) ? 14 : 54, mt = 12, mb = 40;
      var pw = w - ml - mr, ph = h - mt - mb;
      var xd = axisDomain(o.x, "x"), yd = axisDomain(o.y, "y");
      var xlog = !!(o.x && o.x.log), ylog = !!(o.y && o.y.log);
      if (!(xd[0] !== xd[1])) xd = [xd[0], xd[0] + 1];
      if (!(yd[0] !== yd[1])) yd = [yd[0], yd[0] + 1];
      var sx = makeScale(xd[0], xd[1], ml, ml + pw, xlog), sy = makeScale(yd[0], yd[1], mt + ph, mt, ylog);
      var ylo = Math.min(yd[0], yd[1]), yhi = Math.max(yd[0], yd[1]);
      var xlo = Math.min(xd[0], xd[1]), xhi = Math.max(xd[0], xd[1]);
      geom = { sx: sx, sy: sy, ml: ml, mt: mt, pw: pw, ph: ph, xd: xd, yd: yd, w: w, h: h, xlog: xlog };

      plotWrap.innerHTML = "";
      svg = el("svg", { viewBox: "0 0 " + w + " " + h, width: "100%", height: h, role: "img", "aria-label": (o.title || "Chart") + (o.desc ? ". " + o.desc : ""), "class": "rp-chart__svg" });
      svg.style.maxWidth = "100%"; svg.style.display = "block";
      svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
      var cid = id + "-clip";
      var defs = el("defs", null, svg);
      var cp = el("clipPath", { id: cid }, defs); el("rect", { x: ml, y: mt, width: pw, height: ph }, cp);
      var gAll = el("g", { "font-family": "inherit", "font-size": 11 }, svg);

      // bands
      (o.bands || []).forEach(function (b) {
        var x0 = sx(Math.max(b.x0, xlo)), x1 = sx(Math.min(b.x1, xhi));
        var fill = b.kind === "warn" ? warn : accent;
        var r = el("rect", { x: Math.min(x0, x1), y: mt, width: Math.max(1.5, Math.abs(x1 - x0)), height: ph, fill: fill, "fill-opacity": 0.13, stroke: "none" }, gAll);
        var tt = el("title", null, r); tt.textContent = b.label || "";
        if (b.label && Math.abs(x1 - x0) > 0) {
          var bx = Math.min(x0, x1), t = el("text", { x: bx + 3, y: mt + 11, fill: muted, "font-size": 9.5, "text-anchor": bx + 3 > ml + pw * 0.7 ? "end" : "start" }, gAll); if (bx + 3 > ml + pw * 0.7) t.setAttribute("x", Math.max(x0, x1) - 3);
          t.textContent = b.show_label ? b.label : "";
        }
      });

      // grid and axes
      var yt;
      if (ylog) { var lt = logTicks(ylo, yhi); yt = lt.major; lt.minor.forEach(function (v) { el("line", { x1: ml, x2: ml + pw, y1: sy(v), y2: sy(v), stroke: line, "stroke-width": 0.5, "stroke-opacity": 0.55 }, gAll); }); }
      else yt = linTicks(ylo, yhi, Math.max(3, Math.round(ph / 38)));
      yt.forEach(function (v) {
        var y = sy(v);
        el("line", { x1: ml, x2: ml + pw, y1: y, y2: y, stroke: line, "stroke-width": 1 }, gAll);
        if (o.y && o.y.hide) return;
        var t = el("text", { x: ml - 7, y: y + 3.5, "text-anchor": "end", fill: muted }, gAll); t.textContent = fmtNum(v);
      });
      var xt = xlog ? logTicks(xlo, xhi).major : linTicks(xlo, xhi, Math.max(3, Math.round(pw / 70)));
      xt.forEach(function (v) {
        var x = sx(v);
        el("line", { x1: x, x2: x, y1: mt + ph, y2: mt + ph + 4, stroke: muted, "stroke-width": 1 }, gAll);
        var t = el("text", { x: x, y: mt + ph + 17, "text-anchor": "middle", fill: muted }, gAll); t.textContent = fmtNum(v);
      });
      el("line", { x1: ml, x2: ml + pw, y1: mt + ph, y2: mt + ph, stroke: muted, "stroke-width": 1 }, gAll);
      el("line", { x1: ml, x2: ml, y1: mt, y2: mt + ph, stroke: muted, "stroke-width": 1 }, gAll);
      if (o.x && o.x.label) { var xl = el("text", { x: ml + pw / 2, y: h - 6, "text-anchor": "middle", fill: ink, "font-size": 11.5 }, gAll); xl.textContent = o.x.label; }
      if (o.y && o.y.label && !o.y.hide) { var yl = el("text", { x: 12, y: mt + ph / 2, "text-anchor": "middle", fill: ink, "font-size": 11.5, transform: "rotate(-90 12 " + (mt + ph / 2) + ")" }, gAll); yl.textContent = o.y.label; }

      var plot = el("g", { "clip-path": "url(#" + cid + ")" }, gAll);
      // hlines / vlines
      var usedLab = [];
      (o.hlines || []).forEach(function (hl) {
        if (hl.y < ylo || hl.y > yhi) return;
        var y = sy(hl.y);
        el("line", { x1: ml, x2: ml + pw, y1: y, y2: y, stroke: hl.color ? cssVar(hl.color, ink) : ink, "stroke-width": 1.2, "stroke-dasharray": DASH[hl.dash || "dashed"] }, plot);
        if (hl.label) {
          var t = el("text", { x: ml + pw - 4, y: y - 4, "text-anchor": "end", fill: ink, "font-size": 10.5, "paint-order": "stroke", stroke: surf, "stroke-width": 3, "stroke-linejoin": "round" }, gAll);
          t.textContent = hl.label;
        }
      });
      (o.vlines || []).forEach(function (vl) {
        if (vl.x < xlo || vl.x > xhi) return;
        var x = sx(vl.x);
        el("line", { x1: x, x2: x, y1: mt, y2: mt + ph, stroke: ink, "stroke-width": 1.2, "stroke-dasharray": DASH[vl.dash || "dotted"] }, plot);
        if (vl.label) {
          var right = x < ml + pw * 0.6;
          var t = el("text", { x: x + (right ? 4 : -4), y: mt + 11 + (vl.row || 0) * 12, "text-anchor": right ? "start" : "end", fill: ink, "font-size": 10.5, "paint-order": "stroke", stroke: surf, "stroke-width": 3, "stroke-linejoin": "round" }, gAll);
          t.textContent = vl.label;
        }
      });

      // series
      var labs = [];
      series.forEach(function (s, si) {
        var col = cssVar(s.color, ink), xs = s.x || [], ys = s.y || [], d = "", pen = false, px = null, py = null, i;
        var wdt = s.width || 2, area = [];
        var arrows = [];
        for (i = 0; i < xs.length; i++) {
          var xv = xs[i], yv = ys[i];
          if (yv == null || xv == null || !isFinite(yv) || !isFinite(xv) || (ylog && yv <= 0)) {
            if (ylog && yv <= 0 && o.clipY && isFinite(yv)) { yv = ylo; } else { pen = false; continue; }
          }
          var cl = yv;
          if (o.clipY) { if (yv < ylo) { cl = ylo; arrows.push([sx(xv), 1]); } else if (yv > yhi) { cl = yhi; arrows.push([sx(xv), -1]); } }
          var X = sx(xv), Y = sy(cl);
          if (s.step && pen) { d += "H" + X.toFixed(1) + "V" + Y.toFixed(1); }
          else d += (pen ? "L" : "M") + X.toFixed(1) + " " + Y.toFixed(1);
          pen = true; px = X; py = Y;
        }
        if (d) {
          if (s.area) { el("path", { d: d + "L" + px + " " + (mt + ph) + "L" + sx(xs[0]) + " " + (mt + ph) + "Z", fill: col, "fill-opacity": 0.14, stroke: "none" }, plot); }
          el("path", { d: d, fill: "none", stroke: col, "stroke-width": wdt, "stroke-dasharray": DASH[s.dash || "solid"], "stroke-linecap": s.dash === "dotted" ? "round" : "butt", "stroke-linejoin": "round", "data-series": s.id }, plot);
        }
        if (s.marker && xs.length) {
          var every = Math.max(1, Math.ceil(xs.length / 9));
          for (i = 0; i < xs.length; i += every) {
            var yy = ys[i]; if (yy == null || !isFinite(yy) || (ylog && yy <= 0)) continue;
            if (yy < ylo || yy > yhi) continue;
            el("path", { d: markerPath(s.marker, sx(xs[i]), sy(yy), 3.3), fill: surf, stroke: col, "stroke-width": 1.5 }, plot);
          }
        }
        arrows.slice(0, 12).forEach(function (a) {
          var yA = a[1] > 0 ? mt + ph - 1 : mt + 1;
          el("path", { d: "M" + a[0] + " " + yA + "l-3.5 " + (a[1] > 0 ? -6 : 6) + "h7z", fill: col }, plot);
        });
        if (seriesLabelsOn(s) && w >= 480) {
          // last finite point
          for (i = xs.length - 1; i >= 0; i--) { if (ys[i] != null && isFinite(ys[i]) && !(ylog && ys[i] <= 0)) break; }
          if (i >= 0) { var yy2 = Math.max(ylo, Math.min(yhi, ys[i])); labs.push({ y: sy(yy2), i: si, x: sx(xs[i]), col: col, text: s.label }); }
        }
      });
      // points
      (o.points || []).forEach(function (pt) {
        var s = null; series.forEach(function (q) { if (q.id === pt.series) s = q; });
        var xv0 = pt.x, yv, col = ink;
        if (pt.y != null) { yv = pt.y; if (s) col = cssVar(s.color, ink); }
        else {
          if (!s) return;
          var k = nearestIndex(s, pt.x); if (k < 0) return;
          yv = s.y[k]; xv0 = s.x[k]; col = cssVar(s.color, ink);
        }
        if (yv == null || !isFinite(yv) || (ylog && yv <= 0)) return;
        if (xv0 < xlo || xv0 > xhi) return;
        yv = Math.max(ylo, Math.min(yhi, yv));
        if (pt.marker !== false) {
          var p = el("path", { d: markerPath("diamond", sx(xv0), sy(yv), 3.6), fill: col, stroke: surf, "stroke-width": 1.2 }, plot);
          var tt = el("title", null, p); tt.textContent = pt.label || "";
        }
        if (pt.text && pt.label) {
          var px = sx(xv0), anchor = px > ml + pw * 0.75 ? "end" : "start";
          var ptx = el("text", { x: px + (anchor === "end" ? -6 : 6), y: Math.max(mt + 10, sy(yv) - 6), "text-anchor": anchor, fill: ink, "font-size": 10.5, "paint-order": "stroke", stroke: surf, "stroke-width": 3, "stroke-linejoin": "round" }, gAll);
          ptx.textContent = pt.label;
        }
      });
      // end labels
      if (labs.length) {
        var pos = spreadLabels(labs.map(function (l) { return { y: l.y, i: l.i }; }), 13, mt + 6, mt + ph - 2);
        labs.forEach(function (l) {
          var t = el("text", { x: Math.min(l.x + 6, ml + pw + 6), y: pos[l.i] + 3.5, fill: l.col, "font-size": 11, "font-weight": 600 }, gAll);
          t.textContent = l.text;
          if (Math.abs(pos[l.i] - l.y) > 3) el("line", { x1: l.x + 1, y1: l.y, x2: l.x + 5, y2: pos[l.i], stroke: l.col, "stroke-width": 0.8 }, gAll);
        });
      }
      // cursor
      cursorDots = [];
      if (o.cursor) {
        cursorLine = el("line", { y1: mt, y2: mt + ph, stroke: accent, "stroke-width": 1.6, visibility: "hidden", "pointer-events": "none" }, gAll);
        series.forEach(function (s) {
          cursorDots.push(el("circle", { r: 4, fill: cssVar(s.color, ink), stroke: surf, "stroke-width": 1.5, visibility: "hidden", "pointer-events": "none" }, gAll));
        });
        var hit = el("rect", { x: ml, y: mt, width: pw, height: ph, fill: "transparent", style: "cursor:ew-resize;touch-action:pan-y" }, gAll);
        var dragging = false;
        function xFromEvent(e) {
          var r = svg.getBoundingClientRect(), px = (e.clientX - r.left) * (w / r.width);
          var f = (px - ml) / pw; f = Math.max(0, Math.min(1, f));
          var v = xlog ? Math.exp(Math.log(xd[0]) + f * (Math.log(xd[1]) - Math.log(xd[0]))) : xd[0] + f * (xd[1] - xd[0]);
          return snap(v);
        }
        hit.addEventListener("pointerdown", function (e) { dragging = true; try { hit.setPointerCapture(e.pointerId); } catch (_) {} userMove(xFromEvent(e)); });
        hit.addEventListener("pointermove", function (e) {
          if (dragging) userMove(xFromEvent(e));
          else showReadout(xFromEvent(e), true);
        });
        hit.addEventListener("pointerup", function () { dragging = false; });
        hit.addEventListener("pointercancel", function () { dragging = false; });
        hit.addEventListener("pointerleave", function () { if (!dragging) showReadout(cursorX, false); });
        svg.setAttribute("tabindex", "0");
        svg.addEventListener("keydown", function (e) {
          var k = e.key, step = 0;
          if (k === "ArrowLeft") step = -1; else if (k === "ArrowRight") step = 1; else return;
          e.preventDefault(); e.stopPropagation();
          var cur = cursorX == null ? xd[0] : cursorX;
          userMove(snap(cur + step * stepSize()));
        });
      }
      plotWrap.appendChild(svg);
      placeCursor();
      buildLegend();
    }

    function stepSize() {
      var s = (o.series || [])[0]; if (!s || !s.x || s.x.length < 2) return 1;
      return Math.abs(s.x[1] - s.x[0]) || 1;
    }
    function snap(v) {
      var s = (o.series || []).filter(function (q) { return q.x && q.x.length > 1; })[0];
      if (!s) return v;
      var k = nearestIndex(s, v); return k < 0 ? v : s.x[k];
    }
    function userMove(x) {
      setCursor(x);
      cbs.forEach(function (f) { try { f(x); } catch (e) { if (window.console) console.error(e); } });
    }
    function readoutText(x) {
      var parts = [(o.x && o.x.short ? o.x.short : (o.x && o.x.label ? o.x.label.split(" (")[0] : "x")) + " " + fmtNum(x)];
      (o.series || []).forEach(function (s) {
        if (s.readout === false || !s.x || !s.x.length) return;
        var k = nearestIndex(s, x);
        if (k >= 0 && Math.abs(s.x[k] - x) <= (stepSize() * 0.51)) parts.push((s.label || s.id) + " " + fmtVal(s.y[k]));
      });
      return parts.join("  ·  ");
    }
    function showReadout(x, hover) {
      if (x == null) { readout.textContent = o.cursor ? "Click or drag on the chart, or use the Left and Right keys, to move the cursor." : ""; readout.classList.add("is-hint"); return; }
      readout.classList.remove("is-hint");
      readout.textContent = readoutText(x) + (hover ? "" : "");
      if (hover) readout.classList.add("is-hover"); else readout.classList.remove("is-hover");
    }
    function placeCursor() {
      if (!svg || !cursorLine) return;
      if (cursorX == null || !geom) { cursorLine.setAttribute("visibility", "hidden"); cursorDots.forEach(function (d) { d.setAttribute("visibility", "hidden"); }); return; }
      var X = geom.sx(cursorX);
      cursorLine.setAttribute("x1", X); cursorLine.setAttribute("x2", X); cursorLine.setAttribute("visibility", "visible");
      (o.series || []).forEach(function (s, i) {
        var d = cursorDots[i]; if (!d) return;
        var k = nearestIndex(s, cursorX), yv = k >= 0 ? s.y[k] : null;
        if (yv == null || !isFinite(yv) || Math.abs(s.x[k] - cursorX) > stepSize() * 0.51 || (o.y && o.y.log && yv <= 0) || s.readout === false) { d.setAttribute("visibility", "hidden"); return; }
        var lo = Math.min(geom.yd[0], geom.yd[1]), hi = Math.max(geom.yd[0], geom.yd[1]);
        yv = Math.max(lo, Math.min(hi, yv));
        d.setAttribute("cx", X); d.setAttribute("cy", geom.sy(yv)); d.setAttribute("visibility", "visible");
      });
    }
    function setCursor(x) { cursorX = x; placeCursor(); showReadout(x, false); }

    function buildLegend() {
      legend.innerHTML = "";
      var items = (o.series || []).filter(function (s) { return s.legend !== false && s.label; });
      var extra = (o.bands || []).length ? 1 : 0;
      if (items.length < 2) { legend.hidden = true; return; }
      legend.hidden = false;
      var ink = cssVar("--ink", "#1b2333");
      items.forEach(function (s) {
        var li = html("li", "rp-chart__key");
        var sw = el("svg", { width: 34, height: 12, viewBox: "0 0 34 12", "aria-hidden": "true" });
        el("line", { x1: 1, x2: 33, y1: 6, y2: 6, stroke: cssVar(s.color, ink), "stroke-width": s.width || 2, "stroke-dasharray": DASH[s.dash || "solid"], "stroke-linecap": s.dash === "dotted" ? "round" : "butt" }, sw);
        if (s.marker) el("path", { d: markerPath(s.marker, 17, 6, 3.3), fill: cssVar("--surface", "#fff"), stroke: cssVar(s.color, ink), "stroke-width": 1.5 }, sw);
        li.appendChild(sw); li.appendChild(document.createTextNode(" " + s.label));
        legend.appendChild(li);
      });
    }

    function buildTable() {
      tableWrap.innerHTML = "";
      var series = (o.series || []).filter(function (s) { return s.table !== false && s.x && s.x.length; });
      if (o.tableData) {
        var tt2 = html("table", "table table--compact");
        tt2.appendChild(html("caption", "visually-hidden", (o.title || "Chart") + ": values"));
        var th2 = html("thead"), tr2 = html("tr");
        o.tableData.head.forEach(function (c) { var x = html("th", null, c); x.scope = "col"; tr2.appendChild(x); });
        th2.appendChild(tr2); tt2.appendChild(th2);
        var tb3 = html("tbody");
        o.tableData.rows.slice(0, 200).forEach(function (rw) { var r = html("tr"); rw.forEach(function (c, ci) { r.appendChild(html("td", ci ? "num" : null, c)); }); tb3.appendChild(r); });
        tt2.appendChild(tb3); tableWrap.appendChild(tt2);
        if (o.tableData.rows.length > 200) tableWrap.appendChild(html("p", "rp-chart__tblnote", "Showing the first 200 of " + o.tableData.rows.length + " rows."));
        return;
      }
      var tbl = html("table", "table table--compact");
      var cap = html("caption", "visually-hidden", (o.title || "Chart") + ": values"); tbl.appendChild(cap);
      var LIMIT = 200, shown = 0, total = 0;
      var shared = series.length > 0 && series.every(function (s) { return s.x.length === series[0].x.length && s.x.every(function (v, i) { return v === series[0].x[i]; }); });
      var thead = html("thead"), tr = html("tr");
      function th(t) { var c = html("th", null, t); c.scope = "col"; tr.appendChild(c); }
      if (shared) {
        th((o.x && o.x.label) || "x"); series.forEach(function (s) { th(s.label || s.id); });
        thead.appendChild(tr); tbl.appendChild(thead);
        var tb = html("tbody"); total = series[0].x.length;
        series[0].x.forEach(function (xv, i) {
          if (i >= LIMIT) return; shown++;
          var r = html("tr"); r.appendChild(html("td", "num", fmtNum(xv)));
          series.forEach(function (s) { r.appendChild(html("td", "num", fmtVal(s.y[i]))); });
          tb.appendChild(r);
        });
        tbl.appendChild(tb);
      } else {
        th("Series"); th((o.x && o.x.label) || "x"); th((o.y && o.y.label) || "y");
        thead.appendChild(tr); tbl.appendChild(thead);
        var tb2 = html("tbody");
        series.forEach(function (s) { s.x.forEach(function (xv, i) { total++; if (shown >= LIMIT) return; shown++; var r = html("tr"); r.appendChild(html("td", null, s.label || s.id)); r.appendChild(html("td", "num", fmtNum(xv))); r.appendChild(html("td", "num", fmtVal(s.y[i]))); tb2.appendChild(r); }); });
        tbl.appendChild(tb2);
      }
      tableWrap.appendChild(tbl);
      if (total > shown) tableWrap.appendChild(html("p", "rp-chart__tblnote", "Showing the first " + shown + " of " + total + " rows. The full numbers are in the data files."));
    }

    function applyMode() {
      tableWrap.hidden = !showTable; plotWrap.hidden = showTable; legend.style.display = showTable ? "none" : "";
      readout.style.display = showTable ? "none" : "";
      tblBtn.textContent = showTable ? "View as chart" : "View as table";
      tblBtn.setAttribute("aria-pressed", showTable ? "true" : "false");
      if (showTable) buildTable(); else render();
    }
    tblBtn.addEventListener("click", function () { showTable = !showTable; applyMode(); });

    function schedule() { if (rafId) return; rafId = requestAnimationFrame(function () { rafId = 0; if (!showTable) render(); }); }
    var ro = null;
    if (window.ResizeObserver) { var lastW = 0; ro = new ResizeObserver(function () { var w = plotWrap.clientWidth; if (w && Math.abs(w - lastW) > 1) { lastW = w; schedule(); } }); ro.observe(plotWrap); }
    else window.addEventListener("resize", schedule);
    function onTheme() { if (!showTable) render(); }
    document.addEventListener("site:theme", onTheme);

    titleEl.textContent = o.title || "";
    titleEl.hidden = !!o.hideTitle;
    showReadout(null);
    render();

    return {
      setCursor: setCursor,
      onCursor: function (f) { cbs.push(f); },
      update: function (part) {
        for (var k in part) o[k] = part[k];
        titleEl.textContent = o.title || "";
        if (showTable) buildTable(); else render();
      },
      el: root,
      destroy: function () {
        destroyed = true; try { if (ro) ro.disconnect(); } catch (e) {}
        document.removeEventListener("site:theme", onTheme);
        if (root.parentNode) root.parentNode.removeChild(root);
      }
    };
  };

  // A missing data object prints one line instead of throwing.
  (function () {
    var f = R.Chart;
    R.Chart = function (container, opts) {
      try {
        if (!container) return null;
        if (!opts || !opts.series) throw new Error("no data given");
        return f(container, opts);
      } catch (e) {
        var p = document.createElement("p"); p.className = "rp-error"; p.textContent = "This chart could not be drawn (" + e.message + ").";
        if (container) container.appendChild(p);
        if (window.console) console.warn("Replay.Chart", e);
        return null;
      }
    };
  })();
})();
