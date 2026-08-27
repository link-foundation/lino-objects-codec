# lino-objects-codec (Python)

[![Python CI](https://github.com/link-foundation/lino-objects-codec/actions/workflows/python.yml/badge.svg)](https://github.com/link-foundation/lino-objects-codec/actions/workflows/python.yml)
[![PyPI](https://img.shields.io/pypi/v/lino-objects-codec?label=PyPI&logo=pypi&logoColor=white)](https://pypi.org/project/lino-objects-codec/)
[![Python Version](https://img.shields.io/pypi/pyversions/lino-objects-codec.svg)](https://pypi.org/project/lino-objects-codec/)
[![License: Unlicense](https://img.shields.io/badge/license-Unlicense-blue.svg)](https://unlicense.org/)

A Python library to encode/decode objects to/from Links Notation format. This library provides universal serialization and deserialization for Python objects, with built-in support for circular references and complex object graphs.

## Features

- **Readable by Default**: `encode()` writes plain, indented text that can be read and reviewed
- **One Record per Line**: `encode_line()` writes the same document on one line and `decode_line()` reads it back exactly, so an append-only log stays greppable, tailable and countable by `wc -l`
- **Universal Serialization**: Encode Python objects to Links Notation format
- **Type Support**: Handle all common Python types:
  - Basic types: `None`, `bool`, `int`, `float`, `str`
  - Collections: `list`, `dict`
  - Special float values: `NaN`, `Infinity`, `-Infinity`
- **Object Identity**: Shared references and circular references are preserved by the compact format via object ids
- **Full Unicode**: Strings are always written as text — a newline stays a newline and a tab stays a tab, so every word stays greppable; only the characters a form cannot carry are percent-escaped, in a value marked individually as `(escaped "…")`
- **Opt-in Tracing**: Set `LINO_CODEC_DEBUG=1` to trace encoding and decoding, the same way in every language
- **Simple API**: Easy-to-use `encode()` and `decode()` functions

## Installation

```bash
pip install lino-objects-codec
```

## Quick Start

```python
from link_notation_objects_codec import encode, decode

# Encode basic types
encoded = encode({"name": "Alice", "age": 30, "active": True})
print(encoded)
# Output:
# (
#   name "Alice"
#   age 30
#   active true
# )

# Decode back to Python object
decoded = decode(encoded)
print(decoded)
# Output: {'name': 'Alice', 'age': 30, 'active': True}

# Roundtrip preserves data
assert decoded == {"name": "Alice", "age": 30, "active": True}
```

## Usage Examples

### Basic Types

```python
from link_notation_objects_codec import encode, decode

# None
assert decode(encode(None)) is None

# Booleans
assert decode(encode(True)) is True
assert decode(encode(False)) is False

# Integers
assert decode(encode(42)) == 42
assert decode(encode(-123)) == -123

# Floats
assert decode(encode(3.14)) == 3.14
assert decode(encode(float('inf'))) == float('inf')
assert decode(encode(float('nan')))  # NaN != NaN, but both are NaN

# Strings (with full Unicode support)
assert decode(encode("hello")) == "hello"
assert decode(encode("你好世界 🌍")) == "你好世界 🌍"
assert decode(encode("multi\nline\nstring")) == "multi\nline\nstring"
```

### Collections

```python
from link_notation_objects_codec import encode, decode

# Lists
data = [1, 2, 3, "hello", True, None]
assert decode(encode(data)) == data

# Nested lists
nested = [[1, 2], [3, 4], [5, [6, 7]]]
assert decode(encode(nested)) == nested

# Dictionaries
person = {
    "name": "Bob",
    "age": 25,
    "email": "bob@example.com"
}
assert decode(encode(person)) == person

# Complex nested structures
complex_data = {
    "users": [
        {"id": 1, "name": "Alice"},
        {"id": 2, "name": "Bob"}
    ],
    "metadata": {
        "version": 1,
        "count": 2
    }
}
assert decode(encode(complex_data)) == complex_data
```

## Output Formats

| Function | Output |
| --- | --- |
| `encode(obj)` | Readable, indented Links Notation (the default) |
| `encode(obj, indent="\t")` | Same, with a custom indentation string |
| `encode_line(obj)` | The same readable document on one line, for append-only logs |
| `encode_compact(obj)` | The previous single-line, base64 form |
| `encode_obfuscated(obj)` | Alias of `encode_compact` |

`decode()` accepts every one of them, so files written by older versions keep
working and are rewritten in the readable form the next time they are saved.

### Circular References

Object identity -- shared nodes and cycles -- is a property of the **compact**
format, which names shared nodes with `obj_N` ids. The readable format is a plain
tree with nowhere to put those ids, so `encode()` raises `CircularReferenceError`
on a cycle. Use `encode_compact()` when you need identity preserved:

```python
from link_notation_objects_codec import (
    CircularReferenceError,
    decode,
    encode,
    encode_compact,
)

# Self-referencing list -- preserved by the compact format
lst = [1, 2, 3]
lst.append(lst)  # Circular reference
decoded = decode(encode_compact(lst))
assert decoded[3] is decoded  # Reference preserved

# Shared references -- the same object is restored once
shared = {"shared": "data"}
container = {"first": shared, "second": shared}
decoded = decode(encode_compact(container))
assert decoded["first"] is decoded["second"]

# The readable format rejects a cycle rather than losing the identity
try:
    encode(lst)
except CircularReferenceError as error:
    print(error)  # Cannot write a circular reference in the readable format; use encode_compact
```

## How It Works

The library uses the [links-notation](https://github.com/link-foundation/links-notation) format as the serialization target.

### Readable format (the default)

One `( )` construct carries both objects and arrays, at every level including
the root. Lines of the form `key value` make a dict, bare-value lines make a
list:

```lino
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
```

- Strings are double-quoted and written as text: `name "Alice"`
- Numbers, `true`, `false` and `null` are bare, so types survive a round trip
- `NaN`, `Infinity` and `-Infinity` are written as such
- An empty list is `()`; an empty dict is `(` + newline + `)`
- A string is written as text whatever it holds: a newline stays a newline and
  a tab stays a tab, so every word stays greppable
- A string containing the quote delimiter is written between a run of at least
  three of them — `"""say "hi""""` — rather than by doubling the quote
- Only the characters this form cannot carry — a carriage return and the
  remaining control characters — are percent-escaped, in a value marked on its
  own as `(escaped "first%0D")`; everything around it stays readable, and
  `(base64 "…")` written by earlier versions is still decoded
- A value that occurs more than once is written out every time: a shared
  reference would make one record depend on another

### Single-line format (`encode_line`)

The same readable document on one line, so an append-only log holds one record
per line — appending is one write, compaction cuts at a newline, and `grep`,
`tail -f` and `wc -l` all treat a line as one event:

```lino
(o: (bytes 2827) (complete true) (server (o: (host "127.0.0.1") (port 18878))))
```

- A dict is `(o: (key value) …)` and an empty dict is `(o:)`
- A list is `(value …)` and an empty list is `()`
- Scalars and strings are written exactly as in the indented form
- The `o` marker removes the ambiguity a flat layout otherwise has: a bare `( )`
  on one line is always a list, so a *hand-written* `(a 1)` is the two-element
  list, not the one-pair dict
- `decode()` reads this form too; `decode_line()` is its exact inverse and
  rejects input spanning more than one line

### Compact format (`encode_compact`)

The previous single-line form, kept for compatibility and for the object graphs
the readable tree cannot express (shared and circular references):

- Basic types carry a type marker: `(int 42)`, `(str aGVsbG8=)`, `(bool true)`
- Strings are base64-encoded here, and only here: this is the one form that
  asks for it by name, and `encode()` never reaches for it
- Shared / cyclic collections are defined inline with a self-reference id, e.g.
  `(obj_0: list (int 1) (int 2) ...)`; a self-referencing dict `{"self": obj}`
  encodes as `(obj_0: dict ((str c2VsZg==) obj_0))`. See
  [issue #27](https://github.com/link-foundation/lino-objects-codec/issues/27)
  for the rationale.

`decode()` detects which of the two forms it is given, so previously written
files keep decoding.

## Debugging

Tracing is off by default. Turn it on to see what the codec does, either from
the environment or from code:

```bash
LINO_CODEC_DEBUG=1 python your_script.py   # 1, true, yes or on
```

```python
from link_notation_objects_codec import set_debug_enabled

set_debug_enabled(True)   # force on
set_debug_enabled(None)   # follow LINO_CODEC_DEBUG again
```

Trace lines are written to standard error, prefixed with `[lino-codec]`. The
same switch and the same `LINO_CODEC_DEBUG` variable exist in the JavaScript,
Rust and C# implementations.

## API Reference

### `encode(obj: Any) -> str`

Encode a Python object to Links Notation format.

**Parameters:**
- `obj`: The Python object to encode

**Returns:**
- String representation in Links Notation format

**Raises:**
- `TypeError`: If the object type is not supported

### `decode(notation: str) -> Any`

Decode Links Notation format to a Python object.

**Parameters:**
- `notation`: String in Links Notation format

**Returns:**
- Reconstructed Python object

### `encode_line(obj: Any) -> str`

Encode a Python object into the readable format on one line.

**Parameters:**
- `obj`: The Python object to encode

**Returns:**
- String representation in readable Links Notation format, holding no newline

```python
>>> from link_notation_objects_codec import encode_line
>>> encode_line({"age": 30})
'(o: (age 30))'
```

### `decode_line(notation: str) -> Any`

Decode one line of a readable Links Notation log. The exact inverse of
`encode_line()`.

**Parameters:**
- `notation`: One line written by `encode_line()`

**Returns:**
- Reconstructed Python object

**Raises:**
- `ReadableFormatError`: If the input spans more than one line or is malformed

### `ObjectCodec`

The main codec class that performs encoding and decoding. The module-level `encode()` and `decode()` functions use a shared instance of this class.

If you need isolated encoding contexts (for example, in multi-threaded environments), you can create your own codec instances:

```python
from link_notation_objects_codec import ObjectCodec

codec = ObjectCodec()
encoded = codec.encode({"data": [1, 2, 3]})
decoded = codec.decode(encoded)
```

## Development

### Setup

```bash
# Clone the repository
git clone https://github.com/link-foundation/lino-objects-codec.git
cd lino-objects-codec/python

# Create virtual environment
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install in development mode
pip install -e ".[dev]"
```

### Running Tests

```bash
# Run all tests
pytest tests/ -v

# Run with coverage
pytest tests/ --cov=link_notation_objects_codec --cov-report=term-missing

# Run specific test file
pytest tests/test_basic_types.py -v
```

### Code Quality

```bash
# Linting with ruff
ruff check src/ tests/

# Type checking with mypy
mypy src/
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Add tests for your changes
4. Ensure all tests pass (`pytest tests/`)
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## License

This project is licensed under the Unlicense - see the [LICENSE](../LICENSE) file for details.

## Links

- [GitHub Repository](https://github.com/link-foundation/lino-objects-codec)
- [Links Notation Specification](https://github.com/link-foundation/links-notation)
- [PyPI Package](https://pypi.org/project/lino-objects-codec/)
- [JavaScript Implementation](../js/)

## Acknowledgments

This project is built on top of the [links-notation](https://github.com/link-foundation/links-notation) library.
