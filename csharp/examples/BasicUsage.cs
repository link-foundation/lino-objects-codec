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

// Self-referencing list
var selfRef = new List<object?>();
selfRef.Add(selfRef);
encoded = Codec.Encode(selfRef);
Console.WriteLine($"   Self-referencing list encoded: {encoded}");

var decodedSelfRef = Codec.Decode(encoded) as List<object?>;
var isSelfRef = decodedSelfRef != null && ReferenceEquals(decodedSelfRef, decodedSelfRef[0]);
Console.WriteLine($"   Reference preserved after decode: {isSelfRef}");

// Self-referencing dictionary
var selfRefDict = new Dictionary<string, object?>();
selfRefDict["self"] = selfRefDict;
encoded = Codec.Encode(selfRefDict);
Console.WriteLine($"   Self-referencing dict encoded: {encoded}");
Console.WriteLine();

// 6. Mutual references
Console.WriteLine("6. Mutual References:");
var list1 = new List<object?> { 1, 2 };
var list2 = new List<object?> { 3, 4 };
list1.Add(list2);
list2.Add(list1);
encoded = Codec.Encode(list1);
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

Console.WriteLine("=== Example completed successfully! ===");
