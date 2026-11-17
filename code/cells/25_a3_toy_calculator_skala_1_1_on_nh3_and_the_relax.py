# @title A3. Toy calculator (Skala-1.1 on NH3) and the relaxed inversion scan (the known double well)
from ase.calculators.calculator import Calculator, all_changes
from scipy.optimize import minimize_scalar

class ToySkalaCalculator(NativeGPUSkalaCalculator):
    """The production Skala calculator, with two toy-only changes: (1) forces always come with the energy (so reading the energy
    first never costs a second SCF), (2) forces are converted to true eV/A when FORCE_UNIT_FIX is off."""
    def calculate(self, atoms=None, properties=['energy'], system_changes=all_changes):
        super().calculate(atoms, ['energy', 'forces'], system_changes)
        if 'forces' in self.results and not FORCE_UNIT_FIX:
            self.results['forces'] = self.results['forces'] / BOHR_TO_ANG

def make_toy_calculator():
    if BACKEND == "skala":
        return ToySkalaCalculator(fixed_spin=0, fixed_charge=0, basis_set="def2-svp", grid_level=3, conv_tol=1e-8, verbose=0, warm_start=False)
    from tblite.ase import TBLite                          # wiring-test stand-in (GFN2-xTB), NOT a result
    class _XTB(Calculator):
        implemented_properties = ['energy', 'forces']
        def __init__(self):
            super().__init__(); self.tb = TBLite(method="GFN2-xTB", verbose=0); self.n_gradients = 0
        def calculate(self, atoms=None, properties=['energy'], system_changes=all_changes):
            super().calculate(atoms, properties, system_changes); a = self.atoms.copy(); a.calc = self.tb
            self.results['energy'] = float(a.get_potential_energy()); self.results['forces'] = a.get_forces(); self.n_gradients += 1
    return _XTB()

def nh3_geom(h, r):
    rho = np.sqrt(max(r * r - h * h, 1e-6)); ang = np.deg2rad([90, 210, 330])
    return Atoms("NH3", positions=[[0, 0, h]] + [[rho * np.cos(a), rho * np.sin(a), 0.0] for a in ang])

TOY_CALC = make_toy_calculator()
scan_path = os.path.join(TOY_DIR, "nh3_pes.json")
if os.path.exists(scan_path):
    PES = json.load(open(scan_path)); print("Inversion scan loaded from", scan_path)
else:
    PES, t0 = [], time.time()
    for h in ([0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6] if TOY_SIZE == "quick" else [0.0, 0.1, 0.2, 0.3, 0.35, 0.4, 0.5, 0.6, 0.8]):
        def _e(r):
            a = nh3_geom(h, r); a.calc = TOY_CALC; return a.get_potential_energy()
        res = minimize_scalar(_e, bounds=(0.95, 1.12), method="bounded", options={"xatol": 1e-3})
        PES.append(dict(h=h, r_NH=float(res.x), E_eV=float(res.fun))); print(f"   h={h:.2f} A  r_NH={res.x:.4f} A  ({time.time()-t0:.0f} s)")
    E0 = min(p["E_eV"] for p in PES)
    for p in PES: p["E_rel_kcal"] = (p["E_eV"] - E0) * 23.0605
    json.dump(PES, open(scan_path, "w"), indent=1)
barrier = max(p["E_rel_kcal"] for p in PES); h_min = min(PES, key=lambda p: p["E_rel_kcal"])["h"]
print(f"Skala relaxed inversion curve: barrier {barrier:.1f} kcal/mol (PBE/def2-SVP gave 6.3), minimum near h = {h_min} A")
print("   h (A):", [p["h"] for p in PES]); print("   E (kcal/mol):", [round(p["E_rel_kcal"], 2) for p in PES])
if not (1.0 < barrier < 15.0) or not (0.2 <= h_min <= 0.6):
    print("   WARNING: the curve is not the expected double well. Check the Skala install before reading any toy result.")
R_PLANAR = [p for p in PES if p["h"] == 0.0][0]["r_NH"]
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
fig, ax = plt.subplots(figsize=(6.5, 3.6)); hs = [p["h"] for p in PES if p["h"] > 0]; es = [p["E_rel_kcal"] for p in PES if p["h"] > 0]
xs = [-h for h in hs[::-1]] + [0.0] + hs; ys = es[::-1] + [PES[0]["E_rel_kcal"]] + es
ax.plot(xs, ys, "-o", color="#5f6368"); ax.set_xlabel("N height above the H3 plane (A), mirrored"); ax.set_ylabel("E (kcal/mol)"); ax.set_title("NH3 inversion, relaxed scan, same calculator as the runs")
fig.tight_layout(); os.makedirs(os.path.join(TOY_DIR, "figs"), exist_ok=True); fig.savefig(os.path.join(TOY_DIR, "figs", "nh3_inversion_skala.png"), dpi=150); plt.close(fig)
