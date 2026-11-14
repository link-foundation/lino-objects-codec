"""Render saved registry snapshots and explain every retained old resolution.

Run from the repository root after inventory.py after. Does not change dependencies.
"""

import json
import posixpath
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "dev/log/issues/86/pulls/87"
before = json.loads((OUT / "research/inventory-before.json").read_text())
after = json.loads((OUT / "research/inventory-after.json").read_text())


def index(data):
    result = defaultdict(set)
    for row in data["rows"]:
        result[(row["ecosystem"], row["name"], row["manifest"])].add(
            row["version"] or "unversioned"
        )
    return result


old, new = index(before), index(after)
latest = {
    (r["ecosystem"], r["name"]): r.get("latest", "lookup failed; see raw receipt")
    for r in before["rows"] + after["rows"]
}
lines = [
    "# Complete dependency comparison",
    "",
    f"Before registry retrieval: {before['retrieved_at']}. After: {after['retrieved_at']}.",
    "",
    (
        "Registry responses are recorded in inventory-before.json and "
        "inventory-after.json. This table joins every declaration and lock "
        "entry from both snapshots; repeated declarations in the same manifest "
        "are combined. An absent before entry means a newly introduced "
        "pin/lock, not a claimed previous version. Removed entries include "
        "superseded dependency branches. No Python or NuGet transitive lock "
        "existed initially; their initial unpinned resolutions cannot be "
        "reconstructed honestly."
    ),
    "",
    (
        "The mypy hook repository has tags but no GitHub release: the initial "
        "404 is preserved; the final tags lookup resolves 2.4.1 "
        "(mypy-hook-tags.json). The initial unversioned update-tool discovery "
        "rows include evaluated tools, not installed project requirements; only"
        " actual workflow bootstrap tools are pinned afterward."
    ),
    "",
    (
        "See EXCEPTIONS.md for every final lock resolution older than its "
        "registry latest. Stable means the registry stable channel, excluding "
        "prereleases. Historical logs are not install pins."
    ),
    "",
]
for ecosystem in sorted({k[0] for k in old.keys() | new.keys()}):
    lines += [
        f"## {ecosystem}",
        "",
        "| Dependency | Manifest / lock | Before | Registry latest | After |",
        "| --- | --- | --- | --- | --- |",
    ]
    for key in sorted(old.keys() | new.keys()):
        eco, name, manifest = key
        if eco != ecosystem:
            continue
        lines.append(
            f"| {name} | {manifest} | {', '.join(sorted(old[key])) or 'absent'} | "
            f"{latest[eco, name]} | {', '.join(sorted(new[key])) or 'removed'} |"
        )
    lines.append("")
(OUT / "DEPENDENCIES.md").write_text("\n".join(lines).rstrip() + "\n")

exceptions = [
    "# Retained transitive versions",
    "",
    (
        "All direct requirements match registry latest. These older indirect "
        "resolutions remain for the specific reasons below; they are not "
        "presented as updated to latest. The complete table includes every "
        "occurrence. The root npm tree has an unresolved security blocker: npm "
        "12.2.2 bundles glob 13.0.6 and minimatch 10.2.5, affected by "
        "GHSA-3g3m-2fjr-6pw4 and GHSA-g3hv-75wg-m249. npm audit reports 21 "
        "propagated moderate findings from those two advisories. Other "
        "ecosystem audits report no known vulnerabilities. This does not "
        "satisfy the zero-unresolved-advisories requirement."
    ),
    "",
    (
        "npm 12.2.2 publishes its CLI dependencies bundled inside the "
        "integrity-checked tarball; consumer overrides do not replace them. An "
        "upstream report already tracks the missing fix: "
        "https://github.com/npm/cli/issues/10299#issuecomment-6879318834. "
        "Changing those vendored packages would fork npm rather than install "
        "the released CLI; no tested official fixed release exists today. The "
        "strict audit continues to fail explicitly instead of suppressing the "
        "advisories. For other npm packages, the table identifies the current "
        "parent and its declared range. A newer child major cannot be forced "
        "across that range without migrating the parent API (many switch CJS to"
        " ESM or change return values). Parents are themselves current; their "
        "tested dependency contracts are retained instead of silently "
        "overriding unrelated major APIs. Our narrowly scoped parser overrides "
        "are exercised by an actual command/configuration integration test."
    ),
    "",
    (
        "Scriv 1.8.1 requires exact click==8.5.0 and markdown-it-py==4.2.0. "
        "Keeping those is required for a valid resolver result. The upstream "
        "report includes both newer registry releases: "
        "https://github.com/nedbat/scriv/issues/209#issuecomment-6878955200. "
        "Hash-locked installs and pip-audit pass; no dependency constraints are"
        " weakened."
    ),
    "",
    (
        "getrandom 0.4.3 requires r-efi ^6 for the conditional UEFI backend; "
        "7.2.0 is a different major. Upstream already merged the upgrade into "
        "unreleased 0.4.4: https://github.com/rust-random/getrandom/pull/869 "
        "and https://github.com/rust-random/getrandom/blob/master/CHANGELOG.md."
        " Preserve support for that platform and the released parent rather "
        "than patch Cargo metadata or use unreleased Git code."
    ),
    "",
    "| Ecosystem | Package | Retained | Latest | Lock | Published parent constraint / reason |",
    "| --- | --- | --- | --- | --- | --- |",
]
locks = {
    p: json.loads((ROOT / p).read_text())["packages"]
    for p in ["package-lock.json", "js/package-lock.json"]
}


def parents(packages, child_path, name, version, lock_path):
    result = []
    base = ROOT / posixpath.dirname(lock_path)
    for parent_path, locked in packages.items():
        info = locked
        file = base / parent_path / "package.json"
        if not info.get("dependencies") and file.is_file():
            info = json.loads(file.read_text())
        req = {
            **info.get("dependencies", {}),
            **(info.get("devDependencies", {}) if not parent_path else {}),
            **info.get("optionalDependencies", {}),
        }.get(name)
        if not req:
            continue
        directory = parent_path
        while True:
            candidate = posixpath.join(directory, "node_modules", name)
            if candidate in packages:
                if candidate == child_path:
                    parent_name = info.get(
                        "name", parent_path.rsplit("node_modules/", 1)[-1] or "project"
                    )
                    result.append(f"{parent_name}@{locked.get('version', 'root')} requires {req}")
                break
            if not directory:
                break
            directory = posixpath.dirname(directory)
    return (
        "; ".join(sorted(set(result)))
        or "Resolved beneath the current published parent; see lock ancestry"
    )


seen = set()
for row in after["rows"]:
    eco, name, version, manifest = (row[k] for k in ("ecosystem", "name", "version", "manifest"))
    if not version or version == row["latest"] or not manifest.endswith((".lock", "lock.json")):
        continue
    key = (eco, name, version, manifest)
    if key in seen:
        continue
    seen.add(key)
    if eco == "npm":
        packages = locks[manifest]
        occurrences = [
            (p, i)
            for p, i in packages.items()
            if p.rsplit("node_modules/", 1)[-1] == name and i.get("version") == version
        ]
        reason = "; ".join(
            sorted(
                {
                    (
                        "Bundled in the released npm@12.2.2 CLI (inBundle=true)"
                        if i.get("inBundle")
                        else parents(packages, p, name, version, manifest)
                    )
                    for p, i in occurrences
                }
            )
        )
    elif eco == "pypi":
        reason = "Scriv 1.8.1 exact requirement; upstream report 209 above"
    elif eco == "cargo":
        reason = "getrandom 0.4.3 UEFI backend requires ^6; upstream 869 merged, not released"
    else:
        raise RuntimeError(f"Unexplained old resolution: {key}")
    exceptions.append(
        f"| {eco} | {name} | {version} | {row['latest']} | {manifest} | "
        f"{reason.replace('|', '&#124;')} |"
    )
(OUT / "EXCEPTIONS.md").write_text("\n".join(exceptions) + "\n")
print(
    f"Rendered {len(old.keys() | new.keys())} dependency rows "
    f"and {len(seen)} retained lock resolutions"
)
