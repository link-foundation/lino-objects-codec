#!/usr/bin/env python3
"""Make every actions/checkout state `persist-credentials` explicitly.

Issue #71 (zizmor `artipacked`): actions/checkout writes the job token into
.git/config by default, where any later step, or an uploaded artifact that
includes the work tree, can read it. Read-only jobs get `false`; jobs granted
`contents: write` push the release commit and tag, so they keep `true`, stated
explicitly with a comment, as the link-foundation pipeline templates do.
Usage: python3 set-persist-credentials.py .github/workflows/*.yml
"""
import re
import sys

WRITER_COMMENT = (
    "# This job writes to the repository (a release commit and tag, or a\n"
    "# release PR branch), so the checkout explicitly persists credentials.\n"
)


def jobs(lines):
    """Yield (start, end) line ranges of each job under `jobs:`."""
    top = next(i for i, l in enumerate(lines) if l.startswith("jobs:"))
    starts = [i for i in range(top + 1, len(lines)) if re.match(r"  [\w-]+:\s*$", lines[i])]
    for n, s in enumerate(starts):
        yield s, (starts[n + 1] if n + 1 < len(starts) else len(lines))


def migrate(path):
    lines = open(path, encoding="utf-8").read().split("\n")
    for js, je in reversed(list(jobs(lines))):
        writer = any(re.match(r"\s+contents:\s*write", lines[k]) for k in range(js, je))
        k = je - 1
        while k >= js:
            m = re.match(r"(\s*)- uses: actions/checkout@\S+\s*$", lines[k])
            if not m:
                k -= 1
                continue
            dash = len(m.group(1))
            item = dash + 2
            end = k + 1
            while end < je and (not lines[end].strip() or len(lines[end]) - len(lines[end].lstrip()) > dash):
                end += 1
            block = lines[k:end]
            if any("persist-credentials" in b for b in block):
                k -= 1
                continue
            value = "true" if writer else "false"
            with_line = next(
                (i for i in range(k + 1, end) if lines[i] == " " * item + "with:"), None
            )
            entry = " " * (item + 2) + f"persist-credentials: {value}"
            if with_line is None:
                last = end
                while not lines[last - 1].strip():
                    last -= 1
                lines[last:last] = [" " * item + "with:", entry]
            else:
                last = with_line + 1
                while last < end and len(lines[last]) - len(lines[last].lstrip()) > item:
                    last += 1
                lines.insert(last, entry)
            if writer:
                comment = [" " * len(m.group(1)) + c for c in WRITER_COMMENT.rstrip("\n").split("\n")]
                lines[k:k] = comment
            k -= 1
    open(path, "w", encoding="utf-8").write("\n".join(lines))


for p in sys.argv[1:]:
    migrate(p)
