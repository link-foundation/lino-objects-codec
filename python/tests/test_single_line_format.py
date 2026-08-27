"""Tests for the readable, single-line format produced by ``encode_line()``
(issue #43).

An append-only log wants one record per line: appending is one write, compaction
cuts at a newline, and ``grep``, ``tail -f`` and ``wc -l`` all treat a line as an
event. ``encode()`` spreads a record over many lines and ``encode_compact()``
hides it in base64, so neither serves that reader.
"""

import time
from typing import Any

import pytest
from links_notation import Parser

from link_notation_objects_codec import (
    ReadableFormatError,
    decode,
    decode_line,
    encode,
    encode_line,
)

#: A record of the shape an append-only log actually holds.
LOG_RECORD = {
    "bytes": 2827,
    "complete": True,
    "server": {"host": "127.0.0.1", "port": 18878},
    "models": ["claude-haiku", "claude-opus"],
}

LOG_RECORD_LINE = (
    '(o: (bytes 2827) (complete true) (server (o: (host "127.0.0.1")'
    ' (port 18878))) (models ("claude-haiku" "claude-opus")))'
)


def test_a_record_is_written_on_one_line() -> None:
    line = encode_line(LOG_RECORD)
    assert "\n" not in line and "\r" not in line, line
    assert line == LOG_RECORD_LINE


def test_a_line_is_valid_links_notation() -> None:
    Parser().parse(encode_line(LOG_RECORD))


def _ids(links: Any) -> list[str]:
    """Every id in a parse tree, so a mangled parse can be recognised."""
    found: list[str] = []
    for link in links:
        found.append(link.id or "")
        found.extend(_ids(link.values))
    return found


def test_the_hand_rolled_dialect_is_not_read_as_a_record() -> None:
    """The dialect a downstream project invented for the same need, which the
    notation does not read back -- the reason this format exists.

    This parser does not raise on it; it swallows the parentheses into the data,
    which loses the record just as surely.
    """
    ids = _ids(Parser().parse('((:"bytes" 2827) (:"complete" true))'))
    assert any("(" in name or ")" in name for name in ids), ids


@pytest.mark.parametrize(
    "value",
    [LOG_RECORD, [], {}, [{}, []], {"empty": []}, 42, None, "text"],
)
def test_both_forms_of_the_same_value_decode_alike(value: Any) -> None:
    assert decode(encode_line(value)) == decode(encode(value))
    assert decode_line(encode_line(value)) == value


def test_a_string_keeps_its_own_characters_on_one_line() -> None:
    value = {"text": 'quote " backslash \\ ünïcödé'}
    line = encode_line(value)
    assert line == "(o: (text 'quote \" backslash \\ ünïcödé'))"
    assert decode_line(line) == value


def test_a_string_holding_a_newline_still_fits_on_one_line() -> None:
    value = {"readable": "still visible", "multiline": "line1\nline2"}
    line = encode_line(value)
    assert line == '(o: (readable "still visible") (multiline (base64 "bGluZTEKbGluZTI=")))'
    assert "\n" not in line, line
    assert decode_line(line) == value


def test_a_one_pair_dict_is_not_a_two_element_list() -> None:
    assert encode_line({"a": 1}) == "(o: (a 1))"
    assert encode_line(["a", 1]) == '("a" 1)'
    assert decode_line("(o: (a 1))") == {"a": 1}
    assert decode_line('("a" 1)') == ["a", 1]


def test_the_empty_key_survives_the_round_trip() -> None:
    value = {"": 2}
    assert encode_line(value) == '(o: ("" 2))'
    assert decode_line(encode_line(value)) == value


def test_a_marked_object_holding_something_that_is_not_a_pair_is_rejected() -> None:
    with pytest.raises(ReadableFormatError, match="pairs"):
        decode_line("(o: 1 2)")


def test_several_lines_are_not_one_record() -> None:
    with pytest.raises(ReadableFormatError):
        decode_line("(o: (a 1))\n(o: (b 2))")


def test_a_trailing_newline_is_not_a_second_record() -> None:
    assert decode_line("(o: (a 1))\n") == {"a": 1}


def test_a_line_starting_with_none_is_still_read_as_a_line() -> None:
    assert decode("(null 1)") == [None, 1]
    assert decode("(o: (a null))") == {"a": None}
    # The one document both forms claim: `(None)` is the compact null this
    # language writes, and stays read that way, so documents written before this
    # format keep decoding.
    assert decode("(None)") is None


def test_a_long_run_of_line_breaks_is_rejected_without_a_slowdown() -> None:
    # The JavaScript sibling trimmed the framing newlines with a regular
    # expression that backtracked once per newline (CodeQL js/polynomial-redos).
    # Every language strips them with a linear scan instead, and still refuses
    # input holding more than one line.
    notation = LOG_RECORD_LINE + "\n" * 200_000 + "x"
    started = time.perf_counter()
    with pytest.raises(ReadableFormatError):
        decode_line(notation)
    assert time.perf_counter() - started < 2.0
