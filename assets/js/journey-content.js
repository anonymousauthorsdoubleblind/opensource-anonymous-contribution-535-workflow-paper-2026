/* Text of the seven journey stages. Variants: {C10H6: "...", C11H8: "..."} (or null for "omit"). */
(function () {
  "use strict";
  function V(a, b) { return { C10H6: a, C11H8: b }; }
  var F = 'f<sub>max</sub>';
  var C10 = 'C<sub>10</sub>H<sub>6</sub>', C11 = 'C<sub>11</sub>H<sub>8</sub>';
  var N13 = '<sup>13</sup>C', N1 = '<sup>1</sup>H';

  window.JOURNEY = {
    lede: "Follow a distorted structure through the four open-source modules. Each stage shows what goes in, what is computed, what comes out, and why that computation is done there.",
    molecules: {
      C10H6: { label: C10 + " · 16 atoms", name: "dehydro[10]annulene" },
      C11H8: { label: C11 + " · 19 atoms", name: "C11H8 annulene-type hydrocarbon" }
    },
    unitNote: "Forces are shown in eV Å⁻¹ as in the manuscript (section 2.2): the logged eV bohr⁻¹ values multiplied by 1.8897. The force target of 0.038 eV Å⁻¹ is 0.02 in the logged unit. The data files keep the logged values.",
    strandBanner: "Computed in the Note on the def2-TZVP minima of the separately run hand-set route, not on output of the Hessian module. The two routes meet at def2-TZVP: 0.004 Å and 0.8 meV apart for C₁₀H₆, 0.007 Å and 3.5 meV for C₁₁H₈ (section 3.4).",
    handover: "One end point per molecule goes on, unchanged, as unrounded coordinates with provenance metadata, to the Hessian module and to the NMR workflow module.",
    stages: [
      {
        id: "input", n: 0, rail: "Input", chip: "Input", module: 0, title: "The input", badges: ["logged"],
        badgeNote: "The start coordinates are the files used in the runs.",
        section: "sections 1.2 and 2.1",
        input: V("A distorted structure as an .xyz file: 16 atoms of " + C10 + ", start R1, bent out of the ring plane.",
                 "A distorted structure as an .xyz file: 19 atoms of " + C11 + ", start R1, bent out of the ring plane."),
        compute: "Nothing yet. This is what a candidate looks like when it arrives: rough and strained.",
        why: "Each candidate enters the optimize-and-simulate step as a rough, strained structure. Strained means that bonds and angles are pushed away from their relaxed values. The two test molecules are laboratory-synthesized dehydro[10]annulenes with published NMR spectra, so the end of the journey can be checked against experiment (sections 1.2 and 2.1).",
        numbers: [
          V("Energy above the end point: 1.42 eV", "Energy above the end point: 3.79 eV"),
          V("Second start, R3: 3.45 eV (twisted)", "Second start, R3: about 3.58 eV"),
          "Level of the pilot: Skala-1.1/def2-SVP",
          "Budget: 150 gradients per run"
        ],
        limit: "Two related planar hydrocarbons of 16 and 19 atoms. How far the results transfer to larger, flexible or heteroatom-containing molecules is not tested (section 5.1).",
        deeper: [["Start structures as files", "data.html#structures"]],
        dataAnchor: "structures"
      },
      {
        id: "xtb", n: 1, rail: "xTB", chip: "Module 1 · agentic optimizer", module: 1, title: "GFN2-xTB basin search", badges: ["logged"],
        section: "section 2.2",
        input: "The start structure.",
        compute: "Plain code runs a GFN2-xTB basin search from 13 seeds. It returns a table of candidate basins, the valleys of the energy surface. The language model then chooses the starting basin from that table (section 2.2).",
        why: "A fast tight-binding method surveys the valleys before any expensive Skala-1.1 gradient is spent. If another basin lay lower, the run could start there. In this module GFN2-xTB searches for basins and does not relax the Skala-1.1 start.",
        numbers: [
          "13 seeds",
          "1 planar basin found",
          "A basin switch needs a DFT single point that prefers the other basin by at least 43 meV"
        ],
        limit: "One planar basin was found for each molecule, so the choice of basin was not exercised as a decision on the annulenes (section 3.7).",
        deeper: [["Every decision at the guard", "optimizer.html#guard"]],
        dataAnchor: "traj"
      },
      {
        id: "opt", n: 2, rail: "Optimize", chip: "Module 1 · agentic optimizer", module: 1, title: "Supervised L-BFGS on Skala-1.1", badges: ["logged"],
        section: "sections 1.2 and 2.2",
        input: "The start structure and a schedule of passes. Each pass carries a step cap, a force target, an SCF tolerance and a step budget. Here the step cap was set too small on purpose: 0.005 Å.",
        compute: "L-BFGS on Skala-1.1/def2-SVP makes every geometry step. After each step, plain code checks six stall triggers over a five-step window. Most steps raise no trigger. At a trigger the controller proposes one typed action; a validator checks it; an accepted change runs for five steps on probation and is rolled back if the run has become worse. The controller changes settings only and never writes coordinates.",
        why: "Too small a cap makes the optimizer creep; too large a cap can wreck the structure. With a neural functional, each wasted step is one expensive gradient. Settings are therefore adapted during the run, without a restart, and behind a guard that bounds each change and reverses it if the run gets worse (sections 1.2 and 2.2).",
        numbers: {
          C10H6: [
            "Start cap 0.005 Å (forty times below the ASE default)",
            "Cap raised at steps 6, 11 and 19, to 0.01, 0.02 and 0.04 Å; all three changes kept after probation",
            "Force target reached at step 60 (repeat run: 58)",
            "Plain run with the same settings: not below the target within 149 steps, held at the cap on 100% of its steps",
            "Supervised runs held at the cap on 30 to 40% of steps",
            "Rules run, no language model: step 50",
            "Plain run at the ASE defaults: 48 steps",
            "Final " + F + " of this run: 0.027 eV Å<sup>−1</sup>"
          ],
          C11H8: [
            "Start cap 0.005 Å",
            "Cap raised from step 6 onward",
            "Force target reached at step 70 (repeat run: 70)",
            "Plain run with the same settings: step 129, held at the cap on 95% of its steps",
            "Supervised runs held at the cap on 30 to 40% of steps",
            "The end point handed to modules 2 and 3 came from a different supervised run (main grid, weak hand schedule, start R1; final " + F + " 0.008 eV Å<sup>−1</sup>)"
          ],
          both: ["Guard bounds: per decision the cap may at most double (or rise to 0.02 Å, if that is larger) and never exceeds 0.05 Å; probation five steps; after two rollbacks the controller is switched off"]
        },
        limit: V("The cap was mis-set on purpose. Supervision guards against a poor setting; it does not improve on a good one: with a sensible cap of 0.025 Å the two arms tied (50 against 53 steps). Single runs, given as step counts. No gain in speed is claimed. A rule-based controller did as well where we tested it, so a language model is not shown to be required (section 3.6).",
                 "The cap was mis-set on purpose. Supervision guards against a poor setting; it does not improve on a good one: with a sensible cap of 0.025 Å the two arms tied (63 against 65 steps). Single runs, given as step counts. No gain in speed is claimed. A rule-based controller did as well where we tested it, so a language model is not shown to be required (section 3.6)."),
        deeper: [["All three starting caps, both molecules", "optimizer.html#sweep"], ["Every decision at the guard", "optimizer.html#guard"], ["One supervised step, as a diagram", "design.html#one-step"]],
        dataAnchor: "traj"
      },
      {
        id: "check", n: 3, rail: "Check", chip: "Module 1 · agentic optimizer", module: 1, title: "Checked end point", badges: ["logged"],
        section: "section 3.5",
        input: "The last structure of the run, which has reached the force target.",
        compute: "A curvature probe runs whenever a run appears to have reached the force target. The model then makes a final check of the structure, the bonds and the planarity.",
        why: "A run that meets the force target has not yet been shown to sit at a minimum: at a saddle point the forces vanish too. When many structures are processed automatically, such an error would pass unnoticed. So the end point is checked before it is handed on (section 3.5).",
        numbers: [
          "16 of the 18 supervised runs reached the force target: nine for C₁₀H₆ and seven for C₁₁H₈",
          V("End points differ by at most 0.016 Å in pairwise RMSD", "End points differ by at most 0.028 Å in pairwise RMSD"),
          "Energies within 1.7 meV",
          V("Separately run hand-set route, after re-optimization at def2-TZVP: 0.004 Å and 0.8 meV apart", "Separately run hand-set route, after re-optimization at def2-TZVP: 0.007 Å and 3.5 meV apart")
        ],
        limit: "One planar basin for each molecule. Both routes share the functional and the L-BFGS family of optimizers, so this tests the path and the settings, not the functional. The other two runs lost the C₁₁H₈ structure at the first step with a 0.3 Å cap. On the annulenes the probe met no imaginary mode (section 3.4).",
        side: { text: "What if a run had stopped on a mountain pass? See the ammonia saddle test.", href: "optimizer.html#saddle" },
        deeper: [["Ammonia saddle test", "optimizer.html#saddle"]],
        dataAnchor: "traj"
      },
      {
        id: "hessian", n: 4, rail: "Hessian", chip: "Module 2 · Hessian", module: 2, title: "Hessian module", badges: ["tables"],
        section: "sections 2.1, 2.3 and 3.2",
        input: V("The agent end point, re-optimized at Skala-1.1/def2-TZVP until the largest force fell below 0.01 eV Å<sup>−1</sup> (final value 0.0082 eV Å<sup>−1</sup>).",
                 "The agent end point, re-optimized at Skala-1.1/def2-TZVP until the largest force fell below 0.01 eV Å<sup>−1</sup> (final value 0.0057 eV Å<sup>−1</sup>)."),
        compute: V("Every Cartesian coordinate is displaced by ±0.01 Å and the Skala-1.1 forces are evaluated at each displaced structure: 6N + 1 = 97 gradients. The Hessian is assembled from differences of the forces, projected free of translations and rotations, mass-weighted and diagonalized.",
                   "Every Cartesian coordinate is displaced by ±0.01 Å and the Skala-1.1 forces are evaluated at each displaced structure: 6N + 1 = 115 gradients. The Hessian is assembled from differences of the forces, projected free of translations and rotations, mass-weighted and diagonalized."),
        why: "The forces vanish at a valley floor and at a mountain pass alike; only the curvature tells them apart. The Hessian module is run on a structure that has reached the force target, not at every step. The same calculation gives the harmonic frequencies, the IR intensities and the vibrational density of states (sections 2.1, 2.3 and 3.2).",
        numbers: [
          V("42 vibrational modes, none imaginary, in three setups", "51 vibrational modes, none imaginary, in three setups"),
          V("Lowest three modes: 142.0, 168.2, 179.0 cm<sup>−1</sup>", "Lowest three modes: 89.0, 89.3, 182.4 cm<sup>−1</sup>"),
          V("Strongest IR band, out-of-plane C–H wag: 705.2 cm<sup>−1</sup> (93.6 km mol<sup>−1</sup>)", "Strongest IR band, out-of-plane C–H wag: 718.7 cm<sup>−1</sup> (59.5 km mol<sup>−1</sup>)"),
          V("C≡C stretch: 2056.6 and 2173.4 cm<sup>−1</sup>; the second is IR-inactive by symmetry", "C≡C stretch: 2244.8 cm<sup>−1</sup>"),
          "Energy scans along four modes: 32 of 32 displaced structures above the minimum",
          "Analytic force over finite-difference slope: 0.9991 to 1.0002",
          V("Hessian with IR intensities: 16.1 min on one A100 (40 GB)", "Hessian with IR intensities: 22.0 min on one A100 (40 GB)")
        ],
        limit: V("This gives the sign of every curvature, not the accuracy of the frequencies. The frequencies are harmonic and unscaled, precise to about ±20 cm<sup>−1</sup>, and are not compared with a measured spectrum. One displacement step and one integration grid were used.",
                 "This gives the sign of every curvature, not the accuracy of the frequencies. The frequencies are harmonic and unscaled, precise to about ±20 cm<sup>−1</sup>, and are not compared with a measured spectrum. One displacement step and one integration grid were used. The two softest modes of C₁₁H₈ (89 cm<sup>−1</sup>) are strongly anharmonic and are reported by sign and character only."),
        deeper: [["Hessian module, in detail", "hessian.html"]],
        dataAnchor: "hessian"
      },
      {
        id: "nmr", n: 5, rail: "NMR", chip: "Module 3 · NMR workflow", module: 3, title: "NMR workflow module", badges: ["tables"],
        section: "sections 1.2, 2.4 and 3.1",
        input: "The same agent end point, re-optimized with Skala-1.1 in the 6-31+G(d,p) basis, the geometry basis of the published protocol.",
        compute: "GIAO shieldings in the gas phase, in the 6-311+G(2d,p) basis, with two conventional functionals: B3LYP (probe P1) and PBE0 (probe P2). Shieldings are converted to shifts with the published slope and intercept of each probe. No parameter was fitted to the two molecules.",
        why: "An NMR spectrum is a fingerprint of the structure that a laboratory can measure. C₁₁H₈ is a liquid at room temperature, so no crystal structure exists and the NMR spectra are the primary experimental reference. The shifts are computed on the Skala-1.1 geometry: this tests the geometry, not NMR with Skala-1.1 (sections 1.2, 2.4 and 3.1).",
        numbers: [
          V(N13 + " MAE 1.95 and 1.77 ppm; recommended limit 2.0 ppm (Parmar et al.)", N13 + " MAE 1.30 and 1.37 ppm; recommended limit 2.0 ppm (Parmar et al.)"),
          V(N1 + " MAE 0.169 and 0.108 ppm; limit 0.2 ppm", N1 + " MAE 0.120 and 0.082 ppm; limit 0.2 ppm"),
          V("Gap between the two ring-proton signals: 0.64 ppm measured; 0.64 (P1) and 0.67 (P2) computed", "Largest " + N13 + " error at the sp<sup>3</sup> carbon C6: +1.92 (P1) and +2.83 (P2) ppm"),
          "All 24 resolvable signal pairs of the two molecules appear in the measured order"
        ],
        limit: V("The shieldings come from B3LYP and PBE0, not from Skala-1.1, and refer to the gas phase. It does not rank Skala-1.1 against other functionals. The alkyne carbons of C₁₀H₆ are 3.3 (P1) and 4.9 (P2) ppm too high; weighted by nucleus, its " + N13 + " error would rise to 2.1 ppm, slightly above the limit. The signal order is a necessary condition, not a discriminating one.",
                 "The shieldings come from B3LYP and PBE0, not from Skala-1.1, and refer to the gas phase. It does not rank Skala-1.1 against other functionals. The signal order is a necessary condition, not a discriminating one."),
        deeper: [["NMR workflow module, in detail", "nmr.html"]],
        dataAnchor: "nmr"
      },
      {
        id: "props", n: 6, rail: "Properties", chip: "Module 4 · molecular property", module: 4, title: "Molecular property module", badges: ["tables"],
        section: "section 3.8", banner: true,
        input: "A def2-TZVP structure that has reached the force target. In the Note this is the minimum of the separately run hand-set route (xTB, MACE and staged Skala-1.1 passes).",
        compute: "Self-consistent-field properties with Skala-1.1: meta-Löwdin atomic charges, electrostatic potential maps and frontier orbitals, set side by side with the range-separated hybrid ωB97M-V at def2-TZVP. As a further reference, the relaxation energy of one geometry pair per molecule is compared with frozen-core CCSD(T)/def2-TZVP single points.",
        why: "A verified structure is the starting point for the quantities a chemist uses: where the electronic charge sits and how much energy a distortion costs. An established hybrid functional and CCSD(T) give a second opinion (section 3.8).",
        numbers: [
          V("Meta-Löwdin charges against ωB97M-V: R² above 0.999 for both molecules", "Meta-Löwdin charges against ωB97M-V: R² above 0.999 for both molecules; for C₁₁H₈ the mean difference is 0.0025 e and no atom differs by more than 0.01 e"),
          V("Relaxation energy of the pair, CCSD(T): 87.58 kcal mol<sup>−1</sup>", "Relaxation energy of the pair, CCSD(T): 21.71 kcal mol<sup>−1</sup>"),
          V("Skala-1.1: +3.13 (3.6%) kcal mol<sup>−1</sup>", "Skala-1.1: −0.40 kcal mol<sup>−1</sup>"),
          V("ωB97M-V: +4.25 (4.9%) kcal mol<sup>−1</sup>", "ωB97M-V: +0.36 kcal mol<sup>−1</sup>"),
          "Property single point: 149 s per C₁₁H₈ geometry on a T4"
        ],
        limit: "A case study of two geometry pairs: not a statement of chemical accuracy and not a ranking of the two functionals. Frozen-core CCSD(T) without basis-set extrapolation; the integration grids and dispersion treatments of the two functionals were not matched. Energies are electronic energies at fixed nuclei, on the Born–Oppenheimer surface; no free energy is reported.",
        deeper: [["Molecular property module, in detail", "properties.html"]],
        dataAnchor: "props"
      }
    ],
    closing: {
      title: "What the journey delivered",
      lines: [
        [1, "16 of 18 supervised runs reached the force target, all at one structure"],
        [2, "No imaginary mode among 42 and 51 modes, in three setups"],
        [3, "<sup>13</sup>C errors of 1.30 to 1.95 ppm against the 2.0 ppm limit; <sup>1</sup>H errors of 0.08 to 0.17 ppm against 0.2 ppm"],
        [4, "Atomic charges with R² above 0.999 against ωB97M-V"]
      ],
      links: [["Results", "results.html"], ["Why and what is new", "rationale.html"]]
    },
    modeLabels: { wag: "Out-of-plane C–H wag", cc: "C≡C stretch", ch: "C–H stretch" }
  };
})();
