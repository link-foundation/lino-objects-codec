"""Real text stays real text in both readable forms.

Before issue #45 a single control character turned the whole string into base64:
one newline in a log message hid the message, the stack trace and every word a
reader would grep for. The readable forms now write the text as it is, and escape
only the characters the form itself cannot carry.
"""

from typing import Any

import pytest

from link_notation_objects_codec import decode, decode_line, encode, encode_line


def _message(text: str) -> dict[str, Any]:
    """A record of the shape a log line actually holds."""
    return {"message": text}


def test_a_multi_line_string_keeps_its_text_in_the_indented_form() -> None:
    """The reason for the issue: a log line holding a newline must stay greppable."""
    value = _message("line one\nline two")
    encoded = encode(value)

    assert encoded == '(\n  message "line one\nline two"\n)'
    assert "base64" not in encoded
    assert "line one" in encoded
    assert "line two" in encoded
    assert decode(encoded) == value


def test_only_the_newline_is_escaped_in_the_single_line_form() -> None:
    """On one line the record ends at the newline, so the newline -- and nothing
    else -- is escaped: the rest of the message stays as written."""
    value = _message("line one\nline two")
    line = encode_line(value)

    assert line == '(o: (message (escaped "line one%0Aline two")))'
    assert "\n" not in line
    assert "base64" not in line
    assert decode_line(line) == value


def test_a_tab_is_written_as_a_tab_in_both_forms() -> None:
    """A tab is text a reader can see, so both forms keep it as it is."""
    value = _message("a\tb")

    assert encode(value) == '(\n  message "a\tb"\n)'
    assert encode_line(value) == '(o: (message "a\tb"))'
    assert decode(encode(value)) == value
    assert decode_line(encode_line(value)) == value


def test_a_carriage_return_is_escaped_so_crlf_normalisation_cannot_rewrite_it() -> None:
    """A carriage return is the one whitespace character a text file rewrites on
    its own -- CRLF normalisation would change the value -- so it is escaped."""
    value = _message("first\r\nsecond")
    encoded = encode(value)

    assert encoded == '(\n  message (escaped "first%0D\nsecond")\n)'
    assert decode(encoded) == value


def test_a_value_holding_both_quote_kinds_uses_the_n_quote_form() -> None:
    """The doubled-quote form desynchronises the notation's own parser, so a value
    holding both quote kinds is written with a run of delimiters instead."""
    value = _message("both \"kinds\" of 'quotes'")
    encoded = encode(value)

    assert '"""both "kinds" of \'quotes\'"""' in encoded
    assert '""kinds""' not in encoded
    assert decode(encoded) == value


def test_a_repeated_value_is_written_out_every_time() -> None:
    """A value that occurs twice is written twice: a shared reference would make a
    log line depend on another line, which a line-based reader cannot resolve."""
    value = {"first": "same", "second": "same", "third": "same"}

    encoded = encode(value)
    assert encoded.count('"same"') == 3
    assert decode(encoded) == value

    line = encode_line(value)
    assert line.count('"same"') == 3
    assert decode_line(line) == value


def test_a_key_holding_a_control_character_stays_a_key() -> None:
    """A key is escaped like any other text, and stays a key rather than turning
    the dict it belongs to into a list."""
    value = {"a\x00b": 1}

    assert decode(encode(value)) == value
    assert decode_line(encode_line(value)) == value


def test_the_previous_base64_marker_still_decodes() -> None:
    """Documents written by earlier versions keep decoding."""
    assert decode('(\n  message (base64 "bGluZTEKbGluZTI=")\n)') == _message("line1\nline2")


TEXTS = [
    "",
    "plain",
    "with spaces",
    "it's",
    'he said "hello"',
    "both \"kinds\" of 'quotes'",
    '"leading quote',
    'trailing quote"',
    'a""b',
    'a"""b\'c',
    "'\"",
    "\"'",
    "line one\nline two",
    "trailing newline\n",
    "\ttab",
    "carriage\rreturn",
    "null\x00byte",
    "escape\x1b[0m",
    "next\x85line",
    "unicode: 你好世界 🌍",
    "percent %0A not an escape",
    "(parens) and: colons",
    "base64",
    "escaped",
    "o:",
]


@pytest.mark.parametrize("text", TEXTS, ids=repr)
def test_every_kind_of_text_roundtrips_through_both_forms(text: str) -> None:
    """Every value the readable forms write must read back unchanged, whatever
    quotes, newlines and control characters it holds."""
    for value in (text, _message(text), {text: text}, [text]):
        encoded = encode(value)
        assert decode(encoded) == value, f"indented roundtrip failed: {encoded!r}"

        line = encode_line(value)
        assert "\n" not in line, f"{text!r} broke the line: {line!r}"
        assert decode_line(line) == value, f"single-line roundtrip failed: {line!r}"
