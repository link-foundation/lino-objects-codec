"""Shared regression cases for quoted strings in the indented display format."""

import json
from pathlib import Path

import pytest

from link_notation_objects_codec import format_indented, parse_indented

CASES = json.loads(
    (Path(__file__).parents[2] / "fixtures/indented-format/strings.json").read_text(
        encoding="utf-8"
    )
)


@pytest.mark.parametrize("case", CASES, ids=[case["name"] for case in CASES])
def test_indented_string_roundtrip(case):
    original = {"t": case["value"], "after": "unchanged"}
    text = format_indented("doc", original)
    assert parse_indented(text) == ("doc", original)
    # Also accept standard headers, leading/trailing blank lines and a final newline.
    assert parse_indented("\n\ndoc:\n" + text.split("\n", 1)[1] + "\n\n") == ("doc", original)
