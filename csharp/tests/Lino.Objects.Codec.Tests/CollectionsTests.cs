// Tests for encoding/decoding collections (lists and dictionaries).

using Xunit;
using Lino.Objects.Codec;

namespace Lino.Objects.Codec.Tests;

/// <summary>
/// Tests for list serialization.
/// </summary>
public class ListTests
{
    [Fact]
    public void Encode_EmptyList_ReturnsString()
    {
        var result = Codec.Encode(new List<object?>());
        Assert.NotNull(result);
        Assert.IsType<string>(result);
    }

    [Fact]
    public void Decode_EncodedEmptyList_ReturnsEmptyList()
    {
        var encoded = Codec.Encode(new List<object?>());
        var result = Codec.Decode(encoded);
        Assert.NotNull(result);
        var list = Assert.IsType<List<object?>>(result);
        Assert.Empty(list);
    }

    [Fact]
    public void Roundtrip_SimpleList_PreservesValue()
    {
        var original = new List<object?> { 1, 2, 3 };
        var encoded = Codec.Encode(original);
        var decoded = Codec.Decode(encoded);
        var list = Assert.IsType<List<object?>>(decoded);
        Assert.Equal(3, list.Count);
        Assert.Equal(1, list[0]);
        Assert.Equal(2, list[1]);
        Assert.Equal(3, list[2]);
    }

    [Fact]
    public void Roundtrip_MixedTypeList_PreservesValues()
    {
        var original = new List<object?> { 1, "hello", true, 3.14, null };
        var encoded = Codec.Encode(original);
        var decoded = Codec.Decode(encoded);
        var list = Assert.IsType<List<object?>>(decoded);
        Assert.Equal(5, list.Count);
        Assert.Equal(1, list[0]);
        Assert.Equal("hello", list[1]);
        Assert.Equal(true, list[2]);
        Assert.Equal(3.14, (double)list[3]!, 10);
        Assert.Null(list[4]);
    }

    [Fact]
    public void Roundtrip_NestedList_PreservesStructure()
    {
        var original = new List<object?>
        {
            new List<object?> { 1, 2 },
            new List<object?> { 3, 4 }
        };
        var encoded = Codec.Encode(original);
        var decoded = Codec.Decode(encoded);
        var list = Assert.IsType<List<object?>>(decoded);
        Assert.Equal(2, list.Count);

        var inner1 = Assert.IsType<List<object?>>(list[0]);
        Assert.Equal(2, inner1.Count);
        Assert.Equal(1, inner1[0]);
        Assert.Equal(2, inner1[1]);

        var inner2 = Assert.IsType<List<object?>>(list[1]);
        Assert.Equal(2, inner2.Count);
        Assert.Equal(3, inner2[0]);
        Assert.Equal(4, inner2[1]);
    }
}

/// <summary>
/// Tests for dictionary serialization.
/// </summary>
public class DictTests
{
    [Fact]
    public void Encode_EmptyDict_ReturnsString()
    {
        var result = Codec.Encode(new Dictionary<string, object?>());
        Assert.NotNull(result);
        Assert.IsType<string>(result);
    }

    [Fact]
    public void Decode_EncodedEmptyDict_ReturnsEmptyDict()
    {
        var encoded = Codec.Encode(new Dictionary<string, object?>());
        var result = Codec.Decode(encoded);
        Assert.NotNull(result);
        var dict = Assert.IsType<Dictionary<string, object?>>(result);
        Assert.Empty(dict);
    }

    [Fact]
    public void Roundtrip_SimpleDict_PreservesValue()
    {
        var original = new Dictionary<string, object?>
        {
            { "key1", "value1" },
            { "key2", 42 }
        };
        var encoded = Codec.Encode(original);
        var decoded = Codec.Decode(encoded);
        var dict = Assert.IsType<Dictionary<string, object?>>(decoded);
        Assert.Equal(2, dict.Count);
        Assert.Equal("value1", dict["key1"]);
        Assert.Equal(42, dict["key2"]);
    }

    [Fact]
    public void Roundtrip_MixedValueDict_PreservesValues()
    {
        var original = new Dictionary<string, object?>
        {
            { "str", "hello" },
            { "int", 42 },
            { "bool", true },
            { "float", 3.14 },
            { "null", null }
        };
        var encoded = Codec.Encode(original);
        var decoded = Codec.Decode(encoded);
        var dict = Assert.IsType<Dictionary<string, object?>>(decoded);
        Assert.Equal(5, dict.Count);
        Assert.Equal("hello", dict["str"]);
        Assert.Equal(42, dict["int"]);
        Assert.Equal(true, dict["bool"]);
        Assert.Equal(3.14, (double)dict["float"]!, 10);
        Assert.Null(dict["null"]);
    }

    [Fact]
    public void Roundtrip_NestedDict_PreservesStructure()
    {
        var original = new Dictionary<string, object?>
        {
            { "name", "test" },
            {
                "nested", new Dictionary<string, object?>
                {
                    { "inner", "value" }
                }
            }
        };
        var encoded = Codec.Encode(original);
        var decoded = Codec.Decode(encoded);
        var dict = Assert.IsType<Dictionary<string, object?>>(decoded);
        Assert.Equal(2, dict.Count);
        Assert.Equal("test", dict["name"]);

        var nested = Assert.IsType<Dictionary<string, object?>>(dict["nested"]);
        Assert.Single(nested);
        Assert.Equal("value", nested["inner"]);
    }

    [Fact]
    public void Roundtrip_DictWithListValue_PreservesStructure()
    {
        var original = new Dictionary<string, object?>
        {
            { "items", new List<object?> { 1, 2, 3 } }
        };
        var encoded = Codec.Encode(original);
        var decoded = Codec.Decode(encoded);
        var dict = Assert.IsType<Dictionary<string, object?>>(decoded);
        Assert.Single(dict);

        var items = Assert.IsType<List<object?>>(dict["items"]);
        Assert.Equal(3, items.Count);
        Assert.Equal(1, items[0]);
        Assert.Equal(2, items[1]);
        Assert.Equal(3, items[2]);
    }
}

/// <summary>
/// Tests for complex nested structures.
/// </summary>
public class ComplexStructureTests
{
    [Fact]
    public void Roundtrip_ComplexNestedStructure_PreservesAllData()
    {
        var original = new Dictionary<string, object?>
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

        var encoded = Codec.Encode(original);
        var decoded = Codec.Decode(encoded);
        var dict = Assert.IsType<Dictionary<string, object?>>(decoded);
        Assert.Equal(2, dict.Count);

        var users = Assert.IsType<List<object?>>(dict["users"]);
        Assert.Equal(2, users.Count);

        var user1 = Assert.IsType<Dictionary<string, object?>>(users[0]);
        Assert.Equal(1, user1["id"]);
        Assert.Equal("Alice", user1["name"]);

        var user2 = Assert.IsType<Dictionary<string, object?>>(users[1]);
        Assert.Equal(2, user2["id"]);
        Assert.Equal("Bob", user2["name"]);

        var metadata = Assert.IsType<Dictionary<string, object?>>(dict["metadata"]);
        Assert.Equal(1, metadata["version"]);
        Assert.Equal(2, metadata["count"]);
    }
}
