#!/usr/bin/env python3
"""Build ``fixtures/readable-format/cases.json``, the cross-language fixture set.

Every ``text`` below is written by hand from the format specification, not taken
from an implementation's output, so that the four conformance test suites check
each other rather than agreeing on a shared mistake.

Run with ``python3 experiments/issue-39/build_fixtures.py`` from the repository
root; it only serialises the table below to JSON.
"""

import json
from pathlib import Path

NULL = {"null": True}


def b(value):
    return {"bool": value}


def i(value):
    return {"int": value}


def f(value):
    return {"float": value}


def s(value):
    return {"str": value}


def arr(*items):
    return {"array": list(items)}


def obj(*pairs):
    return {"object": [list(pair) for pair in pairs]}


# A language listed here cannot represent the case; the reason is asserted in the
# conformance suites, which skip exactly these cases and no others.
JS_WHOLE_FLOAT = {
    "js": "JavaScript has one number type, so 2.0 and 2 are the same value and "
    "the trailing '.0' cannot be recovered when encoding"
}

CASES = [
    # === Scalars at the root ===
    {"name": "null_scalar", "value": NULL, "text": "null"},
    {"name": "bool_true", "value": b(True), "text": "true"},
    {"name": "bool_false", "value": b(False), "text": "false"},
    {"name": "int_positive", "value": i(42), "text": "42"},
    {"name": "int_negative", "value": i(-7), "text": "-7"},
    {"name": "int_zero", "value": i(0), "text": "0"},
    {"name": "float_fraction", "value": f(3.5), "text": "3.5"},
    {"name": "float_whole", "value": f(2.0), "text": "2.0", "skip": JS_WHOLE_FLOAT},
    {"name": "float_negative", "value": f(-0.5), "text": "-0.5"},
    {"name": "float_nan", "value": f("NaN"), "text": "NaN"},
    {"name": "float_infinity", "value": f("Infinity"), "text": "Infinity"},
    {"name": "float_negative_infinity", "value": f("-Infinity"), "text": "-Infinity"},
    {"name": "string_plain", "value": s("root"), "text": '"root"'},
    {"name": "string_empty", "value": s(""), "text": '""'},
    {"name": "string_with_spaces", "value": s("with spaces"), "text": '"with spaces"'},
    {"name": "string_apostrophe", "value": s("it's"), "text": '"it\'s"'},
    {
        "name": "string_double_quote",
        "value": s('he said "hello"'),
        "text": "'he said \"hello\"'",
    },
    {
        "name": "string_both_quote_kinds",
        "value": s("both \"kinds\" of 'quotes'"),
        "text": "\"both \"\"kinds\"\" of 'quotes'\"",
    },
    {
        "name": "string_unicode",
        "value": s("unicode: 你好世界 🌍"),
        "text": '"unicode: 你好世界 🌍"',
    },
    {
        "name": "string_parens_and_colon",
        "value": s("parens (and) colons: yes"),
        "text": '"parens (and) colons: yes"',
    },
    # Quoting is what keeps a numeric or boolean string from decoding as a number.
    {"name": "string_numeric", "value": s("18878"), "text": '"18878"'},
    {"name": "string_boolean", "value": s("true"), "text": '"true"'},
    # === Values that cannot be written as text ===
    {
        "name": "string_with_newline",
        "value": s("line1\nline2"),
        "text": '(base64 "bGluZTEKbGluZTI=")',
    },
    {"name": "string_with_tab", "value": s("a\tb"), "text": '(base64 "YQli")'},
    # === Empty containers keep their type ===
    {"name": "empty_array", "value": arr(), "text": "()"},
    {"name": "empty_object", "value": obj(), "text": "(\n)"},
    # === Containers ===
    {
        "name": "array_of_scalars",
        "value": arr(i(1), s("two"), b(True), NULL),
        "text": '(\n  1\n  "two"\n  true\n  null\n)',
    },
    {
        "name": "object_of_scalars",
        "value": obj(("name", s("Alice")), ("age", i(30))),
        "text": '(\n  name "Alice"\n  age 30\n)',
    },
    {
        "name": "nested_empty_containers",
        "value": obj(("empty_array", arr()), ("empty_object", obj())),
        "text": "(\n  empty_array ()\n  empty_object (\n  )\n)",
    },
    {
        "name": "array_of_objects_keeps_record_boundaries",
        "value": arr(
            obj(("id", s("1")), ("label", s("one"))),
            obj(("id", s("2")), ("label", s("two"))),
        ),
        "text": '(\n  (\n    id "1"\n    label "one"\n  )\n  (\n    id "2"\n    label "two"\n  )\n)',
    },
    {
        "name": "array_of_arrays",
        "value": arr(arr(i(1), i(2)), arr(i(3))),
        "text": "(\n  (\n    1\n    2\n  )\n  (\n    3\n  )\n)",
    },
    {
        "name": "single_pair_object_is_not_a_two_element_array",
        "value": obj(("key", s("value"))),
        "text": '(\n  key "value"\n)',
    },
    {
        "name": "two_element_array_is_not_a_single_pair_object",
        "value": arr(s("key"), s("value")),
        "text": '(\n  "key"\n  "value"\n)',
    },
    # === Keys ===
    {
        "name": "keys_that_need_quoting",
        "value": obj(
            ("two words", i(1)),
            ("", i(2)),
            ("base64", i(3)),
            ("with:colon", i(4)),
            ('with"quote', i(5)),
        ),
        "text": '(\n  "two words" 1\n  "" 2\n  "base64" 3\n  "with:colon" 4\n'
        "  'with\"quote' 5\n)",
    },
    {
        "name": "base64_key_with_plain_value_is_not_a_marker",
        "value": obj(("base64", s("plain text"))),
        "text": '(\n  "base64" "plain text"\n)',
    },
    # === The document from issue #37 ===
    {
        "name": "documented_router_state",
        "value": obj(
            ("type", s("RouterState")),
            ("server", obj(("host", s("127.0.0.1")), ("port", i(18878)))),
            ("models", arr(s("claude-haiku"), s("claude-opus"))),
        ),
        "text": '(\n  type "RouterState"\n  server (\n    host "127.0.0.1"\n'
        '    port 18878\n  )\n  models (\n    "claude-haiku"\n'
        '    "claude-opus"\n  )\n)',
    },
    {
        "name": "mixed_types_in_one_object",
        "value": obj(
            ("int", i(-7)),
            ("float", f(3.5)),
            ("whole_float", f(2.0)),
            ("yes", b(True)),
            ("no", b(False)),
            ("nothing", NULL),
            ("numeric_string", s("18878")),
            ("boolean_string", s("true")),
        ),
        "text": "(\n  int -7\n  float 3.5\n  whole_float 2.0\n  yes true\n"
        '  no false\n  nothing null\n  numeric_string "18878"\n'
        '  boolean_string "true"\n)',
        "skip": JS_WHOLE_FLOAT,
    },
    {
        "name": "only_unwritable_values_are_marked",
        "value": obj(
            ("readable", s("still visible")),
            ("multiline", s("line1\nline2")),
            ("tabbed", s("a\tb")),
        ),
        "text": '(\n  readable "still visible"\n  multiline (base64 "bGluZTEKbGluZTI=")\n'
        '  tabbed (base64 "YQli")\n)',
    },
    {
        "name": "deeply_nested_objects",
        "value": obj(("a", obj(("b", obj(("c", arr(i(1)))))))),
        "text": "(\n  a (\n    b (\n      c (\n        1\n      )\n    )\n  )\n)",
    },
]

DOCUMENT = {
    "description": (
        "Shared conformance fixtures for the readable, indented Links Notation "
        "format. Every implementation must encode `value` to exactly `text` and "
        "decode `text` back to exactly `value`, so the four languages produce "
        "byte-identical documents."
    ),
    "valueEncoding": (
        "A value is a single-key object naming its type: {\"null\": true}, "
        '{"bool": …}, {"int": …}, {"float": … | "NaN" | "Infinity" | '
        '"-Infinity"}, {"str": …}, {"array": [value, …]} or '
        '{"object": [[key, value], …]}. Object pairs are a list, not a map, '
        "because key order is part of the document."
    ),
    "skip": (
        "`skip` maps a language id (js, python, rust, csharp) to the reason its "
        "value model cannot represent the case. A suite skips exactly the cases "
        "naming it."
    ),
    "cases": CASES,
}

target = Path(__file__).resolve().parents[2] / "fixtures" / "readable-format" / "cases.json"
target.write_text(json.dumps(DOCUMENT, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
print(f"wrote {len(CASES)} cases to {target}")
