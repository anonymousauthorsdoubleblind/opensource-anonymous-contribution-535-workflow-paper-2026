# Data of the demonstration site

Every file is a run log or a table of the Note. Interactive pages of the site read rounded copies of the same numbers.

## Folders

| Folder | What | Level of theory |
|---|---|---|
| `structures/` | Starting geometries R1 and R3, the end point handed to the Hessian and NMR workflow modules, and the Skala-1.1/6-31+G(d,p) geometry | as named in the file |
| `trajectories/` | Step-cap sweep: for each of 16 runs a multi-frame xyz (frame 0 = start), a per-step CSV and an events JSON | Skala-1.1/def2-SVP |
| `sweep/` | Energy, force and step-cap series of the 16 runs, the two controls, first step below the force target | Skala-1.1/def2-SVP |
| `grid/` | The main grid of 16 single runs | Skala-1.1/def2-SVP |
| `guard/` | Counts of decisions, validator outcomes and probations | Skala-1.1/def2-SVP |
| `saddle/` | Ammonia and hydrogen peroxide saddle tests | Skala-1.1 |
| `hessian/` | Vibrational modes, scans, key modes | Skala-1.1/def2-TZVP, B3LYP, Skala-1.1/6-31+G(d,p) |
| `nmr/` | Experimental and computed shifts, table 1 | GIAO B3LYP and PBE0 on the Skala-1.1/6-31+G(d,p) geometry |
| `properties/` | Relaxation energy differences, charge alignment | def2-TZVP minima of the hand-set route |
| `MANIFEST.csv` | Path, size, sha256, description, molecule, level of theory, run, kind (logged or tabulated) | |

## Units and caveats

- Energies in eV (Born-Oppenheimer totals, no zero-point, thermal or entropy term); lengths in angstrom; wavenumbers in cm-1; relaxation energies in kcal/mol.
- Forces: Forces of the annulene runs are logged in the unit of the run log (eV per bohr value labelled eV/A). The manuscript reports eV/A = logged value x 1.8897; the force target 0.02 in the logged unit is 0.038 eV/A. Files keep the logged values; columns named fmax_eV_per_A hold the converted value.
- Main-grid runs are single runs of two set-ups that also differ in L-BFGS memory and warm start (supervised: memory 20, warm start; plain: memory 1, cold start). Their step counts are not the effect of the agent alone and no speed-up is claimed from them. The like-for-like test is the step-cap sweep.
- All runs are single runs and a small sample; the files document a stress test, not a statistical study.
- Ammonia and hydrogen peroxide forces are shown as logged by the compact test engine and are not converted.
- The complete prompt, call and response logs are part of the repository release and are not included here. Model identifiers are replaced by a role (routine model, check model).
