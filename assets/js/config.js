(function(){
window.SITE = {
  TITLE: "An open-source, agent-supervised GPU workflow for Skala-1.1: demonstration site",
  SHORT: "Skala-1.1 workflow demo",
  STATUS: "Anonymous submission under double-anonymous review",
  REPO_URL: "",
  REPO_NOTE: "Anonymised repository link will be added at review.",
  SCOPE_LINE: "Case study of two hydrocarbons, single runs per arm. Screening is not demonstrated. No speed-up is claimed.",
  ANON_LINE: "Anonymous submission under double-anonymous review. Author names, affiliations, funding and contributions are withheld.",
  FMAX_FACTOR: 1.8897,
  FORCE_TARGET_EVA: 0.038,
  NAV: [
    {id:"home",    label:"Home",    href:"index.html",
     desc:"What the site shows, the four modules, the main numbers and where to go next."},
    {id:"journey", label:"Journey", href:"journey.html",
     desc:"One input structure, seven stages, four modules: what comes out at each stage and why the step is there."},
    {id:"modules", label:"Modules", href:"index.html#modules", children:[
      {id:"optimizer",  label:"1 · Agentic optimizer",  href:"optimizer.html",  module:1,
       desc:"GFN2-xTB basin search, then L-BFGS on Skala-1.1 under the supervision layer: step-cap sweep, guard log, ammonia saddle test."},
      {id:"hessian",    label:"2 · Hessian",            href:"hessian.html",    module:2,
       desc:"Finite-difference Hessian of the finished structure: frequencies, IR spectrum, minimum or saddle point."},
      {id:"nmr",        label:"3 · NMR workflow",       href:"nmr.html",        module:3,
       desc:"GIAO shieldings with B3LYP and PBE0 on the Skala-1.1 geometry, beside the measured spectra."},
      {id:"properties", label:"4 · Molecular property", href:"properties.html", module:4,
       desc:"Charges, potential and orbitals beside \u03c9B97M-V; relaxation energy beside CCSD(T), on the hand-set minima."}]},
    {id:"results",   label:"Results", href:"results.html",
     desc:"Nine findings, each with its test, main number, benchmark and limit; Table 6."},
    {id:"rationale", label:"Why and what is new", href:"rationale.html",
     desc:"Four needs, four gaps in the literature, the limits on those statements, and what is not claimed."},
    {id:"understand", label:"Understand", href:"index.html#sitemap", children:[
      {id:"explainers", label:"Explainers", href:"explainers.html",
       desc:"The ideas in pictures: walking downhill, what the step cap does, three checks on a finished structure."},
      {id:"design",     label:"Design",     href:"design.html",
       desc:"How the workflow is built: supervision layer, closed vocabulary, guard bounds, two routes, software stack."}]},
    {id:"reuse", label:"Reuse", href:"index.html#sitemap", children:[
      {id:"code",      label:"Code",      href:"code.html",
       desc:"Read the source of the agentic optimizer module in the browser and download the source archive."},
      {id:"data",      label:"Data",      href:"data.html",
       desc:"Every file behind the replays and charts, with its origin: structures, trajectories, logs, tables."},
      {id:"reproduce", label:"Reproduce", href:"reproduce.html",
       desc:"Requirements, order of the runs, what to expect, and why a rerun may differ."}]},
    {id:"about", label:"About", href:"about.html",
     desc:"Anonymity, how to cite, the limitations in full, what the labels mean, licences."}
  ],
  /* guided tour: order of the Previous / Next pager on every page */
  TOUR: ["home","journey","optimizer","hessian","nmr","properties","results","rationale",
         "explainers","design","code","data","reproduce","about"],
  /* footer sitemap columns */
  FOOT: [
    {title:"Start",      ids:["home","journey"]},
    {title:"Modules",    ids:["optimizer","hessian","nmr","properties"]},
    {title:"Evidence",   ids:["results","rationale"]},
    {title:"Understand", ids:["explainers","design"]},
    {title:"Reuse",      ids:["code","data","reproduce","about"]}
  ],
  MODULES: {
    1:{id:"optimizer",  name:"Agentic optimizer module",  verb:"Optimize",   href:"optimizer.html",
       question:"Can a rough, strained structure be taken to a Skala-1.1 structure with settings that adapt during the run?"},
    2:{id:"hessian",    name:"Hessian module",            verb:"Verify",     href:"hessian.html",
       question:"Is the end point a true minimum?"},
    3:{id:"nmr",        name:"NMR workflow module",       verb:"Compare",    href:"nmr.html",
       question:"Does the Skala-1.1 geometry agree with what the laboratory measures?"},
    4:{id:"properties", name:"Molecular property module", verb:"Properties", href:"properties.html",
       question:"Do the properties agree with established methods?"}
  }
};
})();
