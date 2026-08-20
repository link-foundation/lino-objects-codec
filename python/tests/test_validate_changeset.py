"""Tests for the changelog-fragment gate (issue #41).

The workflow used to warn and exit 0 when a PR changed Python sources without
a changelog fragment, so the check could never fail. These tests pin the
enforced behaviour.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

_SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "validate_changeset.py"
_spec = importlib.util.spec_from_file_location("validate_changeset", _SCRIPT)
assert _spec is not None and _spec.loader is not None
validate_changeset = importlib.util.module_from_spec(_spec)
sys.modules["validate_changeset"] = validate_changeset
_spec.loader.exec_module(validate_changeset)


def test_recognizes_python_sources_by_package_relative_path() -> None:
    assert validate_changeset.is_source_file("src/link_notation_objects_codec/codec.py")
    assert validate_changeset.is_source_file("tests/test_format.py")
    assert validate_changeset.is_source_file("scripts/bump_version.py")
    assert validate_changeset.is_source_file("pyproject.toml")


def test_ignores_docs_and_repo_root_relative_paths() -> None:
    assert not validate_changeset.is_source_file("README.md")
    assert not validate_changeset.is_source_file("changelog.d/20260820_note.md")
    # git without --relative would report this form; matching it would break
    # the check in this monorepo (issue #39).
    assert not validate_changeset.is_source_file("python/src/link_notation_objects_codec/codec.py")


def test_recognizes_fragments_but_not_readme_or_template() -> None:
    assert validate_changeset.is_fragment("changelog.d/20260820_071844_note.md")
    assert not validate_changeset.is_fragment("changelog.d/README.md")
    assert not validate_changeset.is_fragment("changelog.d/new_fragment.md.j2")


def test_source_change_without_fragment_fails() -> None:
    ok, sources, fragments = validate_changeset.evaluate(
        ["src/link_notation_objects_codec/codec.py"]
    )
    assert ok is False
    assert sources == ["src/link_notation_objects_codec/codec.py"]
    assert fragments == []


def test_source_change_with_fragment_passes() -> None:
    ok, _, fragments = validate_changeset.evaluate(
        ["src/link_notation_objects_codec/codec.py", "changelog.d/20260820_note.md"]
    )
    assert ok is True
    assert fragments == ["changelog.d/20260820_note.md"]


def test_docs_only_change_passes() -> None:
    ok, sources, _ = validate_changeset.evaluate(["README.md", "docs/guide.md"])
    assert ok is True
    assert sources == []


def test_release_branches_are_exempt() -> None:
    assert validate_changeset.is_release_branch("changeset-release/main")
    assert validate_changeset.is_release_branch("changeset-manual-release-20260820")
    assert not validate_changeset.is_release_branch("issue-41-297a752a4939")
    assert not validate_changeset.is_release_branch(None)


def test_fragment_content_validation_rejects_missing_category(tmp_path: Path) -> None:
    fragment = tmp_path / "20260820_note.md"
    fragment.write_text("just some prose without a heading\n")
    valid, error = validate_changeset.validate_fragment_content(fragment)
    assert valid is False
    assert "missing category heading" in error


def test_fragment_content_validation_accepts_a_well_formed_fragment(tmp_path: Path) -> None:
    fragment = tmp_path / "20260820_note.md"
    fragment.write_text("### Fixed\n\n- Something that was broken\n")
    valid, error = validate_changeset.validate_fragment_content(fragment)
    assert valid is True
    assert error == ""
