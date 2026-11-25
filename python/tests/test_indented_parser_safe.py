"""The indented format must read back unchanged with the plain links-notation Parser (issue #94)."""

import json
from pathlib import Path
from typing import Any

import pytest
from links_notation import Parser

from link_notation_objects_codec import escape_reference, format_indented, parse_indented

FIXTURES = Path(__file__).parents[2] / "fixtures/indented-format"
PARSER_SAFE = json.loads((FIXTURES / "parser-safe.json").read_text(encoding="utf-8"))
STRINGS = json.loads((FIXTURES / "strings.json").read_text(encoding="utf-8"))
CASES = PARSER_SAFE + STRINGS

_parser = Parser()


def _plain_pairs(text: str) -> list[tuple[str | None, str | None]]:
    """Read ``key value`` pairs the way any links-notation reader sees them."""
    header, _, body = text.partition("\n")
    links = _parser.parse(f"{header}:\n{body}")
    assert len(links) == 1
    return [(child.values[0].id, child.values[1].id) for child in links[0].values]


@pytest.mark.parametrize("case", CASES, ids=[case["name"] for case in CASES])
def test_parser_reads_format_indented_output(case: dict[str, str]) -> None:
    value = case["value"]
    original: dict[str, Any] = {"k": value, value: value, "z": value}
    text = format_indented("root", original)
    assert parse_indented(text) == ("root", original)
    assert _plain_pairs(text) == list(original.items())


def test_issue_94_empty_values_do_not_swallow_following_lines() -> None:
    original = {"a": "", "b": "", "#k": "#v", "c": "end"}
    text = format_indented("doc", original)
    assert text == 'doc\n  a ~1{}\n  b ~1{}\n  \'#k\' "#v"\n  c "end"'
    assert parse_indented(text) == ("doc", original)


def test_parse_indented_still_reads_legacy_empty_quotes() -> None:
    assert parse_indented('doc\n  a ""') == ("doc", {"a": ""})


@pytest.mark.parametrize("case", PARSER_SAFE, ids=[case["name"] for case in PARSER_SAFE])
def test_escape_reference_is_parser_safe(case: dict[str, str]) -> None:
    reference = escape_reference(case["value"])
    links = _parser.parse(f"(k {reference})")
    assert [(link.values[0].id, link.values[1].id) for link in links] == [("k", case["value"])]


def test_escape_reference_spellings() -> None:
    assert escape_reference("") == "~1{}"
    assert escape_reference("#x") == "'#x'"
    assert escape_reference("issue#1") == "issue#1"
    assert escape_reference("~1{61}") == "'~1{61}'"
    assert escape_reference("'\"") == "`'\"`"
    assert escape_reference("'\"`") == '"\'""`"'
    assert escape_reference("'`\"") == "~1{276022}"
