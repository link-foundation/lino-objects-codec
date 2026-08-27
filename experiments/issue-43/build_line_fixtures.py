#!/usr/bin/env python3
"""Fill in the `line` field of the shared readable-format fixtures.

Written directly from the single-line specification in `rust/src/readable.rs`,
independently of any implementation, so that the four language suites are
checked against the format rather than against one of them.

Usage: python3 experiments/issue-43/build_line_fixtures.py [--write]
"""
import base64
import json
import pathlib
import sys

FIXTURES = pathlib.Path(__file__).resolve().parents[2] / "fixtures/readable-format/cases.json"
BASE64_MARKER = "base64"
OBJECT_MARKER = "o"
KEY_NEEDS_QUOTES = set(" \t\n\r()'\":`")


def needs_encoding(text):
    return any(ord(c) <= 0x1F or 0x7F <= ord(c) <= 0x9F for c in text)


def quote(text):
    if '"' not in text:
        return f'"{text}"'
    if "'" not in text:
        return f"'{text}'"
    return '"' + text.replace('"', '""') + '"'


def format_string(text):
    if needs_encoding(text):
        payload = base64.b64encode(text.encode("utf-8")).decode("ascii")
        return f"({BASE64_MARKER} {quote(payload)})"
    return quote(text)


def format_key(key):
    plain = (
        key != ""
        and key != BASE64_MARKER
        and not needs_encoding(key)
        and not any(c in KEY_NEEDS_QUOTES or c.isspace() for c in key)
    )
    return key if plain else format_string(key)


def format_float(value):
    if isinstance(value, str):
        return value  # "NaN", "Infinity", "-Infinity"
    text = repr(float(value))
    return text


def line_of(tagged):
    (tag, payload), = tagged.items()
    if tag == "null":
        return "null"
    if tag == "bool":
        return "true" if payload else "false"
    if tag == "int":
        return str(payload)
    if tag == "float":
        return format_float(payload)
    if tag == "str":
        return format_string(payload)
    if tag == "array":
        return "(" + " ".join(line_of(item) for item in payload) + ")"
    if tag == "object":
        if not payload:
            return f"({OBJECT_MARKER}:)"
        pairs = " ".join(f"({format_key(k)} {line_of(v)})" for k, v in payload)
        return f"({OBJECT_MARKER}: {pairs})"
    raise SystemExit(f"unknown tag {tag}")


def main():
    document = json.loads(FIXTURES.read_text())
    for case in document["cases"]:
        case["line"] = line_of(case["value"])
        print(f"{case['name']}: {case['line']}")

    if "--write" in sys.argv:
        FIXTURES.write_text(json.dumps(document, indent=2, ensure_ascii=False) + "\n")
        print(f"\nwrote {FIXTURES}")


if __name__ == "__main__":
    main()
