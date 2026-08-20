# lino-objects-codec (Rust)

[![Rust CI](https://github.com/link-foundation/lino-objects-codec/actions/workflows/rust.yml/badge.svg)](https://github.com/link-foundation/lino-objects-codec/actions/workflows/rust.yml)
[![crates.io](https://img.shields.io/crates/v/lino-objects-codec?label=crates.io&logo=rust)](https://crates.io/crates/lino-objects-codec)
[![docs.rs](https://img.shields.io/docsrs/lino-objects-codec?label=docs.rs)](https://docs.rs/lino-objects-codec)
[![License: Unlicense](https://img.shields.io/badge/license-Unlicense-blue.svg)](https://unlicense.org/)

Rust implementation of the Links Notation Objects Codec - a universal serialization library to encode/decode objects to/from Links Notation format.

## Installation

Add to your `Cargo.toml`:

```toml
[dependencies]
lino-objects-codec = "0.1"
```

## Features

- **Universal Serialization**: Encode objects to Links Notation format
- **Type Support**: Handle all common types:
  - `null` (Null)
  - `bool` (Bool)
  - `int` (Int - 64-bit signed)
  - `float` (Float - 64-bit, including NaN, Infinity, -Infinity)
  - `str` (String)
  - `array` (Array)
  - `object` (Object)
- **Special Float Values**: Full support for NaN, Infinity, -Infinity (which are not valid JSON)
- **Circular References**: Detect and preserve circular references via object IDs
- **Object Identity**: Maintain object identity for shared references
- **Readable by Default**: `encode()` writes indented, plain-text Links Notation; keys and values stay legible and diffable
- **UTF-8 Support**: Full Unicode string support written as text; only values that cannot be written as text (control characters) are base64-encoded, and each is marked individually
- **Simple API**: Easy-to-use `encode()` and `decode()` functions

## Quick Start

```rust
use lino_objects_codec::{encode, decode, LinoValue};

// Create an object
let data = LinoValue::object([
    ("name", LinoValue::String("Alice".to_string())),
    ("age", LinoValue::Int(30)),
    ("active", LinoValue::Bool(true)),
]);

// Encode to Links Notation
let encoded = encode(&data);
assert_eq!(encoded, "(\n  name \"Alice\"\n  age 30\n  active true\n)");

// Decode back
let decoded = decode(&encoded).unwrap();
assert_eq!(decoded, data);
```

The encoded document reads as:

```lino
(
  name "Alice"
  age 30
  active true
)
```

## Output Formats

| Function | Output |
| --- | --- |
| `encode(value)` | Readable, indented Links Notation (the default) |
| `encode_with_indent(value, "\t")` | Same, with a custom indentation string |
| `encode_compact(value)` | The previous single-line base64 form |
| `encode_obfuscated(value)` | Alias of `encode_compact` |

`decode()` accepts every one of them, so files written by older versions keep
working and are rewritten in the readable form the next time they are saved.

## API Reference

### Types

#### `LinoValue`

The main value type that can represent any serializable value:

```rust
pub enum LinoValue {
    Null,
    Bool(bool),
    Int(i64),
    Float(f64),
    String(String),
    Array(Vec<LinoValue>),
    Object(Vec<(String, LinoValue)>),
}
```

Helper methods:
- `LinoValue::object(iter)` - Create an object from key-value pairs
- `LinoValue::array(iter)` - Create an array from values
- `is_null()`, `as_bool()`, `as_int()`, `as_float()`, `as_str()`, `as_array()`, `as_object()` - Type checking and extraction
- `get(key)` - Get a value from an object by key
- `get_index(index)` - Get a value from an array by index

#### `CodecError`

Error type for codec operations:

```rust
pub enum CodecError {
    ParseError(String),
    DecodeError(String),
    UnknownType(String),
}
```

### Functions

#### `encode(value: &LinoValue) -> String`

Encode a value to the readable, indented Links Notation format.

```rust
let value = LinoValue::Int(42);
let encoded = encode(&value);
assert_eq!(encoded, "42");
```

#### `encode_with_indent(value: &LinoValue, indent: &str) -> String`

Same as `encode()`, but with a custom indentation string (the default is two spaces).

#### `encode_compact(value: &LinoValue) -> String`

Encode a value to the single-line, base64 form used before version 0.3.

```rust
let value = LinoValue::String("hello".to_string());
assert_eq!(encode_compact(&value), "(str aGVsbG8=)");
```

#### `encode_obfuscated(value: &LinoValue) -> String`

Alias of `encode_compact()`, named after what the base64 form actually does to the text.

#### `decode(notation: &str) -> Result<LinoValue, CodecError>`

Decode Links Notation format to a value. Both the readable and the compact form
are accepted.

```rust
let decoded = decode("42").unwrap();
assert_eq!(decoded, LinoValue::Int(42));

let legacy = decode("(int 42)").unwrap();
assert_eq!(legacy, LinoValue::Int(42));
```

### `ObjectCodec`

For advanced use cases, you can create your own codec instance:

```rust
use lino_objects_codec::ObjectCodec;

let mut codec = ObjectCodec::new();
let encoded = codec.encode(&value);
let decoded = codec.decode(&encoded)?;
```

## Usage Examples

### Basic Types

```rust
use lino_objects_codec::{encode, decode, LinoValue};

// Null
let null = LinoValue::Null;
assert_eq!(encode(&null), "null");

// Boolean
let bool_val = LinoValue::Bool(true);
assert_eq!(encode(&bool_val), "true");

// Integer
let int_val = LinoValue::Int(42);
assert_eq!(encode(&int_val), "42");

// Float
let float_val = LinoValue::Float(3.14);
assert_eq!(encode(&float_val), "3.14");

// Special floats
let inf = LinoValue::Float(f64::INFINITY);
assert_eq!(encode(&inf), "Infinity");

let nan = LinoValue::Float(f64::NAN);
assert_eq!(encode(&nan), "NaN");

// Strings are quoted, not encoded
let str_val = LinoValue::String("hello".to_string());
assert_eq!(encode(&str_val), "\"hello\"");

// Numbers written as strings stay strings
let numeric = LinoValue::String("42".to_string());
assert_eq!(decode(&encode(&numeric)).unwrap(), numeric);
```

### Collections

```rust
use lino_objects_codec::{encode, decode, LinoValue};

// Array
let array = LinoValue::array([
    LinoValue::Int(1),
    LinoValue::Int(2),
    LinoValue::Int(3),
]);
let encoded = encode(&array);
let decoded = decode(&encoded).unwrap();
assert_eq!(decoded.as_array().unwrap().len(), 3);

// Object
let obj = LinoValue::object([
    ("name", LinoValue::String("Alice".to_string())),
    ("age", LinoValue::Int(30)),
]);
let encoded = encode(&obj);
let decoded = decode(&encoded).unwrap();
assert_eq!(decoded.get("name").unwrap().as_str(), Some("Alice"));
```

### Nested Structures

```rust
use lino_objects_codec::{encode, decode, LinoValue};

let data = LinoValue::object([
    ("users", LinoValue::array([
        LinoValue::object([
            ("id", LinoValue::Int(1)),
            ("name", LinoValue::String("Alice".to_string())),
        ]),
        LinoValue::object([
            ("id", LinoValue::Int(2)),
            ("name", LinoValue::String("Bob".to_string())),
        ]),
    ])),
    ("metadata", LinoValue::object([
        ("version", LinoValue::Int(1)),
        ("count", LinoValue::Int(2)),
    ])),
]);

let encoded = encode(&data);
let decoded = decode(&encoded).unwrap();

// Access nested values
let users = decoded.get("users").unwrap().as_array().unwrap();
assert_eq!(users.len(), 2);
```

### From Traits

`LinoValue` implements `From` for common Rust types:

```rust
use lino_objects_codec::LinoValue;

let null: LinoValue = ().into();
let bool_val: LinoValue = true.into();
let int_val: LinoValue = 42i64.into();
let float_val: LinoValue = 3.14f64.into();
let str_val: LinoValue = "hello".into();
let vec_val: LinoValue = vec![1i64, 2, 3].into();
let opt_val: LinoValue = Some(42i64).into();
let none_val: LinoValue = None::<i64>.into();
```

## How It Works

The codec encodes values using the [Links Notation](https://github.com/link-foundation/links-notation) format.

### Readable format (the default)

One `( )` construct carries both objects and arrays, at every level including
the root. Lines of the form `key value` make an object, bare-value lines make an
array:

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
- An empty array is `()`; an empty object is `(` + newline + `)`
- A value that cannot be written as text (one containing control characters) is
  base64-encoded on its own and marked as `(base64 "bGluZTEKbGluZTI=")`;
  everything around it stays readable

Reading the format back requires `links-notation` 0.14 semantics, where a
parenthesis opens a nested indentation context.

### Compact format (`encode_compact`)

The previous single-line form, kept for compatibility and for cases where size
matters more than legibility:

- Basic types: `(int 42)`, `(str aGVsbG8=)`, `(bool true)`
- Strings are base64-encoded to handle special characters and newlines
- Arrays: `(array (int 1) (int 2) (int 3))`
- Objects: `(object ((str a2V5) (int 42)) ...)`
- Special floats: `(float NaN)`, `(float Infinity)`, `(float -Infinity)`

For structures with shared references or circular references, the compact form
uses object IDs:
- Format: `(obj_0: array ...)` or `(obj_0: object ...)`
- References: `obj_0`

`decode()` detects which of the two forms it is given, so previously written
files keep decoding.

## Development

```bash
# Run tests
cargo test

# Run example
cargo run --example basic_usage

# Build documentation
cargo doc --open
```

## License

This project is licensed under the Unlicense - see the [LICENSE](../LICENSE) file for details.
