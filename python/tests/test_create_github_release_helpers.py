"""Tests for the version/badge helpers in scripts/create_github_release.py."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest

# Load create_github_release as a regular module without requiring it to be on
# the package path (it lives under scripts/ which is not part of the package).
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
SCRIPT_PATH = Path(__file__).resolve().parent.parent / "scripts" / "create_github_release.py"
spec = importlib.util.spec_from_file_location("create_github_release", SCRIPT_PATH)
assert spec is not None and spec.loader is not None
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)


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


def test_create_release_adds_badge_for_unrelated_hostname(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import subprocess

    monkeypatch.setenv("GH_TOKEN", "test")
    monkeypatch.setattr(
        sys, "argv", ["release", "--version", "1.2.3", "--repository", "owner/repo"]
    )
    monkeypatch.setattr(
        module, "run_command", lambda cmd, check=False: subprocess.CompletedProcess(cmd, 0)
    )
    monkeypatch.setattr(module, "detect_pypi_package_name", lambda _: "codec")
    monkeypatch.setattr(
        module,
        "extract_changelog_entry",
        lambda *_: "![PyPI](https://img.shields.io.evil.invalid/badge/a)",
    )
    releases: list[dict[str, object]] = []

    def capture(**kwargs: object) -> None:
        releases.append(kwargs)

    monkeypatch.setattr(module, "create_release", capture)
    assert module.main() == 0
    assert "[![PyPI](https://img.shields.io/badge/pypi-1.2.3-blue.svg)" in str(
        releases[0]["release_notes"]
    )
