# @title 9. Surrogate tools (GFN2-xTB): relaxation, soft modes, basin exploration, preconditioner
import numpy as np
from ase import Atoms
from ase.optimize import BFGS, LBFGS
from tblite.ase import TBLite

def xtb_atoms(pos):
    a = Atoms(SYMBOLS, positions=np.array(pos, float)); a.calc = TBLite(method="GFN2-xTB", verbose=0); return a

def xtb_relax(pos, fmax=0.02, steps=400):
    a = xtb_atoms(pos); LBFGS(a, logfile=None, maxstep=0.1, memory=20).run(fmax=fmax, steps=steps)
    return a.positions.copy(), float(a.get_potential_energy())

def xtb_energy(pos): return float(xtb_atoms(pos).get_potential_energy())

def xtb_hessian(pos, delta=0.01):
    """Cartesian Hessian (eV/A^2) by central differences of xTB forces: 6 N cheap gradients (N atoms)."""
    a = xtb_atoms(pos); n3 = 3 * len(a); H = np.zeros((n3, n3)); x0 = a.positions.copy()
    for k in range(n3):
        for sgn in (+1, -1):
            x = x0.copy().reshape(-1); x[k] += sgn * delta; a.positions = x.reshape(-1, 3)
            H[k] += -sgn * a.get_forces().reshape(-1) / (2 * delta)
    return 0.5 * (H + H.T)

def surrogate_modes(pos, n_soft=6):
    """Softest vibrational modes of the xTB Hessian (the 6 rigid-body modes are removed). Each mode is a unit vector in 3N space."""
    H = xtb_hessian(pos); w, U = np.linalg.eigh(H)
    rigid = np.argsort(np.abs(w))[:6]; vib = [i for i in np.argsort(w) if i not in set(rigid)]
    normal = np.linalg.svd(pos - pos.mean(0))[2][2]                      # best-fit plane normal
    out = []
    for i in vib[:n_soft]:
        v = U[:, i].reshape(-1, 3); out.append(dict(index=int(i), curvature_eV_A2=float(w[i]), vec=U[:, i].copy(),
                                                    out_of_plane_share=float(((v @ normal) ** 2).sum() / (v ** 2).sum())))
    return out, H

def surrogate_preconditioner(pos, H=None):
    """Positive-definite starting Hessian from xTB: vibrational floor 0.3 eV/A^2, rigid-body modes 30."""
    H = xtb_hessian(pos) if H is None else H; w, U = np.linalg.eigh(H); idx = np.argsort(np.abs(w))
    lam = np.maximum(w, 0.3); lam[idx[:6]] = 30.0
    return (U * lam) @ U.T

def explore_basins(pos, amp_rms=0.15, seed=0, n_modes=6):
    """Surrogate search for basins near the start: relax the start with xTB, push +/- along the softest modes, relax each, cluster.
    Deterministic (the pushes are fixed vectors); seed only labels the call."""
    x_s, e_s = xtb_relax(pos)
    modes, _ = surrogate_modes(x_s, n_modes)
    seeds = [("start_relaxed", x_s)]
    for k, m in enumerate(modes):
        for sgn in (+1, -1):
            seeds.append((f"mode{k}{'+' if sgn > 0 else '-'}", x_s + sgn * amp_rms * np.sqrt(N_ATOMS) * m["vec"].reshape(-1, 3)))
    basins = []
    for label, x in seeds:
        try:
            xr, er = xtb_relax(x, fmax=0.01)
        except Exception:
            continue
        if not same_bond_graph(xr): continue
        for b in basins:
            if abs(b["E_xtb_eV"] - er) < 5e-4 and rmsd_sym(b["pos"], xr) < 0.05:
                b["n_seeds"] += 1; b["seeds"].append(label); break
        else:
            basins.append(dict(E_xtb_eV=er, pos=xr, n_seeds=1, seeds=[label], plane_rms_A=plane_rms(xr), rmsd_to_ref_A=rmsd_sym(REF_POS, xr)))
    basins.sort(key=lambda b: b["E_xtb_eV"])
    for i, b in enumerate(basins): b["id"] = i; b["rel_xtb_meV"] = 1000 * (b["E_xtb_eV"] - basins[0]["E_xtb_eV"])
    return basins, modes

print("Surrogate tools ready (GFN2-xTB via tblite).")
