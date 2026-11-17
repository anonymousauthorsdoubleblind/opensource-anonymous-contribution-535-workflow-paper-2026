/* Replay.Player: transport (play / pause / step / scrub / speed). Never autoplays. */
(function () {
  "use strict";
  var R = (window.Replay = window.Replay || {});
  var uid = 0;

  function reduced() { try { return !!(window.Site && Site.reducedMotion && Site.reducedMotion()); } catch (e) { return false; } }
  function mk(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  var ICON = {
    play: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><path d="M4 2.5v11l9-5.5z" fill="currentColor"/></svg>',
    pause: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><path d="M3.5 2.5h3v11h-3zM9.5 2.5h3v11h-3z" fill="currentColor"/></svg>',
    replay: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><path d="M8 2.5a5.5 5.5 0 1 0 5.2 3.7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M8 0.5v4.4L4.6 2.7z" fill="currentColor"/></svg>',
    prev: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><path d="M3 2.5h2v11H3zM13 2.5v11L6 8z" fill="currentColor"/></svg>',
    next: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><path d="M11 2.5h2v11h-2zM3 2.5v11l7-5.5z" fill="currentColor"/></svg>'
  };

  R.Player = function (container, opts) {
    opts = opts || {};
    var n = Math.max(1, opts.n | 0 || 1), fps = opts.fps || 10, loop = !!opts.loop;
    var idx = Math.min(n - 1, Math.max(0, opts.start | 0));
    var speed = 1, playing = false, raf = 0, last = 0, acc = 0, destroyed = false;
    var marks = (opts.marks || []).slice();
    var id = "rp-pl-" + (++uid);

    var root = mk("div", "rp-player");
    root.setAttribute("role", "group");
    root.setAttribute("aria-label", opts.ariaLabel || "Replay controls");
    var row = mk("div", "rp-player__row");
    var bPrev = mk("button", "btn btn--icon rp-player__btn"); bPrev.type = "button"; bPrev.innerHTML = ICON.prev; bPrev.setAttribute("aria-label", "Previous step"); bPrev.title = "Previous step (Left)";
    var bPlay = mk("button", "btn btn--primary btn--icon rp-player__btn rp-player__play"); bPlay.type = "button";
    var bNext = mk("button", "btn btn--icon rp-player__btn"); bNext.type = "button"; bNext.innerHTML = ICON.next; bNext.setAttribute("aria-label", "Next step"); bNext.title = "Next step (Right)";
    var track = mk("div", "rp-player__track");
    var rng = mk("input", "rp-player__range"); rng.type = "range"; rng.min = 0; rng.max = n - 1; rng.step = 1; rng.value = idx;
    rng.id = id + "-r"; rng.setAttribute("aria-label", "Position in the replay");
    var tickBox = mk("div", "rp-player__marks"); tickBox.setAttribute("aria-hidden", "true");
    track.appendChild(rng); track.appendChild(tickBox);
    var lab = mk("div", "rp-player__label"); lab.setAttribute("aria-live", "off");
    var seg = mk("div", "seg rp-player__speed"); seg.setAttribute("role", "radiogroup"); seg.setAttribute("aria-label", "Playback speed");
    var speedBtns = [0.5, 1, 2, 4].map(function (s) {
      var b = mk("button", "", s + "×"); b.type = "button"; b.setAttribute("role", "radio"); b.dataset.speed = s;
      b.setAttribute("aria-checked", s === 1 ? "true" : "false"); b.tabIndex = s === 1 ? 0 : -1; b.setAttribute("aria-label", "Speed " + s + " times");
      seg.appendChild(b); return b;
    });
    row.appendChild(bPrev); row.appendChild(bPlay); row.appendChild(bNext); row.appendChild(track);
    var row2 = mk("div", "rp-player__row2"); row2.appendChild(lab); row2.appendChild(seg);
    root.appendChild(row); root.appendChild(row2);
    var keyhelp = mk("p", "rp-player__help visually-hidden", "Keyboard: Space plays or pauses, Left and Right step, Home and End jump to the first and last step.");
    root.appendChild(keyhelp);
    container.appendChild(root);

    function drawMarks() {
      tickBox.innerHTML = "";
      marks.forEach(function (m, k) {
        var t = mk("span", "rp-player__mark rp-mark--" + (m.kind || "decision"));
        t.style.left = (n > 1 ? (m.i / (n - 1)) * 100 : 0) + "%";
        t.title = m.label || "";
        tickBox.appendChild(t);
      });
    }
    function markAt(i) { for (var k = 0; k < marks.length; k++) if (marks[k].i === i) return marks[k]; return null; }
    function atEnd() { return idx >= n - 1; }
    function setPlayBtn() {
      var end = atEnd() && !playing && !loop;
      bPlay.innerHTML = playing ? ICON.pause : (end ? ICON.replay : ICON.play);
      var t = playing ? "Pause" : (end ? "Replay from the start" : "Play");
      bPlay.setAttribute("aria-label", t); bPlay.title = t + " (Space)";
      root.classList.toggle("is-playing", playing);
    }
    function label() {
      var t = opts.label ? opts.label(idx) : "Step " + (idx + 1) + " of " + n;
      var m = markAt(idx); if (m && m.label) t += " · " + m.label;
      lab.textContent = t;
      rng.setAttribute("aria-valuetext", t);
    }
    function set(i, silent) {
      i = Math.max(0, Math.min(n - 1, Math.round(i)));
      var ch = i !== idx; idx = i;
      rng.value = idx; label(); setPlayBtn();
      if ((ch || silent === "force") && silent !== true && opts.onFrame) { try { opts.onFrame(idx); } catch (e) { if (window.console) console.error(e); } }
    }
    function frameStep(ts) {
      if (!playing || destroyed) return;
      var dt = last ? (ts - last) : 0; last = ts;
      if (dt > 250) dt = 250;
      var interval = reduced() ? 700 / speed : 1000 / (fps * speed);
      acc += dt;
      while (acc >= interval && playing) {
        acc -= interval;
        if (idx >= n - 1) {
          if (loop) { set(0); } else { api.pause(); return; }
        } else { set(idx + 1); if (idx >= n - 1 && !loop) { api.pause(); return; } }
      }
      raf = requestAnimationFrame(frameStep);
    }
    var api = {
      play: function () {
        if (playing || destroyed) return;
        if (atEnd()) set(0, "force");
        playing = true; last = 0; acc = reduced() ? 0 : 1e9 * 0; setPlayBtn();
        raf = requestAnimationFrame(frameStep);
        root.dispatchEvent(new CustomEvent("rp:play", { bubbles: true }));
      },
      pause: function () {
        if (!playing) { return; }
        playing = false; if (raf) cancelAnimationFrame(raf); raf = 0; setPlayBtn();
        root.dispatchEvent(new CustomEvent("rp:pause", { bubbles: true }));
      },
      seek: function (i) { set(i); },
      seekQuiet: function (i) { set(i, true); },
      index: function () { return idx; },
      setSpeed: function (s) {
        speed = +s || 1;
        speedBtns.forEach(function (b) { var on = +b.dataset.speed === speed; b.setAttribute("aria-checked", on ? "true" : "false"); b.tabIndex = on ? 0 : -1; });
      },
      setN: function (m, keep) {
        n = Math.max(1, m | 0); rng.max = n - 1;
        if (!keep || idx > n - 1) idx = Math.min(idx, n - 1);
        rng.value = idx; drawMarks(); label(); setPlayBtn();
      },
      setMarks: function (mm) { marks = (mm || []).slice(); drawMarks(); label(); },
      setLabel: function (fn) { opts.label = fn; label(); },
      setOnFrame: function (fn) { opts.onFrame = fn; },
      isPlaying: function () { return playing; },
      toggle: function () { if (playing) api.pause(); else api.play(); },
      el: root,
      destroy: function () {
        destroyed = true; api.pause();
        document.removeEventListener("visibilitychange", onVis);
        if (root.parentNode) root.parentNode.removeChild(root);
      }
    };

    bPlay.addEventListener("click", function () { api.toggle(); });
    bPrev.addEventListener("click", function () { api.pause(); set(idx - 1); });
    bNext.addEventListener("click", function () { api.pause(); set(idx + 1); });
    rng.addEventListener("input", function () { set(+rng.value); });
    rng.addEventListener("pointerdown", function () { if (playing) api.pause(); });
    seg.addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) api.setSpeed(+b.dataset.speed); });
    seg.addEventListener("keydown", function (e) {
      var k = e.key; if (k !== "ArrowRight" && k !== "ArrowLeft" && k !== "ArrowUp" && k !== "ArrowDown") return;
      e.preventDefault(); e.stopPropagation();
      var cur = speedBtns.findIndex(function (b) { return +b.dataset.speed === speed; });
      var nx = (cur + ((k === "ArrowRight" || k === "ArrowDown") ? 1 : -1) + speedBtns.length) % speedBtns.length;
      api.setSpeed(+speedBtns[nx].dataset.speed); speedBtns[nx].focus();
    });
    root.addEventListener("keydown", function (e) {
      var t = e.target, k = e.key, isRange = t === rng, isBtn = t.tagName === "BUTTON";
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (seg.contains(t)) return;
      if (k === " " || k === "Spacebar") { if (isBtn) return; e.preventDefault(); api.toggle(); return; }
      if (isRange) return;   // native arrows, Home and End
      if (k === "ArrowLeft") { e.preventDefault(); api.pause(); set(idx - 1); }
      else if (k === "ArrowRight") { e.preventDefault(); api.pause(); set(idx + 1); }
      else if (k === "Home") { e.preventDefault(); api.pause(); set(0); }
      else if (k === "End") { e.preventDefault(); api.pause(); set(n - 1); }
    });
    // global convenience: when the focus is on the viewer panel (tabindex) the host can forward keys via p.el
    function onVis() { if (document.hidden) api.pause(); }
    document.addEventListener("visibilitychange", onVis);

    drawMarks(); label(); setPlayBtn();
    return api;
  };

  // A missing data object prints one line instead of throwing.
  (function () {
    var f = R.Player;
    R.Player = function (container, opts) {
      try {
        if (!container) return null;
        if (!opts) throw new Error("no data given");
        return f(container, opts);
      } catch (e) {
        var p = document.createElement("p"); p.className = "rp-error"; p.textContent = "This player could not be drawn (" + e.message + ").";
        if (container) container.appendChild(p);
        if (window.console) console.warn("Replay.Player", e);
        return null;
      }
    };
  })();
})();
