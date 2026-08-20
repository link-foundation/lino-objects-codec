"""Cross-language conformance tests for the readable format.

The cases live in ``fixtures/readable-format/cases.json`` at the repository root
and are shared by the JavaScript, Python, Rust and C# suites: every
implementation has to encode the same value to exactly the same text, which is
what keeps the four outputs byte-identical.
"""

import json
import math
from pathlib import Path
from typing import Any

import pytest

from link_notation_objects_codec import decode, encode

LANGUAGE = "python"

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures" / "readable-format" / "cases.json"

_SPECIAL_FLOATS = {"NaN": math.nan, "Infinity": math.inf, "-Infinity": -math.inf}


def _load_cases() -> list[dict[str, Any]]:
    document = json.loads(FIXTURES.read_text(encoding="utf-8"))
    return document["cases"]


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


CASES = _load_cases()
ACTIVE = [case for case in CASES if LANGUAGE not in case.get("skip", {})]


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
