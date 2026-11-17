# @title A7. Zip the toy results
import zipfile
toy_zip = os.path.join(RESULTS_ROOT, f"toy_nh3_skala{RUN_TAG}.zip")
with zipfile.ZipFile(toy_zip, "w", zipfile.ZIP_DEFLATED) as z:
    for root, _, files in os.walk(TOY_DIR):
        for f in files: z.write(os.path.join(root, f), os.path.join("toy", os.path.relpath(os.path.join(root, f), TOY_DIR)))
print("Toy zip written:", toy_zip, f"({os.path.getsize(toy_zip)/1e6:.2f} MB). The notebook now continues with the molecule.")
