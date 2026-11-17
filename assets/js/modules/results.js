/* WP3: results.html. Filter the nine findings by module. Cards are static HTML so the page works without this file. */
(function () {
  "use strict";
  function init() {
    var bar = document.getElementById("res-filter"); if (!bar) return;
    var btns = Array.prototype.slice.call(bar.querySelectorAll("button[role=radio]"));
    var cards = Array.prototype.slice.call(document.querySelectorAll(".md-finding"));
    var count = document.getElementById("res-count");
    function apply(v) {
      var n = 0;
      cards.forEach(function (c) { var show = v === "all" || c.getAttribute("data-f") === v; c.hidden = !show; if (show) n++; });
      btns.forEach(function (b) { var on = b.getAttribute("data-f") === v; b.setAttribute("aria-checked", on ? "true" : "false"); b.tabIndex = on ? 0 : -1; });
      if (count) count.textContent = n + " of " + cards.length + " findings shown";
      try { history.replaceState(null, "", v === "all" ? location.pathname + location.search : "#filter-" + v); } catch (e) {}
    }
    btns.forEach(function (b, i) {
      b.addEventListener("click", function () { apply(b.getAttribute("data-f")); });
      b.addEventListener("keydown", function (e) {
        var k = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
        if (k) { e.preventDefault(); var n = btns[(i + k + btns.length) % btns.length]; n.focus(); apply(n.getAttribute("data-f")); }
      });
    });
    var m = /^#filter-(\d)$/.exec(location.hash); apply(m ? m[1] : "all");
    // a link to #f3-5 shows its card even when filtered
    window.addEventListener("hashchange", function () { var t = document.getElementById(location.hash.slice(1)); if (t && t.hidden) apply("all"); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
