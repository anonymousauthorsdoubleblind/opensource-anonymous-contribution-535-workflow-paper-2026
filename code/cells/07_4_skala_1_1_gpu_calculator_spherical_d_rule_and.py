# @title 4. Skala-1.1 GPU calculator (spherical-d rule and telemetry)
import io, gc, os, time
import numpy as np
from ase.calculators.calculator import Calculator, all_changes

HARTREE_TO_EV = 27.211386
BOHR_TO_ANG = 0.529177210903
WARM = {"mol": None, "dm": None}      # density from the previous SCF, reused as the next guess when WARM_START is on

def reset_warm_start():
    WARM["mol"], WARM["dm"] = None, None

def _to_numpy(x):
    if hasattr(x, "get"):             # cupy array
        x = x.get()
    return np.asarray(x, dtype=float)

class NativeGPUSkalaCalculator(Calculator):
    """NativeGPUSkalaCalculator. Changes: (1) cart=False is explicit (golden rule: pure d functions),
    (2) telemetry counters, (3) optional density warm start, (4) optional force-unit fix. The SCF/grid/memory settings
    are unchanged."""
    implemented_properties = ['energy', 'forces']

    def __init__(self, fixed_spin=0, fixed_charge=0, basis_set="def2-svp", grid_level=3, conv_tol=1e-5, verbose=0,
                 warm_start=False, grid_response=False, align=None, rho_cut=None, **kwargs):
        super().__init__(**kwargs)
        self.rho_cut = rho_cut                  # small_rho_cutoff override (diagnostic only); None = SMALL_RHO_CUTOFF_L3
        self.align = align                      # grids.alignment; None = library default (diagnostic only)
        self.grid_response = grid_response      # diagnostic only (force check cell); off in every production run
        self.fixed_spin, self.fixed_charge = fixed_spin, fixed_charge
        self.basis_set, self.grid_level = basis_set, grid_level
        self.conv_tol, self.verbose, self.warm_start = conv_tol, verbose, warm_start
        self.n_scf = 0                 # every SCF (energy-only or with gradient)
        self.n_gradients = 0           # SCFs that also produced a gradient
        self.last_scf = {}
        self.nao = None

    def calculate(self, atoms=None, properties=['energy'], system_changes=all_changes):
        from pyscf import gto, dft
        os.environ["TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD"] = "1"   # e3nn / PyTorch>=2.6 loading fix (see GPU utilities cell)
        from skala.gpu4pyscf import SkalaKS, SkalaUKS
        super().calculate(atoms, properties, system_changes)
        t0 = time.perf_counter()
        gc.collect(); torch.cuda.empty_cache(); cp.get_default_memory_pool().free_all_blocks()

        atom_list = [[self.atoms.symbols[i], self.atoms.positions[i]] for i in range(len(self.atoms))]
        cpu_mol = gto.M(atom=atom_list, basis=self.basis_set, charge=self.fixed_charge, spin=self.fixed_spin,
                        cart=False, verbose=0)                      # GOLDEN RULE: spherical (pure) d functions
        self.nao = int(cpu_mol.nao)
        gpu_mol = cpu_mol.to_gpu()

        if self.fixed_spin > 0:
            base_ks = SkalaUKS(gpu_mol, xc="skala-1.1"); initial_density_guess = 'atom'
        else:
            base_ks = SkalaKS(gpu_mol, xc="skala-1.1");  initial_density_guess = 'minao'

        base_ks.grids.level = self.grid_level
        if self.align is not None: base_ks.grids.alignment = self.align      # newer Skala/gpu4pyscf builds: padded grids break the per-atom grid-size check (error 'Grid size mismatch')
        if self.grid_level >= 3:
            base_ks.grids.prune = dft.gen_grid.nwchem_prune
            base_ks.small_rho_cutoff = SMALL_RHO_CUTOFF_L3 if self.rho_cut is None else self.rho_cut   # see settings cell
            base_ks.max_memory = 2000        # memory-safe chunking at grid level 3
        else:
            base_ks.grids.prune = dft.gen_grid.sg1_prune
            base_ks.small_rho_cutoff = 1e-8
            base_ks.max_memory = 4000
        base_ks.verbose = self.verbose
        base_ks.conv_tol = self.conv_tol

        scf_engine = base_ks.density_fit(auxbasis="def2-universal-jkfit")
        scf_engine.init_guess = initial_density_guess

        warm_used, warm_failed = False, False
        energy_ha = None
        if self.warm_start and self.fixed_spin == 0 and WARM["dm"] is not None:
            try:
                from pyscf.scf import addons
                dm0 = cp.asarray(addons.project_dm_nr2nr(WARM["mol"], WARM["dm"], cpu_mol))
                energy_ha = float(scf_engine.kernel(dm0=dm0))
                warm_used = bool(getattr(scf_engine, "converged", True))
                if not warm_used:
                    warm_failed = True; energy_ha = None
            except Exception as e:
                warm_failed = True; energy_ha = None
                if self.verbose: print("   warm start failed, using minao:", repr(e)[:120])
        if energy_ha is None:
            scf_engine.init_guess = initial_density_guess
            energy_ha = float(scf_engine.kernel())
        self.n_scf += 1
        self.results['energy'] = energy_ha * HARTREE_TO_EV

        cycles = getattr(scf_engine, "cycles", None)
        self.last_scf = {"converged": bool(getattr(scf_engine, "converged", True)),
                         "cycles": int(cycles) if isinstance(cycles, (int, np.integer)) else None,
                         "conv_tol": float(self.conv_tol), "warm_start_used": warm_used, "warm_start_failed": warm_failed}
        if self.warm_start and self.fixed_spin == 0:
            try:
                WARM["dm"], WARM["mol"] = _to_numpy(scf_engine.make_rdm1()), cpu_mol
            except Exception:
                WARM["dm"], WARM["mol"] = None, None

        if 'forces' in properties:
            grad_analyzer = scf_engine.nuc_grad_method()
            if self.grid_response:
                try: grad_analyzer.grid_response = True
                except Exception: pass
            forces_ha_per_bohr = -_to_numpy(grad_analyzer.kernel())
            # legacy convention: Eh/Bohr x 27.211386 (so "eV/A" thresholds are really eV/Bohr). FORCE_UNIT_FIX converts properly.
            self.results['forces'] = forces_ha_per_bohr * HARTREE_TO_EV / (BOHR_TO_ANG if FORCE_UNIT_FIX else 1.0)
            self.n_gradients += 1
        self.last_scf["wall_s"] = round(time.perf_counter() - t0, 2)

        del gpu_mol, scf_engine
        torch.cuda.synchronize(); cp.cuda.Stream.null.synchronize()
        gc.collect(); torch.cuda.empty_cache(); cp.get_default_memory_pool().free_all_blocks()

class StandInCalculator(Calculator):
    """CPU dry-run stand-in: GFN2-xTB. In the second basis it adds a small bond-length shift so the basis switch changes
    the forces, as it does with DFT. It exists only to test the notebook's wiring."""
    implemented_properties = ['energy', 'forces']

    def __init__(self, basis_set="def2-svp", conv_tol=1e-5, warm_start=False, **kw):
        super().__init__(**kw)
        from tblite.ase import TBLite
        self.basis_set, self.conv_tol, self.warm_start = basis_set, conv_tol, warm_start
        self.tb = TBLite(method="GFN2-xTB", verbose=0)
        self.n_scf = self.n_gradients = 0
        self.last_scf = {}
        self.nao = MOL["nao"].get(basis_set)

    def calculate(self, atoms=None, properties=['energy'], system_changes=all_changes):
        super().calculate(atoms, properties, system_changes)
        t0 = time.perf_counter()
        a = self.atoms.copy(); a.calc = self.tb
        e, f = a.get_potential_energy(), a.get_forces()
        if self.basis_set != BASIS_PATH[0]:
            k, shift = 15.0, 0.012
            pos = self.atoms.positions
            for i, j in BOND_PAIRS:
                d = pos[j] - pos[i]; r = np.linalg.norm(d); u = d / r
                e += 0.5 * k * (r - REF_BOND_LEN[(i, j)] - shift) ** 2
                fij = -k * (r - REF_BOND_LEN[(i, j)] - shift) * u
                f[j] += fij; f[i] -= fij
        self.n_scf += 1; self.n_gradients += 1
        self.results['energy'] = float(e); self.results['forces'] = np.array(f)
        self.last_scf = {"converged": True, "cycles": 9, "conv_tol": float(self.conv_tol), "warm_start_used": False,
                         "warm_start_failed": False, "wall_s": round(time.perf_counter() - t0, 3)}

def make_calculator(basis_set, conv_tol, grid_level=3, warm_start=False, grid_response=False, align=None, rho_cut=None):
    if BACKEND == "skala":
        return NativeGPUSkalaCalculator(fixed_spin=0, fixed_charge=0, basis_set=basis_set, grid_level=grid_level,
                                        conv_tol=conv_tol, verbose=0, warm_start=warm_start, grid_response=grid_response, align=align, rho_cut=rho_cut)
    return StandInCalculator(basis_set=basis_set, conv_tol=conv_tol, warm_start=warm_start)

print("Calculator ready. Force convention:", "eV/Angstrom (corrected)" if FORCE_UNIT_FIX else "legacy convention (Eh/Bohr x 27.211386, labelled eV/A)")
print("Spherical d enforced: cart=False in every PySCF molecule." if BACKEND == "skala" else "(stand-in backend: no PySCF molecule is built)")
