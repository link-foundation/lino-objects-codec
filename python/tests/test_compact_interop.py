"""The compact format must be readable across languages.

Booleans used to be written differently per language: JavaScript and Rust
wrote ``(bool true)`` while Python and C# wrote ``(bool True)``, and each
decoder only understood its own spelling, so a document written by one
language decoded to the wrong value in another. Every language now writes the
lowercase form and reads either spelling.
"""

from link_notation_objects_codec import decode_compact, encode_compact


def test_booleans_are_written_lowercase() -> None:
    assert encode_compact(True) == "(bool true)"
    assert encode_compact(False) == "(bool false)"


def test_lowercase_booleans_decode() -> None:
    assert decode_compact("(bool true)") is True
    assert decode_compact("(bool false)") is False


def test_capitalized_booleans_from_older_documents_still_decode() -> None:
    assert decode_compact("(bool True)") is True
    assert decode_compact("(bool False)") is False
