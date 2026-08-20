"""
Link Notation Objects Codec - Universal serializer/deserializer for Python objects.

This library provides serialization and deserialization of Python objects to/from
Links Notation format, with support for circular references and complex object graphs.

:func:`encode` writes the readable, indented format by default; :func:`decode`
reads both that and the compact (base64) format written by earlier versions.
"""

from importlib.metadata import PackageNotFoundError
from importlib.metadata import version as _installed_version

from .codec import (
    ObjectCodec,
    decode,
    decode_compact,
    encode,
    encode_compact,
    encode_obfuscated,
    is_compact_notation,
)
from .debug import DEBUG_ENV_VAR, is_debug_enabled, set_debug_enabled
from .format import (
    escape_reference,
    format_indented,
    parse_indented,
    unescape_reference,
)
from .readable import (
    BASE64_MARKER,
    DEFAULT_INDENT,
    CircularReferenceError,
    ReadableFormatError,
)

try:
    #: Read from the installed distribution, so this never drifts from
    #: ``pyproject.toml`` -- the release pipeline bumps the version in one place.
    __version__ = _installed_version("lino-objects-codec")
except PackageNotFoundError:  # pragma: no cover - only when run from a source tree
    __version__ = "0.0.0+unknown"
__all__ = [
    "ObjectCodec",
    "encode",
    "encode_compact",
    "encode_obfuscated",
    "decode",
    "decode_compact",
    "is_compact_notation",
    "escape_reference",
    "unescape_reference",
    "format_indented",
    "parse_indented",
    "DEFAULT_INDENT",
    "BASE64_MARKER",
    "ReadableFormatError",
    "CircularReferenceError",
    "DEBUG_ENV_VAR",
    "is_debug_enabled",
    "set_debug_enabled",
]
