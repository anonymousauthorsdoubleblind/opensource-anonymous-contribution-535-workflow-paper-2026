/* Replay.Mol: ball-and-stick viewer. 3Dmol when WebGL works, otherwise a 2D canvas projection. */
(function () {
  "use strict";
  var R = (window.Replay = window.Replay || {});
  var COL = { C: "#4a5263", H: "#c9ced8", N: "#3f6fd1", O: "#d1493f" };
  var RAD = { C: 1.0, H: 0.62, N: 0.98, O: 0.96 };
  var DEF_CUT = { "default": 1.75, "H-C": 1.25, "H-N": 1.2, "H-O": 1.15, "H-H": 0 };
  var HEIGHT_RANGE = 0.45;

  function cssVar(n, fb) {
    try {
      if (window.Site && Site.cssVar) { var v = Site.cssVar(n); if (v) return v; }
      var s = getComputedStyle(document.documentElement).getPropertyValue(n).trim();
      return s || fb;
    } catch (e) { return fb; }
  }
  function toPoints(c, n) {
    // accepts [[x,y,z],...] or a flat array
    var out = [], i;
    if (!c) return out;
    if (typeof c[0] === "number") { for (i = 0; i + 2 < c.length; i += 3) out.push([c[i], c[i + 1], c[i + 2]]); return out; }
    for (i = 0; i < c.length; i++) out.push([+c[i][0], +c[i][1], +c[i][2]]);
    return out;
  }
  function hex(c) { var m = /^#?([0-9a-f]{6})$/i.exec(c); return m ? parseInt(m[1], 16) : 0x888888; }
  function mix(a, b, t) {
    var r = [16, 8, 0].map(function (s) { var x = (a >> s) & 255, y = (b >> s) & 255; return Math.round(x + (y - x) * t); });
    return (r[0] << 16) | (r[1] << 8) | r[2];
  }
  function css(n) { var s = (n | 0).toString(16); while (s.length < 6) s = "0" + s; return "#" + s; }

  // --- geometry helpers (pure; also used by the node smoke test) ---
  function centroid(P) {
    var c = [0, 0, 0]; if (!P.length) return c;
    P.forEach(function (p) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; });
    return [c[0] / P.length, c[1] / P.length, c[2] / P.length];
  }
  function normalOf(P) {
    // plane normal = eigenvector of the smallest eigenvalue of the covariance matrix (power iteration on shifted matrix)
    var c = centroid(P), S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], i, j, k;
    P.forEach(function (p) { var d = [p[0] - c[0], p[1] - c[1], p[2] - c[2]]; for (i = 0; i < 3; i++) for (j = 0; j < 3; j++) S[i][j] += d[i] * d[j]; });
    var tr = S[0][0] + S[1][1] + S[2][2];
    var M = [[tr - S[0][0], -S[0][1], -S[0][2]], [-S[1][0], tr - S[1][1], -S[1][2]], [-S[2][0], -S[2][1], tr - S[2][2]]];
    var v = [0.31, 0.57, 0.77];
    for (k = 0; k < 80; k++) {
      var w = [0, 0, 0];
      for (i = 0; i < 3; i++) for (j = 0; j < 3; j++) w[i] += M[i][j] * v[j];
      var nn = Math.sqrt(w[0] * w[0] + w[1] * w[1] + w[2] * w[2]) || 1;
      v = [w[0] / nn, w[1] / nn, w[2] / nn];
    }
    return v;
  }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function norm(a) { var n = Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]) || 1; return [a[0] / n, a[1] / n, a[2] / n]; }
  function matMul(A, B) {
    var C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], i, j, k;
    for (i = 0; i < 3; i++) for (j = 0; j < 3; j++) for (k = 0; k < 3; k++) C[i][j] += A[i][k] * B[k][j];
    return C;
  }
  function rotX(a) { var c = Math.cos(a), s = Math.sin(a); return [[1, 0, 0], [0, c, -s], [0, s, c]]; }
  function rotY(a) { var c = Math.cos(a), s = Math.sin(a); return [[c, 0, s], [0, 1, 0], [-s, 0, c]]; }
  function apply(M, p) { return [M[0][0] * p[0] + M[0][1] * p[1] + M[0][2] * p[2], M[1][0] * p[0] + M[1][1] * p[1] + M[1][2] * p[2], M[2][0] * p[0] + M[2][1] * p[1] + M[2][2] * p[2]]; }
  // base frame: rows = in-plane axis u, in-plane axis v, normal n  -> maps a point into (u,v,n) coordinates
  function baseFrame(P) {
    var n = normalOf(P);
    var ref = Math.abs(n[0]) < 0.8 ? [1, 0, 0] : [0, 1, 0];
    var u = norm(cross(ref, n)); var v = cross(n, u);
    // rotate in the plane so that u is the long axis of the structure (landscape views)
    var c = centroid(P), sxx = 0, syy = 0, sxy = 0;
    P.forEach(function (p) {
      var d = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
      var a = d[0] * u[0] + d[1] * u[1] + d[2] * u[2], b = d[0] * v[0] + d[1] * v[1] + d[2] * v[2];
      sxx += a * a; syy += b * b; sxy += a * b;
    });
    var th = 0.5 * Math.atan2(2 * sxy, sxx - syy), ct = Math.cos(th), st = Math.sin(th);
    var u2 = [ct * u[0] + st * v[0], ct * u[1] + st * v[1], ct * u[2] + st * v[2]];
    var v2 = cross(n, u2);
    return [u2, v2, n];
  }
  function viewMatrix(B, name) {
    // screen x = u, screen y = v (up is -v on a canvas, handled at draw time), depth = n (toward viewer = +)
    // top: look along the normal. side: look along v (edge-on). tilt: top tilted 60 degrees about u.
    var a = name === "side" ? Math.PI / 2 - 0.12 : name === "top" ? 0 : Math.PI / 3;
    return matMul(rotX(a), B);
  }
  function bondsFor(symbols, P, cut) {
    var c = {}, k; for (k in DEF_CUT) c[k] = DEF_CUT[k]; if (cut) for (k in cut) c[k] = cut[k];
    var out = [], i, j;
    for (i = 0; i < P.length; i++) for (j = i + 1; j < P.length; j++) {
      var a = symbols[i], b = symbols[j];
      var lim = c[a + "-" + b]; if (lim === undefined) lim = c[b + "-" + a]; if (lim === undefined) lim = c["default"];
      if (!(lim > 0)) continue;
      var dx = P[i][0] - P[j][0], dy = P[i][1] - P[j][1], dz = P[i][2] - P[j][2];
      if (dx * dx + dy * dy + dz * dz <= lim * lim) out.push([i, j]);
    }
    return out;
  }
  function heightColor(h) {
    var t = Math.max(-1, Math.min(1, h / HEIGHT_RANGE));
    var mid = 0xe8e8e8, lo = 0x2f6fdd, hi = 0xd23a2e;
    return t < 0 ? mix(mid, lo, -t) : mix(mid, hi, t);
  }
  R._molPure = { toPoints: toPoints, bondsFor: bondsFor, normalOf: normalOf, baseFrame: baseFrame, viewMatrix: viewMatrix, heightColor: heightColor, centroid: centroid };

  function webglOK() {
    try {
      var c = document.createElement("canvas");
      return !!(c.getContext("webgl") || c.getContext("experimental-webgl"));
    } catch (e) { return false; }
  }

  R.Mol = function (container, opts) {
    opts = opts || {};
    var root = document.createElement("div");
    root.className = "rp-mol";
    var stage = document.createElement("div");
    stage.className = "rp-mol__stage";
    stage.style.height = (opts.height || 360) + "px";
    root.appendChild(stage);
    var noteEl = document.createElement("p");
    noteEl.className = "rp-mol__note"; noteEl.hidden = true;
    root.appendChild(noteEl);
    container.appendChild(root);

    var symbols = (opts.symbols || []).slice();
    var P = toPoints(opts.coords);
    var P0 = P.slice();               // start geometry fixes the frame
    var C0 = centroid(P0);
    var B = baseFrame(P0.length ? P0 : [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]]);
    var viewName = opts.view || "tilt";
    var colorBy = opts.colorBy || null;
    var overlays = {};
    var cut = opts.bondCutoff || null;
    var radius = 1;
    P0.forEach(function (p) { var d = Math.hypot(p[0] - C0[0], p[1] - C0[1], p[2] - C0[2]); if (d > radius) radius = d; });
    var self = { isFallback: false };
    var destroyed = false;
    var gl = null, rot = null, off = null;   // 3Dmol viewer ; fallback state

    root.setAttribute("role", "img");
    root.setAttribute("aria-label", opts.label || "Molecular structure");

    function bg() { return cssVar("--surface", "#f6f8fb"); }

    // ---------- common: geometry in view frame ----------
    function heights(pts) {
      var n = B[2];
      return pts.map(function (p) { return (p[0] - C0[0]) * n[0] + (p[1] - C0[1]) * n[1] + (p[2] - C0[2]) * n[2]; });
    }
    function colors(pts) {
      var h = colorBy === "height" ? heights(pts) : null;
      return symbols.map(function (s, i) { return h ? heightColor(h[i]) : hex(COL[s] || "#888888"); });
    }

    // ---------- 3Dmol path ----------
    function glInit() {
      if (!(window.$3Dmol && webglOK())) return false;
      try {
        stage.innerHTML = "";
        var holder = document.createElement("div");
        holder.style.cssText = "position:relative;width:100%;height:100%";
        stage.appendChild(holder);
        gl = $3Dmol.createViewer(holder, { backgroundColor: bg(), antialias: true });
        if (!gl) return false;
        glDraw(true);
        return true;
      } catch (e) { gl = null; return false; }
    }
    function glRotated(pts) {
      var M = viewMatrix(B, viewName);
      return pts.map(function (p) { var q = apply(M, [p[0] - C0[0], p[1] - C0[1], p[2] - C0[2]]); return [q[0], q[1], q[2]]; });
    }
    function glAddModel(pts, cols, opacity) {
      var bonds = bondsFor(symbols, pts, cut), at = [], i;
      for (i = 0; i < pts.length; i++) at.push({ elem: symbols[i], x: pts[i][0], y: pts[i][1], z: pts[i][2], serial: i, bonds: [], bondOrder: [] });
      bonds.forEach(function (b) { at[b[0]].bonds.push(b[1]); at[b[0]].bondOrder.push(1); at[b[1]].bonds.push(b[0]); at[b[1]].bondOrder.push(1); });
      var m = gl.addModel();
      m.addAtoms(at);
      for (i = 0; i < at.length; i++) {
        var c = css(cols[i]);
        m.setStyle({ serial: i }, { stick: { radius: 0.14, color: c, opacity: opacity }, sphere: { scale: 0.28, color: c, opacity: opacity } });
      }
      return m;
    }
    function glDraw(first) {
      if (!gl) return;
      gl.removeAllModels();
      glAddModel(glRotated(P), colors(P), 1);
      Object.keys(overlays).forEach(function (id) {
        var o = overlays[id];
        var cols = o.pts.map(function (_, i) { return hex(COL[symbols[i]] || "#888888"); });
        glAddModel(glRotated(o.pts), cols, o.opacity);
      });
      if (first) { gl.zoomTo(); gl.zoom(1.0); }
      gl.render();
    }

    // ---------- canvas fallback ----------
    function fbInit() {
      self.isFallback = true;
      stage.innerHTML = "";
      var cv = document.createElement("canvas");
      cv.className = "rp-mol__canvas";
      cv.tabIndex = 0;
      cv.setAttribute("aria-label", (opts.label || "Molecular structure") + ". Drag or use the arrow keys to rotate.");
      stage.appendChild(cv);
      rot = viewMatrix(B, viewName);
      off = { cv: cv, ctx: cv.getContext("2d"), w: 0, h: 0, dpr: 1 };
      var drag = null;
      cv.addEventListener("pointerdown", function (e) { drag = { x: e.clientX, y: e.clientY }; try { cv.setPointerCapture(e.pointerId); } catch (_) {} });
      cv.addEventListener("pointermove", function (e) {
        if (!drag) return;
        var dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
        rot = matMul(rotX(dy * 0.012), matMul(rotY(dx * 0.012), rot)); fbDraw();
      });
      function up() { drag = null; }
      cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
      cv.addEventListener("keydown", function (e) {
        var s = 0.12, k = e.key, used = true;
        if (k === "ArrowLeft") rot = matMul(rotY(-s), rot);
        else if (k === "ArrowRight") rot = matMul(rotY(s), rot);
        else if (k === "ArrowUp") rot = matMul(rotX(-s), rot);
        else if (k === "ArrowDown") rot = matMul(rotX(s), rot);
        else used = false;
        if (used) { e.preventDefault(); e.stopPropagation(); fbDraw(); }
      });
      fbSize();
      noteEl.hidden = false;
      noteEl.textContent = "3D acceleration is not available here: a simple 2D drawing is shown. Drag to rotate.";
    }
    function fbSize() {
      if (!off) return;
      var r = stage.getBoundingClientRect();
      var w = Math.max(160, Math.round(r.width)), h = Math.round(r.height) || (opts.height || 360);
      var dpr = Math.min(2, window.devicePixelRatio || 1);
      off.w = w; off.h = h; off.dpr = dpr;
      off.cv.width = Math.round(w * dpr); off.cv.height = Math.round(h * dpr);
      off.cv.style.width = w + "px"; off.cv.style.height = h + "px";
      fbDraw();
    }
    function fbDraw() {
      if (!off || destroyed) return;
      var ctx = off.ctx, w = off.w, h = off.h;
      ctx.setTransform(off.dpr, 0, 0, off.dpr, 0, 0);
      ctx.fillStyle = bg(); ctx.fillRect(0, 0, w, h);
      var scale = 0.40 * Math.min(w, h) / (radius + 0.6);
      var lineCol = cssVar("--muted", "#586279");
      var items = [];
      function collect(pts, cols, alpha, ovl) {
        var pr = pts.map(function (p) { var q = apply(rot, [p[0] - C0[0], p[1] - C0[1], p[2] - C0[2]]); return [w / 2 + q[0] * scale, h / 2 - q[1] * scale, q[2]]; });
        bondsFor(symbols, pts, cut).forEach(function (b) {
          items.push({ t: "b", z: (pr[b[0]][2] + pr[b[1]][2]) / 2 - 0.01, a: pr[b[0]], b: pr[b[1]], alpha: alpha, ca: cols[b[0]], cb: cols[b[1]] });
        });
        pr.forEach(function (p, i) { items.push({ t: "a", z: p[2], p: p, c: cols[i], el: symbols[i], alpha: alpha }); });
      }
      collect(P, colors(P), 1);
      Object.keys(overlays).forEach(function (id) {
        var o = overlays[id];
        collect(o.pts, o.pts.map(function (_, i) { return hex(COL[symbols[i]] || "#888888"); }), o.opacity);
      });
      items.sort(function (a, b) { return a.z - b.z; });
      items.forEach(function (it) {
        ctx.globalAlpha = it.alpha;
        if (it.t === "b") {
          ctx.lineCap = "round"; ctx.lineWidth = Math.max(2, scale * 0.2);
          var mx = (it.a[0] + it.b[0]) / 2, my = (it.a[1] + it.b[1]) / 2;
          ctx.strokeStyle = css(it.ca); ctx.beginPath(); ctx.moveTo(it.a[0], it.a[1]); ctx.lineTo(mx, my); ctx.stroke();
          ctx.strokeStyle = css(it.cb); ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(it.b[0], it.b[1]); ctx.stroke();
        } else {
          var r = Math.max(3, scale * 0.22 * (RAD[it.el] || 1));
          ctx.fillStyle = css(it.c); ctx.strokeStyle = lineCol; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(it.p[0], it.p[1], r, 0, 6.2832); ctx.fill(); ctx.stroke();
        }
      });
      ctx.globalAlpha = 1;
    }

    // ---------- public ----------
    function redraw() { if (self.isFallback) fbDraw(); else glDraw(false); }
    self.setCoords = function (c) {
      var pts = toPoints(c);
      if (pts.length !== symbols.length) return;
      P = pts; if (!P0.length) { P0 = pts.slice(); }
      redraw();
    };
    self.overlay = function (c, o) {
      o = o || {};
      overlays[o.id || "ref"] = { pts: toPoints(c), opacity: o.opacity == null ? 0.35 : o.opacity };
      redraw();
    };
    self.clearOverlay = function (id) { if (id) delete overlays[id]; else overlays = {}; redraw(); };
    self.setColorBy = function (m) { colorBy = m || null; redraw(); };
    self.setNote = function (txt) {
      if (txt) { noteEl.hidden = false; noteEl.textContent = txt; }
      else if (self.isFallback) { noteEl.hidden = false; noteEl.textContent = "3D acceleration is not available here: a simple 2D drawing is shown. Drag to rotate."; }
      else { noteEl.hidden = true; noteEl.textContent = ""; }
    };
    self.setView = function (name) {
      viewName = name || "tilt";
      if (self.isFallback) { rot = viewMatrix(B, viewName); fbDraw(); }
      else if (gl) { rebuildGl(); }
    };
    self.resetView = function () { self.setView(viewName); };
    function glDispose() {
      // stop the viewer's own observers, then release its WebGL context: browsers allow only a handful at a time
      try { if (gl && gl.divwatcher) gl.divwatcher.disconnect(); } catch (e) {}
      try { if (gl && gl.intwatcher) gl.intwatcher.disconnect(); } catch (e) {}
      try {
        var cv = gl && gl.getCanvas && gl.getCanvas();
        var cx = cv && (cv.getContext("webgl2") || cv.getContext("webgl"));
        var ext = cx && cx.getExtension && cx.getExtension("WEBGL_lose_context");
        if (ext) ext.loseContext();
      } catch (e) {}
    }
    function rebuildGl() {
      glDispose();
      stage.innerHTML = "";
      gl = null;
      if (!glInit()) { fbInit(); }
    }
    self.resize = function () {
      if (self.isFallback) fbSize();
      else if (gl) { try { gl.resize(); gl.render(); } catch (e) {} }
    };
    self.destroy = function () {
      destroyed = true;
      try { if (ro) ro.disconnect(); } catch (e) {}
      document.removeEventListener("site:theme", onTheme);
      glDispose();
      if (root.parentNode) root.parentNode.removeChild(root);
    };
    self.setHeight = function (px) { stage.style.height = px + "px"; self.resize(); };

    function onTheme() {
      if (self.isFallback) fbDraw();
      else if (gl) { try { gl.setBackgroundColor(bg()); gl.render(); } catch (e) {} }
    }
    document.addEventListener("site:theme", onTheme);
    var ro = null;
    if (window.ResizeObserver) { ro = new ResizeObserver(function () { if (!destroyed) self.resize(); }); ro.observe(stage); }
    else window.addEventListener("resize", self.resize);

    if (!glInit()) fbInit();
    return self;
  };

  // A missing data object prints one line instead of throwing.
  (function () {
    var f = R.Mol;
    R.Mol = function (container, opts) {
      try {
        if (!container) return null;
        if (!opts || !(opts.symbols && opts.coords)) throw new Error("no data given");
        return f(container, opts);
      } catch (e) {
        var p = document.createElement("p"); p.className = "rp-error"; p.textContent = "This mol could not be drawn (" + e.message + ").";
        if (container) container.appendChild(p);
        if (window.console) console.warn("Replay.Mol", e);
        return null;
      }
    };
  })();
})();
