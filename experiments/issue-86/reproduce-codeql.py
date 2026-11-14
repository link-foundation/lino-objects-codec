"""Reproduce the old CodeQL defects without changing tracked source files.

Run with python/.venv/bin/python experiments/issue-86/reproduce-codeql.py.
The performance probe uses 100,000 characters, a 64 MiB Node heap and a
three-second subprocess budget. Every temporary source/fixture is removed.
"""

from __future__ import annotations

import importlib.util
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASE = "235d954e956e3b7f985144f523dadefcc3368380"
OUT = ROOT / "dev/log/issues/86/pulls/87/verification/codeql-reproductions.json"


def before(path: str) -> str:
    return subprocess.check_output(["git", "show", f"{BASE}:{path}"], cwd=ROOT, text=True)


def performance(path: Path) -> str:
    source = (
        f"import {{ formatIndented }} from {json.dumps(path.as_uri())};"
        "const key = 'a'+'_'.repeat(100000)+'b';"
        "const text = formatIndented({id:'root',obj:{[key]:{ok:true}}});"
        "if (!text.endsWith('root_'+key+':\\n  ok true')) process.exitCode=1;"
    )
    try:
        subprocess.run(
            ["node", "--max-old-space-size=64", "--input-type=module", "-e", source],
            cwd=ROOT,
            capture_output=True,
            check=True,
            timeout=3,
        )
        return "pass"
    except subprocess.TimeoutExpired:
        return "bounded timeout"


def identity(path: Path) -> bool:
    with tempfile.TemporaryDirectory(prefix="codec-identity-") as directory:
        name = 'Release "bot" $(touch injected)'
        email = "private+release@example.invalid"
        subprocess.run(["git", "init", "--quiet"], cwd=directory, check=True)
        result = subprocess.run(
            ["node", str(path)],
            cwd=directory,
            env={**os.environ, "GIT_USER_NAME": name, "GIT_USER_EMAIL": email},
            text=True,
            capture_output=True,
            check=True,
        )
        stored = subprocess.check_output(
            ["git", "config", "user.name"], cwd=directory, text=True
        ).strip()
        return (
            stored == name
            and not (Path(directory) / "injected").exists()
            and email not in result.stdout
        )


def badge(path: Path) -> bool:
    sys.path.insert(0, str(ROOT / "python/scripts"))
    spec = importlib.util.spec_from_file_location("release_notes_probe", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    body = "![PyPI](https://img.shields.io.evil.invalid/badge/a)"
    return "[![PyPI version]" in module.format_release_body(
        body, "1.2.3", "owner/repo", None, "codec"
    )


def main() -> None:
    results: dict[str, object] = {"baseline": BASE}
    # Place the old formatter next to its imports; no tracked file is replaced.
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".js", prefix=".issue86-", dir=ROOT / "js/src"
    ) as snapshot:
        snapshot.write(before("js/src/format.js"))
        snapshot.flush()
        results["identifier_trimming"] = {
            "before": performance(Path(snapshot.name)),
            "after": performance(ROOT / "js/src/format.js"),
        }
    with tempfile.TemporaryDirectory(prefix="codec-old-source-") as directory:
        old_git = Path(directory) / "git-config.mjs"
        old_git.write_text(before("rust/scripts/git-config.mjs"))
        results["literal_private_git_identity"] = {
            "before": identity(old_git),
            "after": identity(ROOT / "rust/scripts/git-config.mjs"),
        }
        old_python = Path(directory) / "format_release_notes.py"
        old_python.write_text(before("python/scripts/format_release_notes.py"))
        results["exact_python_badge_origin"] = {
            "before": badge(old_python),
            "after": badge(ROOT / "python/scripts/format_release_notes.py"),
        }
    for language in ("rust", "csharp"):
        source = before(f"{language}/scripts/create-github-release.mjs")
        fragment = source[
            source.index("  const versionHeaderRegex") : source.index("  if (!releaseNotes)")
        ]
        probe = (
            "const semver='1.2.3+build.7';"
            "const changelog='## [1.2.3+build.7] - today\\nCorrect entry\\n';"
            + fragment
            + "console.log(releaseNotes === 'Correct entry');"
        )
        old = subprocess.check_output(["node", "-e", probe], text=True).strip()
        fixed = subprocess.check_output(
            [
                "node",
                "--input-type=module",
                "-e",
                "import { extractChangelogEntry } from './scripts/release-notes.mjs';"
                "console.log(extractChangelogEntry('## [1.2.3+build.7] - today\\n"
                "Correct entry\\n', '1.2.3+build.7') === 'Correct entry');",
            ],
            cwd=ROOT,
            text=True,
        ).strip()
        results[f"{language}_literal_build_version"] = {"before": old, "after": fixed}
    assert results["identifier_trimming"] == {
        "before": "bounded timeout",
        "after": "pass",
    }
    for name in ("literal_private_git_identity", "exact_python_badge_origin"):
        assert results[name] == {"before": False, "after": True}
    for language in ("rust", "csharp"):
        assert results[f"{language}_literal_build_version"] == {
            "before": "false",
            "after": "true",
        }
    OUT.write_text(json.dumps(results, indent=2) + "\n")
    print(OUT.relative_to(ROOT))


if __name__ == "__main__":
    main()
