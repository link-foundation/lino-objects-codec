"""
Link Notation Objects Codec - Universal serializer/deserializer for Python objects.

This library provides serialization and deserialization of Python objects to/from
Links Notation format, with support for circular references and complex object graphs.
"""

from .codec import ObjectCodec, decode, encode
from .format import (
    escape_reference,
    format_indented,
    parse_indented,
    unescape_reference,
)

__version__ = "0.1.0"
__all__ = [
    "ObjectCodec",
    "encode",
    "decode",
    "escape_reference",
    "unescape_reference",
    "format_indented",
    "parse_indented",
]
