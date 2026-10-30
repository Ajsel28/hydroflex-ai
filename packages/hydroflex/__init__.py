"""HYDROFLEX AI — climate-aware optimisation of hydropower, renewables and storage for Albania.

Research prototype. Not an operational model and not endorsed by any grid operator,
regulator, IRENA, or Whitman College.
"""

from pathlib import Path

__version__ = "0.1.0"

REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = REPO_ROOT / "data"
RESULTS_DIR = REPO_ROOT / "results"

SYNTHETIC_LABEL = "SYNTHETIC RESEARCH DEMONSTRATION DATA — NOT OBSERVED GRID OPERATIONS"
