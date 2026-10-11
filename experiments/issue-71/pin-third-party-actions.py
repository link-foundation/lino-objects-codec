#!/usr/bin/env python3
"""Hash-pin third-party actions in .github/workflows (issue #71).

zizmor's `unpinned-uses` (and .github/zizmor.yml) require a full commit SHA
for every action outside actions/*, github/*, docker/*, lycheeverse/* and
zizmorcore/*: a tag of a repository we do not control can be moved to
arbitrary code. dtolnay/rust-toolchain@stable relied on the ref for its
default toolchain, so the pinned form restates `toolchain: stable`.

Usage: python3 experiments/issue-71/pin-third-party-actions.py
"""

import re
from pathlib import Path

PINS = {
    "peter-evans/create-pull-request@v8": "peter-evans/create-pull-request@5f6978faf089d4d20b00c7766989d076bb2fc7f1 # v8.1.1",
    "codecov/codecov-action@v7": "codecov/codecov-action@303a32d7a59b442fa8d48b6a1cc6825c09c847a5 # v7.1.1",
    "pypa/gh-action-pypi-publish@release/v1": "pypa/gh-action-pypi-publish@dc37677b2e1c63e2034f94d8a5b11f265b73ba33 # v1.14.2",
    "dtolnay/rust-toolchain@stable": "dtolnay/rust-toolchain@686976e191b89faba57d3206551f0f330d8cb249 # stable branch @ 2026-10-09",
}

TOOLCHAIN_COMMENT = (
    "# The `stable` ref supplied the default toolchain; restated now that\n"
    "# the action is pinned by hash.\n"
)

for path in sorted(Path(".github/workflows").glob("*.yml")):
    lines = path.read_text().splitlines(keepends=True)
    out = []
    i = 0
    while i < len(lines):
        line = lines[i]
        m = re.match(r"^(\s*)(- )?uses: (\S+)\s*$", line)
        if m and m.group(3) in PINS:
            ref = m.group(3)
            out.append(line.replace(ref, PINS[ref]))
            if ref.startswith("dtolnay/"):
                key_indent = m.group(1) + ("  " if m.group(2) else "")
                nxt = lines[i + 1] if i + 1 < len(lines) else ""
                with_indent = key_indent + "  "
                block = "".join(with_indent + c for c in TOOLCHAIN_COMMENT.splitlines(True))
                if nxt.strip() == "with:":
                    out.append(nxt)
                    out.append(block + with_indent + "toolchain: stable\n")
                    i += 1
                else:
                    out.append(key_indent + "with:\n" + block + with_indent + "toolchain: stable\n")
        else:
            out.append(line)
        i += 1
    new = "".join(out)
    if new != path.read_text():
        path.write_text(new)
        print(f"pinned: {path}")
