"""Bounded regressions for large readable strings (issue #68)."""

import tracemalloc

import pytest

from link_notation_objects_codec import decode, decode_line, encode, encode_line
from link_notation_objects_codec.readable import ReadableFormatError


def test_quoted_value_does_not_build_per_character_lists() -> None:
    text = "a" * (1024 * 1024) + "🍫"
    notation = f'"{text}"'
    tracemalloc.start()
    try:
        restored = decode(notation)
        _, peak = tracemalloc.get_traced_memory()
    finally:
        tracemalloc.stop()
    assert restored == text
    assert peak < 8 * 1024 * 1024


def test_large_history_and_unicode_quote_runs() -> None:
    record = {"🍫日本語": "evidence " * 8192, "quote": 'both "and\' ending"', "escape": "\r%🍫"}
    history = [record] * 64
    assert decode(encode(history)) == history
    assert decode_line(encode_line(history)) == history
    for quote in ['"', "'", "`"]:
        assert decode(f"{quote}legacy {quote}{quote}🍫{quote}{quote} end{quote}") == (
            f"legacy {quote}🍫{quote} end"
        )
        assert decode(f"{quote * 3}🍫{quote * 4}") == f"🍫{quote}"
        with pytest.raises(ReadableFormatError):
            decode(f"{quote * 3}🍫{quote * 2}")


@pytest.mark.parametrize("offset", [65533, 65534, 65535, 65536])
def test_escaped_unicode_across_chunks(offset: int) -> None:
    prefix = "a" * offset
    for unicode in ["🍫", "%F0%9F%8D%AB"]:
        assert decode(f'(escaped "{prefix}{unicode}%0D")') == f"{prefix}🍫\r"


@pytest.mark.parametrize("payload", ["%F0%9F", "%FF", "%C0%AF", "%ED%A0%80", "%80", "%0", "%GG"])
def test_invalid_escapes_do_not_contaminate_the_next_value(payload: str) -> None:
    with pytest.raises(ReadableFormatError):
        decode(f'(escaped "{payload}")')
    assert decode('(escaped "%F0%9F%8D%AB")') == "🍫"
    assert decode('(escaped "%EF%BB%BFtext%EF%BB%BF")') == "\ufefftext\ufeff"
