#!/usr/bin/env python3
"""Rewrite `${{ expr }}` inside `run:` blocks to "$VAR" plus a step `env:` entry.

One-off migration tool for issue #71 (zizmor template-injection). Kept so the
change can be reproduced or re-applied to the pipeline templates.
Usage: python3 move-run-expressions-to-env.py .github/workflows/*.yml
"""
import re
import sys

EXPR = re.compile(r"\$\{\{\s*(.*?)\s*\}\}")
# Default runner variables need no env entry.
BUILTIN = {"github.repository": "GITHUB_REPOSITORY", "github.sha": "GITHUB_SHA"}
NAMES = {
    "steps.version_check.outputs.package_id": "PACKAGE_ID",
    "steps.version_check.outputs.current_version": "CURRENT_VERSION",
    "steps.version_check.outputs.package_name": "PACKAGE_NAME",
    "steps.pkg.outputs.package_name": "PACKAGE_NAME",
    "steps.publish.outputs.published_version": "PUBLISHED_VERSION",
    "steps.version.outputs.new_version": "NEW_VERSION",
    "steps.bump_type.outputs.bump_type": "BUMP_TYPE",
    "steps.current_version.outputs.version": "CURRENT_VERSION",
    "github.event.inputs.bump_type": "BUMP_TYPE",
    "github.event.inputs.description": "DESCRIPTION",
}


def indent_of(line):
    return len(line) - len(line.lstrip())


def run_blocks(lines):
    """Yield (key_line, first, last) for every run: key, block lines inclusive."""
    i = 0
    while i < len(lines):
        m = re.match(r"(\s*)(-\s+)?run:\s*(.*)$", lines[i])
        if not m:
            i += 1
            continue
        key_indent = len(m.group(1)) + (len(m.group(2)) if m.group(2) else 0)
        j = i + 1
        if m.group(3).startswith(("|", ">")):
            while j < len(lines) and (not lines[j].strip() or indent_of(lines[j]) > key_indent):
                j += 1
        yield i, key_indent, i, j - 1
        i = j


def migrate(path):
    lines = open(path, encoding="utf-8").read().split("\n")
    changed = False
    for key_line, key_indent, first, last in reversed(list(run_blocks(lines))):
        needed = {}
        for k in range(first, last + 1):
            def repl(m):
                expr = m.group(1)
                if expr in BUILTIN:
                    return "${" + BUILTIN[expr] + "}"
                if expr not in NAMES:
                    raise SystemExit(f"{path}:{k + 1}: no env name for {expr!r}")
                needed[NAMES[expr]] = expr
                return "${" + NAMES[expr] + "}"
            new = EXPR.sub(repl, lines[k])
            if new != lines[k]:
                lines[k] = new
                changed = True
        if not needed:
            continue
        # Locate the step: the nearest line above at key_indent - 2 starting with "- ".
        start = key_line
        while not (lines[start].lstrip().startswith("- ") and indent_of(lines[start]) == key_indent - 2):
            start -= 1
        end = start + 1
        while end < len(lines) and (not lines[end].strip() or indent_of(lines[end]) > key_indent - 2):
            end += 1
        env_line = next(
            (k for k in range(start, end)
             if re.match(rf"\s{{{key_indent}}}env:\s*$", lines[k]) or re.match(rf"\s*-\s+env:\s*$", lines[k]) and k == start),
            None,
        )
        existing = {}
        if env_line is not None:
            k = env_line + 1
            while k < end and (not lines[k].strip() or indent_of(lines[k]) > key_indent):
                em = re.match(r"\s*([A-Z_][A-Z0-9_]*):\s*\$\{\{\s*(.*?)\s*\}\}\s*$", lines[k])
                if em:
                    existing[em.group(1)] = em.group(2)
                k += 1
            insert_at = k
            while not lines[insert_at - 1].strip():
                insert_at -= 1
        else:
            insert_at = key_line
            lines.insert(insert_at, " " * key_indent + "env:")
            insert_at += 1
        new_entries = []
        for name, expr in needed.items():
            if name in existing:
                if existing[name] != expr:
                    raise SystemExit(f"{path}:{key_line + 1}: env {name} already set to {existing[name]!r}")
                continue
            new_entries.append(" " * (key_indent + 2) + f"{name}: ${{{{ {expr} }}}}")
        lines[insert_at:insert_at] = new_entries
    if changed:
        open(path, "w", encoding="utf-8").write("\n".join(lines))
        print(f"rewrote {path}")


for p in sys.argv[1:]:
    migrate(p)
