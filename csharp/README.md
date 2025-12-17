# lino-objects-codec (C#)

A C# library for working with Links Notation format. This library provides universal serialization/deserialization for C# objects with circular reference support.

## Features

- **Universal Serialization**: Encode C# objects to Links Notation format
- **Type Support**: Handle common C# types:
  - Basic types: `null`, `bool`, `int`, `long`, `float`, `double`, `string`
  - Collections: `List<object?>`, `Dictionary<string, object?>`
  - Special float values: `NaN`, `Infinity`, `-Infinity`
- **Circular References**: Automatically detect and preserve circular references
- **Object Identity**: Maintain object identity for shared references
- **UTF-8 Support**: Full Unicode string support using base64 encoding
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
// Output: (dict ((str bmFtZQ==) (str QWxpY2U=)) ((str YWdl) (int 30)) ((str YWN0aXZl) (bool True)))

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

### Circular References

The library automatically handles circular references and shared objects:

```csharp
using Lino.Objects.Codec;

// Self-referencing list
var selfRef = new List<object?>();
selfRef.Add(selfRef);  // Circular reference
var encoded = Codec.Encode(selfRef);
// Output: (obj_0: list obj_0)
var decoded = Codec.Decode(encoded) as List<object?>;
Console.WriteLine(ReferenceEquals(decoded, decoded?[0])); // True - Reference preserved

// Self-referencing dictionary
var selfRefDict = new Dictionary<string, object?>();
selfRefDict["self"] = selfRefDict;  // Circular reference
encoded = Codec.Encode(selfRefDict);
// Output: (obj_0: dict ((str c2VsZg==) obj_0))
var decodedDict = Codec.Decode(encoded) as Dictionary<string, object?>;
Console.WriteLine(ReferenceEquals(decodedDict, decodedDict?["self"])); // True

// Shared references
var shared = new Dictionary<string, object?> { { "shared", "data" } };
var container = new Dictionary<string, object?>
{
    { "first", shared },
    { "second", shared }
};
encoded = Codec.Encode(container);
var decodedContainer = Codec.Decode(encoded) as Dictionary<string, object?>;
// Both references point to the same object
Console.WriteLine(ReferenceEquals(decodedContainer?["first"], decodedContainer?["second"])); // True

// Complex circular structure (tree with back-references)
var root = new Dictionary<string, object?> { { "name", "root" }, { "children", new List<object?>() } };
var child = new Dictionary<string, object?> { { "name", "child" }, { "parent", root } };
((List<object?>)root["children"]!).Add(child);
encoded = Codec.Encode(root);
var decodedRoot = Codec.Decode(encoded) as Dictionary<string, object?>;
var decodedChild = ((List<object?>)decodedRoot?["children"]!)[0] as Dictionary<string, object?>;
Console.WriteLine(ReferenceEquals(decodedRoot, decodedChild?["parent"])); // True
```

## How It Works

The library uses the [links-notation](https://github.com/link-foundation/links-notation) format as the serialization target. Each C# object is encoded as a Link with type information:

- Basic types are encoded with type markers: `(int 42)`, `(str SGVsbG8=)`, `(bool True)`
- Strings are base64-encoded to handle special characters and newlines
- Collections with self-references use built-in links notation self-reference syntax:
  - **Format**: `(obj_id: type content...)`
  - **Example**: `(obj_0: dict ((str c2VsZg==) obj_0))` for `{"self": obj}`
- Simple collections without shared references use format: `(list item1 item2 ...)` or `(dict (key val) ...)`
- Circular references use direct object ID references: `obj_0` (without the `ref` keyword)

This approach allows for:
- Universal representation of object graphs
- Preservation of object identity
- Natural handling of circular references using built-in links notation syntax
- Cross-language compatibility with Python and JavaScript implementations

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
