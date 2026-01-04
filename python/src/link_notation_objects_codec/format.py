"""
Formatting utilities for Links Notation.

These utilities provide functions for formatting and parsing indented Links Notation format.
"""

import re
from typing import Any, Dict, Optional, Tuple


def escape_reference(value: Any) -> str:
    """
    Escape a reference for Links Notation.

    References need escaping when they contain spaces, quotes, parentheses, colons, or newlines.

    Args:
        value: The value to escape

    Returns:
        The escaped reference string
    """
    # Numbers and booleans don't need escaping
    if isinstance(value, (int, float, bool)):
        return str(value)

    s = str(value)

    # Check if escaping is needed
    needs_escaping = bool(re.search(r'[\s()\'":]', s)) or "\n" in s

    if not needs_escaping:
        return s

    # If contains single quotes but not double quotes, use double quotes
    if "'" in s and '"' not in s:
        return f'"{s}"'

    # If contains double quotes but not single quotes, use single quotes
    if '"' in s and "'" not in s:
        return f"'{s}'"

    # If contains both quotes, count which one appears more
    if "'" in s and '"' in s:
        single_count = s.count("'")
        double_count = s.count('"')

        if double_count < single_count:
            # Use double quotes, escape internal double quotes by doubling
            return f'"{s.replace(chr(34), chr(34) + chr(34))}"'
        else:
            # Use single quotes, escape internal single quotes by doubling
            return f"'{s.replace(chr(39), chr(39) + chr(39))}'"

    # Just spaces or other special characters, use single quotes by default
    return f"'{s}'"


def unescape_reference(s: Optional[str]) -> Optional[str]:
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
    Values are always wrapped in double quotes.

    Args:
        value: The value to format

    Returns:
        Formatted value with double quotes
    """
    if value is None:
        return '"null"'

    s = str(value)

    # Escape internal double quotes by doubling them
    escaped = s.replace('"', '""')

    return f'"{escaped}"'


def format_indented(
    id: str,
    obj: Dict[str, Any],
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
        '6dcf4c1b-ff3f-482c-95ab-711ea7d1b019\\n  uuid "6dcf4c1b-ff3f-482c-95ab-711ea7d1b019"\\n  status "executed"'

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


def parse_indented(text: str) -> Tuple[str, Dict[str, Any]]:
    """
    Parse an indented Links Notation string back to an object.

    This is the inverse of format_indented. It parses strings like:

        <identifier>
          <key> "<value>"
          <key> "<value>"
          ...

    Args:
        text: The indented Links Notation string to parse

    Returns:
        A tuple of (id, obj) where id is the identifier and obj is the parsed dict

    Raises:
        ValueError: If text is empty or invalid
    """
    if not text:
        raise ValueError("text is required for parse_indented")

    lines = text.split("\n")
    if len(lines) == 0:
        raise ValueError("text must have at least one line (the identifier)")

    id = lines[0].strip()
    obj: Dict[str, Any] = {}

    for i in range(1, len(lines)):
        line = lines[i]

        # Skip empty lines
        if not line.strip():
            continue

        # Remove leading whitespace
        trimmed = line.lstrip()

        # Find the first space that separates key from value
        space_index = trimmed.find(" ")
        if space_index == -1:
            continue  # No value, skip this line

        key = trimmed[:space_index]
        value = trimmed[space_index + 1 :]

        # Unescape key (remove quotes if present)
        if (key.startswith("'") and key.endswith("'")) or (
            key.startswith('"') and key.endswith('"')
        ):
            key = key[1:-1]
        unescaped_key = unescape_reference(key)

        # Parse value (remove surrounding quotes and unescape doubled quotes)
        if value.startswith('"') and value.endswith('"'):
            value = value[1:-1]
            value = value.replace('""', '"')
        elif value.startswith("'") and value.endswith("'"):
            value = value[1:-1]
            value = value.replace("''", "'")

        # Handle null value
        if value == "null":
            obj[unescaped_key] = None
        else:
            obj[unescaped_key] = value

    return id, obj
