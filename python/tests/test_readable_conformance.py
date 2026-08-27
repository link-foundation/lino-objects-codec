"""Cross-language conformance tests for the readable format.

The cases live in ``fixtures/readable-format/cases.json`` at the repository root
and are shared by the JavaScript, Python, Rust and C# suites: every
implementation has to encode the same value to exactly the same text and to
exactly the same single line, which is what keeps the four outputs
byte-identical.
"""

import json
import math
from pathlib import Path
from typing import Any

import pytest

from link_notation_objects_codec import decode, decode_line, encode, encode_line

LANGUAGE = "python"

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures" / "readable-format" / "cases.json"

_SPECIAL_FLOATS = {"NaN": math.nan, "Infinity": math.inf, "-Infinity": -math.inf}


def _section(key: str) -> list[dict[str, Any]]:
    document = json.loads(FIXTURES.read_text(encoding="utf-8"))
    return document[key]


def _build(spec: dict[str, Any]) -> Any:
    """Turn a fixture value specification into a Python value."""
    if "null" in spec:
        return None
    if "bool" in spec:
        return spec["bool"]
    if "int" in spec:
        return spec["int"]
    if "float" in spec:
        raw = spec["float"]
        return _SPECIAL_FLOATS[raw] if isinstance(raw, str) else float(raw)
    if "str" in spec:
        return spec["str"]
    if "array" in spec:
        return [_build(item) for item in spec["array"]]
    if "object" in spec:
        return {key: _build(value) for key, value in spec["object"]}
    raise AssertionError(f"unknown value specification: {spec}")


def _same(left: Any, right: Any) -> bool:
    """Deep equality where NaN equals NaN and a bool is not an int."""
    if isinstance(left, bool) or isinstance(right, bool):
        return type(left) is type(right) and left == right
    if isinstance(left, float) and isinstance(right, float):
        return (math.isnan(left) and math.isnan(right)) or left == right
    if isinstance(left, dict) and isinstance(right, dict):
        return list(left) == list(right) and all(_same(left[key], right[key]) for key in left)
    if isinstance(left, list) and isinstance(right, list):
        return len(left) == len(right) and all(
            _same(a, b) for a, b in zip(left, right, strict=True)
        )
    return type(left) is type(right) and left == right


CASES = _section("cases")
ACTIVE = [case for case in CASES if LANGUAGE not in case.get("skip", {})]
LEGACY = _section("legacy")


def test_every_case_is_either_active_or_skipped_with_a_reason() -> None:
    for case in CASES:
        for language, reason in case.get("skip", {}).items():
            assert language in {"js", "python", "rust", "csharp"}, case["name"]
            assert reason, case["name"]


@pytest.mark.parametrize("case", ACTIVE, ids=lambda case: case["name"])
def test_encode_matches_the_shared_text(case: dict[str, Any]) -> None:
    assert encode(_build(case["value"])) == case["text"]


@pytest.mark.parametrize("case", ACTIVE, ids=lambda case: case["name"])
def test_decode_matches_the_shared_value(case: dict[str, Any]) -> None:
    expected = _build(case["value"])
    decoded = decode(case["text"])
    assert _same(decoded, expected), f"{decoded!r} != {expected!r}"


@pytest.mark.parametrize("case", ACTIVE, ids=lambda case: case["name"])
def test_encode_line_matches_the_shared_line(case: dict[str, Any]) -> None:
    assert encode_line(_build(case["value"])) == case["line"]


@pytest.mark.parametrize("case", CASES, ids=lambda case: case["name"])
def test_the_shared_line_holds_no_line_break(case: dict[str, Any]) -> None:
    assert "\n" not in case["line"] and "\r" not in case["line"], case["line"]


@pytest.mark.parametrize("case", ACTIVE, ids=lambda case: case["name"])
def test_decode_line_matches_the_shared_value(case: dict[str, Any]) -> None:
    expected = _build(case["value"])
    decoded = decode_line(case["line"])
    assert _same(decoded, expected), f"{decoded!r} != {expected!r}"


@pytest.mark.parametrize("case", ACTIVE, ids=lambda case: case["name"])
def test_decode_reads_the_shared_line_too(case: dict[str, Any]) -> None:
    expected = _build(case["value"])
    decoded = decode(case["line"])
    assert _same(decoded, expected), f"{decoded!r} != {expected!r}"


@pytest.mark.parametrize("case", LEGACY, ids=lambda case: case["name"])
def test_decode_reads_the_document_an_earlier_version_wrote(case: dict[str, Any]) -> None:
    """Documents written before this format wrote text as text keep decoding, so
    upgrading a reader never loses a stored record."""
    expected = _build(case["value"])
    decoded = decode(case["text"])
    assert _same(decoded, expected), f"{decoded!r} != {expected!r}"


def test_no_shared_document_hides_its_text_in_base64() -> None:
    """The point of the change: an implementation may not reach for base64 while
    writing a readable document, whatever the text holds."""
    for case in CASES:
        assert 'base64 "' not in case["text"], case["name"]
        assert 'base64 "' not in case["line"], case["name"]
