# lino-objects-codec

[![JS CI](https://github.com/link-foundation/lino-objects-codec/actions/workflows/js.yml/badge.svg)](https://github.com/link-foundation/lino-objects-codec/actions/workflows/js.yml)
[![Python CI](https://github.com/link-foundation/lino-objects-codec/actions/workflows/python.yml/badge.svg)](https://github.com/link-foundation/lino-objects-codec/actions/workflows/python.yml)
[![Rust CI](https://github.com/link-foundation/lino-objects-codec/actions/workflows/rust.yml/badge.svg)](https://github.com/link-foundation/lino-objects-codec/actions/workflows/rust.yml)
[![C# CI](https://github.com/link-foundation/lino-objects-codec/actions/workflows/csharp.yml/badge.svg)](https://github.com/link-foundation/lino-objects-codec/actions/workflows/csharp.yml)

### Package versions

[![npm](https://img.shields.io/npm/v/lino-objects-codec?label=npm&logo=npm)](https://www.npmjs.com/package/lino-objects-codec)
[![PyPI](https://img.shields.io/pypi/v/lino-objects-codec?label=PyPI&logo=pypi&logoColor=white)](https://pypi.org/project/lino-objects-codec/)
[![crates.io](https://img.shields.io/crates/v/lino-objects-codec?label=crates.io&logo=rust)](https://crates.io/crates/lino-objects-codec)
[![NuGet](https://img.shields.io/nuget/v/Lino.Objects.Codec?label=NuGet&logo=nuget)](https://www.nuget.org/packages/Lino.Objects.Codec)
[![Python Version](https://img.shields.io/pypi/pyversions/lino-objects-codec.svg)](https://pypi.org/project/lino-objects-codec/)

> A "no badge / not found" state on any of the registry badges above means the corresponding
> package has not been published yet for that version. The badges read live from the package
> registries, so they always reflect the latest published state.

Universal serialization library to encode/decode objects to/from Links Notation format. Available in **Python**, **JavaScript**, **Rust**, and **C#** with identical functionality and API design.

## 🌍 Multi-Language Support

This library provides universal serialization and deserialization with built-in support for circular references and complex object graphs in:

- **[Python](python/)** - Full implementation for Python 3.8+
- **[JavaScript](js/)** - Full implementation for Node.js 18+
- **[Rust](rust/)** - Full implementation for Rust 1.70+
- **[C#](csharp/)** - Full implementation for .NET 8.0+

All implementations share the same design philosophy and provide feature parity.

## Features

- **Universal Serialization**: Encode objects to Links Notation format
- **Type Support**: Handle all common types in each language:
  - **Python**: `None`, `bool`, `int`, `float`, `str`, `list`, `dict`
  - **JavaScript**: `null`, `undefined`, `boolean`, `number`, `string`, `Array`, `Object`
  - **Rust**: `LinoValue` enum with `Null`, `Bool`, `Int`, `Float`, `String`, `Array`, `Object`
  - **C#**: `null`, `bool`, `int`, `long`, `float`, `double`, `string`, `List<object?>`, `Dictionary<string, object?>`
  - Special float/number values: `NaN`, `Infinity`, `-Infinity`
- **Readable by Default**: In every language `encode()` writes indented, plain-text Links Notation; the previous single-line base64 form stays available as `encode_compact()` (alias `encode_obfuscated()`)
- **One Record per Line**: `encode_line()` writes the same readable document on one line and `decode_line()` reads it back exactly, so an append-only log stays greppable, tailable and countable by `wc -l`
- **Object Identity**: Shared references and circular references are preserved by the compact format via object ids; the readable format is a plain tree and raises a circular-reference error instead
- **Full Unicode**: Strings are written as text; only a value that cannot be written as text (one holding control characters) is base64-encoded, and it is marked individually as `(base64 "…")`
- **Opt-in Tracing**: Set `LINO_CODEC_DEBUG=1` to trace encoding and decoding, the same way in every language
- **Simple API**: Easy-to-use `encode()` and `decode()` functions
- **JSON/Lino Conversion**: Convert between JSON and Links Notation (JavaScript)
- **Reference Escaping**: Properly escape strings for Links Notation format (JavaScript)
- **Fuzzy Matching**: String similarity utilities for finding matches (JavaScript)
- **Indented Format**: Human-readable indented Links Notation format for display and debugging

## Quick Start

### Python

```bash
pip install lino-objects-codec
```

```python
from link_notation_objects_codec import encode, decode

# Encode and decode
data = {"name": "Alice", "age": 30, "active": True}
encoded = encode(data)
decoded = decode(encoded)
assert decoded == data
```

### JavaScript

```bash
npm install lino-objects-codec
```

```javascript
import { encode, decode } from "lino-objects-codec";

// `encode` produces readable, indented Links Notation by default
const data = { name: "Alice", age: 30, active: true };
const encoded = encode({ obj: data });
const decoded = decode({ notation: encoded });
console.log(JSON.stringify(decoded) === JSON.stringify(data)); // true
```

### Rust

```toml
[dependencies]
lino-objects-codec = "0.1"
```

```rust
use lino_objects_codec::{encode, decode, LinoValue};

// Encode and decode
let data = LinoValue::object([
    ("name", LinoValue::String("Alice".to_string())),
    ("age", LinoValue::Int(30)),
    ("active", LinoValue::Bool(true)),
]);
// `encode` produces readable, indented Links Notation
let encoded = encode(&data);
assert_eq!(encoded, "(\n  name \"Alice\"\n  age 30\n  active true\n)");

let decoded = decode(&encoded).unwrap();
assert_eq!(decoded, data);
```

```lino
(
  name "Alice"
  age 30
  active true
)
```

For an append-only log, `encode_line()` writes the same document on one line:

```lino
(o: (name "Alice") (age 30) (active true))
```

```python
from link_notation_objects_codec import encode_line, decode_line

decode_line(encode_line(data)) == data
```

```javascript
import { encodeLine, decodeLine } from "lino-objects-codec";

decodeLine({ notation: encodeLine({ obj: data }) });
```

```rust
use lino_objects_codec::{decode_line, encode_line};

assert_eq!(decode_line(&encode_line(&data)).unwrap(), data);
```

```csharp
var line = Codec.EncodeLine(data);
var record = Codec.DecodeLine(line);
```

The single-line base64 form is still available as `encode_compact()` (alias
`encode_obfuscated()`) in every language, and `decode()` accepts all three forms.

### C#

```bash
dotnet add package Lino.Objects.Codec
```

```csharp
using Lino.Objects.Codec;

// Encode and decode
var data = new Dictionary<string, object?>
{
    { "name", "Alice" },
    { "age", 30 },
    { "active", true }
};
var encoded = Codec.Encode(data);
var decoded = Codec.Decode(encoded) as Dictionary<string, object?>;
Console.WriteLine(decoded?["name"]); // Alice
```

## Repository Structure

```
.
├── python/           # Python implementation
│   ├── src/         # Source code
│   ├── tests/       # Test suite
│   ├── examples/    # Usage examples
│   └── README.md    # Python-specific docs
├── js/              # JavaScript implementation
│   ├── src/         # Source code
│   ├── tests/       # Test suite
│   ├── examples/    # Usage examples
│   └── README.md    # JavaScript-specific docs
├── rust/            # Rust implementation
│   ├── src/         # Source code
│   ├── examples/    # Usage examples
│   └── README.md    # Rust-specific docs
├── csharp/          # C# implementation
│   ├── src/         # Source code
│   ├── tests/       # Test suite
│   ├── examples/    # Usage examples
│   └── README.md    # C#-specific docs
└── README.md        # This file
```

## Language-Specific Documentation

For detailed documentation, API reference, and examples, see:

- **[Python Documentation](python/README.md)**
- **[JavaScript Documentation](js/README.md)**
- **[Rust Documentation](rust/README.md)**
- **[C# Documentation](csharp/README.md)**

## Usage Examples

All implementations support the same features with language-appropriate syntax:

### Circular References

Object identity -- shared nodes and cycles -- is a property of the **compact**
format, which names shared nodes with `obj_N` ids. The readable format is a plain
tree with nowhere to put those ids, so `encode()` raises a circular-reference
error on a cycle; use `encode_compact()` (the compact form) when you need
identity preserved.

**Python:**

```python
from link_notation_objects_codec import decode, encode_compact

# Self-referencing list -- preserved by the compact format
lst = [1, 2, 3]
lst.append(lst)
decoded = decode(encode_compact(lst))
assert decoded[3] is decoded  # Reference preserved
```

**JavaScript:**

```javascript
import { encodeCompact, decode } from "lino-objects-codec";

// Self-referencing array -- preserved by the compact format
const arr = [1, 2, 3];
arr.push(arr);
const decoded = decode({ notation: encodeCompact({ obj: arr }) });
console.log(decoded[3] === decoded); // true - Reference preserved
```

**Rust:**

```rust
use lino_objects_codec::{encode_compact, decode, LinoValue};

// Self-referencing structures are handled via object ids in the compact form
let data = LinoValue::array([LinoValue::Int(1), LinoValue::Int(2)]);
let decoded = decode(&encode_compact(&data)).unwrap();
// Reference semantics preserved through encoding/decoding
```

**C#:**

```csharp
using Lino.Objects.Codec;

// Self-referencing list -- preserved by the compact format
var lst = new List<object?>();
lst.Add(lst);
var decoded = Codec.Decode(Codec.EncodeCompact(lst)) as List<object?>;
Console.WriteLine(ReferenceEquals(decoded, decoded?[0])); // True - Reference preserved
```

### Complex Nested Structures

**Python:**

```python
data = {
    "users": [
        {"id": 1, "name": "Alice"},
        {"id": 2, "name": "Bob"}
    ],
    "metadata": {"version": 1, "count": 2}
}
assert decode(encode(data)) == data
```

**JavaScript:**

```javascript
const data = {
  users: [
    { id: 1, name: "Alice" },
    { id: 2, name: "Bob" },
  ],
  metadata: { version: 1, count: 2 },
};
console.log(JSON.stringify(decode(encode(data))) === JSON.stringify(data));
```

**Rust:**

```rust
use lino_objects_codec::{encode, decode, LinoValue};

let data = LinoValue::object([
    ("users", LinoValue::array([
        LinoValue::object([("id", LinoValue::Int(1)), ("name", LinoValue::String("Alice".to_string()))]),
        LinoValue::object([("id", LinoValue::Int(2)), ("name", LinoValue::String("Bob".to_string()))]),
    ])),
    ("metadata", LinoValue::object([
        ("version", LinoValue::Int(1)),
        ("count", LinoValue::Int(2)),
    ])),
]);
assert_eq!(decode(&encode(&data)).unwrap(), data);
```

**C#:**

```csharp
var data = new Dictionary<string, object?>
{
    {
        "users", new List<object?>
        {
            new Dictionary<string, object?> { { "id", 1 }, { "name", "Alice" } },
            new Dictionary<string, object?> { { "id", 2 }, { "name", "Bob" } }
        }
    },
    { "metadata", new Dictionary<string, object?> { { "version", 1 }, { "count", 2 } } }
};
var decoded = Codec.Decode(Codec.Encode(data));
```

### Indented Links Notation Format

The indented format provides a human-readable representation for displaying objects:

**JavaScript:**

```javascript
import { formatIndented, parseIndented } from "lino-objects-codec";

// Format an object with an identifier
const formatted = formatIndented({
  id: "6dcf4c1b-ff3f-482c-95ab-711ea7d1b019",
  obj: {
    uuid: "6dcf4c1b-ff3f-482c-95ab-711ea7d1b019",
    status: "executed",
    command: "echo test",
    exitCode: "0",
  },
});
console.log(formatted);
// Output:
// 6dcf4c1b-ff3f-482c-95ab-711ea7d1b019:
//   uuid '6dcf4c1b-ff3f-482c-95ab-711ea7d1b019'
//   status executed
//   command 'echo test'
//   exitCode '0'

// Parse it back
const { id, obj } = parseIndented({ text: formatted });
```

**Python:**

```python
from link_notation_objects_codec import format_indented, parse_indented

# Format an object with an identifier
formatted = format_indented(
    '6dcf4c1b-ff3f-482c-95ab-711ea7d1b019',
    {'uuid': '6dcf4c1b-ff3f-482c-95ab-711ea7d1b019', 'status': 'executed'}
)

# Parse it back
id, obj = parse_indented(formatted)
```

**Rust:**

```rust
use lino_objects_codec::format::{format_indented_ordered, parse_indented};

// Format an object with an identifier
let pairs = [("status", "executed"), ("exitCode", "0")];
let formatted = format_indented_ordered("my-uuid", &pairs, "  ").unwrap();

// Parse it back
let (id, obj) = parse_indented(&formatted).unwrap();
```

**C#:**

```csharp
using Lino.Objects.Codec;

// Format an object with an identifier
var obj = new Dictionary<string, string?> { { "status", "executed" }, { "exitCode", "0" } };
var formatted = Format.FormatIndented("my-uuid", obj);

// Parse it back
var (id, parsedObj) = Format.ParseIndented(formatted);
```

## How It Works

The library uses the [links-notation](https://github.com/link-foundation/links-notation) format as the serialization target. Each object is encoded as a Link with type information:

### Readable format (the default)

In every language `encode()` writes one `( )` construct for both objects and
arrays, at every level including the root. Lines of the form `key value` make an
object, bare-value lines make an array:

```lino
(
  name "Alice"
  age 30
  active true
)
```

- Strings are double-quoted and written as text; numbers, `true`, `false` and
  `null` are bare, so types survive a round trip
- `NaN`, `Infinity` and `-Infinity` are written as such
- An empty array is `()`; an empty object is `(` + newline + `)`
- Only a value that cannot be written as text (one containing control characters)
  is base64-encoded, and it is marked individually as `(base64 "bGluZTEKbGluZTI=")`
- The four languages produce byte-identical output, checked by the shared
  fixtures in [`fixtures/readable-format/cases.json`](fixtures/readable-format/cases.json)

### Single-line format (`encode_line`)

The same readable document written on one line, so an append-only log holds one
record per line — appending is one write, compaction cuts at a newline, and
`grep`, `tail -f` and `wc -l` all treat a line as one event:

```lino
(o: (bytes 2827) (complete true) (server (o: (host "127.0.0.1") (port 18878))))
```

- An object is `(o: (key value) …)` and an empty object is `(o:)`
- An array is `(value …)` and an empty array is `()`
- Scalars and strings are written exactly as in the indented form, so a string
  keeps its own characters and a number keeps its type
- The `o` marker is what removes the ambiguity a flat layout otherwise has:
  without it `((key value))` reads both as a one-pair object and as an array
  holding a two-element array. With it a bare `( )` on one line is always an
  array, so a *hand-written* `(a 1)` is the two-element array — on one line,
  objects say so
- `decode()` reads this form too, so a log reader needs no flag saying which form
  a file holds; `decode_line()` is the exact inverse of `encode_line()` and
  rejects input spanning more than one line

### Compact format (`encode_compact`)

The previous single-line form, kept for compatibility and for the object graphs
the readable tree cannot express (shared and circular references):

- Basic types are encoded with type markers: `(int 42)`, `(str aGVsbG8=)`, `(bool true)`
- Strings are base64-encoded to handle special characters and newlines
- Collections with self-references use `(obj_id: type content...)`, e.g.
  `(obj_0: dict ((str c2VsZg==) obj_0))` for `{"self": obj}`
- Circular references use direct object id references: `obj_0` (without a `ref` keyword)

`decode()` detects which of the two forms it is given, so previously written
files keep decoding, and every language reads the compact documents the others
write.

## Debugging

Tracing is off by default and can be turned on in any language by setting the
`LINO_CODEC_DEBUG` environment variable to a truthy value (`1`, `true`, `yes` or
`on`), or from code (`set_debug_enabled` / `setDebugEnabled` /
`CodecDebug.SetEnabled`). Trace lines go to standard error, prefixed with
`[lino-codec]`.

## Development

### Python

```bash
cd python
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
pytest tests/ -v
```

### JavaScript

```bash
cd js
npm install
npm test
npm run example
```

### Rust

```bash
cd rust
cargo test
cargo run --example basic_usage
```

### C#

```bash
cd csharp
dotnet build
dotnet test
dotnet run --project examples/BasicUsage.csproj
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Add tests for your changes
4. Ensure all tests pass
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## License

This project is licensed under the Unlicense - see the [LICENSE](LICENSE) file for details.

## Links

- [GitHub Repository](https://github.com/link-foundation/lino-objects-codec)
- [Links Notation Specification](https://github.com/link-foundation/links-notation)
- [PyPI Package](https://pypi.org/project/lino-objects-codec/) (Python)
- [npm Package](https://www.npmjs.com/package/lino-objects-codec/) (JavaScript)
- [crates.io Package](https://crates.io/crates/lino-objects-codec/) (Rust)
- [NuGet Package](https://www.nuget.org/packages/Lino.Objects.Codec/) (C#)

## Acknowledgments

This project is built on top of the [links-notation](https://github.com/link-foundation/links-notation) library.
