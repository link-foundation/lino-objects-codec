// Basic usage example for lino-objects-codec C# implementation.

using System;
using System.Collections.Generic;
using Lino.Objects.Codec;

Console.WriteLine("=== lino-objects-codec C# Basic Usage Example ===\n");

// 1. Encode and decode basic types
Console.WriteLine("1. Basic Types:");
Console.WriteLine($"   null: {Codec.Encode(null)}");
Console.WriteLine($"   bool (true): {Codec.Encode(true)}");
Console.WriteLine($"   bool (false): {Codec.Encode(false)}");
Console.WriteLine($"   int: {Codec.Encode(42)}");
Console.WriteLine($"   double: {Codec.Encode(3.14)}");
Console.WriteLine($"   string: {Codec.Encode("Hello, World!")}");
Console.WriteLine();

// 2. Roundtrip a dictionary
Console.WriteLine("2. Dictionary Roundtrip:");
var data = new Dictionary<string, object?>
{
    { "name", "Alice" },
    { "age", 30 },
    { "active", true }
};
var encoded = Codec.Encode(data);
Console.WriteLine($"   Original: {{name: Alice, age: 30, active: true}}");
Console.WriteLine($"   Encoded: {encoded}");

var decoded = Codec.Decode(encoded) as Dictionary<string, object?>;
Console.WriteLine($"   Decoded: {{name: {decoded?["name"]}, age: {decoded?["age"]}, active: {decoded?["active"]}}}");
Console.WriteLine();

// 3. Encode a list
Console.WriteLine("3. List Encoding:");
var list = new List<object?> { 1, 2, 3, "four", true };
encoded = Codec.Encode(list);
Console.WriteLine($"   List: [1, 2, 3, \"four\", true]");
Console.WriteLine($"   Encoded: {encoded}");
Console.WriteLine();

// 4. Nested structures
Console.WriteLine("4. Nested Structure:");
var nested = new Dictionary<string, object?>
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
encoded = Codec.Encode(nested);
Console.WriteLine($"   Encoded: {encoded}");
Console.WriteLine();

// 5. Circular references
Console.WriteLine("5. Circular References:");
// Object identity is a property of the compact format, which names shared nodes
// with `obj_N` ids. The readable format writes a plain tree, so it rejects a
// cycle instead of silently unrolling it.

// Self-referencing list
var selfRef = new List<object?>();
selfRef.Add(selfRef);
encoded = Codec.EncodeCompact(selfRef);
Console.WriteLine($"   Self-referencing list encoded: {encoded}");

var decodedSelfRef = Codec.Decode(encoded) as List<object?>;
var isSelfRef = decodedSelfRef != null && ReferenceEquals(decodedSelfRef, decodedSelfRef[0]);
Console.WriteLine($"   Reference preserved after decode: {isSelfRef}");

// Self-referencing dictionary
var selfRefDict = new Dictionary<string, object?>();
selfRefDict["self"] = selfRefDict;
encoded = Codec.EncodeCompact(selfRefDict);
Console.WriteLine($"   Self-referencing dict encoded: {encoded}");
Console.WriteLine();

// 6. Mutual references
Console.WriteLine("6. Mutual References:");
// Also a compact-format property, for the same reason.
var list1 = new List<object?> { 1, 2 };
var list2 = new List<object?> { 3, 4 };
list1.Add(list2);
list2.Add(list1);
encoded = Codec.EncodeCompact(list1);
Console.WriteLine($"   Two lists referencing each other:");
Console.WriteLine($"   {encoded}");

var decodedList1 = Codec.Decode(encoded) as List<object?>;
var decodedList2 = decodedList1?[2] as List<object?>;
var backRef = decodedList2?[2];
Console.WriteLine($"   Circular reference preserved: {ReferenceEquals(decodedList1, backRef)}");
Console.WriteLine();

// 7. Special float values
Console.WriteLine("7. Special Float Values:");
Console.WriteLine($"   NaN: {Codec.Encode(double.NaN)}");
Console.WriteLine($"   Infinity: {Codec.Encode(double.PositiveInfinity)}");
Console.WriteLine($"   -Infinity: {Codec.Encode(double.NegativeInfinity)}");
Console.WriteLine();

// 8. Output formats
Console.WriteLine("8. Output Formats:");
var formats = new Dictionary<string, object?>
{
    { "users", new List<object?> { new Dictionary<string, object?> { { "id", 1 }, { "name", "Alice" } } } },
    { "count", 1 }
};

// The default output is readable: values are written as they are.
var readable = Codec.Encode(formats);
Console.WriteLine("   Readable (default):");
Console.WriteLine(readable);

// The compact form carries a type marker per value and base64 encodes strings.
var compact = Codec.EncodeCompact(formats);
Console.WriteLine($"   Compact: {compact}");

// `Decode` recognises both.
Console.WriteLine($"   Compact document detected: {Codec.IsCompactNotation(compact)}");
Console.WriteLine($"   Readable document detected as compact: {Codec.IsCompactNotation(readable)}");

// A cycle has no readable form; use the compact one.
var cyclic = new Dictionary<string, object?>();
cyclic["self"] = cyclic;
try
{
    Codec.Encode(cyclic);
    Console.Error.WriteLine("   ERROR: a cycle should not be writable as readable text!");
}
catch (CircularReferenceException e)
{
    Console.WriteLine($"   Readable format rejects a cycle: {e.GetType().Name}");
}

Console.WriteLine();

Console.WriteLine("=== Example completed successfully! ===");
