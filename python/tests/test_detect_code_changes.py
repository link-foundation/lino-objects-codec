"""Tests for ``scripts/detect_code_changes.py``.

The prefix handling is a regression guard: ``git diff --name-only`` yields
repository-root paths, so every package-relative comparison has to strip the
``python/`` prefix first. Getting that wrong is what issue #39 was about, and
the same defect was found in the JavaScript and Rust scripts while solving
issue #41.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from detect_code_changes import (  # noqa: E402
    classify_changes,
    is_excluded_from_code_changes,
    is_workflow_file,
    to_package_paths,
)


def test_to_package_paths_strips_prefix_and_drops_other_packages() -> None:
    files = ["python/src/codec.py", "rust/src/lib.rs", ".github/workflows/python.yml"]
    assert to_package_paths(files, "python/") == ["src/codec.py"]


def test_to_package_paths_is_a_no_op_at_the_repository_root() -> None:
    assert to_package_paths(["src/codec.py"], "") == ["src/codec.py"]


def test_examples_only_pull_request_is_not_a_code_change() -> None:
    outputs, code_files = classify_changes(["python/examples/demo.py"], "python/")
    assert outputs["any-code-changed"] == "false"
    assert outputs["py-changed"] == "true"
    assert code_files == []


def test_fragment_only_pull_request_is_not_a_code_change() -> None:
    outputs, _ = classify_changes(["python/changelog.d/20260820_fix.md"], "python/")
    assert outputs["any-code-changed"] == "false"
    assert outputs["docs-changed"] == "true"


def test_pyproject_change_is_a_code_change() -> None:
    outputs, _ = classify_changes(["python/pyproject.toml"], "python/")
    assert outputs["toml-changed"] == "true"
    assert outputs["any-code-changed"] == "true"


def test_source_change_is_a_code_change() -> None:
    outputs, _ = classify_changes(["python/src/lino_objects_codec/codec.py"], "python/")
    assert outputs["py-changed"] == "true"
    assert outputs["any-code-changed"] == "true"


def test_workflow_change_counts_as_a_code_change() -> None:
    outputs, _ = classify_changes([".github/workflows/python.yml"], "python/")
    assert outputs["workflow-changed"] == "true"
    assert outputs["any-code-changed"] == "true"


def test_changes_in_another_package_are_ignored() -> None:
    outputs, _ = classify_changes(["rust/Cargo.toml"], "python/")
    assert outputs["toml-changed"] == "false"
    assert outputs["any-code-changed"] == "false"


def test_is_workflow_file_only_matches_repository_root_paths() -> None:
    assert is_workflow_file(".github/workflows/python.yml") is True
    assert is_workflow_file("python/.github/workflows/python.yml") is False


def test_markdown_is_excluded_anywhere_in_the_package() -> None:
    assert is_excluded_from_code_changes("docs/guide.md") is True
    assert is_excluded_from_code_changes("src/README.md") is True
    assert is_excluded_from_code_changes("src/codec.py") is False
