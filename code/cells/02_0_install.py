# @title 0. Install
SKALA_VERSION = "2026.9"   # forces verified consistent on 2026.9 (gpu4pyscf 1.8.1, pyscf 2.14.0). 2026.4 gave forces ~2.7x off: do not use it. Restart the session after changing it.
!pip install -q skala-cuda12x=={SKALA_VERSION}
# Only what a standard GPU notebook image does not already have. mace-torch is NOT installed: this notebook does not use MACE, and installing it can change torch/e3nn.
!pip install -q ase tblite google-genai
