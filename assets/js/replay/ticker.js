/* Replay.Ticker: decision cards that follow the player. */
(function () {
  "use strict";
  var R = (window.Replay = window.Replay || {});
  function mk(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  var STATUS = { accepted: "Accepted", clipped: "Clipped by the validator", rejected: "Rejected" };
  var OUTCOME = { kept: "Kept after probation", rolled_back: "Rolled back", "continue": "Run continued" };

  function paramsText(p) {
    if (!p || typeof p !== "object") return "";
    return Object.keys(p).map(function (k) { return k + ": " + p[k]; }).join(", ");
  }
  R._tickerPure = { paramsText: paramsText };

  R.Ticker = function (container, opts) {
    opts = opts || {};
    var items = (opts.items || []).slice().sort(function (a, b) { return a.step - b.step; });
    var root = mk("div", "rp-ticker");
    var list = mk("ol", "rp-ticker__list");
    list.setAttribute("aria-label", opts.ariaLabel || "Decisions of the supervision layer");
    var live = mk("div", "visually-hidden"); live.setAttribute("aria-live", "polite"); live.setAttribute("role", "status");
    var empty = mk("p", "rp-ticker__empty", opts.emptyText || "No decisions in this run.");
    root.appendChild(list); root.appendChild(empty); root.appendChild(live);
    container.appendChild(root);
    var cur = -1, current = -1, all = false, nodes = [], liveTimer = 0, destroyed = false;

    function build() {
      list.innerHTML = ""; nodes = [];
      empty.hidden = items.length > 0;
      items.forEach(function (it, i) {
        var li = mk("li", "rp-ticker__item");
        var head = mk("button", "rp-ticker__head"); head.type = "button";
        head.setAttribute("aria-expanded", "false");
        var tt = mk("span", "rp-ticker__title", it.title || "Decision");
        if (!/^Step\s/.test(it.title || "")) head.appendChild(mk("span", "rp-ticker__step num", "Step " + it.step));
        head.appendChild(tt);
        li.appendChild(head);
        var body = mk("div", "rp-ticker__body");
        var chips = mk("div", "rp-ticker__chips");
        var act = it.actionLabel || it.action;
        if (act) chips.appendChild(mk("span", "chip", act));
        var pt = it.paramsText || paramsText(it.params);
        if (pt) chips.appendChild(mk("span", "chip", pt));
        if (it.status) chips.appendChild(mk("span", "chip " + (it.status === "accepted" ? "chip--ok" : it.status === "rejected" ? "chip--warn" : ""), STATUS[it.status] || it.status));
        if (it.outcome) chips.appendChild(mk("span", "chip " + (it.outcome === "rolled_back" ? "chip--warn" : it.outcome === "kept" ? "chip--ok" : ""), OUTCOME[it.outcome] || it.outcome));
        if (it.role) chips.appendChild(mk("span", "chip", it.role));
        body.appendChild(chips);
        if (it.rationale) {
          var q = mk("blockquote", "rp-ticker__quote");
          q.appendChild(mk("div", "rp-ticker__qhead", it.quoteHead || "Reason written by the agent (logged)"));
          q.appendChild(mk("p", null, it.rationale));
          body.appendChild(q);
        }
        if (it.evidence && it.evidence.length) {
          var ev = mk("ul", "rp-ticker__evidence");
          it.evidence.forEach(function (s) { ev.appendChild(mk("li", null, s)); });
          body.appendChild(mk("div", "rp-ticker__evhead", "Evidence given"));
          body.appendChild(ev);
        }
        li.appendChild(body);
        head.addEventListener("click", function () {
          var open = li.classList.toggle("is-open");
          head.setAttribute("aria-expanded", open ? "true" : "false");
          if (opts.onSelect) { try { opts.onSelect(i, it); } catch (e) { if (window.console) console.error(e); } }
        });
        list.appendChild(li); nodes.push({ li: li, head: head });
      });
      paint();
    }
    function paint() {
      nodes.forEach(function (n, i) {
        var it = items[i];
        n.li.classList.toggle("is-current", i === current);
        n.li.classList.toggle("is-future", current < 0 ? true : it.step > cur);
        var open = all || i === current || n.li.dataset.pin === "1";
        // current is auto-opened; user toggles keep their state only for the current frame
        if (!n.li.dataset.touched) { n.li.classList.toggle("is-open", open); n.head.setAttribute("aria-expanded", open ? "true" : "false"); }
        if (i === current) n.head.setAttribute("aria-current", "step"); else n.head.removeAttribute("aria-current");
      });
    }
    var api = {
      setStep: function (step) {
        if (destroyed) return;
        cur = step;
        var k = -1; for (var i = 0; i < items.length; i++) if (items[i].step <= step) k = i;
        if (k !== current) {
          current = k;
          nodes.forEach(function (n) { delete n.li.dataset.touched; });
          paint();
          if (k >= 0 && nodes[k]) {
            var li = nodes[k].li, box = list;
            // keep the scroll inside the ticker; never move the page
            var top = li.offsetTop - box.offsetTop;
            if (top < box.scrollTop || top + li.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = Math.max(0, top - 8);
          }
          clearTimeout(liveTimer);
          liveTimer = setTimeout(function () {
            if (k >= 0) live.textContent = "Decision at step " + items[k].step + ": " + (items[k].title || "") + (items[k].rationale ? ". " + items[k].rationale : "");
            else live.textContent = "";
          }, 450);
        } else paint();
      },
      showAll: function (b) { all = !!b; nodes.forEach(function (n) { delete n.li.dataset.touched; }); paint(); },
      setItems: function (arr, emptyText) { items = (arr || []).slice().sort(function (a, b) { return a.step - b.step; }); if (emptyText) empty.textContent = emptyText; current = -1; build(); api.setStep(cur); },
      count: function () { return items.length; },
      el: root,
      destroy: function () { destroyed = true; clearTimeout(liveTimer); if (root.parentNode) root.parentNode.removeChild(root); }
    };
    list.addEventListener("click", function (e) { var h = e.target.closest(".rp-ticker__head"); if (h) h.parentNode.dataset.touched = "1"; }, true);
    build();
    return api;
  };


  // A missing data object prints one line instead of throwing.
  (function () {
    var f = R.Ticker;
    R.Ticker = function (container, opts) {
      try {
        if (!container) return null;
        if (!opts) throw new Error("no data given");
        return f(container, opts);
      } catch (e) {
        var p = document.createElement("p"); p.className = "rp-error"; p.textContent = "This ticker could not be drawn (" + e.message + ").";
        if (container) container.appendChild(p);
        if (window.console) console.warn("Replay.Ticker", e);
        return null;
      }
    };
  })();
})();
