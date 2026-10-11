#!/usr/bin/env python3
"""List every `${{ ... }}` expression that appears inside a `run:` block.

Issue #71: such expressions are expanded by the runner *before* the shell
parses the script, so any value an attacker (or just an odd input) controls
becomes shell code. The fix is to pass the value through `env:` and refer to
it as "$VAR". Usage: python3 find-run-expressions.py .github/workflows/*.yml
"""
import re
import sys

EXPR = re.compile(r"\$\{\{.*?\}\}")


def scan(path):
    hits = []
    lines = open(path, encoding="utf-8").read().split("\n")
    in_run, run_indent = False, 0
    for number, line in enumerate(lines, 1):
        stripped = line.lstrip()
        indent = len(line) - len(stripped)
        if in_run:
            if stripped and indent <= run_indent:
                in_run = False
            else:
                hits += [(number, m) for m in EXPR.findall(line)]
                continue
        m = re.match(r"(\s*)(?:-\s+)?run:\s*(.*)$", line)
        if m:
            run_indent = len(m.group(1))
            rest = m.group(2)
            if rest.startswith(("|", ">")):
                in_run = True
            else:
                hits += [(number, e) for e in EXPR.findall(rest)]
    return hits


total = 0
for path in sys.argv[1:]:
    for number, expr in scan(path):
        print(f"{path}:{number}: {expr}")
        total += 1
print(f"{total} expression(s) inside run: blocks", file=sys.stderr)
sys.exit(1 if total else 0)
