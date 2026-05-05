#!/usr/bin/env python3
"""Create a GitHub release from CHANGELOG.md content.

Per issue #33:
    - Tag format:   python_v<semver>
    - Title format: [Python] X.Y.Z
    - Body MUST contain a PyPI shields.io badge.
    - The script must check the gh exit code so 422 (e.g. tag conflicts) does
      not silently succeed.

Usage:
    python scripts/create_github_release.py --version VERSION --repository REPO \
        [--tag-prefix PREFIX] [--language NAME] [--package-name NAME]

Example:
    python scripts/create_github_release.py --version 1.2.3 --repository owner/repo \
        --tag-prefix python_v

Environment variables:
    GH_TOKEN or GITHUB_TOKEN: GitHub token for authentication
"""

from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
import urllib.parse
from pathlib import Path


def normalize_release_version_for_badge(release_version: str) -> str:
    """Strip any language prefix and leading "v" so we always have bare semver.

    Mirrors js/scripts/release-format-helpers.mjs::normalizeReleaseVersionForBadge.
    """
    trimmed = (release_version or "").strip()
    semver_match = re.search(
        r"(?:^|[-_])v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)$",
        trimmed,
        re.IGNORECASE,
    )
    if semver_match:
        return semver_match.group(1)

    trimmed = re.sub(r"^[A-Za-z][A-Za-z0-9]*[-_]", "", trimmed)
    trimmed = re.sub(r"^v", "", trimmed, flags=re.IGNORECASE)
    return trimmed


def encode_shields_segment(value: str) -> str:
    """shields.io static badge encoding: '-' -> '--', '_' -> '__'."""
    encoded = urllib.parse.quote(value, safe="")
    return encoded.replace("-", "--").replace("_", "__")


def build_pypi_badge(package_name: str, release_version: str) -> str:
    semver = normalize_release_version_for_badge(release_version)
    badge_version = encode_shields_segment(semver)
    version_path = urllib.parse.quote(semver, safe="")
    return (
        f"[![PyPI](https://img.shields.io/badge/pypi-{badge_version}-blue.svg)"
        f"](https://pypi.org/project/{package_name}/{version_path}/)"
    )


def run_command(cmd: list[str], check: bool = True) -> subprocess.CompletedProcess:
    """Run a command and handle errors."""
    print(f"Running: {' '.join(cmd)}")
    result = subprocess.run(cmd, capture_output=True, text=True, check=False)

    if result.stdout:
        print(result.stdout)
    if result.stderr and result.returncode != 0:
        print(result.stderr, file=sys.stderr)

    if check and result.returncode != 0:
        print(
            f"Error: Command failed with exit code {result.returncode}",
            file=sys.stderr,
        )
        sys.exit(result.returncode)

    return result


def extract_changelog_entry(changelog_path: Path, version: str) -> str:
    """Extract the changelog entry for a specific version."""
    if not changelog_path.exists():
        print(f"Warning: {changelog_path} not found", file=sys.stderr)
        return f"Release {version}"

    content = changelog_path.read_text()

    # Look for version section (e.g., "## 1.2.3" or "## 1.2.3 - 2024-01-15")
    version_pattern = rf"^## {re.escape(version)}(\s|$)"
    match = re.search(version_pattern, content, re.MULTILINE)

    if not match:
        print(
            f"Warning: Version {version} not found in {changelog_path}",
            file=sys.stderr,
        )
        return f"Release {version}"

    # Extract content until next version section or end of file
    start = match.end()
    next_version = re.search(r"^## \d+\.\d+\.\d+", content[start:], re.MULTILINE)

    if next_version:
        entry = content[start : start + next_version.start()].strip()
    else:
        entry = content[start:].strip()

    return entry if entry else f"Release {version}"


def detect_pypi_package_name(project_root: Path) -> str | None:
    """Return the [project] name from pyproject.toml (no third-party deps)."""
    pyproject = project_root / "pyproject.toml"
    if not pyproject.exists():
        return None
    text = pyproject.read_text()
    in_project = False
    for raw_line in text.splitlines():
        stripped = raw_line.strip()
        if stripped.startswith("["):
            in_project = stripped == "[project]"
            continue
        if in_project:
            match = re.match(r"name\s*=\s*['\"]([^'\"]+)['\"]", stripped)
            if match:
                return match.group(1)
    return None


def create_release(
    *,
    semver: str,
    tag: str,
    title: str,
    repository: str,
    release_notes: str,
    prerelease: bool = False,
) -> None:
    """Create a GitHub release using gh CLI.

    Uses ``gh release create`` rather than ``gh api`` because the former exits
    non-zero on duplicate-tag failures, giving us the same false-positive
    protection that issue #29 added on the JS side.
    """
    print(f"\nCreating GitHub release for {tag}...")
    print(f"Repository: {repository}")
    print(f"Title: {title}")
    print(f"Prerelease: {prerelease}")
    print(f"\nRelease notes:\n{release_notes}\n")

    cmd = [
        "gh",
        "release",
        "create",
        tag,
        "--repo",
        repository,
        "--title",
        title,
        "--notes",
        release_notes,
    ]

    if prerelease:
        cmd.append("--prerelease")

    result = run_command(cmd, check=False)
    if result.returncode != 0:
        combined = f"{result.stdout}\n{result.stderr}".lower()
        if "already exists" in combined or "already_exists" in combined:
            print(f"GitHub release already exists: {tag}. Skipping creation.")
            return
        print(
            f"Error: gh release create failed with exit code {result.returncode}",
            file=sys.stderr,
        )
        sys.exit(result.returncode)

    print(f"\n[OK] GitHub release {tag} created successfully!")


def main() -> int:
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Create GitHub release from CHANGELOG.md",
    )
    parser.add_argument(
        "--version",
        "-v",
        required=True,
        help="Version to release (e.g., 1.2.3)",
    )
    parser.add_argument(
        "--repository",
        "-r",
        required=True,
        help="GitHub repository (owner/repo)",
    )
    parser.add_argument(
        "--prerelease",
        action="store_true",
        help="Mark as prerelease",
    )
    parser.add_argument(
        "--tag-prefix",
        default="python_v",
        help='Tag prefix for the release (e.g. "python_v"); default "python_v"',
    )
    parser.add_argument(
        "--language",
        default="Python",
        help='Display label for the release title (default "Python")',
    )
    parser.add_argument(
        "--package-name",
        default=None,
        help="PyPI package name for the badge (auto-detected from pyproject.toml if missing)",
    )

    args = parser.parse_args()

    if not os.environ.get("GH_TOKEN") and not os.environ.get("GITHUB_TOKEN"):
        print(
            "Error: GH_TOKEN or GITHUB_TOKEN environment variable required",
            file=sys.stderr,
        )
        return 1

    result = run_command(["gh", "--version"], check=False)
    if result.returncode != 0:
        print(
            "Error: gh CLI not found. Install from https://cli.github.com/",
            file=sys.stderr,
        )
        return 1

    script_dir = Path(__file__).parent
    project_root = script_dir.parent
    changelog_path = project_root / "CHANGELOG.md"

    try:
        semver = normalize_release_version_for_badge(args.version)
        tag = f"{args.tag_prefix}{semver}"
        title = f"[{args.language}] {semver}"
        package_name = args.package_name or detect_pypi_package_name(project_root)

        release_notes = extract_changelog_entry(changelog_path, semver)
        if package_name and "img.shields.io" not in release_notes:
            badge = build_pypi_badge(package_name, semver)
            release_notes = f"{release_notes}\n\n---\n\n{badge}"

        create_release(
            semver=semver,
            tag=tag,
            title=title,
            repository=args.repository,
            release_notes=release_notes,
            prerelease=args.prerelease,
        )

        return 0

    except Exception as exc:  # noqa: BLE001
        print(f"Error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
