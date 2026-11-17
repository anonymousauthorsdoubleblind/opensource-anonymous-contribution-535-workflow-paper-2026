(function(){
"use strict";
var el = function(t,a,c){ return window.Site.el(t,a,c); };

var START = [
  {id:"figA01", text:"Optimizing a structure is a walk downhill. A valley floor is a stable structure; a mountain pass is level too, but not stable. The step cap is the longest stride."},
  {id:"figA02", text:"The optimizer makes every step. When progress stalls, a controller suggests one change to the settings; a validator checks it, and a trial of five steps decides whether it stays."},
  {id:"fig07",   text:"Three checks on an optimized structure: curvature, fingerprint, second opinion."}
];
var G2 = ["fig01","fig02","fig03","fig04","figA03","sch-H3"];
var G3 = ["fig05","fig06","figA04","figA05","fig08","figA06","figA07","fig16","sch-D1","sch-D2","sch-D3","sch-D4","sch-D5","sch-modes"];
var FILTERS = [["all","All"],["1","Module 1"],["2","Module 2"],["3","Module 3"],["4","Module 4"],["0","General"]];

function fdata(id){ return window.DATA_FIGS && DATA_FIGS.byId ? DATA_FIGS.byId[id] : null; }

function buildStart(){
  var host = document.getElementById("pg-start"); if(!host) return;
  START.forEach(function(it){
    var f = fdata(it.id); if(!f) return;
    var fig = window.Site.fig(it.id, {size:"full", caption:"none"});
    var det = el("details", {class:"pg-details"}, [el("summary", {text:"Full caption"}), el("p", {text:f.caption || f.title})]);
    var txt = el("div", {class:"pg-start__text"}, [el("h3", {text:f.title}), el("p", {text:it.text}), det]);
    host.appendChild(el("div", {class:"pg-start__item"}, [fig, txt]));
  });
}

var cards = [];
function buildGallery(hostId, ids){
  var host = document.getElementById(hostId); if(!host) return;
  ids.forEach(function(id){
    var f = fdata(id); if(!f) return;   // only ids present in the catalogue
    var fig = window.Site.fig(id, {size:"full", caption:"none"});
    var chip = f.module ? el("span", {class:"chip chip--m" + f.module, text:"Module " + f.module}) : el("span", {class:"chip", text:"General"});
    var card = el("div", {class:"pg-gcard", "data-module":String(f.module||0)}, [fig, el("h4", {text:f.title}), el("div", null, chip)]);
    host.appendChild(card); cards.push(card);
  });
}
function applyFilter(val){
  var shown = 0;
  cards.forEach(function(c){
    var ok = val === "all" || c.getAttribute("data-module") === val;
    c.hidden = !ok; if(ok) shown++;
  });
  var n = document.getElementById("pg-filter-count");
  if(n) n.textContent = shown + " of " + cards.length + " shown";
  ["pg-g2","pg-g3"].forEach(function(id){
    var h = document.getElementById(id); if(!h) return;
    var vis = h.querySelectorAll(".pg-gcard:not([hidden])").length;
    var e = h.parentNode.querySelector(".pg-empty");
    if(!vis && !e){ h.parentNode.insertBefore(el("p", {class:"pg-empty", text:"No picture in this group for the chosen filter."}), h.nextSibling); }
    else if(vis && e) e.parentNode.removeChild(e);
  });
}
function buildFilter(){
  var seg = document.getElementById("pg-filter"); if(!seg) return;
  var btns = [];
  FILTERS.forEach(function(f, i){
    var b = el("button", {type:"button", role:"radio", "aria-checked": i === 0 ? "true" : "false", tabindex: i === 0 ? "0" : "-1", text:f[1]});
    b.addEventListener("click", function(){ select(i); });
    b.addEventListener("keydown", function(e){
      var d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
      if(d){ e.preventDefault(); select((i + d + FILTERS.length) % FILTERS.length, true); }
    });
    seg.appendChild(b); btns.push(b);
  });
  function select(i, focus){
    btns.forEach(function(b, j){ b.setAttribute("aria-checked", j === i ? "true" : "false"); b.tabIndex = j === i ? 0 : -1; });
    if(focus) btns[i].focus();
    applyFilter(FILTERS[i][0]);
  }
  select(0);
}

/* ---------- ball on a landscape ---------- */
function ball(){
  var host = document.getElementById("pg-ball-svg"); if(!host) return;
  var NS = "http://www.w3.org/2000/svg";
  var W = 640, H = 300, X0 = 50, X1 = 610, Y0 = 20, Y1 = 250;     // plot box
  var XMIN = -2, XMAX = 2, EMAX = 4;
  function E(x){ var q = x*x - 1; return q*q; }
  function G(x){ return 4*x*(x*x - 1); }
  function px(x){ return X0 + (x - XMIN)/(XMAX - XMIN)*(X1 - X0); }
  function py(e){ return Y1 - Math.min(e, EMAX)/EMAX*(Y1 - Y0); }
  var CAPS = [0.02, 0.25, 20], NAMES = ["too small", "sensible", "too large"];
  var ETA = 0.2, ETA0 = 0.75, TOL = 0.05;
  var svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 " + W + " " + H);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "A one-dimensional energy curve with two valley floors and a level pass between them, with a ball that steps downhill.");
  function mk(tag, attrs, parent){ var n = document.createElementNS(NS, tag); for(var k in attrs) n.setAttribute(k, attrs[k]); (parent || svg).appendChild(n); return n; }
  mk("path", {d:"M"+X0+" "+Y0+" V"+Y1+" H"+X1, class:"pg-axis"});
  var d = "";
  for(var i = 0; i <= 200; i++){ var x = XMIN + (XMAX - XMIN)*i/200; d += (i ? "L" : "M") + px(x).toFixed(1) + " " + py(E(x)).toFixed(1); }
  mk("path", {d:d, class:"pg-curve"});
  var t1 = mk("text", {x:(X0+X1)/2, y:H-14, "text-anchor":"middle"}); t1.textContent = "shape of the molecule";
  var t2 = mk("text", {x:16, y:(Y0+Y1)/2, "text-anchor":"middle", transform:"rotate(-90 16 "+((Y0+Y1)/2)+")"}); t2.textContent = "energy";
  var tv = mk("text", {x:px(-1), y:Y1+16, "text-anchor":"middle", class:"pg-tl"}); tv.textContent = "valley floor";
  var tv2 = mk("text", {x:px(1), y:Y1+16, "text-anchor":"middle", class:"pg-tl"}); tv2.textContent = "valley floor";
  var tp = mk("text", {x:px(0), y:py(1)-8, "text-anchor":"middle", class:"pg-tl"}); tp.textContent = "pass";
  var trail = mk("g", {});
  var ballc = mk("circle", {r:9, class:"pg-ballc"});
  host.appendChild(svg);
  var statusEl = document.getElementById("pg-status"), countEl = document.getElementById("pg-count");
  var capIn = document.getElementById("pg-cap"), playB = document.getElementById("pg-play"), stepB = document.getElementById("pg-step");
  var st, timer = null;
  function place(){
    if(st.lost){ ballc.setAttribute("cx", X1 + 30); ballc.setAttribute("cy", py(EMAX)); ballc.style.display = "none"; return; }
    ballc.style.display = "";
    ballc.setAttribute("cx", px(st.x)); ballc.setAttribute("cy", py(E(st.x)) - 9);
  }
  function setStatus(msg, warn){ statusEl.textContent = msg; statusEl.className = "pg-ball__status" + (warn ? " pg-ball__status--warn" : ""); }
  function reset(onPass){
    stop();
    st = {x: onPass ? 0 : -1.6, n: 0, lost: false, done: false, pass: !!onPass};
    while(trail.firstChild) trail.removeChild(trail.firstChild);
    countEl.textContent = "0"; place();
    if(onPass) setStatus("The force is zero here too. Only the curvature shows that this is not a valley floor.");
    else setStatus("Step cap: " + NAMES[+capIn.value] + ". Press Step or Play. Nothing moves by itself.");
  }
  function step(){
    if(st.lost || st.done) return false;
    var g = G(st.x);
    if(Math.abs(g) < 1e-9 && st.pass){ setStatus("The force is zero here too. Only the curvature shows that this is not a valley floor. The ball stays where it is."); st.done = true; return false; }
    if(Math.abs(g) < TOL){ st.done = true; setStatus("Force below the target after " + st.n + " steps: a valley floor is reached.", false); return false; }
    var cap = CAPS[+capIn.value];
    var eta = st.n === 0 ? ETA0 : ETA;
    var dx = -g*eta; if(Math.abs(dx) > cap) dx = (dx < 0 ? -1 : 1)*cap;
    mk("circle", {cx:px(st.x), cy:py(E(st.x)) - 3, r:3, class:"pg-trail"}, trail);
    st.x += dx; st.n++; countEl.textContent = String(st.n);
    if(st.x < XMIN - 0.3 || st.x > XMAX + 0.3){
      st.lost = true; place();
      setStatus("Structure lost: the stride carried the ball far out of the frame, to shapes the toy no longer describes. A step cap that is too large can tear a strained molecule apart.", true);
      return false;
    }
    place();
    if(Math.abs(G(st.x)) < TOL){ st.done = true; setStatus("Force below the target after " + st.n + " steps: a valley floor is reached.", false); return false; }
    if(st.n < 5) setStatus("Step cap: " + NAMES[+capIn.value] + ". Step " + st.n + ".");
    else if(st.n % 5 === 0) setStatus("Step cap: " + NAMES[+capIn.value] + ". " + st.n + " steps so far" + (+capIn.value === 0 ? ": the ball creeps." : "."));
    return true;
  }
  function stop(){ if(timer){ clearInterval(timer); timer = null; } if(playB) playB.textContent = "Play"; }
  function reduced(){ return window.Site && Site.reducedMotion && Site.reducedMotion(); }
  function syncMotion(){
    var r = reduced(); playB.disabled = r; playB.title = r ? "Reduced motion is on: use Step" : "";
    if(r) stop();
  }
  playB.addEventListener("click", function(){
    if(timer){ stop(); return; }
    if(st.done || st.lost) reset(st.pass);
    playB.textContent = "Pause";
    timer = setInterval(function(){ if(!step()) stop(); }, 320);
  });
  stepB.addEventListener("click", function(){ if(st.done || st.lost){ if(!st.pass) reset(false); } else step(); });
  document.getElementById("pg-reset").addEventListener("click", function(){ reset(false); });
  document.getElementById("pg-pass").addEventListener("click", function(){ reset(true); });
  capIn.addEventListener("input", function(){ capIn.setAttribute("aria-valuetext", NAMES[+capIn.value]); reset(false); });
  document.addEventListener("site:motion", syncMotion);
  syncMotion(); reset(false);
}

window.Site.onReady(function(){
  buildStart();
  buildGallery("pg-g2", G2);
  buildGallery("pg-g3", G3);
  buildFilter();
  ball();
});
})();
