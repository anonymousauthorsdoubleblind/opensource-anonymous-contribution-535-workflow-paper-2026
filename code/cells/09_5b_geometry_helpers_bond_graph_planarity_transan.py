# @title 5b. Geometry helpers: bond graph, planarity, transannular distances, symmetry-aware RMSD
import numpy as np
from ase import Atoms
from ase.data import covalent_radii, atomic_numbers
from scipy.optimize import linear_sum_assignment

def parse_xyz(text):
    lines = text.strip().splitlines()
    n = int(lines[0]); rows = [l.split() for l in lines[2:2 + n]]
    return [r[0] for r in rows], np.array([[float(x) for x in r[1:4]] for r in rows])

SYMBOLS, REF_POS = parse_xyz(REF_XYZ)
N_ATOMS = len(SYMBOLS)

def start_atoms(name):
    sym, pos = parse_xyz(START_XYZ[name]); return Atoms(sym, positions=pos)

def _graph(pos):
    z = [atomic_numbers[s] for s in SYMBOLS]; pairs = set()
    for i in range(N_ATOMS):
        for j in range(i + 1, N_ATOMS):
            if np.linalg.norm(pos[i] - pos[j]) < 1.2 * (covalent_radii[z[i]] + covalent_radii[z[j]]):
                pairs.add((i, j))
    return pairs

BOND_GRAPH = _graph(REF_POS)
BOND_PAIRS = sorted(BOND_GRAPH)
REF_BOND_LEN = {(i, j): float(np.linalg.norm(REF_POS[i] - REF_POS[j])) for i, j in BOND_PAIRS}
_nbr = {i: set() for i in range(N_ATOMS)}
for i, j in BOND_PAIRS: _nbr[i].add(j); _nbr[j].add(i)
_C = [i for i, s in enumerate(SYMBOLS) if s == "C"]
_TRANS_PAIRS = [(i, j) for i in _C for j in _C if i < j and (i, j) not in BOND_GRAPH and not (_nbr[i] & _nbr[j])]

def same_bond_graph(pos): return _graph(pos) == BOND_GRAPH
def fmax_of(F): return float(np.linalg.norm(F, axis=1).max())
def min_pair_distance(pos):
    d = np.linalg.norm(pos[:, None] - pos[None], axis=-1); d[np.diag_indices(len(pos))] = 9; return float(d.min())
def plane_rms(pos):
    """RMS distance (A) of the atoms from their best-fit plane. Frame independent: a tilted flat molecule gives 0."""
    p = pos if MOL["plane_atoms"] is None else pos[MOL["plane_atoms"]]     # C11H8: the ten ring carbons only
    c = p - p.mean(0); return float(np.sqrt(max(np.linalg.eigvalsh(c.T @ c / len(c))[0], 0.0)))
def transannular(pos, k=2):
    return sorted(float(np.linalg.norm(pos[i] - pos[j])) for i, j in _TRANS_PAIRS)[:k]

def _kabsch(A, B):
    A0, B0 = A - A.mean(0), B - B.mean(0)
    U, S, Vt = np.linalg.svd(B0.T @ A0)
    d = np.sign(np.linalg.det(U @ Vt)); D = np.diag([1, 1, d])
    R = U @ D @ Vt
    return B0 @ R, A0

def rmsd_sym(A, B, allow_reflection=True):
    """Standard RMSD (sqrt of the mean squared atom distance) minimised over rotations, reflection and same-element atom
    permutations (the ring's symmetry). Note: a per-coordinate (3N) normalisation would be sqrt(3) smaller."""
    best = 1e9
    for sgn in ([1, -1] if allow_reflection else [1]):
        Bm = B * np.array([1, 1, sgn]); perm = np.arange(len(A))
        for _ in range(4 if MOL["permute_symmetry"] else 0):
            Bal, A0 = _kabsch(A, Bm[perm]); newperm = perm.copy()
            for el in set(SYMBOLS):
                idx = np.array([i for i, s in enumerate(SYMBOLS) if s == el])
                _, c = linear_sum_assignment(np.linalg.norm(A0[idx][:, None] - Bal[idx][None], axis=-1))
                newperm[idx] = perm[idx][c]
            if np.array_equal(newperm, perm): break
            perm = newperm
        Bal, A0 = _kabsch(A, Bm[perm])
        best = min(best, float(np.sqrt(((A0 - Bal) ** 2).sum(1).mean())))
    return best

def fingerprint(pos, energy=None):
    return {"plane_rms_A": round(plane_rms(pos), 4), "transannular_A": [round(x, 3) for x in transannular(pos)],
            "rmsd_to_reference_A": round(rmsd_sym(REF_POS, pos), 4), "bond_graph_ok": same_bond_graph(pos),
            "energy_eV": None if energy is None else float(energy)}

print(f"Reference {MOLECULE}: {N_ATOMS} atoms, {len(BOND_PAIRS)} bonds, planarity (ring atoms) {plane_rms(REF_POS):.4f} A; transannular C...C = {[round(x,2) for x in transannular(REF_POS)]} A")
