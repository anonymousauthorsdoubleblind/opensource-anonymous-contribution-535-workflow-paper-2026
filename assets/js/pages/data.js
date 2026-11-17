(function(){
"use strict";
var FILES = window.DATA_FILES || [], XYZ = window.DATA_XYZ || {}, EX = window.DATA_EXAMPLES || {};
function kb(n){ return n < 1024 ? n + " B" : n < 1048576 ? (n/1024).toFixed(n < 10240 ? 1 : 0) + " kB" : (n/1048576).toFixed(1) + " MB"; }

/* file tables */
Array.prototype.forEach.call(document.querySelectorAll("table[data-files]"), function(t){
  var pre = t.getAttribute("data-files"), tb = t.querySelector("tbody");
  FILES.filter(function(f){ return f.path.indexOf(pre) === 0; }).forEach(function(f){
    var tr = document.createElement("tr");
    function td(c, html){ var d = document.createElement("td"); if(c) d.className = c; if(html instanceof Node) d.appendChild(html); else d.textContent = html; tr.appendChild(d); return d; }
    td("pg-fname", f.path.replace(/^[^/]+\//, ""));
    td("num", kb(f.bytes));
    td("pg-fdesc", f.desc + (f.kind === "tabulated" ? " (tabulated values of the manuscript)" : ""));
    var a = document.createElement("a"); a.href = "data/" + f.path; a.setAttribute("download", f.path.split("/").pop()); a.textContent = "Download";
    a.setAttribute("aria-label", "Download " + f.path.split("/").pop());
    td("", a);
    tb.appendChild(tr);
  });
  if(!tb.children.length){ var tr = document.createElement("tr"), d = document.createElement("td"); d.colSpan = 4; d.textContent = "No files listed."; tr.appendChild(d); tb.appendChild(tr); }
});

/* examples */
function pretty(o){ return JSON.stringify(o, null, 2); }
var s1 = document.getElementById("pg-ex-step"), s2 = document.getElementById("pg-ex-dec");
if(s1 && EX.step) s1.textContent = pretty(EX.step);
if(s2 && EX.decision) s2.textContent = pretty(EX.decision);

/* xyz viewer */
(function(){
  var sel = document.getElementById("pg-xyz-sel"), view = document.getElementById("pg-xyz-view"), txt = document.getElementById("pg-xyz-text"), note = document.getElementById("pg-xyz-note");
  if(!sel) return;
  var keys = Object.keys(XYZ).sort();
  keys.forEach(function(k){ var o = document.createElement("option"); o.value = k; o.textContent = k.replace("structures/", ""); sel.appendChild(o); });
  var mol = null;
  function parse(t){ var L = t.split("\n"), n = parseInt(L[0], 10), s = [], c = []; for(var i = 0; i < n; i++){ var p = L[i+2].trim().split(/\s+/); s.push(p[0]); c.push([+p[1], +p[2], +p[3]]); } return {symbols:s, coords:c, comment:L[1]}; }
  function align(c){   // rotate so that the plane of the molecule is x-y (principal axes; Jacobi on the 3x3 covariance)
    var n = c.length, m = [0,0,0], i, j, k, p, q;
    c.forEach(function(r){ for(i=0;i<3;i++) m[i] += r[i]/n; });
    var C = [[0,0,0],[0,0,0],[0,0,0]];
    c.forEach(function(r){ for(i=0;i<3;i++) for(j=0;j<3;j++) C[i][j] += (r[i]-m[i])*(r[j]-m[j]); });
    var V = [[1,0,0],[0,1,0],[0,0,1]];
    for(var it=0; it<30; it++){
      p = 0; q = 1; var mx = Math.abs(C[0][1]);
      if(Math.abs(C[0][2]) > mx){ p = 0; q = 2; mx = Math.abs(C[0][2]); }
      if(Math.abs(C[1][2]) > mx){ p = 1; q = 2; mx = Math.abs(C[1][2]); }
      if(mx < 1e-12) break;
      var th = 0.5*Math.atan2(2*C[p][q], C[q][q]-C[p][p]), cs = Math.cos(th), sn = Math.sin(th);
      for(k=0;k<3;k++){ var a = C[k][p], b = C[k][q]; C[k][p] = cs*a - sn*b; C[k][q] = sn*a + cs*b; }
      for(k=0;k<3;k++){ var a2 = C[p][k], b2 = C[q][k]; C[p][k] = cs*a2 - sn*b2; C[q][k] = sn*a2 + cs*b2; }
      for(k=0;k<3;k++){ var a3 = V[k][p], b3 = V[k][q]; V[k][p] = cs*a3 - sn*b3; V[k][q] = sn*a3 + cs*b3; }
    }
    var ord = [0,1,2].sort(function(a,b){ return C[b][b] - C[a][a]; });
    return c.map(function(r){ var d = [r[0]-m[0], r[1]-m[1], r[2]-m[2]]; return ord.map(function(o){ return d[0]*V[0][o] + d[1]*V[1][o] + d[2]*V[2][o]; }); });
  }
  function show(){
    var k = sel.value; if(!k) return;
    var t = XYZ[k]; txt.textContent = t;
    var m = parse(t); note.textContent = m.comment + ".";
    if(!(window.Replay && Replay.Mol)){ view.textContent = "The 3D viewer is not available; the file text is shown on the right."; return; }
    try {
      if(mol){ mol.destroy(); mol = null; }
      view.textContent = "";
      mol = Replay.Mol(view, {symbols:m.symbols, coords:align(m.coords), height:300, view:"tilt", label:"Structure " + k.replace("structures/", "")});
    } catch(e){ view.textContent = "The 3D viewer could not start; the file text is shown on the right."; }
  }
  sel.addEventListener("change", show);
  if(keys.length){ sel.value = keys.filter(function(k){ return /endpoint/.test(k); })[0] || keys[0]; show(); }
})();
})();
