# Demonstration site: an open-source, agent-supervised GPU workflow for Skala-1.1

A static website that accompanies a Technical Note under double-anonymous review. It shows how a molecule passes through the four modules of the workflow (agentic optimizer, Hessian, NMR workflow, molecular property), with figures, replays of logged runs, data, code and design notes.

Anonymous submission under double-anonymous review. Author names, affiliations, funding and contributions are withheld.

Scope: case study of two hydrocarbons, single runs per arm. Screening is not demonstrated. No speed-up is claimed.

## View it locally

Open `index.html` in a browser. There is no build step and no network access is needed: pages, scripts, data and libraries are all in this folder, and every link is relative.

## Publish it

Copy the contents of this folder to the root of the branch that serves the site. The file `.nojekyll` is included, so nothing is rewritten. The page `404.html` is picked up by the host.

## Folder map

```
index.html journey.html optimizer.html hessian.html nmr.html properties.html results.html rationale.html
explainers.html code.html data.html design.html reproduce.html about.html 404.html
README.md LICENSE .nojekyll
code/     sanitized source of the agentic optimizer module, downloadable (notebooks, one file per cell, analysis scripts, zip)
data/     downloadable run logs and tables (CSV, JSON, XYZ), MANIFEST.csv with sizes and SHA-256
assets/
  css/    site.css (design tokens and shared components), replay.css, journey.css, modules.css, pages.css
  js/     config.js (site settings), site.js (header, footer, theme, figures), replay/ (3D viewer, player, charts),
          modules/, pages/ (code viewer, gallery, data tables), journey scripts
  data/   rounded copies of the data for the interactive pages (window.DATA_* files)
  img/    figures of the manuscript, schematics, favicon
  vendor/ 3Dmol.js, highlight.js, Inter font, each with its licence
```

## Repository link

The repository link is set in one place: `REPO_URL` in `assets/js/config.js`. While it is empty, pages show the line "Anonymised repository link will be added at review."

## Licences

Code under `code/` and the scripts of this site: MIT (see `LICENSE`). Vendored libraries keep their own licences, listed in `LICENSE` and stored next to the libraries. Figures and text are copyright of the authors; reuse terms will be stated on publication.
