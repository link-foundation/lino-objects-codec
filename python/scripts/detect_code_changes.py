#!/usr/bin/env python3
"""Detect code changes for the Python CI/CD pipeline.

This script decides whether a push or pull request touched anything that needs
the expensive jobs to run. It mirrors ``scripts/detect_code_changes.py`` in
``link-foundation/python-ai-driven-development-pipeline-template`` and the
JavaScript, Rust and C# siblings in this repository.

Key behaviour:

- For pull requests: compares the pull request head against its base.
- For pushes: compares ``HEAD`` against ``HEAD^``.
- Paths are judged *relative to this package*. ``git diff --name-only`` prints
  repository-root paths, so in this monorepo the real paths are
  ``python/examples/demo.py``; without stripping the ``python/`` prefix the
  documented exclusions below would never match. That mistake is what issue #39
  was about, and the JavaScript and Rust scripts carried it until issue #41.

Excluded from code changes (they never need a changelog fragment):

- Markdown files (``*.md``) anywhere.
- ``changelog.d/`` (changelog fragments)
- ``docs/`` (documentation)
- ``experiments/`` (experimental scripts)
- ``examples/`` (example scripts)

Usage::

    python scripts/detect_code_changes.py

Environment variables (set by GitHub Actions):

- ``GITHUB_EVENT_NAME``: ``pull_request`` or ``push``
- ``GITHUB_BASE_SHA``: base commit SHA for a pull request
- ``GITHUB_HEAD_SHA``: head commit SHA for a pull request

Outputs (appended to ``GITHUB_OUTPUT``):

- ``py-changed``: any ``.py`` file in this package changed
- ``toml-changed``: any ``.toml`` file in this package changed
- ``docs-changed``: any ``.md`` file in this package changed
- ``workflow-changed``: any ``.github/workflows/`` file changed
- ``any-code-changed``: any code file changed, exclusions applied
"""

from __future__ import annotations

import os
import subprocess

EXCLUDED_FOLDERS = (
    "changelog.d/",
    "docs/",
    "examples/",
    "experiments/",
)
CODE_EXTENSIONS = (".py", ".toml", ".yml", ".yaml", ".cfg")
WORKFLOW_PREFIX = ".github/workflows/"


def exec_command(command: list[str]) -> str:
    """Run a command and return its trimmed stdout, or an empty string."""
    try:
        result = subprocess.run(  # noqa: S603 - fixed argument lists only
            command,
            capture_output=True,
            text=True,
            check=True,
        )
    except (OSError, subprocess.CalledProcessError) as error:
        print(f"Error executing command: {' '.join(command)}")
        print(error)
        return ""
    return result.stdout.strip()


def set_output(name: str, value: str) -> None:
    """Append a GitHub Actions job output and echo it into the log."""
    output_file = os.environ.get("GITHUB_OUTPUT")
    if output_file:
        with open(output_file, "a", encoding="utf-8") as handle:
            handle.write(f"{name}={value}\n")
    print(f"{name}={value}")


def get_path_prefix() -> str:
    """Return the working directory relative to the repository root.

    ``python/`` in this monorepo, and ``""`` in a single-package checkout, where
    every path is already package-relative.
    """
    return exec_command(["git", "rev-parse", "--show-prefix"])


def get_changed_files() -> list[str]:
    """Return the repository-root-relative paths changed by this event."""
    event_name = os.environ.get("GITHUB_EVENT_NAME", "local")

    if event_name == "pull_request":
        base_sha = os.environ.get("GITHUB_BASE_SHA")
        head_sha = os.environ.get("GITHUB_HEAD_SHA")
        if base_sha and head_sha:
            print(f"Comparing PR: {base_sha}...{head_sha}")
            if not exec_command(["git", "cat-file", "-t", base_sha]):
                print("Base commit not available locally, attempting fetch...")
                exec_command(["git", "fetch", "origin", base_sha])
            output = exec_command(["git", "diff", "--name-only", base_sha, head_sha])
            return [f for f in output.split("\n") if f]

    print("Comparing HEAD^ to HEAD")
    output = exec_command(["git", "diff", "--name-only", "HEAD^", "HEAD"])
    if output:
        return [f for f in output.split("\n") if f]

    # First commit in the repository: there is no HEAD^ to compare against.
    print("HEAD^ not available, listing all files in HEAD")
    output = exec_command(["git", "ls-tree", "--name-only", "-r", "HEAD"])
    return [f for f in output.split("\n") if f]


def to_package_paths(changed_files: list[str], prefix: str) -> list[str]:
    """Re-express root-relative paths as package-relative, dropping the rest."""
    if not prefix:
        return list(changed_files)
    return [f.removeprefix(prefix) for f in changed_files if f.startswith(prefix)]


def is_workflow_file(file_path: str) -> bool:
    """Return True for a repository-root workflow definition."""
    return file_path.startswith(WORKFLOW_PREFIX)


def is_excluded_from_code_changes(file_path: str) -> bool:
    """Return True when a *package-relative* path is not a code change."""
    if file_path.endswith(".md"):
        return True
    return file_path.startswith(EXCLUDED_FOLDERS)


def classify_changes(changed_files: list[str], prefix: str) -> tuple[dict[str, str], list[str]]:
    """Classify changed paths, returning the outputs and the code files."""
    package_files = to_package_paths(changed_files, prefix)
    workflow_files = [f for f in changed_files if is_workflow_file(f)]

    code_changed_files = [f for f in package_files if not is_excluded_from_code_changes(f)]
    # A workflow change counts as a code change: it can alter how this package
    # is built and published even when no package file moved.
    code_changed = bool(workflow_files) or any(
        f.endswith(CODE_EXTENSIONS) for f in code_changed_files
    )

    outputs = {
        "py-changed": str(any(f.endswith(".py") for f in package_files)).lower(),
        "toml-changed": str(any(f.endswith(".toml") for f in package_files)).lower(),
        "docs-changed": str(any(f.endswith(".md") for f in package_files)).lower(),
        "workflow-changed": str(bool(workflow_files)).lower(),
        "any-code-changed": str(code_changed).lower(),
    }
    return outputs, code_changed_files


def detect_changes() -> None:
    """Detect the changes of the current event and publish them as outputs."""
    print("Detecting file changes for CI/CD...\n")

    changed_files = get_changed_files()
    prefix = get_path_prefix()

    print(f"Package prefix: {prefix or '(repository root)'}")
    print("Changed files:")
    if not changed_files:
        print("  (none)")
    else:
        for file in changed_files:
            print(f"  {file}")
    print()

    outputs, code_changed_files = classify_changes(changed_files, prefix)

    print("Files considered as code changes:")
    if not code_changed_files:
        print("  (none)")
    else:
        for file in code_changed_files:
            print(f"  {file}")
    print()

    for name, value in outputs.items():
        set_output(name, value)

    print("\nChange detection completed.")


if __name__ == "__main__":
    detect_changes()
