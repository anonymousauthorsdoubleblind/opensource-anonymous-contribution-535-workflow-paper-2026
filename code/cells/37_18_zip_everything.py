# @title 18. Zip everything
import zipfile
zip_path = os.path.join(RESULTS_ROOT, f"agentic_skala_{MOLECULE.lower()}_{REQUIREMENT}{RUN_TAG}{'_STANDIN' if BACKEND != 'skala' else ''}.zip")
with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
    for root, _, files in os.walk(EXPERIMENT_DIR):
        for f in files: z.write(os.path.join(root, f), os.path.relpath(os.path.join(root, f), EXPERIMENT_DIR))
print("Zip written:", zip_path, f"({os.path.getsize(zip_path)/1e6:.1f} MB)")
