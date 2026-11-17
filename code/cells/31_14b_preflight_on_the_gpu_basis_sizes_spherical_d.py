# @title 14b. Preflight on the GPU: basis sizes, spherical-d check, seconds per gradient, warm-start check (run once, about 10 minutes on an L4)
RUN_PREFLIGHT = True   # @param {type:"boolean"}
if RUN_PREFLIGHT:
    pf = {}
    a0 = start_atoms("P0")
    print("Preflight on start P0. This also measures the time per gradient.")
    for basis in dict.fromkeys(BASIS_PATH):
        calc = make_calculator(basis, 1e-6, 3, warm_start=False); a = a0.copy(); a.calc = calc; secs = []
        for k in range(3):
            a.positions = a0.positions + 0.003 * k * np.random.default_rng(k).standard_normal(a0.positions.shape)   # three slightly different geometries
            t0 = time.time(); F = a.get_forces(); secs.append(time.time() - t0)
        pf[basis] = dict(basis_functions=calc.nao, seconds_per_gradient=[round(x, 1) for x in secs], fmax_first=round(fmax_of(F), 4), scf_cycles=calc.last_scf.get("cycles"))
        print(f"   {basis:12s}: {calc.nao} basis functions | gradient seconds {pf[basis]['seconds_per_gradient']} | SCF cycles {calc.last_scf.get('cycles')}")
    expect = MOL["nao"]
    for b, v in pf.items():
        if BACKEND == "skala" and v["basis_functions"] != expect[b]: print(f"   WARNING: {b} has {v['basis_functions']} functions, expected {expect[b]} with spherical d")
    if BACKEND == "skala":
        reset_warm_start(); c1 = make_calculator(BASIS_PATH[0], 1e-6, 3, warm_start=True); a = a0.copy(); a.calc = c1; e1 = a.get_potential_energy()
        a.positions += 0.002; a.get_forces(); c2 = make_calculator(BASIS_PATH[0], 1e-6, 3, warm_start=False); b = a.copy(); b.calc = c2
        de = abs(a.get_potential_energy() - b.get_potential_energy()) / HARTREE_TO_EV
        pf["warm_start_check"] = dict(abs_energy_difference_Eh=de, warm_start_used=c1.last_scf.get("warm_start_used"), ok=bool(de < 1e-5))
        print(f"   warm start vs fresh guess: energy difference {de:.2e} Eh -> {'OK' if de < 1e-5 else 'TOO LARGE: set WARM_START=False'}")
    json.dump(pf, open(os.path.join(EXPERIMENT_DIR, "preflight.json"), "w"), indent=2)
    del a, a0
    hard_reset_gpu_allocator_pool(verbose=False)
