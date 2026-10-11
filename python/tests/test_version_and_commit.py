"""Tests for the manual-release version step (issue #71).

The workflow ran `scriv collect --version "${BUMP_TYPE}"` before the bump, so
the collected changelog section was titled "patch" instead of the version.
Collection now happens inside version_and_commit.py, after the bump.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

_SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "version_and_commit.py"
_spec = importlib.util.spec_from_file_location("version_and_commit", _SCRIPT)
assert _spec is not None and _spec.loader is not None
version_and_commit = importlib.util.module_from_spec(_spec)
sys.modules["version_and_commit"] = version_and_commit
_spec.loader.exec_module(version_and_commit)


def test_pending_fragments_skip_readme_and_template(tmp_path: Path) -> None:
    (tmp_path / "README.md").write_text("docs")
    (tmp_path / "fragment_template.md.j2").write_text("template")
    (tmp_path / "20261011_fix.md").write_text("### Fixed\n- x")
    assert [p.name for p in version_and_commit.pending_fragments(tmp_path)] == ["20261011_fix.md"]
    assert version_and_commit.pending_fragments(tmp_path / "missing") == []


def test_bump_skips_generic_entry_only_when_scriv_will_collect(tmp_path: Path) -> None:
    with_fragments = version_and_commit.bump_command(tmp_path, "patch", "", True)
    assert with_fragments[1:] == [
        str(tmp_path / "scripts" / "bump_version.py"),
        "patch",
        "--skip-changelog",
    ]
    without = version_and_commit.bump_command(tmp_path, "minor", "New feature", False)
    assert without[2:] == ["minor", "--description", "New feature"]


def test_workflow_no_longer_collects_with_the_bump_type() -> None:
    workflow = Path(__file__).resolve().parents[2] / ".github" / "workflows" / "python.yml"
    assert 'scriv collect --version "${BUMP_TYPE}"' not in workflow.read_text()
