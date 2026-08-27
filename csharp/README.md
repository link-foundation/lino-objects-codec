# lino-objects-codec (C#)

[![C# CI](https://github.com/link-foundation/lino-objects-codec/actions/workflows/csharp.yml/badge.svg)](https://github.com/link-foundation/lino-objects-codec/actions/workflows/csharp.yml)
[![NuGet](https://img.shields.io/nuget/v/Lino.Objects.Codec?label=NuGet&logo=nuget)](https://www.nuget.org/packages/Lino.Objects.Codec)
[![NuGet downloads](https://img.shields.io/nuget/dt/Lino.Objects.Codec?label=downloads)](https://www.nuget.org/packages/Lino.Objects.Codec)
[![License: Unlicense](https://img.shields.io/badge/license-Unlicense-blue.svg)](https://unlicense.org/)

A C# library for working with Links Notation format. This library provides universal serialization/deserialization for C# objects with circular reference support.

## Features

- **Universal Serialization**: Encode C# objects to Links Notation format
- **Type Support**: Handle common C# types:
  - Basic types: `null`, `bool`, `int`, `long`, `float`, `double`, `string`
  - Collections: `List<object?>`, `Dictionary<string, object?>`
  - Special float values: `NaN`, `Infinity`, `-Infinity`
- **Readable by Default**: `Codec.Encode()` writes plain, indented text that can be read and reviewed
- **One Record per Line**: `Codec.EncodeLine()` writes the same document on one line and `Codec.DecodeLine()` reads it back exactly, so an append-only log stays greppable, tailable and countable by `wc -l`
- **Object Identity**: Shared references and circular references are preserved by the compact format (`Codec.EncodeCompact`) via object ids
- **Full Unicode**: Strings are written as text; only a value that cannot be written as text (one holding control characters) is base64-encoded, and it is marked individually as `(base64 "…")`
- **Opt-in Tracing**: Set `LINO_CODEC_DEBUG=1` to trace encoding and decoding, the same way in every language
- **Simple API**: Easy-to-use `Codec.Encode()` and `Codec.Decode()` functions
- **Thread Safe**: Each operation uses a fresh codec instance

## Installation

### Package Manager

```text
Install-Package Lino.Objects.Codec
```

### .NET CLI

```bash
dotnet add package Lino.Objects.Codec
```

### PackageReference

```xml
<PackageReference Include="Lino.Objects.Codec" Version="0.1.0" />
```

## Quick Start

```csharp
using Lino.Objects.Codec;

// Encode basic types
var encoded = Codec.Encode(new Dictionary<string, object?>
{
    { "name", "Alice" },
    { "age", 30 },
    { "active", true }
});
Console.WriteLine(encoded);
// Output:
// (
//   name "Alice"
//   age 30
//   active true
// )

// Decode back to C# object
var decoded = Codec.Decode(encoded) as Dictionary<string, object?>;
Console.WriteLine($"Name: {decoded?["name"]}, Age: {decoded?["age"]}");
// Output: Name: Alice, Age: 30
```

## Usage Examples

### Basic Types

```csharp
using Lino.Objects.Codec;

// null
Console.WriteLine(Codec.Decode(Codec.Encode(null))); // null

// Booleans
Console.WriteLine(Codec.Decode(Codec.Encode(true)));  // True
Console.WriteLine(Codec.Decode(Codec.Encode(false))); // False

// Numbers (integers and floats)
Console.WriteLine(Codec.Decode(Codec.Encode(42)));    // 42
Console.WriteLine(Codec.Decode(Codec.Encode(-123)));  // -123
Console.WriteLine(Codec.Decode(Codec.Encode(3.14))); // 3.14

// Special number values
Console.WriteLine(Codec.Decode(Codec.Encode(double.PositiveInfinity))); // ∞
Console.WriteLine(Codec.Decode(Codec.Encode(double.NegativeInfinity))); // -∞
Console.WriteLine(double.IsNaN((double)Codec.Decode(Codec.Encode(double.NaN))!)); // True

// Strings (with full Unicode support)
Console.WriteLine(Codec.Decode(Codec.Encode("hello"))); // hello
Console.WriteLine(Codec.Decode(Codec.Encode("你好世界 🌍"))); // 你好世界 🌍
Console.WriteLine(Codec.Decode(Codec.Encode("multi\nline\nstring"))); // multi\nline\nstring
```

### Collections

```csharp
using Lino.Objects.Codec;

// Lists
var list = new List<object?> { 1, 2, 3, "hello", true, null };
var encoded = Codec.Encode(list);
var decoded = Codec.Decode(encoded) as List<object?>;
// decoded contains [1, 2, 3, "hello", true, null]

// Nested lists
var nested = new List<object?>
{
    new List<object?> { 1, 2 },
    new List<object?> { 3, 4 },
    new List<object?> { 5, new List<object?> { 6, 7 } }
};
decoded = Codec.Decode(Codec.Encode(nested)) as List<object?>;

// Dictionaries
var person = new Dictionary<string, object?>
{
    { "name", "Bob" },
    { "age", 25 },
    { "email", "bob@example.com" }
};
decoded = Codec.Decode(Codec.Encode(person));

// Complex nested structures
var complexData = new Dictionary<string, object?>
{
    {
        "users", new List<object?>
        {
            new Dictionary<string, object?> { { "id", 1 }, { "name", "Alice" } },
            new Dictionary<string, object?> { { "id", 2 }, { "name", "Bob" } }
        }
    },
    {
        "metadata", new Dictionary<string, object?>
        {
            { "version", 1 },
            { "count", 2 }
        }
    }
};
decoded = Codec.Decode(Codec.Encode(complexData));
```

## Output Formats

| Method | Output |
| --- | --- |
| `Codec.Encode(obj)` | Readable, indented Links Notation (the default) |
| `Codec.Encode(obj, "\t")` | Same, with a custom indentation string |
| `Codec.EncodeLine(obj)` | The same readable document on one line, for append-only logs |
| `Codec.EncodeCompact(obj)` | The previous single-line, base64 form |
| `Codec.EncodeObfuscated(obj)` | Alias of `Codec.EncodeCompact` |

`Codec.Decode()` accepts every one of them, so files written by older versions
keep working and are rewritten in the readable form the next time they are saved.

### Circular References

Object identity -- shared nodes and cycles -- is a property of the **compact**
format, which names shared nodes with `obj_N` ids. The readable format is a plain
tree with nowhere to put those ids, so `Codec.Encode` throws
`CircularReferenceException` on a cycle. Use `Codec.EncodeCompact` when you need
identity preserved:

```csharp
using Lino.Objects.Codec;

// Self-referencing list -- preserved by the compact format
var selfRef = new List<object?>();
selfRef.Add(selfRef);  // Circular reference
var encoded = Codec.EncodeCompact(selfRef);
// Output: (obj_0: list obj_0)
var decoded = Codec.Decode(encoded) as List<object?>;
Console.WriteLine(ReferenceEquals(decoded, decoded?[0])); // True - Reference preserved

// Shared references -- the same object is restored once
var shared = new Dictionary<string, object?> { { "shared", "data" } };
var container = new Dictionary<string, object?>
{
    { "first", shared },
    { "second", shared }
};
var decodedContainer = Codec.Decode(Codec.EncodeCompact(container)) as Dictionary<string, object?>;
Console.WriteLine(ReferenceEquals(decodedContainer?["first"], decodedContainer?["second"])); // True

// The readable format rejects a cycle rather than losing the identity
try
{
    Codec.Encode(selfRef);
}
catch (CircularReferenceException error)
{
    Console.WriteLine(error.GetType().Name); // CircularReferenceException
}
```

## How It Works

The library uses the [links-notation](https://github.com/link-foundation/links-notation) format as the serialization target.

### Readable format (the default)

`Codec.Encode` writes one `( )` construct for both dictionaries and lists, at
every level including the root. Lines of the form `key value` make a dictionary,
bare-value lines make a list:

- Strings are double-quoted and written as text: `name "Alice"`
- Numbers, `true`, `false` and `null` are bare, so types survive a round trip
- `NaN`, `Infinity` and `-Infinity` are written as such
- An empty list is `()`; an empty dictionary is `(` + newline + `)`
- A value that cannot be written as text (one containing control characters) is
  base64-encoded on its own and marked as `(base64 "bGluZTEKbGluZTI=")`;
  everything around it stays readable

### Single-line format (`Codec.EncodeLine`)

The same readable document on one line, so an append-only log holds one record
per line -- appending is one write, compaction cuts at a newline, and `grep`,
`tail -f` and `wc -l` all treat a line as one event:

```lino
(o: (bytes 2827) (complete true) (server (o: (host "127.0.0.1") (port 18878))))
```

- A dictionary is `(o: (key value) …)` and an empty dictionary is `(o:)`
- A list is `(value …)` and an empty list is `()`
- Scalars and strings are written exactly as in the indented form
- The `o` marker removes the ambiguity a flat layout otherwise has: a bare `( )`
  on one line is always a list, so a *hand-written* `(a 1)` is the two-element
  list, not the one-pair dictionary
- `Codec.Decode` reads this form too; `Codec.DecodeLine` is its exact inverse and
  rejects input spanning more than one line

### Compact format (`Codec.EncodeCompact`)

The previous single-line form, kept for compatibility and for the object graphs
the readable tree cannot express (shared and circular references):

- Basic types carry a type marker: `(int 42)`, `(str SGVsbG8=)`, `(bool true)`
- Strings are base64-encoded to handle special characters and newlines
- Collections with self-references use `(obj_id: type content...)`, e.g.
  `(obj_0: dict ((str c2VsZg==) obj_0))` for `{"self": obj}`
- Circular references use direct object ID references: `obj_0` (without a `ref` keyword)

`Codec.Decode` detects which of the two forms it is given, so previously written
files keep decoding, and every language reads the compact documents the others
write.

## Debugging

Tracing is off by default. Turn it on to see what the codec does, either from
the environment or from code:

```bash
LINO_CODEC_DEBUG=1 dotnet run   # 1, true, yes or on
```

```csharp
using Lino.Objects.Codec;

CodecDebug.SetEnabled(true); // force on
CodecDebug.SetEnabled(null); // follow LINO_CODEC_DEBUG again
```

Trace lines are written to standard error, prefixed with `[lino-codec]`. The
same switch and the same `LINO_CODEC_DEBUG` variable exist in the JavaScript,
Python and Rust implementations.

## API Reference

### Static Methods

#### `Codec.Encode(object? obj)`

Encode a C# object to Links Notation format.

**Parameters:**
- `obj` - The C# object to encode (can be null)

**Returns:**
- String representation in Links Notation format

**Throws:**
- `NotSupportedException` - If the object type is not supported

#### `Codec.Decode(string notation)`

Decode Links Notation format to a C# object.

**Parameters:**
- `notation` - String in Links Notation format

**Returns:**
- Reconstructed C# object (or null)

**Throws:**
- `InvalidOperationException` - If the type marker is unknown

#### `Codec.EncodeLine(object? obj)`

Encode a C# object into the readable format on one line.

**Parameters:**
- `obj` - The C# object to encode (can be null)

**Returns:**
- String representation in readable Links Notation format, holding no newline

```csharp
Codec.EncodeLine(new Dictionary<string, object?> { ["age"] = 30 }); // (o: (age 30))
```

#### `Codec.DecodeLine(string notation)`

Decode one line of a readable Links Notation log. The exact inverse of
`Codec.EncodeLine`.

**Parameters:**
- `notation` - One line written by `Codec.EncodeLine`

**Returns:**
- Reconstructed C# object (or null)

**Throws:**
- `FormatException` - If the input spans more than one line or is malformed

### ObjectCodec Class

The main codec class that performs encoding and decoding. The static `Codec` class creates a new instance for each operation to ensure thread safety.

```csharp
using Lino.Objects.Codec;

var codec = new ObjectCodec();
var encoded = codec.Encode(new List<object?> { 1, 2, 3 });
var decoded = codec.Decode(encoded);
```

## Development

### Setup

```bash
# Clone the repository
git clone https://github.com/link-foundation/lino-objects-codec.git
cd lino-objects-codec/csharp

# Build
dotnet build

# Run tests
dotnet test

# Run example
dotnet run --project examples/BasicUsage.csproj
```

### Running Tests

```bash
# Run all tests
dotnet test

# Run tests with verbose output
dotnet test --verbosity normal

# Run specific test class
dotnet test --filter "FullyQualifiedName~CircularReferences"
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Add tests for your changes
4. Ensure all tests pass (`dotnet test`)
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## License

This project is licensed under the Unlicense - see the [LICENSE](../LICENSE) file for details.

## Links

- [GitHub Repository](https://github.com/link-foundation/lino-objects-codec)
- [Links Notation Specification](https://github.com/link-foundation/links-notation)
- [NuGet Package](https://www.nuget.org/packages/Lino.Objects.Codec/) (C#)
- [Python Implementation](../python/)
- [JavaScript Implementation](../js/)

## Acknowledgments

This project is built on top of the [Link.Foundation.Links.Notation](https://www.nuget.org/packages/Link.Foundation.Links.Notation/) library.
