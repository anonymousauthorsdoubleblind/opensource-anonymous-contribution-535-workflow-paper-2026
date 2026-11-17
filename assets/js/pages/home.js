/* Home page: one logged run (C10H6, supervised, start R1, step cap 0.005 A) in the hero panel.
   No autoplay. If the data, the replay components or the renderer are missing, the fallback figure stays. */
(function () {
  "use strict";
  function init() {
    var panel = document.getElementById("hm-replay");
    var T = window.DATA_TRAJ_C10H6, R = T && T.runs && T.runs.GS;
    var fb = document.getElementById("hm-fallback");
    var unit = panel && panel.querySelector(".hm-unit");
    function fallback() {
      if (unit) unit.hidden = true;
      if (fb) fb.hidden = false;
    }
    if (!panel || !window.Replay || !R || !R.frames || !R.steps) { fallback(); return; }
    if (fb) fb.hidden = true;
    var target = (window.SITE && SITE.FORCE_TARGET_EVA) || 0.038;
    if (R.n_steps !== 60 || R.first_below_target !== 60 || R.cap0_A !== 0.005) {
      if (window.console) console.warn("home.js: the text of the hero panel does not match the data (n_steps, first_below_target, cap0_A).");
    }
    var frames = R.frames, n = frames.length + 1, last = frames.length;
    function coords(i) { return i === 0 ? T.start.coords : frames[i - 1]; }
    var mol = null, chart = null;
    try {
      mol = Replay.Mol(document.getElementById("hm-mol"), { symbols: T.symbols, coords: T.start.coords, height: 210, view: "tilt", colorBy: "height", label: "C10H6, supervised run, geometry at each optimizer step" });
      var xs = [], k;
      for (k = 1; k <= last; k++) xs.push(k);
      chart = Replay.Chart(document.getElementById("hm-chart"), {
        height: 150, title: "Largest force",
        desc: "Largest force against optimizer step for the supervised run; it falls below the force target at step 60.",
        x: { label: "optimizer step", min: 1, max: last },
        y: { label: "f_max (eV Å⁻¹)", log: true, min: 0.01, max: 5 },
        series: [{ id: "sup", label: "Supervised run", x: xs, y: R.steps.fmax_eVA, color: "--c-sup", dash: "solid", width: 2, end_label: false }],
        hlines: [{ y: target, label: "force target " + target + " eV Å⁻¹", dash: "dashed" }],
        cursor: true, table: true
      });
      Replay.Player(document.getElementById("hm-player"), {
        n: n, fps: 10, loop: false, start: 0, ariaLabel: "Replay controls for the supervised run of C10H6",
        label: function (i) { return i === 0 ? "Start structure" : "Step " + i + " of " + last; },
        onFrame: function (i) { if (mol && mol.setCoords) mol.setCoords(coords(i)); if (chart && chart.setCursor) chart.setCursor(Math.max(1, i)); }
      });
    } catch (e) {
      if (window.console) console.warn("home.js: replay could not start: " + e.message);
      fallback();
    }
  }
  if (window.Site && Site.onReady) Site.onReady(init); else document.addEventListener("DOMContentLoaded", init);
})();
