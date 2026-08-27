"""Readable, indented Links Notation representation.

This module implements the default output of :func:`link_notation_objects_codec.encode`:
a plain-text, indented projection where keys and values are written as they are,
so the document can be read, grepped and reviewed without decoding anything.

Shape
-----

One construct -- ``( )`` -- is used for both objects and arrays, at every level
including the root. What distinguishes them is the content of the lines:
``key value`` pairs make a dict, bare values make a list::

    (
      type "RouterState"
      server (
        host "127.0.0.1"
        port 18878
      )
      models (
        "claude-haiku"
        "claude-opus"
      )
    )

Value mapping
-------------

============================== ==========================================
Python value                   Readable form
============================== ==========================================
``dict``                       ``( )`` with one ``key value`` pair per line
``list`` / ``tuple``           ``( )`` with one value per line
``str``                        quoted, never encoded
``int`` / ``float`` / ``bool`` / ``None``  bare, so the type survives the round trip
============================== ==========================================

Empty containers keep their type: an empty list is ``()`` on one line, while an
empty dict is written as ``(`` and ``)`` on two lines.

Only values that cannot be written as plain text are encoded: strings holding
control characters (including newlines and tabs, which line-based tooling and
CRLF normalisation would corrupt) are marked individually as ``(base64 "...")``
instead of encoding the whole document.

Single-line form
----------------

:func:`encode_line` writes the same document on one line, so one record is one
line and an append-only log stays greppable, tailable and countable by ``wc -l``.
Rows can no longer be told apart by line breaks there, so a dict names itself
with the ``o`` link id the notation already has, and its pairs are written as
their own links::

    (o: (type "RouterState") (server (o: (host "127.0.0.1") (port 18878))))

================== ===============================
Value              Single-line form
================== ===============================
``dict``           ``(o: (key value) ...)``
empty ``dict``     ``(o:)``
``list``           ``(value ...)``
empty ``list``     ``()``
scalars            exactly as in the indented form
================== ===============================

The marker is what answers the ambiguity a flat layout otherwise has: without it
``((key value))`` reads both as the one-pair dict and as the list holding the
two-element list, and an empty key makes it worse. With it, a bare ``( )`` is
always a list and a marked one is always a dict, so every value -- empty key
included -- survives the round trip. Consequently a *hand-written* one-line link
such as ``(a 1)`` is the two-element list, not the one-pair dict: on one line,
dicts say so.
"""

import base64
import math
import re
import unicodedata
from collections.abc import Iterator, Sequence
from contextlib import contextmanager
from typing import Any

from .debug import trace

#: Default indentation used by :func:`encode`.
DEFAULT_INDENT = "  "

#: Marker used for values that cannot be represented as plain text.
BASE64_MARKER = "base64"

#: Link id naming a dict in the single-line form, written as ``(o: ...)``.
OBJECT_MARKER = "o"

#: Quote characters that open a quoted reference.
_QUOTE_CHARS = ("'", '"', "`")

#: Characters that force an object key to be quoted.
_KEY_NEEDS_QUOTES = re.compile(r"[\s()':`\"]")

_INTEGER_PATTERN = re.compile(r"^[+-]?\d+$")
_FLOAT_PATTERN = re.compile(r"^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$")


class ReadableFormatError(ValueError):
    """Raised when a readable document cannot be parsed."""


class CircularReferenceError(ValueError):
    """Raised when a value cannot be written because it refers back to itself.

    The readable form writes a plain tree and has no place to put the ``obj_N``
    definition ids that name a shared node, so a cycle cannot be represented.
    :func:`link_notation_objects_codec.encode_compact` handles cycles.
    """


def encode(value: Any, indent: str = DEFAULT_INDENT) -> str:
    """Encode a value into the readable, indented Links Notation form.

    Args:
        value: The value to encode.
        indent: Indentation string used per nesting level.

    Returns:
        The readable Links Notation document.

    Raises:
        CircularReferenceError: If the value refers back to itself.
        TypeError: If the value holds a type this format cannot write.
    """
    out: list[str] = []
    _write_value(value, indent, 0, out, set())
    return "".join(out)


def encode_line(value: Any) -> str:
    """Encode a value into the readable, single-line Links Notation form.

    The result never contains a newline, so one value is one line of an
    append-only log. See the module documentation for the shape.

    Args:
        value: The value to encode.

    Returns:
        The readable Links Notation document, on one line.

    Raises:
        CircularReferenceError: If the value refers back to itself.
        TypeError: If the value holds a type this format cannot write.
    """
    out: list[str] = []
    _write_line_value(value, out, set())
    return "".join(out)


def decode_line(text: str) -> Any:
    """Decode the readable, single-line Links Notation form back into a value.

    This is the exact inverse of :func:`encode_line`. Input spanning more than
    one line is rejected: a line-based reader hands over one record at a time,
    and silently accepting several would merge two records into one value.

    Args:
        text: One line of a readable Links Notation document.

    Returns:
        The reconstructed value.

    Raises:
        ReadableFormatError: If the input holds more than one line.
    """
    line = text.strip("\n\r")
    if "\n" in line or "\r" in line:
        raise ReadableFormatError("a single-line document cannot contain a line break")
    return decode(line)


def decode(text: str) -> Any:
    """Decode the readable, indented Links Notation form back into a value.

    Args:
        text: The readable Links Notation document.

    Returns:
        The reconstructed value.

    Raises:
        ReadableFormatError: If the document is not well formed.
    """
    tokens = _tokenize(text)
    trace("readable.decode", lambda: f"{len(tokens)} tokens")
    cursor = _Cursor(tokens)
    rows = cursor.parse_rows(top_level=True)

    if cursor.pos < len(tokens):
        raise ReadableFormatError("unexpected ')' in readable notation")

    # A document holding a single value (for example ``42``) is that value.
    if len(rows) == 1 and len(rows[0]) == 1:
        return _node_to_value(rows[0][0])

    return _rows_to_value(rows, multiline=True, object_marker=False)


# === Encoding ===


def _write_value(value: Any, indent: str, level: int, out: list[str], path: set[int]) -> None:
    if isinstance(value, dict):
        with _on_path(value, path):
            items = list(value.items())
            if not items:
                # An empty dict spans two lines; ``()`` on one line is an empty list.
                out.append("(\n")
                _push_indent(indent, level, out)
                out.append(")")
                return

            def write_pair(pair: tuple[Any, Any]) -> None:
                key, child = pair
                out.append(_format_key(key))
                out.append(" ")
                _write_value(child, indent, level + 1, out, path)

            _write_rows(items, indent, level, out, write_pair)
        return

    if isinstance(value, (list, tuple, set, frozenset)):
        with _on_path(value, path):
            items_seq: Sequence[Any] = list(value)

            def write_item(item: Any) -> None:
                _write_value(item, indent, level + 1, out, path)

            _write_rows(items_seq, indent, level, out, write_item)
        return

    out.append(_format_scalar(value))


def _write_line_value(value: Any, out: list[str], path: set[int]) -> None:
    """Write a value on one line.

    Dicts name themselves with the ``o`` link id and write each pair as its own
    link, so nothing depends on where lines break.
    """
    if isinstance(value, dict):
        with _on_path(value, path):
            items = list(value.items())
            if not items:
                # ``()`` is the empty list, so the empty dict keeps its marker.
                out.append(f"({OBJECT_MARKER}:)")
                return

            out.append(f"({OBJECT_MARKER}:")
            for key, child in items:
                out.append(f" ({_format_key(key)} ")
                _write_line_value(child, out, path)
                out.append(")")
            out.append(")")
        return

    if isinstance(value, (list, tuple, set, frozenset)):
        with _on_path(value, path):
            out.append("(")
            for index, item in enumerate(value):
                if index:
                    out.append(" ")
                _write_line_value(item, out, path)
            out.append(")")
        return

    out.append(_format_scalar(value))


@contextmanager
def _on_path(value: Any, path: set[int]) -> Iterator[None]:
    """Mark a container as being written, so a reference back to it is caught.

    Only the containers on the way down are tracked: the same object appearing
    twice side by side is written twice, which reads back as two equal values.
    """
    marker = id(value)
    if marker in path:
        raise CircularReferenceError(
            "Cannot write a circular reference in the readable format; "
            "use encode_compact, which names shared nodes with obj_N ids"
        )
    path.add(marker)
    try:
        yield
    finally:
        path.discard(marker)


def _write_rows(
    items: Sequence[Any], indent: str, level: int, out: list[str], write_item: Any
) -> None:
    """Write a container as ``(``, one indented line per item, then ``)``.

    An empty container collapses to ``()``, which reads back as an empty list.
    """
    if not items:
        out.append("()")
        return

    out.append("(")
    for item in items:
        out.append("\n")
        _push_indent(indent, level + 1, out)
        write_item(item)
    out.append("\n")
    _push_indent(indent, level, out)
    out.append(")")


def _push_indent(indent: str, level: int, out: list[str]) -> None:
    for _ in range(level):
        out.append(indent)


def _format_scalar(value: Any) -> str:
    """Format a scalar value.

    Strings are quoted, everything else stays bare so that its type is
    recoverable when reading the document back.
    """
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        return _format_float(value)
    if isinstance(value, str):
        return _format_string(value)
    if isinstance(value, (bytes, bytearray)):
        return f"({BASE64_MARKER} {_quote(base64.b64encode(bytes(value)).decode('ascii'))})"
    raise TypeError(f"Unsupported type: {type(value).__name__}")


def _format_float(value: float) -> str:
    if math.isnan(value):
        return "NaN"
    if math.isinf(value):
        return "Infinity" if value > 0 else "-Infinity"
    # ``repr`` keeps the decimal point for whole floats (``1.0``), which is what
    # tells a float apart from an int when reading the document back.
    return repr(value)


def _format_string(value: str) -> str:
    """Format a string: quoted plain text, or an individually marked payload."""
    if _needs_encoding(value):
        payload = base64.b64encode(value.encode("utf-8")).decode("ascii")
        return f"({BASE64_MARKER} {_quote(payload)})"
    return _quote(value)


def _needs_encoding(value: str) -> bool:
    """Whether a string has to be encoded rather than written as text.

    A value can be written as text unless it contains control characters:
    newlines break the line structure and CRLF normalisation would rewrite them.
    """
    return any(unicodedata.category(char) == "Cc" for char in value)


def _quote(value: str) -> str:
    if '"' not in value:
        return f'"{value}"'
    if "'" not in value:
        return f"'{value}'"
    # Both quote styles are present: double the double quotes, as the parser expects.
    return '"' + value.replace('"', '""') + '"'


def _format_key(key: Any) -> str:
    """Format an object key. Keys are bare when they read as plain identifiers.

    The readable form has string keys, like JSON: a non-string key is written as
    the text it formats to, and reads back as that text.
    """
    if isinstance(key, str):
        text = key
    elif key is None or isinstance(key, (bool, int, float)):
        text = _format_scalar(key)
    else:
        raise TypeError(f"Unsupported key type: {type(key).__name__}")

    plain = (
        bool(text)
        and text != BASE64_MARKER
        and not _needs_encoding(text)
        and not _KEY_NEEDS_QUOTES.search(text)
    )
    return text if plain else _format_string(text)


# === Decoding ===

_TOKEN_OPEN = "open"
_TOKEN_CLOSE = "close"
_TOKEN_NEWLINE = "newline"
_TOKEN_REF = "ref"


class _Token:
    """One token of a readable document."""

    __slots__ = ("kind", "value", "quoted")

    def __init__(self, kind: str, value: str = "", quoted: bool = False) -> None:
        self.kind = kind
        self.value = value
        self.quoted = quoted


class _Node:
    """A parsed element: a reference (remembering whether it was quoted, which is
    what distinguishes a string from a number) or a link."""

    __slots__ = ("is_ref", "value", "quoted", "rows", "multiline", "is_object")

    def __init__(
        self,
        is_ref: bool,
        value: str = "",
        quoted: bool = False,
        rows: list[list["_Node"]] | None = None,
        multiline: bool = False,
        is_object: bool = False,
    ) -> None:
        self.is_ref = is_ref
        self.value = value
        self.quoted = quoted
        self.rows = rows if rows is not None else []
        self.multiline = multiline
        self.is_object = is_object


def _tokenize(text: str) -> list[_Token]:
    """Split a document into parentheses, newlines and references."""
    tokens: list[_Token] = []
    i = 0
    length = len(text)

    while i < length:
        char = text[i]

        if char == "\n":
            tokens.append(_Token(_TOKEN_NEWLINE))
            i += 1
        elif char.isspace():
            i += 1
        elif char == "(":
            tokens.append(_Token(_TOKEN_OPEN))
            i += 1
        elif char == ")":
            tokens.append(_Token(_TOKEN_CLOSE))
            i += 1
        elif char in _QUOTE_CHARS:
            value, i = _read_quoted(text, i, char)
            tokens.append(_Token(_TOKEN_REF, value, quoted=True))
        else:
            start = i
            while (
                i < length
                and not text[i].isspace()
                and text[i] not in "()"
                and text[i] not in _QUOTE_CHARS
            ):
                i += 1
            tokens.append(_Token(_TOKEN_REF, text[start:i], quoted=False))

    return tokens


def _read_quoted(text: str, start: int, quote_char: str) -> tuple[str, int]:
    """Read a quoted reference, where a doubled quote character means a literal one."""
    parts: list[str] = []
    i = start + 1
    length = len(text)

    while i < length:
        if text[i] == quote_char:
            if i + 1 < length and text[i + 1] == quote_char:
                parts.append(quote_char)
                i += 2
                continue
            return "".join(parts), i + 1
        parts.append(text[i])
        i += 1

    raise ReadableFormatError(f"unterminated quoted value starting at character {start}")


class _Cursor:
    """Cursor over the token stream, turning tokens into nodes and rows."""

    def __init__(self, tokens: list[_Token]) -> None:
        self.tokens = tokens
        self.pos = 0

    def parse_rows(self, top_level: bool) -> list[list[_Node]]:
        """Parse rows until the matching ``)`` (or the end of input at the top level).

        A row is one line: the values written between two newlines.
        """
        rows: list[list[_Node]] = []
        row: list[_Node] = []

        while self.pos < len(self.tokens):
            token = self.tokens[self.pos]

            if token.kind == _TOKEN_CLOSE:
                if top_level:
                    break
                self.pos += 1
                if row:
                    rows.append(row)
                return rows

            if token.kind == _TOKEN_NEWLINE:
                self.pos += 1
                if row:
                    rows.append(row)
                    row = []
                continue

            row.append(self.parse_node())

        if not top_level:
            raise ReadableFormatError("unterminated '(' in readable notation")

        if row:
            rows.append(row)
        return rows

    def parse_node(self) -> _Node:
        """Parse a single node: a reference or a parenthesised link."""
        token = self.tokens[self.pos]

        if token.kind == _TOKEN_REF:
            self.pos += 1
            return _Node(True, token.value, token.quoted)

        if token.kind == _TOKEN_OPEN:
            self.pos += 1
            is_object = self._take_object_marker()
            multiline = self._link_is_multiline()
            rows = self.parse_rows(top_level=False)
            return _Node(False, rows=rows, multiline=multiline, is_object=is_object)

        raise ReadableFormatError("unexpected token in readable notation")

    def _take_object_marker(self) -> bool:
        """Consume the ``o:`` marker if the link that just opened carries one,
        which is how the single-line form says "this link is a dict, not a list"."""
        if self.pos >= len(self.tokens):
            return False
        token = self.tokens[self.pos]
        is_marker = (
            token.kind == _TOKEN_REF and not token.quoted and token.value == f"{OBJECT_MARKER}:"
        )
        if is_marker:
            self.pos += 1
        return is_marker

    def _link_is_multiline(self) -> bool:
        """Whether the link that just opened spans more than one line, which is
        what tells an empty dict (``(\\n)``) from an empty list (``()``)."""
        for token in self.tokens[self.pos :]:
            if token.kind == _TOKEN_CLOSE:
                return False
            if token.kind == _TOKEN_NEWLINE:
                return True
        return False


def _node_to_value(node: _Node) -> Any:
    if node.is_ref:
        return _ref_to_value(node.value, node.quoted)
    return _rows_to_value(node.rows, node.multiline, node.is_object)


def _rows_to_value(rows: list[list[_Node]], multiline: bool, object_marker: bool) -> Any:
    if object_marker:
        return _marked_object_to_value(rows)

    if not rows:
        return {} if multiline else []

    marked = _decode_marked_value(rows)
    if marked is not None:
        return marked[0]

    # Written on one line, a link is a list of values: a dict on one line says so
    # with the ``o:`` marker, which is what keeps ``(key value)`` unambiguous.
    if not multiline:
        return [_node_to_value(node) for row in rows for node in row]

    # ``key value`` on every line makes a dict; anything else is a list of values.
    is_dict = all(len(row) == 2 and row[0].is_ref for row in rows)

    if is_dict:
        result: dict[str, Any] = {}
        for row in rows:
            result[row[0].value] = _node_to_value(row[1])
        return result

    items: list[Any] = []
    for row in rows:
        for node in row:
            items.append(_node_to_value(node))
    return items


def _marked_object_to_value(rows: list[list[_Node]]) -> dict[str, Any]:
    """Build the dict a ``(o: (key value) ...)`` link describes.

    Every value in it is a pair, so anything else is a malformed document rather
    than a silent list.
    """
    result: dict[str, Any] = {}

    for node in (node for row in rows for node in row):
        if node.is_ref or node.is_object:
            raise ReadableFormatError(
                f"an object marked '{OBJECT_MARKER}:' holds (key value) pairs, "
                "found a value that is not a pair"
            )
        if len(node.rows) != 1:
            raise ReadableFormatError(
                f"an object marked '{OBJECT_MARKER}:' holds (key value) pairs, "
                f"found a link of {len(node.rows)} lines"
            )
        row = node.rows[0]
        if len(row) != 2 or not row[0].is_ref:
            raise ReadableFormatError(
                f"an object marked '{OBJECT_MARKER}:' holds (key value) pairs, "
                f"found a link of {len(row)} values"
            )
        result[row[0].value] = _node_to_value(row[1])

    return result


def _decode_marked_value(rows: list[list[_Node]]) -> tuple[str] | None:
    """Recognise ``(base64 "...")``, the individual marker for values that could
    not be written as text.

    A quoted ``base64`` key is an ordinary dict key, not a marker. The result is
    wrapped in a tuple so that an empty string is still distinguishable from
    "not a marker".
    """
    if len(rows) != 1 or len(rows[0]) != 2:
        return None

    marker, payload = rows[0]
    if not marker.is_ref or marker.quoted or marker.value != BASE64_MARKER:
        return None
    if not payload.is_ref or not payload.quoted:
        return None

    try:
        decoded = base64.b64decode(payload.value, validate=True).decode("utf-8")
    except Exception as error:  # noqa: BLE001 - reported as a format error
        raise ReadableFormatError(f"invalid base64 value: {error}") from error
    return (decoded,)


def _ref_to_value(value: str, quoted: bool) -> None | bool | int | float | str:
    """Convert a reference to a value.

    Quoted references are always strings; bare references keep the type they were
    written with.
    """
    if quoted:
        return value

    if value == "null":
        return None
    if value == "true":
        return True
    if value == "false":
        return False
    if value == "NaN":
        return math.nan
    if value == "Infinity":
        return math.inf
    if value == "-Infinity":
        return -math.inf

    if _INTEGER_PATTERN.match(value):
        return int(value)
    if _FLOAT_PATTERN.match(value):
        return float(value)

    return value
