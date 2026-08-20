// Tests for encoding/decoding objects with circular references.
//
// Object identity — shared nodes and cycles — is a property of the compact
// format, which names nodes with `obj_N` ids. These tests therefore encode with
// `Codec.EncodeCompact`; `Codec.Decode` reads either format back. The readable
// format writes a plain tree and rejects cycles, which the last tests cover.

using Xunit;
using Lino.Objects.Codec;

namespace Lino.Objects.Codec.Tests;

/// <summary>
/// Tests for circular reference handling.
/// </summary>
public class CircularReferencesTests
{
    [Fact]
    public void Roundtrip_SelfReferencingList_PreservesReference()
    {
        var lst = new List<object?>();
        lst.Add(lst);

        var encoded = Codec.EncodeCompact(lst);
        // Verify correct Links Notation format with built-in self-reference syntax
        Assert.Equal("(obj_0: list obj_0)", encoded);

        var decoded = Codec.Decode(encoded);

        // Check that it's a list containing itself
        var list = Assert.IsType<List<object?>>(decoded);
        Assert.Single(list);
        Assert.Same(list, list[0]);
    }

    [Fact]
    public void Roundtrip_SelfReferencingDict_PreservesReference()
    {
        var d = new Dictionary<string, object?>();
        d["self"] = d;

        var encoded = Codec.EncodeCompact(d);
        // Verify correct Links Notation format with built-in self-reference syntax
        Assert.Equal("(obj_0: dict ((str c2VsZg==) obj_0))", encoded);

        var decoded = Codec.Decode(encoded);

        // Check that it's a dict containing itself
        var dict = Assert.IsType<Dictionary<string, object?>>(decoded);
        Assert.Single(dict);
        Assert.True(dict.ContainsKey("self"));
        Assert.Same(dict, dict["self"]);
    }

    [Fact]
    public void Roundtrip_MutualReferenceLists_PreservesReferences()
    {
        var list1 = new List<object?> { 1, 2 };
        var list2 = new List<object?> { 3, 4 };
        list1.Add(list2);
        list2.Add(list1);

        var encoded = Codec.EncodeCompact(list1);
        // Multi-link format is used to avoid parser bug with nested self-references
        var expected = "(obj_0: list (int 1) (int 2) obj_1)\n(obj_1: list (int 3) (int 4) obj_0)";
        Assert.Equal(expected, encoded);

        var decoded = Codec.Decode(encoded);

        // Check the structure
        var decodedList = Assert.IsType<List<object?>>(decoded);
        Assert.Equal(3, decodedList.Count);
        Assert.Equal(1, decodedList[0]);
        Assert.Equal(2, decodedList[1]);

        var innerList = Assert.IsType<List<object?>>(decodedList[2]);
        Assert.Equal(3, innerList.Count);
        Assert.Equal(3, innerList[0]);
        Assert.Equal(4, innerList[1]);
        // Check circular reference
        Assert.Same(decodedList, innerList[2]);
    }

    [Fact]
    public void Roundtrip_MutualReferenceDicts_PreservesReferences()
    {
        var dict1 = new Dictionary<string, object?> { { "name", "dict1" } };
        var dict2 = new Dictionary<string, object?> { { "name", "dict2" } };
        dict1["other"] = dict2;
        dict2["other"] = dict1;

        var encoded = Codec.EncodeCompact(dict1);
        var decoded = Codec.Decode(encoded);

        // Check the structure
        var decodedDict = Assert.IsType<Dictionary<string, object?>>(decoded);
        Assert.Equal("dict1", decodedDict["name"]);

        var otherDict = Assert.IsType<Dictionary<string, object?>>(decodedDict["other"]);
        Assert.Equal("dict2", otherDict["name"]);

        // Check circular reference
        Assert.Same(decodedDict, otherDict["other"]);
    }

    [Fact]
    public void Roundtrip_ComplexCircularStructure_PreservesReferences()
    {
        // Create a tree-like structure with a back reference
        var root = new Dictionary<string, object?> { { "name", "root" }, { "children", new List<object?>() } };
        var child1 = new Dictionary<string, object?> { { "name", "child1" }, { "parent", root } };
        var child2 = new Dictionary<string, object?> { { "name", "child2" }, { "parent", root } };
        ((List<object?>)root["children"]!).Add(child1);
        ((List<object?>)root["children"]!).Add(child2);

        var encoded = Codec.EncodeCompact(root);
        var decoded = Codec.Decode(encoded);

        // Check the structure
        var decodedRoot = Assert.IsType<Dictionary<string, object?>>(decoded);
        Assert.Equal("root", decodedRoot["name"]);

        var children = Assert.IsType<List<object?>>(decodedRoot["children"]);
        Assert.Equal(2, children.Count);

        var decodedChild1 = Assert.IsType<Dictionary<string, object?>>(children[0]);
        Assert.Equal("child1", decodedChild1["name"]);

        var decodedChild2 = Assert.IsType<Dictionary<string, object?>>(children[1]);
        Assert.Equal("child2", decodedChild2["name"]);

        // Check circular references
        Assert.Same(decodedRoot, decodedChild1["parent"]);
        Assert.Same(decodedRoot, decodedChild2["parent"]);
    }

    [Fact]
    public void Roundtrip_ListWithMultipleReferencesToSameObject_PreservesIdentity()
    {
        var shared = new Dictionary<string, object?> { { "shared", "value" } };
        var lst = new List<object?> { shared, shared, shared };

        var encoded = Codec.EncodeCompact(lst);
        var decoded = Codec.Decode(encoded);

        // Check that all three items reference the same object
        var list = Assert.IsType<List<object?>>(decoded);
        Assert.Equal(3, list.Count);
        Assert.Same(list[0], list[1]);
        Assert.Same(list[1], list[2]);

        var decodedShared = Assert.IsType<Dictionary<string, object?>>(list[0]);
        Assert.Equal("value", decodedShared["shared"]);
    }

    [Fact]
    public void Roundtrip_DictWithMultipleReferencesToSameObject_PreservesIdentity()
    {
        var shared = new List<object?> { "shared", "list" };
        var d = new Dictionary<string, object?>
        {
            { "first", shared },
            { "second", shared },
            { "third", shared }
        };

        var encoded = Codec.EncodeCompact(d);
        var decoded = Codec.Decode(encoded);

        // Check that all three values reference the same object
        var dict = Assert.IsType<Dictionary<string, object?>>(decoded);
        Assert.Same(dict["first"], dict["second"]);
        Assert.Same(dict["second"], dict["third"]);

        var decodedShared = Assert.IsType<List<object?>>(dict["first"]);
        Assert.Equal(2, decodedShared.Count);
        Assert.Equal("shared", decodedShared[0]);
        Assert.Equal("list", decodedShared[1]);
    }

    [Fact]
    public void Roundtrip_DeeplyNestedCircularReference_PreservesReference()
    {
        var level1 = new Dictionary<string, object?> { { "level", 1 } };
        var level2 = new Dictionary<string, object?> { { "level", 2 }, { "parent", level1 } };
        var level3 = new Dictionary<string, object?> { { "level", 3 }, { "parent", level2 } };
        var level4 = new Dictionary<string, object?> { { "level", 4 }, { "parent", level3 } };
        level1["child"] = level2;
        level2["child"] = level3;
        level3["child"] = level4;
        // Create circular reference
        level4["root"] = level1;

        var encoded = Codec.EncodeCompact(level1);
        var decoded = Codec.Decode(encoded);

        // Navigate down the structure
        var decodedLevel1 = Assert.IsType<Dictionary<string, object?>>(decoded);
        Assert.Equal(1, decodedLevel1["level"]);

        var decodedLevel2 = Assert.IsType<Dictionary<string, object?>>(decodedLevel1["child"]);
        Assert.Equal(2, decodedLevel2["level"]);

        var decodedLevel3 = Assert.IsType<Dictionary<string, object?>>(decodedLevel2["child"]);
        Assert.Equal(3, decodedLevel3["level"]);

        var decodedLevel4 = Assert.IsType<Dictionary<string, object?>>(decodedLevel3["child"]);
        Assert.Equal(4, decodedLevel4["level"]);

        // Check circular reference back to root
        Assert.Same(decodedLevel1, decodedLevel4["root"]);
    }

    [Fact]
    public void ReadableFormat_RejectsSelfReferencingDict()
    {
        var d = new Dictionary<string, object?>();
        d["self"] = d;

        Assert.Throws<CircularReferenceException>(() => Codec.Encode(d));
    }

    [Fact]
    public void ReadableFormat_RejectsSelfReferencingList()
    {
        var lst = new List<object?>();
        lst.Add(lst);

        Assert.Throws<CircularReferenceException>(() => Codec.Encode(lst));
    }

    [Fact]
    public void ReadableFormat_WritesSharedObjectTwice()
    {
        var shared = new Dictionary<string, object?> { ["shared"] = "value" };
        var root = new Dictionary<string, object?> { ["a"] = shared, ["b"] = shared };

        var decoded = Assert.IsType<Dictionary<string, object?>>(Codec.Decode(Codec.Encode(root)));
        var a = Assert.IsType<Dictionary<string, object?>>(decoded["a"]);
        var b = Assert.IsType<Dictionary<string, object?>>(decoded["b"]);

        // Equal in content, but no longer the same node: the readable format has
        // no place for the `obj_N` id that names a shared one.
        Assert.Equal(a, b);
        Assert.NotSame(a, b);
    }
}
