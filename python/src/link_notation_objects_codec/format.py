"""
Formatting utilities for Links Notation.

These utilities provide functions for formatting and parsing indented Links Notation format.
Uses the links-notation library for parsing to ensure compatibility with the standard format.
"""

import re
from typing import Any

from links_notation import Parser, encode_reference_literal

from .debug import trace

# Shared parser instance
_parser = Parser()


# The links-notation reference literal for the empty string. A bare empty
# quote pair at the end of a line can swallow the following lines.
EMPTY_REFERENCE = encode_reference_literal("")

# A bare reference starting with ``~<digits>{`` is a reference literal.
_REFERENCE_LITERAL_PREFIX = re.compile(r"~[0-9]+\{")


def _needs_reference_quoting(s: str) -> bool:
    """Return True when the Parser would not read ``s`` back as a bare reference."""
    return (
        s == ""
        or bool(re.search(r'[\s()\'":`]', s))
        or s.startswith("#")
        or _REFERENCE_LITERAL_PREFIX.match(s) is not None
    )


def _quote_text(s: str, prefer: str = "'") -> str:
    """
    Quote ``s`` so the links-notation Parser reads it back unchanged.

    The empty string becomes the reference literal ``~1{}``. Otherwise ``prefer``
    is used when ``s`` does not contain it, then the other quote. When ``s``
    contains both quotes, the less frequent one is doubled inside, unless ``s``
    starts or ends with it (a leading run of quotes is read as a wider
    delimiter). The fallbacks are a backtick, then a reference literal.
    """
    if s == "":
        return EMPTY_REFERENCE
    other = '"' if prefer == "'" else "'"
    for quote in (prefer, other):
        if quote not in s:
            return f"{quote}{s}{quote}"
    candidates = ('"', "'") if s.count('"') < s.count("'") else ("'", '"')
    for quote in candidates:
        if not s.startswith(quote) and not s.endswith(quote):
            return f"{quote}{s.replace(quote, quote + quote)}{quote}"
    if "`" not in s:
        return f"`{s}`"
    return encode_reference_literal(s)


def escape_reference(value: Any) -> str:
    """
    Escape a reference for Links Notation.

    References need escaping when they are empty, contain spaces, quotes,
    parentheses, colons, or newlines, start with ``#`` (a comment), or start with
    ``~<digits>{`` (a reference literal). The empty string is written as ``~1{}``.

    Args:
        value: The value to escape

    Returns:
        The escaped reference string
    """
    # Numbers and booleans don't need escaping
    if isinstance(value, (int, float, bool)):
        return str(value)

    s = str(value)

    if not _needs_reference_quoting(s):
        return s

    return _quote_text(s)


def unescape_reference(s: str | None) -> str | None:
    """
    Unescape a reference from Links Notation format.

    Reverses the escaping done by escape_reference.

    Args:
        s: The escaped reference string

    Returns:
        The unescaped string
    """
    if s is None:
        return s

    # Unescape doubled quotes
    unescaped = s.replace('""', '"')
    unescaped = unescaped.replace("''", "'")

    return unescaped


def _format_indented_value(value: Any) -> str:
    """
    Format a value for display in indented Links Notation.

    Values are quoted, preferring double quotes, so that the links-notation
    Parser reads them back unchanged (see ``_quote_text``). The empty string is
    written as the reference literal ``~1{}``.

    Args:
        value: The value to format

    Returns:
        Formatted value with appropriate quotes
    """
    if value is None:
        return '"null"'

    return _quote_text(str(value), prefer='"')


def format_indented(
    id: str,  # noqa: A002 - part of the public API since 0.1.0; renaming would break callers
    obj: dict[str, Any],
    indent: str = "  ",
) -> str:
    """
    Format an object in indented Links Notation format.

    This format is designed for human readability, displaying objects as:

        <identifier>
          <key> "<value>"
          <key> "<value>"
          ...

    Example:
        >>> format_indented(
        ...     '6dcf4c1b-ff3f-482c-95ab-711ea7d1b019',
        ...     {'uuid': '6dcf4c1b-ff3f-482c-95ab-711ea7d1b019', 'status': 'executed'}
        ... )
        '6dcf4c1b-ff3f-482c-95ab-711ea7d1b019\\n  uuid \\
"6dcf4c1b-ff3f-482c-95ab-711ea7d1b019"\\n  status "executed"'

    Args:
        id: The object identifier (displayed on first line)
        obj: The object (dict) with key-value pairs to format
        indent: The indentation string (default: 2 spaces)

    Returns:
        Formatted indented Links Notation string

    Raises:
        ValueError: If id is empty or obj is not a dict
    """
    if not id:
        raise ValueError("id is required for format_indented")

    if not isinstance(obj, dict):
        raise ValueError("obj must be a dict for format_indented")

    lines = [id]

    for key, value in obj.items():
        escaped_key = escape_reference(key)
        formatted_value = _format_indented_value(value)
        lines.append(f"{indent}{escaped_key} {formatted_value}")

    return "\n".join(lines)


def parse_indented(text: str) -> tuple[str, dict[str, Any]]:
    """
    Parse an indented Links Notation string back to an object.

    This function uses the links-notation parser for proper parsing,
    supporting the standard Links Notation indented syntax.

    Parses strings like:

        <identifier>
          <key> "<value>"
          <key> "<value>"
          ...

    The format with colon after identifier is also supported (standard lino):

        <identifier>:
          <key> "<value>"

    Args:
        text: The indented Links Notation string to parse

    Returns:
        A tuple of (id, obj) where id is the identifier and obj is the parsed dict

    Raises:
        ValueError: If text is empty or invalid
    """
    if not text:
        raise ValueError("text is required for parse_indented")

    # Skip only the blank lines before the header. The parser understands quoted
    # continuations; filtering the body would delete blank lines inside values.
    remaining = text.lstrip()
    if not remaining:
        raise ValueError("text must have at least one non-empty line (the identifier)")

    # Convert to standard lino format by adding colon after first line if not present
    # This allows the links-notation parser to properly parse the indented structure
    header, _, body = remaining.partition("\n")
    first_line = header.rstrip()
    if not first_line.endswith(":"):
        first_line += ":"
    lino_text = first_line + "\n" + body
    trace("format.parse_indented", lambda: f"preserved {len(lino_text)} input characters")

    # Use links-notation parser
    parsed = _parser.parse(lino_text)

    if not parsed or len(parsed) == 0:
        raise ValueError("Failed to parse indented Links Notation")

    # Extract id and key-value pairs from parsed result
    main_link = parsed[0]
    result_id = main_link.id or ""
    obj: dict[str, Any] = {}

    # Process the values array - each entry is a doublet (key value)
    for child in main_link.values or []:
        if hasattr(child, "values") and child.values and len(child.values) == 2:
            key_ref = child.values[0]
            value_ref = child.values[1]

            # Get key string
            key = key_ref.id or ""

            # Get value string, handling null
            value_str = value_ref.id
            if value_str == "null":
                obj[key] = None
            else:
                obj[key] = value_str

    return result_id, obj
