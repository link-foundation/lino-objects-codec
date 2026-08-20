#!/usr/bin/env python3
"""
Validate that PRs contain proper changelog fragments.

This script is the Python equivalent of validate-changeset.mjs from the JS template.
It ensures that pull requests include changelog documentation.

Before issue #41 this script existed but no workflow ran it: the ``changelog``
job in ``.github/workflows/python.yml`` had its own inline shell copy that
printed ``::warning::No changelog fragment found`` and then exited 0, so the
check could never fail. It also counted every file in ``changelog.d/``, which
meant a leftover fragment from an earlier, unreleased PR satisfied the check
for a new PR that added nothing. The fragment requirement is now decided from
the PR diff, matching rust/scripts/check-changelog-fragment.mjs and
csharp/scripts/check-changeset.mjs.

Usage:
    python scripts/validate_changeset.py

Environment variables (set by GitHub Actions):
    GITHUB_BASE_REF - base branch name for the PR (defaults to "main")
    HEAD_REF        - PR head branch; automated release branches are exempt

Exit codes:
    0 - Validation passed (fragment added, or no source changes)
    1 - Validation failed (source changes without fragment, or a malformed one)

Example CI usage:
    - name: Validate changelog fragment
      run: python scripts/validate_changeset.py
"""

import os
import re
import subprocess
import sys
from pathlib import Path

# Automated release PRs only consume fragments, so requiring a new one from
# them would deadlock the release jobs.
RELEASE_BRANCH_PREFIXES = ("changeset-release/", "changeset-manual-release-")

# Paths are relative to the `python` package directory (git is invoked with
# --relative). Repo-root-relative paths such as "python/src/..." deliberately
# do not match: see issue #39 for the same bug in the Rust script.
SOURCE_PATTERNS = (
    re.compile(r"^src/"),
    re.compile(r"^tests/"),
    re.compile(r"^scripts/"),
    re.compile(r"^pyproject\.toml$"),
)


def is_release_branch(head_ref: str | None) -> bool:
    """Check whether a branch belongs to an automated release PR."""
    if not head_ref:
        return False
    return head_ref.startswith(RELEASE_BRANCH_PREFIXES)


def is_source_file(path: str) -> bool:
    """Check whether a changed file requires a changelog fragment."""
    return any(pattern.search(path) for pattern in SOURCE_PATTERNS)


def is_fragment(path: str) -> bool:
    """Check whether a changed file is a changelog fragment."""
    return (
        path.startswith("changelog.d/")
        and path.endswith(".md")
        and not path.endswith("README.md")
        and not path.endswith(".j2")
    )


def evaluate(changed_files: list[str]) -> tuple[bool, list[str], list[str]]:
    """Decide the outcome of the fragment requirement from a list of changed files.

    Returns (is_ok, source_files, fragments).
    """
    source_files = [f for f in changed_files if is_source_file(f)]
    fragments = [f for f in changed_files if is_fragment(f)]
    return (not source_files or bool(fragments)), source_files, fragments


def get_changed_files() -> list[str]:
    """Get the PR's changed files, relative to the `python` package directory."""
    base_ref = os.environ.get("GITHUB_BASE_REF") or "main"
    print(f"Comparing against origin/{base_ref}...HEAD")

    try:
        output = subprocess.run(
            ["git", "diff", "--name-only", "--relative", f"origin/{base_ref}...HEAD"],
            capture_output=True,
            text=True,
            check=True,
        ).stdout.strip()
    except (subprocess.CalledProcessError, OSError) as error:
        print(f"Git diff failed: {error}", file=sys.stderr)
        return []

    return [line for line in output.split("\n") if line]


def get_fragment_files(changelog_dir: Path) -> list[Path]:
    """Get list of changelog fragment files (excluding README and template)."""
    if not changelog_dir.exists():
        return []

    return [
        f
        for f in changelog_dir.glob("*.md")
        if f.name != "README.md" and not f.name.endswith(".j2")
    ]


def validate_fragment_content(fragment_path: Path) -> tuple[bool, str]:
    """
    Validate that a fragment has proper content.

    Returns (is_valid, error_message).
    """
    content = fragment_path.read_text().strip()

    if not content:
        return False, f"Fragment {fragment_path.name} is empty"

    # Check for at least one category heading
    category_pattern = re.compile(
        r"^###\s*(Added|Changed|Deprecated|Fixed|Removed|Security)",
        re.MULTILINE | re.IGNORECASE,
    )

    if not category_pattern.search(content):
        return False, (
            f"Fragment {fragment_path.name} missing category heading.\n"
            "Expected one of: ### Added, ### Changed, ### Deprecated, "
            "### Fixed, ### Removed, ### Security"
        )

    # Check for actual content (not just commented template)
    # Remove HTML comments
    content_without_comments = re.sub(r"<!--.*?-->", "", content, flags=re.DOTALL)
    # Check if there's meaningful content after headings
    lines = [
        line.strip()
        for line in content_without_comments.split("\n")
        if line.strip() and not line.strip().startswith("#")
    ]

    if not lines:
        return False, (
            f"Fragment {fragment_path.name} has no content.\n"
            "Please add a description of your changes under the appropriate category."
        )

    return True, ""


def main() -> int:
    """Main entry point."""
    if is_release_branch(os.environ.get("HEAD_REF")):
        print("Automated release PR detected; skipping the changelog check.")
        return 0

    script_dir = Path(__file__).parent
    project_root = script_dir.parent
    changelog_dir = project_root / "changelog.d"

    print("Validating changelog fragments...")
    print()

    changed_files = get_changed_files()
    is_ok, source_files, added_fragments = evaluate(changed_files)

    print(f"Source files changed: {len(source_files)}")
    for path in source_files:
        print(f"  {path}")
    print(f"Changelog fragments added: {len(added_fragments)}")
    for path in added_fragments:
        print(f"  {path}")
    print()

    if not is_ok:
        print("::error::No changelog fragment found in this PR.")
        print()
        print("To document your changes, create a changelog fragment:")
        print()
        print("  # Using scriv (recommended):")
        print("  pip install 'scriv[toml]'")
        print("  scriv create")
        print()
        print("  # Or using the helper script:")
        print("  python scripts/create_manual_changeset.py patch --description 'Your changes'")
        print()
        print("See changelog.d/README.md for more information.")
        return 1

    # Validate the content of every fragment currently in the directory, so a
    # malformed one fails the PR that introduced it rather than the release.
    fragments = get_fragment_files(changelog_dir)
    all_valid = True
    for fragment in fragments:
        valid, error = validate_fragment_content(fragment)
        if valid:
            print(f"  [OK] {fragment.name}")
        else:
            print(f"  [FAIL] {error}")
            all_valid = False

    print()

    if all_valid:
        print("Changelog validation passed!")
        return 0

    print("Changelog validation FAILED!")
    print()
    print("Expected fragment format:")
    print()
    print("  ### Added")
    print("  - Description of new feature")
    print()
    print("  ### Changed")
    print("  - Description of change")
    print()
    print("  ### Fixed")
    print("  - Description of bug fix")
    print()
    return 1


if __name__ == "__main__":
    sys.exit(main())
