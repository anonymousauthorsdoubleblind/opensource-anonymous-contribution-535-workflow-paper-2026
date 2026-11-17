/* WP3 shared helpers for the module pages. Registers window.MD. */
(function () {
  "use strict";
  var MD = window.MD = {};
  var SUBS = {"₀":"0","₁":"1","₂":"2","₃":"3","₄":"4","₅":"5","₆":"6","₇":"7","₈":"8","₉":"9","ₕ":"h"};

  MD.esc = function (s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  };
  // Escaped HTML with true subscripts for unicode subscript runs and superscript -1.
  MD.rich = function (s) {
    var t = MD.esc(s);
    t = t.replace(/[₀-₉ₕ]+/g, function (m) {
      return "<sub>" + m.split("").map(function (c) { return SUBS[c]; }).join("") + "</sub>";
    });
    return t.replace(/⁻¹/g, "<sup>−1</sup>");
  };
  MD.h = function (tag, attrs, kids) {
    var e = document.createElement(tag), k;
    if (attrs) for (k in attrs) {
      if (!Object.prototype.hasOwnProperty.call(attrs, k) || attrs[k] === null || attrs[k] === undefined) continue;
      if (k === "text") e.textContent = attrs[k];
      else if (k === "html") e.innerHTML = attrs[k];
      else if (k === "rich") e.innerHTML = MD.rich(attrs[k]);
      else if (k.slice(0, 2) === "on" && typeof attrs[k] === "function") e.addEventListener(k.slice(2), attrs[k]);
      else e.setAttribute(k === "cls" ? "class" : k, attrs[k]);
    }
    (kids || []).forEach(function (c) {
      if (c === null || c === undefined) return;
      e.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return e;
  };
  var NS = "http://www.w3.org/2000/svg";
  MD.svg = function (tag, attrs, kids) {
    var e = document.createElementNS(NS, tag), k;
    if (attrs) for (k in attrs) {
      if (!Object.prototype.hasOwnProperty.call(attrs, k) || attrs[k] === null || attrs[k] === undefined) continue;
      if (k === "text") e.textContent = attrs[k];
      else if (k.slice(0, 2) === "on" && typeof attrs[k] === "function") e.addEventListener(k.slice(2), attrs[k]);
      else e.setAttribute(k === "cls" ? "class" : k, attrs[k]);
    }
    (kids || []).forEach(function (c) { if (c) e.appendChild(c); });
    return e;
  };
  MD.$ = function (id) { return document.getElementById(id); };
  MD.clear = function (el) { while (el && el.firstChild) el.removeChild(el.firstChild); return el; };
  MD.minus = function (s) { return String(s).replace(/-/g, "−"); };
  MD.num = function (x, d) {
    if (x === null || x === undefined || isNaN(x)) return "–";
    var s = Number(x).toFixed(d === undefined ? 2 : d);
    return MD.minus(s);
  };
  MD.signed = function (x, d) { return (x > 0 ? "+" : "") + MD.num(x, d); };
  MD.cssVar = function (name, fallback) {
    var v = "";
    try { v = getComputedStyle(document.documentElement).getPropertyValue(name).trim(); } catch (e) {}
    return v || fallback || "#888";
  };
  MD.onTheme = function (fn) { document.addEventListener("site:theme", fn); };
  MD.reduced = function () { try { return !!(window.Site && Site.reducedMotion && Site.reducedMotion()); } catch (e) { return false; } };
  MD.ready = function (fn) {
    if (window.Site && Site.onReady) Site.onReady(fn);
    else if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);
    else fn();
  };
  // Run a block; on failure print a one-line message into the host and keep the page alive.
  MD.guard = function (host, name, fn) {
    try { fn(); }
    catch (e) {
      if (window.console && console.warn) console.warn("[" + name + "]", e);
      if (host) { MD.clear(host); host.appendChild(MD.h("p", {cls: "md-missing", text: "This panel could not be drawn (" + name + ")."})); }
    }
  };
  MD.needReplay = function (host, parts) {
    var ok = !!window.Replay, i;
    for (i = 0; ok && parts && i < parts.length; i++) ok = ok && !!window.Replay[parts[i]];
    if (!ok && host) { MD.clear(host); host.appendChild(MD.h("p", {cls: "md-missing", text: "Replay component not loaded."})); }
    return ok;
  };
  MD.needData = function (host, name) {
    var ok = !!window[name];
    if (!ok && host) { MD.clear(host); host.appendChild(MD.h("p", {cls: "md-missing", text: "Data file not loaded (" + name + ")."})); }
    return ok;
  };

  // table: cols = ["Head", ...] or [{label, num, sortKey}], rows = arrays of strings (rich) or {html}
  MD.table = function (cols, rows, opts) {
    opts = opts || {};
    var thead = MD.h("tr"), tbody = MD.h("tbody");
    cols.forEach(function (c, i) {
      c = typeof c === "string" ? {label: c} : c;
      var th = MD.h("th", {scope: "col"});
      if (opts.sortable && c.sortable !== false) {
        th.appendChild(MD.h("button", {cls: "md-sortbtn", type: "button", rich: c.label, "aria-label": "Sort by " + c.label,
          onclick: function () { opts.sortable(i); }}));
      } else th.innerHTML = MD.rich(c.label);
      thead.appendChild(th);
    });
    rows.forEach(function (r, ri) {
      var tr = MD.h("tr");
      if (opts.rowAttr) { var at = opts.rowAttr(r, ri); for (var k in at) tr.setAttribute(k, at[k]); }
      r.forEach(function (cell, i) {
        var c = typeof cols[i] === "string" ? {} : cols[i];
        var td = MD.h("td", {cls: c.num ? "num" : null});
        if (cell && typeof cell === "object" && cell.node) td.appendChild(cell.node);
        else td.innerHTML = MD.rich(cell === null || cell === undefined ? "" : cell);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    var t = MD.h("table", {cls: "table table--compact"}, [opts.caption ? MD.h("caption", {rich: opts.caption}) : null, MD.h("thead", null, [thead]), tbody]);
    return MD.h("div", {cls: "table-wrap"}, [t]);
  };

  // Segmented control (radiogroup) with arrow-key support.
  MD.seg = function (host, items, value, onChange) {
    MD.clear(host);
    var btns = [];
    function set(v, fire) {
      btns.forEach(function (b) {
        var on = b.getAttribute("data-v") === String(v);
        b.setAttribute("aria-checked", on ? "true" : "false");
        b.tabIndex = on ? 0 : -1;
      });
      if (fire) onChange(v);
    }
    items.forEach(function (it) {
      var b = MD.h("button", {type: "button", role: "radio", "data-v": it.value, rich: it.label,
        onclick: function () { set(it.value, true); },
        onkeydown: function (ev) {
          var i = btns.indexOf(b), n = -1;
          if (ev.key === "ArrowRight" || ev.key === "ArrowDown") n = (i + 1) % btns.length;
          else if (ev.key === "ArrowLeft" || ev.key === "ArrowUp") n = (i - 1 + btns.length) % btns.length;
          if (n >= 0) { ev.preventDefault(); btns[n].focus(); set(items[n].value, true); }
        }});
      btns.push(b); host.appendChild(b);
    });
    set(value, false);
    return {set: function (v) { set(v, false); }};
  };

  // Chart/table switch for own SVG charts. views = [{value,label,node}]
  MD.viewSwitch = function (host, views, start) {
    MD.clear(host);
    var bar = MD.h("div", {cls: "md-controls"}), segHost = MD.h("div", {cls: "seg", role: "radiogroup", "aria-label": "View"});
    bar.appendChild(segHost); host.appendChild(bar);
    var body = MD.h("div"); host.appendChild(body);
    function show(v) {
      views.forEach(function (x) { x.node.hidden = x.value !== v; });
    }
    views.forEach(function (x) { body.appendChild(x.node); });
    var s = MD.seg(segHost, views.map(function (x) { return {value: x.value, label: x.label}; }), start || views[0].value, show);
    show(start || views[0].value);
    return {show: function (v) { s.set(v); show(v); }};
  };

  // Tooltip inside a position:relative host.
  MD.tip = function (host) {
    host.classList.add("md-rel");
    var tip = MD.h("div", {cls: "md-tip", role: "status"}); tip.hidden = true; host.appendChild(tip);
    return {
      show: function (html, ev, anchor) {
        tip.innerHTML = html; tip.hidden = false;
        var hr = host.getBoundingClientRect(), x, y;
        if (ev && ev.clientX !== undefined && ev.type && ev.type.indexOf("mouse") === 0) { x = ev.clientX - hr.left; y = ev.clientY - hr.top; }
        else if (anchor) { var ar = anchor.getBoundingClientRect(); x = ar.left - hr.left + ar.width / 2; y = ar.top - hr.top; }
        else { x = 10; y = 10; }
        var w = tip.offsetWidth;
        tip.style.left = Math.max(4, Math.min(hr.width - w - 4, x + 12)) + "px";
        tip.style.top = Math.max(4, y - tip.offsetHeight - 8) + "px";
      },
      hide: function () { tip.hidden = true; }
    };
  };

  // Legend entry: sample line (dash pattern) + text
  MD.legendItem = function (cssVar, dash, label, marker) {
    var arr = {solid: "", dashed: "6 4", dotted: "1.5 3.5", dashdot: "7 3 1.5 3"}[dash || "solid"] || "";
    var s = MD.svg("svg", {viewBox: "0 0 34 10", "aria-hidden": "true"}, [
      MD.svg("line", {x1: 1, x2: 33, y1: 5, y2: 5, stroke: "var(" + cssVar + ")", "stroke-width": 2.2, "stroke-dasharray": arr}),
      marker === "square" ? MD.svg("rect", {x: 14, y: 2, width: 6, height: 6, fill: "var(" + cssVar + ")"}) : null]);
    return MD.h("span", null, [s, document.createTextNode(label)]);
  };

  // Gaussian helper
  MD.gauss = function (x, mu, fwhm) { var s = fwhm / 2.354820045; return Math.exp(-0.5 * Math.pow((x - mu) / s, 2)); };

  MD.nice = function (v, steps) {
    var raw = v / (steps || 5), p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
    return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p;
  };
})();
