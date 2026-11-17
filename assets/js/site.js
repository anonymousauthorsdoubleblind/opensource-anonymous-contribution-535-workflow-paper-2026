(function(){
"use strict";
var SITE = window.SITE || {};
var root = document.documentElement;
var NS = "http://www.w3.org/2000/svg";

function lsGet(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
function lsSet(k,v){ try{ localStorage.setItem(k,v); }catch(e){} }

function el(tag, attrs, children){
  var n = document.createElement(tag);
  if(attrs){ Object.keys(attrs).forEach(function(k){
    var v = attrs[k];
    if(v === null || v === undefined || v === false) return;
    if(k === "class") n.className = v;
    else if(k === "text") n.textContent = v;
    else if(k === "html") n.innerHTML = v;
    else if(k.slice(0,2) === "on" && typeof v === "function") n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? "" : v);
  }); }
  if(children !== undefined && children !== null){
    (Array.isArray(children) ? children : [children]).forEach(function(c){
      if(c === null || c === undefined) return;
      n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
  }
  return n;
}
function onReady(fn){
  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn); else fn();
}
function fire(name, detail){
  try{ document.dispatchEvent(new CustomEvent(name, {detail: detail})); }catch(e){}
}

/* theme */
function theme(){
  var t = root.getAttribute("data-theme");
  if(t === "dark" || t === "light") return t;
  return (window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light";
}
function setTheme(t){
  if(t !== "dark" && t !== "light") t = "light";
  lsSet("theme", t);
  root.setAttribute("data-theme", t);
  fire("site:theme", {theme: t});
}

/* motion */
function reducedMotion(){
  if(lsGet("motion") === "reduce") return true;
  return !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
}
function applyMotion(){
  if(lsGet("motion") === "reduce") root.setAttribute("data-motion","reduce"); else root.removeAttribute("data-motion");
}
function setMotion(reduce){
  lsSet("motion", reduce ? "reduce" : "normal");
  applyMotion();
  fire("site:motion", {reduced: reducedMotion()});
}

function cssVar(name){
  return getComputedStyle(document.body || root).getPropertyValue(name).trim();
}

/* number and formula helpers */
function fmt(x, digits){
  if(x === null || x === undefined || (typeof x === "number" && !isFinite(x))) return "–";
  if(typeof x !== "number") return String(x);
  var s = (digits === undefined) ? String(x) : x.toFixed(digits);
  s = s.replace("-", "−");
  var parts = s.split(".");
  var ip = parts[0], sign = "";
  if(ip.charAt(0) === "−"){ sign = "−"; ip = ip.slice(1); }
  if(ip.length > 4) ip = ip.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return sign + ip + (parts.length > 1 ? "." + parts[1] : "");
}
function formula(str){
  return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/([A-Za-z\)])(\d+)/g, "$1<sub>$2</sub>");
}

/* badges */
var BADGES = {
  logged: {label:"Replay of logged data", icon:"M4 3h8v10H4z M6 6h4 M6 8.5h4 M6 11h2"},
  illustrative: {label:"Illustrative replay", icon:"M3 12 C5 4 8 4 8 8 S11 12 13 4"},
  tables: {label:"Drawn from tabulated values", icon:"M2.5 3.5h11v9h-11z M2.5 7h11 M6.5 3.5v9"},
  schematic: {label:"Schematic, not computed data", icon:"M3 4h4v3H3z M9 9h4v3H9z M7 5.5h2.5V9"}
};
function badge(kind){
  var b = BADGES[kind] || BADGES.schematic;
  var svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox","0 0 16 16"); svg.setAttribute("aria-hidden","true"); svg.setAttribute("focusable","false");
  var p = document.createElementNS(NS, "path");
  p.setAttribute("d", b.icon); p.setAttribute("fill","none"); p.setAttribute("stroke","currentColor");
  p.setAttribute("stroke-width","1.5"); p.setAttribute("stroke-linecap","round"); p.setAttribute("stroke-linejoin","round");
  svg.appendChild(p);
  var s = el("span", {class:"badge badge--" + (BADGES[kind] ? kind : "schematic")});
  s.appendChild(svg); s.appendChild(document.createTextNode(b.label));
  return s;
}
function fillBadges(scope){
  Array.prototype.forEach.call((scope||document).querySelectorAll("[data-badge]"), function(n){
    if(n.getAttribute("data-badge-done")) return;
    var b = badge(n.getAttribute("data-badge"));
    n.className = (n.className ? n.className + " " : "") + b.className;
    while(b.firstChild) n.appendChild(b.firstChild);
    n.setAttribute("data-badge-done","1");
  });
}

/* figures */
function figData(id){
  var d = window.DATA_FIGS;
  return d && d.byId ? d.byId[id] : null;
}
function firstSentence(t){
  var m = /^[\s\S]*?[.!?](?=\s|$)/.exec(t || "");
  return m ? m[0] : (t || "");
}
function fig(id, opts){
  opts = opts || {};
  var f = figData(id);
  if(!f) return el("p", {class:"fig__note", text:"[figure " + id + " is not available]"});
  var size = opts.size || "l";
  if(f.lowres) size = "m";
  var cls = "fig fig--" + size + (f.lowres ? " fig--lowres" : "");
  var cap = f.caption || "";
  if(opts.caption === "none") cap = ""; else if(opts.caption === "short") cap = firstSentence(cap);
  var img = el("img", {src:f.preview || f.file, alt:f.alt || f.title || "", width:f.pw || f.w || null, height:f.ph || f.h || null, loading:"lazy", decoding:"async"});
  var plate = el("button", {class:"fig__plate", type:"button", "aria-label":"Enlarge " + f.label + (f.title ? ": " + f.title : "")}, img);
  plate.addEventListener("click", function(){ openLightbox(f, plate); });
  var labelKids = [el("span", {text:f.label})];
  if(f.tag === "schematic") labelKids.push(badge("schematic"));
  else if(f.tag === "mixed") labelKids.push(el("span", {class:"chip", text:"Schematic with data"}));
  var figure = el("figure", {class:cls, id:opts.id || null}, [plate, el("div", {class:"fig__label"}, labelKids)]);
  if(cap) figure.appendChild(el("figcaption", {class:"fig__caption", text:cap}));
  if(f.lowres) figure.appendChild(el("p", {class:"fig__note", text:"Shown at the resolution of the source."}));
  else if(f.note) figure.appendChild(el("p", {class:"fig__note", text:f.note}));
  return figure;
}
function fillFigs(){
  Array.prototype.forEach.call(document.querySelectorAll("[data-fig]"), function(n){
    var o = {size: n.getAttribute("data-size") || "l", caption: n.getAttribute("data-caption") || null};
    var f = fig(n.getAttribute("data-fig"), o);
    n.parentNode.replaceChild(f, n);
  });
}

/* lightbox */
var lb = null;
function trapFocus(e, box){
  if(e.key !== "Tab") return;
  var items = box.querySelectorAll("button,[href],[tabindex]:not([tabindex='-1'])");
  if(!items.length) return;
  var first = items[0], last = items[items.length-1];
  if(e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
  else if(!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
}
function closeLightbox(){
  if(!lb) return;
  document.removeEventListener("keydown", lb.key, true);
  if(lb.node.parentNode) lb.node.parentNode.removeChild(lb.node);
  document.body.classList.remove("is-locked");
  var back = lb.back; lb = null;
  if(back && back.focus) back.focus();
}
function openLightbox(f, back){
  if(lb) closeLightbox();
  var img = el("img", {src:f.file || f.preview, alt:f.alt || f.title || ""});
  var close = el("button", {class:"btn btn--icon lightbox__close", type:"button", "aria-label":"Close enlarged figure", text:"✕"});
  var inner = el("div", {class:"lightbox__inner"}, img);
  var cap = el("div", {class:"lightbox__cap"}, [el("strong", {text:f.label + ". "}), document.createTextNode(f.caption || f.title || "")]);
  var node = el("div", {class:"lightbox", role:"dialog", "aria-modal":"true", "aria-label":f.label + " enlarged"}, [close, inner, cap]);
  function key(e){
    if(e.key === "Escape"){ e.preventDefault(); closeLightbox(); }
    else trapFocus(e, node);
  }
  close.addEventListener("click", closeLightbox);
  node.addEventListener("click", function(e){ if(e.target === node) closeLightbox(); });
  document.addEventListener("keydown", key, true);
  document.body.appendChild(node);
  document.body.classList.add("is-locked");
  lb = {node:node, key:key, back:back};
  close.focus();
}

/* glossary terms */
var tip = null, tipFor = null;
function hideTip(){
  if(tip && tip.parentNode) tip.parentNode.removeChild(tip);
  if(tipFor) tipFor.removeAttribute("aria-describedby");
  tip = null; tipFor = null;
}
function showTip(n){
  var g = window.DATA_GLOSSARY && window.DATA_GLOSSARY[n.getAttribute("data-term")];
  if(!g) return;
  hideTip();
  tip = el("div", {class:"tip", role:"tooltip", id:"site-tip"}, [el("strong", {text:g.term}), document.createTextNode(g.def)]);
  document.body.appendChild(tip);
  var r = n.getBoundingClientRect();
  var left = Math.max(8, Math.min(window.scrollX + r.left, window.scrollX + document.documentElement.clientWidth - tip.offsetWidth - 8));
  var top = window.scrollY + r.bottom + 6;
  if(r.bottom + tip.offsetHeight + 12 > window.innerHeight) top = window.scrollY + r.top - tip.offsetHeight - 6;
  tip.style.left = left + "px"; tip.style.top = top + "px";
  n.setAttribute("aria-describedby","site-tip"); tipFor = n;
}
function wireTerms(){
  Array.prototype.forEach.call(document.querySelectorAll("[data-term]"), function(n){
    n.classList.add("term");
    if(!n.hasAttribute("tabindex")) n.setAttribute("tabindex","0");
    n.addEventListener("mouseenter", function(){ showTip(n); });
    n.addEventListener("mouseleave", hideTip);
    n.addEventListener("focus", function(){ showTip(n); });
    n.addEventListener("blur", hideTip);
    n.addEventListener("click", function(){ if(tipFor === n) hideTip(); else showTip(n); });
  });
  document.addEventListener("keydown", function(e){ if(e.key === "Escape" && tip) hideTip(); });
}

/* scope note, repo link */
function fillScope(){
  Array.prototype.forEach.call(document.querySelectorAll("[data-scope-note]"), function(n){
    n.className = (n.className ? n.className + " " : "") + "callout callout--scope";
    n.textContent = "";
    n.appendChild(el("strong", {class:"callout__label", text:"Scope"}));
    n.appendChild(el("p", {text:SITE.SCOPE_LINE}));
  });
}
function fillRepo(scope){
  Array.prototype.forEach.call((scope||document).querySelectorAll("[data-repo-link]"), function(a){
    if(SITE.REPO_URL){ a.setAttribute("href", SITE.REPO_URL); a.textContent = a.textContent || "Repository"; }
    else { a.removeAttribute("href"); a.textContent = SITE.REPO_NOTE; }
  });
}

/* navigation map helpers: flat list, breadcrumb, guided tour, footer sitemap */
function flatNav(){
  var out = {};
  (SITE.NAV || []).forEach(function(it){
    if(it.children) it.children.forEach(function(c){ out[c.id] = {item:c, group:it}; });
    else out[it.id] = {item:it, group:null};
  });
  return out;
}
function buildCrumbs(){
  var page = document.body.getAttribute("data-page");
  var head = document.querySelector("main .page-head");
  var f = flatNav()[page];
  if(!head || !f || page === "home") return;
  var ol = el("ol", null, [el("li", null, el("a", {href:"index.html", text:"Home"}))]);
  if(f.group) ol.appendChild(el("li", null, el("a", {href:f.group.href, text:f.group.label})));
  ol.appendChild(el("li", {"aria-current":"page", text:f.item.label}));
  head.insertBefore(el("nav", {class:"crumbs", "aria-label":"Breadcrumb"}, ol), head.firstChild);
}
function buildTour(){
  var body = document.body, page = body.getAttribute("data-page"), main = document.getElementById("main");
  var tour = SITE.TOUR || [], i = tour.indexOf(page), map = flatNav();
  if(!main || i < 0 || body.getAttribute("data-tour") === "off") return;
  Array.prototype.forEach.call(main.querySelectorAll(".md-next"), function(n){ n.parentNode.removeChild(n); });
  var prev = i > 0 ? map[tour[i-1]] : null, next = i < tour.length - 1 ? map[tour[i+1]] : null;
  var nav = el("nav", {class:"tour", "aria-label":"Guided tour"});
  if(prev) nav.appendChild(el("a", {class:"btn btn--ghost tour__prev", href:prev.item.href, rel:"prev", text:"\u2190 Previous: " + prev.item.label}));
  nav.appendChild(el("span", {class:"tour__pos", text:"Page " + (i+1) + " of " + tour.length + " in the guided tour"}));
  if(next) nav.appendChild(el("a", {class:"btn btn--primary tour__next", href:next.item.href, rel:"next", text:"Next: " + next.item.label + " \u2192"}));
  else nav.appendChild(el("a", {class:"btn btn--primary tour__next", href:"index.html", text:"Back to the start \u2192"}));
  main.appendChild(nav);
}
function footMap(){
  var page = document.body.getAttribute("data-page"), map = flatNav();
  var nav = el("nav", {class:"foot-map", "aria-label":"All pages"});
  (SITE.FOOT || []).forEach(function(col){
    var ul = el("ul");
    col.ids.forEach(function(id){
      var f = map[id]; if(!f) return;
      ul.appendChild(el("li", null, el("a", {href:f.item.href, title:f.item.desc || null, text:f.item.label, "aria-current":id === page ? "page" : null})));
    });
    nav.appendChild(el("div", null, [el("p", {class:"foot-map__h", text:col.title}), ul]));
  });
  return nav;
}

/* header and footer */
function buildHeader(){
  var host = document.getElementById("site-header");
  if(!host) return;
  var page = document.body.getAttribute("data-page");
  var bar = el("header", {class:"site-header"});
  bar.appendChild(el("a", {class:"site-brand", href:"index.html"}, [el("strong", {text:SITE.SHORT}), el("small", {text:SITE.STATUS})]));
  var nav = el("nav", {class:"site-nav", id:"site-nav", "aria-label":"Main"});
  var ul = el("ul");
  (SITE.NAV || []).forEach(function(it){
    var li = el("li");
    if(it.children){
      li.className = "has-sub";
      var isCur = it.children.some(function(c){ return c.id === page; });
      var btn = el("button", {class:"site-nav__item" + (isCur ? " is-current" : ""), type:"button", "aria-expanded":"false", "aria-haspopup":"true", text:it.label + " ▾"});
      var sub = el("ul", {class:"site-nav__sub"});
      it.children.forEach(function(c){
        var a = el("a", {class:"site-nav__item" + (c.id === page ? " is-current" : ""), href:c.href, text:c.label, "aria-current":c.id === page ? "page" : null});
        sub.appendChild(el("li", null, a));
      });
      function setOpen(o){ li.classList.toggle("is-open", o); btn.setAttribute("aria-expanded", o ? "true" : "false"); }
      var wasOpen = null;
      btn.addEventListener("mousedown", function(){ wasOpen = li.classList.contains("is-open"); });
      btn.addEventListener("click", function(e){ e.stopPropagation(); setOpen(wasOpen === null ? true : !wasOpen); wasOpen = null; });
      li.addEventListener("focusin", function(){ setOpen(true); });
      li.addEventListener("keydown", function(e){ if(e.key === "Escape"){ setOpen(false); btn.focus(); } });
      document.addEventListener("click", function(e){ if(!li.contains(e.target)) setOpen(false); });
      li.addEventListener("focusout", function(e){ if(e.relatedTarget && !li.contains(e.relatedTarget)) setOpen(false); });
      li.appendChild(btn); li.appendChild(sub);
    } else {
      li.appendChild(el("a", {class:"site-nav__item" + (it.id === page ? " is-current" : ""), href:it.href, text:it.label, "aria-current":it.id === page ? "page" : null}));
    }
    ul.appendChild(li);
  });
  nav.appendChild(ul);
  bar.appendChild(nav);

  var tools = el("div", {class:"site-tools"});
  var pauseIcon = document.createElementNS(NS, "svg");
  pauseIcon.setAttribute("viewBox","0 0 16 16"); pauseIcon.setAttribute("width","14"); pauseIcon.setAttribute("height","14"); pauseIcon.setAttribute("aria-hidden","true");
  pauseIcon.innerHTML = '<rect x="3" y="2.5" width="3.2" height="11" rx="1" fill="currentColor"/><rect x="9.8" y="2.5" width="3.2" height="11" rx="1" fill="currentColor"/>';
  var mBtn = el("button", {class:"motion-toggle", type:"button", "aria-pressed":"false", title:"Reduce motion", "aria-label":"Reduce motion"}, [pauseIcon, el("span", {class:"mt-text", text:"Reduce motion"})]);
  function syncMotion(){ mBtn.setAttribute("aria-pressed", reducedMotion() ? "true" : "false"); }
  mBtn.addEventListener("click", function(){ setMotion(lsGet("motion") !== "reduce"); syncMotion(); });
  syncMotion();
  var tBtn = el("button", {class:"theme-toggle", type:"button"});
  function syncTheme(){ var d = theme() === "dark"; tBtn.textContent = d ? "☀ Light" : "☾ Dark"; tBtn.setAttribute("aria-label", d ? "Switch to light theme" : "Switch to dark theme"); }
  tBtn.addEventListener("click", function(){ setTheme(theme() === "dark" ? "light" : "dark"); syncTheme(); });
  syncTheme();
  var hb = el("button", {class:"nav-toggle", type:"button", "aria-expanded":"false", "aria-controls":"site-nav", "aria-label":"Menu", text:"☰ Menu"});
  hb.addEventListener("click", function(){ var o = !nav.classList.contains("is-open"); nav.classList.toggle("is-open", o); hb.setAttribute("aria-expanded", o ? "true" : "false"); });
  tools.appendChild(mBtn); tools.appendChild(tBtn); tools.appendChild(hb);
  bar.appendChild(tools);
  host.appendChild(bar);
  document.addEventListener("keydown", function(e){
    if(e.key === "Escape" && nav.classList.contains("is-open")){ nav.classList.remove("is-open"); hb.setAttribute("aria-expanded","false"); hb.focus(); }
  });
}
function buildFooter(){
  var host = document.getElementById("site-footer");
  if(!host) return;
  var scope = el("div", {class:"callout callout--scope"}, [el("strong", {class:"callout__label", text:"Scope"}), el("p", {text:SITE.SCOPE_LINE})]);
  scope.querySelector("p").style.margin = "0";
  var repo = el("p", null, [document.createTextNode("Repository: "), el("a", {"data-repo-link":""})]);
  var foot = el("footer", {class:"site-footer"}, el("div", {class:"site-footer__in"}, [
    footMap(),
    scope,
    el("p", {text:SITE.ANON_LINE}),
    repo,
    el("p", {text:"Figures and numbers follow the manuscript; section numbers refer to it."})
  ]));
  host.appendChild(foot);
  fillRepo(foot);
}

window.Site = {
  theme: theme, setTheme: setTheme, reducedMotion: reducedMotion, cssVar: cssVar,
  fig: function(id, opts){ return fig(id, opts); }, badge: badge, fmt: fmt, formula: formula, el: el, onReady: onReady
};

onReady(function(){
  applyMotion();
  buildHeader();
  buildFooter();
  buildCrumbs();
  buildTour();
  fillScope();
  fillFigs();
  fillBadges();
  fillRepo();
  wireTerms();
  if(window.matchMedia){
    var mq = matchMedia("(prefers-color-scheme: dark)");
    var h = function(){ if(!lsGet("theme")) fire("site:theme", {theme: theme()}); };
    if(mq.addEventListener) mq.addEventListener("change", h);
  }
});
})();
