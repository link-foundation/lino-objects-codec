#!/usr/bin/env python3
"""Fail on stale direct dependencies, with manifest-local open-issue exceptions.

Uses only the standard library and public registry APIs. This checks release
floors (including dev/build dependencies), not just semver-compatible updates.
Put `# https://github.com/OWNER/REPO/issues/N` on a blocked manifest line;
NuGet uses an XML comment. The issue must still be open. npm's JSON cannot
carry comments, so npm dependencies have no exception mechanism.
"""

import argparse
import json
import os
from pathlib import Path
import re
import sys
import tomllib
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from functools import cache

ROOT = Path(__file__).resolve().parent.parent
ISSUE = re.compile(r"https://github\.com/([\w.-]+/[\w.-]+)/issues/(\d+)")


@dataclass(frozen=True)
class Dependency:
    ecosystem: str
    name: str
    version: str | None
    manifest: str
    blocker: str | None = None


def floor(requirement: str) -> str | None:
    match = re.search(r"\d+(?:\.\d+){1,3}", requirement)
    return match.group() if match else None


def version_key(version: str) -> tuple[int, ...]:
    parts = tuple(map(int, version.lstrip("v").split(".")))
    return parts + (0,) * (4 - len(parts))


def declaration_matches(declaration: str, name: str) -> bool:
    escaped = re.escape(name)
    return bool(
        re.match(rf'''\s*["']?{escaped}["']?\s*=''', declaration)
        or re.search(rf'''["']{escaped}(?:\[|[<=>~!;'"\s])''', declaration)
        or re.search(rf'''\bInclude=["']{escaped}["']''', declaration)
        or re.search(rf'''\buses:\s*{escaped}(?:/[^@\s]+)?@''', declaration)
        or re.match(rf'''\s*{escaped}\s*:''', declaration)
    )


def blocker_on_line(text: str, name: str) -> str | None:
    for line in text.splitlines():
        if name in line:
            # Only a comment can justify an exception, never a dependency URL.
            declaration, _, comment = line.partition("#" if "#" in line else "<!--")
            if not declaration_matches(declaration, name):
                continue
            match = ISSUE.search(comment)
            if match:
                return match.group()
    return None


def manifest_blocker(text: str, name: str, requirement: str, used: set[tuple[int, int, str]]) -> str | None:
    """Match each parsed dependency to one physical declaration, including repeats.

    Consume even uncommented lines so a dev dependency's comment cannot excuse
    a runtime dependency with the same name and version. Match the exact quoted
    requirement, rather than a version substring or a renamed Cargo package.
    """
    quoted = re.compile(rf'''(["']){re.escape(requirement)}\1''')
    for index, line in enumerate(text.splitlines()):
        declaration = line.partition("#" if "#" in line else "<!--")[0]
        if declaration_matches(declaration, name):
            for match in quoted.finditer(declaration):
                occurrence = (index, match.start(), name)
                if occurrence not in used:
                    used.add(occurrence)
                    return blocker_on_line(line, name)
    return None


def declarations(root: Path = ROOT) -> list[Dependency]:
    result = []
    # Include maintained experiment crates too; path dependencies are local.
    cargo_paths = [root / "rust/Cargo.toml", *sorted((root / "experiments").glob("**/Cargo.toml"))]
    for path in cargo_paths:
        if "target" in path.parts:
            continue
        text = path.read_text()
        used: set[tuple[int, int, str]] = set()
        data = tomllib.loads(text)
        tables = [data, *data.get("target", {}).values()]
        for table in tables:
            for section in ["dependencies", "dev-dependencies", "build-dependencies"]:
                for name, spec in table.get(section, {}).items():
                    declared_name = name
                    if isinstance(spec, dict):
                        if "path" in spec or "git" in spec:
                            continue
                        name = spec.get("package", name)
                        spec = spec.get("version", "")
                    result.append(Dependency("cargo", name, floor(spec), str(path.relative_to(root)), manifest_blocker(text, declared_name, spec, used)))
    path = root / "js/package.json"
    data = json.loads(path.read_text())
    for section in ["dependencies", "devDependencies", "optionalDependencies"]:
        for name, spec in data.get(section, {}).items():
            result.append(Dependency("npm", name, floor(spec), str(path.relative_to(root))))
    path = root / "python/pyproject.toml"
    text = path.read_text()
    used = set()
    data = tomllib.loads(text)
    specs = [*data["build-system"]["requires"], *data["project"]["dependencies"]]
    for group in data["project"].get("optional-dependencies", {}).values():
        specs.extend(group)
    for spec in specs:
        name = re.match(r"[\w.-]+", spec).group()
        result.append(Dependency("pypi", name, floor(spec), str(path.relative_to(root)), manifest_blocker(text, name, spec, used)))
    for path in sorted((root / "csharp").glob("**/*.csproj")):
        if "obj" in path.parts or "bin" in path.parts:
            continue
        text = path.read_text()
        used = set()
        for ref in ET.fromstring(text).iter("PackageReference"):
            result.append(Dependency("nuget", ref.attrib["Include"], floor(ref.attrib["Version"]), str(path.relative_to(root)), manifest_blocker(text, ref.attrib["Include"], ref.attrib["Version"], used)))
    for path in sorted((root / ".github/workflows").glob("*.yml")):
        text = path.read_text()
        for line in text.splitlines():
            for name, ref in re.findall(r"uses:\s*([\w.-]+/[\w.-]+)(?:/[\w/-]+)?@(v\d+(?:\.\d+)*)", line):
                result.append(Dependency("github-actions", name, ref[1:], str(path.relative_to(root)), blocker_on_line(line, name)))
    for path, variable, name in [
        (root / ".github/workflows/scripts.yml", "ACTIONLINT_VERSION", "rhysd/actionlint"),
        (root / ".github/workflows/security.yml", "GITLEAKS_VERSION", "gitleaks/gitleaks"),
    ]:
        line = next(line for line in path.read_text().splitlines() if re.match(rf"\s*{variable}:\s*", line))
        result.append(Dependency("github-tools", name, re.search(rf"{variable}:\s*(\S+)", line).group(1), str(path.relative_to(root)), blocker_on_line(line, variable)))
    return result


@cache
def get_json(url: str):
    headers = {"User-Agent": "lino-objects-codec-dependency-freshness"}
    if url.startswith("https://api.github.com/") and os.environ.get("GH_TOKEN"):
        headers["Authorization"] = f"Bearer {os.environ['GH_TOKEN']}"
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=30) as response:
        return json.load(response)


@cache
def latest(ecosystem: str, name: str) -> str:
    if ecosystem in {"github-actions", "github-tools"}:
        tag = get_json(f"https://api.github.com/repos/{name}/releases/latest")["tag_name"]
        if re.fullmatch(r"v?\d+(?:\.\d+){0,3}", tag):
            return tag.removeprefix("v")
        # CodeQL also publishes bundle releases in the action repository.
        # Those tags do not version the action; find its stable release instead.
        for page in range(1, 6):
            releases = get_json(f"https://api.github.com/repos/{name}/releases?per_page=100&page={page}")
            for release in releases:
                tag = release["tag_name"]
                if not release.get("prerelease") and not release.get("draft") and re.fullmatch(r"v?\d+(?:\.\d+){0,3}", tag):
                    return tag.removeprefix("v")
            if len(releases) < 100:
                break
        raise ValueError("no stable action version found in recent releases")
    if ecosystem == "npm":
        return get_json(f"https://registry.npmjs.org/{urllib.parse.quote(name, safe='')}/latest")["version"]
    if ecosystem == "pypi":
        return get_json(f"https://pypi.org/pypi/{name}/json")["info"]["version"]
    if ecosystem == "nuget":
        versions = get_json(f"https://api.nuget.org/v3-flatcontainer/{name.lower()}/index.json")["versions"]
    elif ecosystem == "cargo":
        # Cargo's sparse index avoids crates.io API rate limits and returns the
        # same published versions Cargo itself resolves.
        name = name.lower()
        prefix = "1" if len(name) == 1 else "2" if len(name) == 2 else f"3/{name[0]}" if len(name) == 3 else f"{name[:2]}/{name[2:4]}"
        with urllib.request.urlopen(f"https://index.crates.io/{prefix}/{name}", timeout=30) as response:
            versions = [entry["vers"] for line in response for entry in [json.loads(line)] if not entry["yanked"]]
    else:
        raise ValueError(f"unknown ecosystem: {ecosystem}")
    return max((v for v in versions if re.fullmatch(r"\d+(?:\.\d+){1,3}", v)), key=version_key)


def check(dependency: Dependency, latest_version, issue_state) -> str | None:
    current = latest_version(dependency.ecosystem, dependency.name)
    if dependency.ecosystem == "github-actions" and "." not in dependency.version:
        current = current.split(".")[0]
    if dependency.version is None or version_key(dependency.version) >= version_key(current):
        return None
    if dependency.blocker:
        match = ISSUE.fullmatch(dependency.blocker)
        if match and issue_state(*match.groups()) == "open":
            print(f"BLOCKED {dependency.name}: {dependency.blocker}")
            return None
    return f"{dependency.manifest}: {dependency.name} {dependency.version} is behind latest {current}"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true", help="report current registry data as JSON")
    args = parser.parse_args()
    failures, report = [], []
    for dependency in declarations():
        try:
            current = latest(dependency.ecosystem, dependency.name)
            report.append({**dependency.__dict__, "latest": current})
            error = check(dependency, latest, lambda repo, number: get_json(f"https://api.github.com/repos/{repo}/issues/{number}")["state"])
            if error:
                failures.append(error)
        except Exception as error:
            failures.append(f"{dependency.manifest}: cannot verify {dependency.name}: {error}")
    if args.json:
        print(json.dumps(report, indent=2))
    for error in failures:
        print(f"ERROR {error}", file=sys.stderr)
    if not failures:
        print(f"All {len(report)} direct dependency declarations are current.", file=sys.stderr)
    return int(bool(failures))


if __name__ == "__main__":
    sys.exit(main())
