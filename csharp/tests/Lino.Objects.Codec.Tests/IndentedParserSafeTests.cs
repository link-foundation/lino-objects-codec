using System.Text.Json;
using Link.Foundation.Links.Notation;
using Xunit;
using Lino.Objects.Codec;

namespace Lino.Objects.Codec.Tests;

/// <summary>
/// The indented format must read back unchanged with the plain links-notation Parser (issue #94).
/// </summary>
public class IndentedParserSafeTests
{
    private static readonly Parser PlainParser = new();

    private static List<(string Name, string Value)> Cases(string name)
    {
        var root = new DirectoryInfo(AppContext.BaseDirectory);
        while (root is not null && !Directory.Exists(Path.Combine(root.FullName, "fixtures")))
        {
            root = root.Parent;
        }
        Assert.NotNull(root);
        using var cases = JsonDocument.Parse(File.ReadAllText(
            Path.Combine(root.FullName, "fixtures", "indented-format", name)));
        return cases.RootElement.EnumerateArray()
            .Select(item => (item.GetProperty("name").GetString()!, item.GetProperty("value").GetString()!))
            .ToList();
    }

    /// <summary>Read <c>key value</c> pairs the way any links-notation reader sees them.</summary>
    private static List<(string?, string?)> PlainPairs(string text)
    {
        var newline = text.IndexOf('\n');
        var links = PlainParser.Parse(text[..newline] + ":\n" + text[(newline + 1)..]);
        Assert.Single(links);
        return links[0].Values!.Select(child =>
        {
            Assert.Equal(2, child.Values!.Count);
            return (child.Values[0].Id, child.Values[1].Id);
        }).ToList();
    }

    [Fact]
    public void ParserReadsFormatIndentedOutput()
    {
        foreach (var (name, value) in Cases("parser-safe.json").Concat(Cases("strings.json")))
        {
            (string Key, string? Value)[] pairs = [("k", value), (value, value), ("z", value)];
            var text = Format.FormatIndentedOrdered("root", pairs);
            Assert.True(
                pairs.Select(p => ((string?)p.Key, p.Value)).SequenceEqual(PlainPairs(text)),
                $"{name}: {text}");
            var (id, obj) = Format.ParseIndented(text);
            Assert.Equal("root", id);
            Assert.Equal(pairs.ToDictionary(p => p.Key, p => p.Value), obj);
        }
    }

    [Fact]
    public void EmptyValuesDoNotSwallowFollowingLines()
    {
        var text = Format.FormatIndentedOrdered("doc", [("a", ""), ("b", ""), ("#k", "#v"), ("c", "end")]);
        Assert.Equal("doc\n  a ~1{}\n  b ~1{}\n  '#k' \"#v\"\n  c \"end\"", text);
        var (_, obj) = Format.ParseIndented(text);
        Assert.Equal(
            new Dictionary<string, string?> { ["a"] = "", ["b"] = "", ["#k"] = "#v", ["c"] = "end" },
            obj);
    }

    [Fact]
    public void ParseIndentedStillReadsLegacyEmptyQuotes()
    {
        var (_, obj) = Format.ParseIndented("doc\n  a \"\"");
        Assert.Equal("", obj["a"]);
    }

    [Fact]
    public void EscapeReferenceIsParserSafe()
    {
        Assert.Equal("~1{}", Format.EscapeReference(""));
        Assert.Equal("'#x'", Format.EscapeReference("#x"));
        Assert.Equal("issue#1", Format.EscapeReference("issue#1"));
        Assert.Equal("'~1{61}'", Format.EscapeReference("~1{61}"));
        Assert.Equal("`'\"`", Format.EscapeReference("'\""));
        Assert.Equal("\"'\"\"`\"", Format.EscapeReference("'\"`"));
        Assert.Equal("~1{276022}", Format.EscapeReference("'`\""));
        foreach (var (name, value) in Cases("parser-safe.json"))
        {
            var escaped = Format.EscapeReference(value);
            var links = PlainParser.Parse($"(k {escaped})");
            Assert.True(links[0].Values!.Count == 2, $"{name}: {escaped}");
            Assert.True(value == links[0].Values![1].Id, $"{name}: {escaped}");
        }
    }
}
