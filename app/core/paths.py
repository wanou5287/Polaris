import os
import sys
from pathlib import Path


def get_project_root() -> Path:
    explicit = str(os.getenv("POLARIS_APP_HOME", "")).strip()
    if explicit:
        return Path(explicit).resolve()

    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent.parent

    return Path(__file__).resolve().parents[2]


def get_data_root() -> Path:
    explicit = str(os.getenv("POLARIS_DATA_ROOT", "")).strip()
    if explicit:
        return Path(explicit).resolve()

    if getattr(sys, "frozen", False):
        return Path(os.getenv("LOCALAPPDATA", Path.home())) / "PolarisData"

    return get_project_root()
