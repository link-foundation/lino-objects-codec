"""Tests for the version/badge helpers in scripts/create_github_release.py."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

# Load create_github_release as a regular module without requiring it to be on
# the package path (it lives under scripts/ which is not part of the package).
SCRIPT_PATH = Path(__file__).resolve().parent.parent / "scripts" / "create_github_release.py"
spec = importlib.util.spec_from_file_location("create_github_release", SCRIPT_PATH)
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)  # type: ignore[union-attr]


def test_normalize_strips_dash_language_prefix() -> None:
    assert module.normalize_release_version_for_badge("python-v1.2.3") == "1.2.3"
    assert module.normalize_release_version_for_badge("python_v1.2.3") == "1.2.3"


def test_normalize_strips_bare_v() -> None:
    assert module.normalize_release_version_for_badge("v0.3.5") == "0.3.5"
    assert module.normalize_release_version_for_badge("0.3.5") == "0.3.5"


def test_normalize_handles_prerelease_and_build_metadata() -> None:
    assert module.normalize_release_version_for_badge("python_v1.0.0-beta.1") == "1.0.0-beta.1"
    assert module.normalize_release_version_for_badge("python_v1.0.0+build.7") == "1.0.0+build.7"


def test_pypi_badge_uses_bare_semver() -> None:
    badge = module.build_pypi_badge("link-notation-objects-codec", "python_v1.2.3")
    assert "pypi-1.2.3-blue.svg" in badge
    assert "pypi.org/project/link-notation-objects-codec/1.2.3/" in badge
    assert "python_v" not in badge
