"""Registry-backed dependency snapshot; no installations or builds.

Run from the repository root: python experiments/issue-86/inventory.py before
or `after`. Network requests use four workers and the existing freshness client.
"""

import json
import re
import sys
import tomllib
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
import check_dependency_freshness as freshness  # noqa: E402

OUT = ROOT / "dev/log/issues/86/pulls/87/research"


def collect():
    rows = [asdict(dep) for dep in freshness.declarations()]
    for relative in ["package-lock.json", "js/package-lock.json"]:
        lock = json.loads((ROOT / relative).read_text())
        for path, info in lock["packages"].items():
            if path and "version" in info:
                rows.append(
                    {
                        "ecosystem": "npm",
                        "name": path.rsplit("node_modules/", 1)[-1],
                        "version": info["version"],
                        "manifest": relative,
                    }
                )
    for name, version in re.findall(
        r"^([\w.-]+)==([^ \\]+)",
        (ROOT / "python/requirements-dev.lock").read_text(),
        re.M,
    ):
        rows.append(
            {
                "ecosystem": "pypi",
                "name": name,
                "version": version,
                "manifest": "python/requirements-dev.lock",
            }
        )
    for path in sorted(ROOT.glob("**/Cargo.lock")):
        if "target" in path.parts:
            continue
        for info in tomllib.loads(path.read_text())["package"]:
            if info.get("source", "").startswith("registry+"):
                rows.append(
                    {
                        "ecosystem": "cargo",
                        "name": info["name"],
                        "version": info["version"],
                        "manifest": str(path.relative_to(ROOT)),
                    }
                )
    # Installed update/bootstrap tools that have no lockfile entry of their own.
    for ecosystem, name, version in [
        ("pypi", "pip", "26.3"),
        ("pypi", "uv", "0.13.8"),
        ("cargo", "cargo-audit", "0.23.0"),
    ]:
        rows.append(
            {
                "ecosystem": ecosystem,
                "name": name,
                "version": version,
                "manifest": "workflow/update tools",
            }
        )
    for path in ROOT.glob("**/packages.lock.json"):
        if "obj" in path.parts:
            continue
        for framework in json.loads(path.read_text())["dependencies"].values():
            for name, info in framework.items():
                if "resolved" in info:
                    rows.append(
                        {
                            "ecosystem": "nuget",
                            "name": name,
                            "version": info["resolved"],
                            "manifest": str(path.relative_to(ROOT)),
                        }
                    )
    for line in (ROOT / "python/.pre-commit-config.yaml").read_text().splitlines():
        if "repo:" in line:
            repo = line.split("github.com/", 1)[-1].strip()
        if "rev:" in line:
            version = line.split("rev:", 1)[-1].strip().lstrip("v")
            rows.append(
                {
                    "ecosystem": "github-tools",
                    "name": repo,
                    "version": version,
                    "manifest": "python/.pre-commit-config.yaml",
                }
            )
    return rows


def resolve(key):
    ecosystem, name = key
    try:
        return key, {
            "latest": freshness.latest(
                "github-hooks" if name == "pre-commit/mirrors-mypy" else ecosystem, name
            )
        }
    except Exception as error:
        return key, {"error": str(error)}


def main():
    stage = sys.argv[1]
    if stage not in {"before", "after"}:
        raise SystemExit("Expected before or after")
    rows = collect()
    keys = sorted({(r["ecosystem"], r["name"]) for r in rows})
    with ThreadPoolExecutor(max_workers=4) as pool:
        versions = dict(pool.map(resolve, keys))
    for row in rows:
        row.update(versions[row["ecosystem"], row["name"]])
    data = {"retrieved_at": datetime.now(UTC).isoformat(), "rows": rows}
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / f"inventory-{stage}.json").write_text(json.dumps(data, indent=2) + "\n")
    lines = [
        f"# {stage.title()} registry snapshot",
        "",
        f"Retrieved: {data['retrieved_at']}",
        "",
        (
            "Every direct declaration and existing lockfile entry is listed. A dash"
            " means the tool was installed without a version pin."
        ),
        "",
        "| Ecosystem | Dependency | Declared/resolved | Latest stable | Manifest |",
        "| --- | --- | --- | --- | --- |",
    ]
    for row in rows:
        lines.append(
            f"| {row['ecosystem']} | {row['name']} | {row['version'] or '—'} | "
            f"{row.get('latest', row.get('error'))} | {row['manifest']} |"
        )
    (OUT / f"inventory-{stage}.md").write_text("\n".join(lines) + "\n")
    errors = [dict(ecosystem=k[0], name=k[1], **v) for k, v in versions.items() if "error" in v]
    print(
        json.dumps(
            {
                "stage": stage,
                "declarations": len(rows),
                "registry_queries": len(keys),
                "errors": errors,
            }
        )
    )


if __name__ == "__main__":
    main()
