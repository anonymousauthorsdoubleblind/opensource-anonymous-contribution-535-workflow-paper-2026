(function(){
"use strict";
var FILES = window.CODE_FILES || [];
var tree = document.getElementById("pg-tree"), nameEl = document.getElementById("pg-fname"), codeEl = document.getElementById("pg-code"),
    lnEl = document.getElementById("pg-ln"), dl = document.getElementById("pg-dl"), copyB = document.getElementById("pg-copy"),
    msg = document.getElementById("pg-viewer-msg"), srcEl = document.getElementById("pg-src");
if(!tree || !FILES.length){ if(msg) msg.textContent = "The source files could not be loaded."; return; }

var byPath = {}; FILES.forEach(function(f){ byPath[f.path] = f; });
var current = null;

function numOf(f){ var m = /^(\d+[a-c]?|A\d)\./.exec(f.title); return m ? m[1] : null; }

function buildTree(){
  var groups = [], seen = {};
  FILES.forEach(function(f){ if(!seen[f.group]){ seen[f.group] = []; groups.push(f.group); } seen[f.group].push(f); });
  groups.forEach(function(g){
    var h = document.createElement("h3"); h.textContent = g; tree.appendChild(h);
    var ul = document.createElement("ul");
    seen[g].forEach(function(f){
      var li = document.createElement("li"), a = document.createElement("a");
      a.href = "#f=" + f.path; a.setAttribute("data-path", f.path);
      var n = numOf(f);
      if(n){ var s = document.createElement("span"); s.className = "pg-n"; s.textContent = n; a.appendChild(s); a.appendChild(document.createTextNode(f.title.replace(/^[^.]+\.\s*/, "").replace(/\s*\(.*$/, ""))); }
      else a.textContent = f.title;
      a.title = f.path; li.appendChild(a); ul.appendChild(li);
    });
    tree.appendChild(ul);
  });
}

function show(path, focusTop){
  var f = byPath[path] || FILES[0]; current = f;
  Array.prototype.forEach.call(tree.querySelectorAll("a"), function(a){
    if(a.getAttribute("data-path") === f.path) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current");
  });
  nameEl.textContent = f.path;
  dl.href = "code/" + f.path; dl.setAttribute("download", f.path.split("/").pop());
  var text = f.text.replace(/\n$/, "");
  var n = text.split("\n").length, ln = [];
  for(var i = 1; i <= n; i++) ln.push(i);
  lnEl.textContent = ln.join("\n");
  var html = null;
  if(window.hljs && f.lang && f.lang !== "text"){
    try { html = hljs.highlight(text, {language: f.lang, ignoreIllegals: true}).value; } catch(e){ html = null; }
  }
  if(html !== null) codeEl.innerHTML = html; else codeEl.textContent = text;
  srcEl.scrollTop = 0; srcEl.scrollLeft = 0;
  msg.textContent = n + " lines" + (f.lang === "python" ? ", Python" : f.lang === "diff" ? ", unified diff" : "");
  copyB.textContent = "Copy";
}

function fromHash(){
  var m = /^#f=(.+)$/.exec(decodeURIComponent(location.hash || ""));
  show(m ? m[1] : FILES[0].path);
}

copyB.addEventListener("click", function(){
  if(!current) return;
  function ok(){ copyB.textContent = "Copied"; setTimeout(function(){ copyB.textContent = "Copy"; }, 1600); }
  function fallback(){
    var ta = document.createElement("textarea"); ta.value = current.text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); ok(); } catch(e){ copyB.textContent = "Copy failed"; }
    document.body.removeChild(ta);
  }
  if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(current.text).then(ok, fallback); else fallback();
});

/* links in the code map */
function wireMap(){
  var by = {}; FILES.forEach(function(f){ var n = numOf(f); if(n) by[n] = f; });
  Array.prototype.forEach.call(document.querySelectorAll("td[data-cells]"), function(td){
    var cells = td.getAttribute("data-cells").split(","); td.textContent = "";
    cells.forEach(function(c, i){
      var f = by[c];
      if(i) td.appendChild(document.createTextNode(", "));
      if(f){ var a = document.createElement("a"); a.href = "#f=" + f.path; a.textContent = c; a.addEventListener("click", function(){ var v = document.getElementById("viewer"); if(v && v.scrollIntoView) setTimeout(function(){ v.scrollIntoView(); }, 0); }); td.appendChild(a); }
      else td.appendChild(document.createTextNode(c));
    });
  });
}

buildTree(); wireMap();
window.addEventListener("hashchange", fromHash);
fromHash();
})();
