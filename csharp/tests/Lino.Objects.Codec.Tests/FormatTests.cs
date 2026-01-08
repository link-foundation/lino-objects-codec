// Tests for Format class (FormatIndented, ParseIndented)

using Xunit;
using Lino.Objects.Codec;

namespace Lino.Objects.Codec.Tests;

public class FormatTests
{
    [Fact]
    public void EscapeReference_SimpleString()
    {
        Assert.Equal("hello", Format.EscapeReference("hello"));
        Assert.Equal("world", Format.EscapeReference("world"));
    }

    [Fact]
    public void EscapeReference_StringWithSpaces()
    {
        var result = Format.EscapeReference("hello world");
        Assert.True(result.StartsWith("'") || result.StartsWith("\""));
        Assert.Contains("hello world", result);
    }

    [Fact]
    public void EscapeReference_StringWithSingleQuotes()
    {
        var result = Format.EscapeReference("it's");
        Assert.Equal("\"it's\"", result);
    }

    [Fact]
    public void EscapeReference_StringWithDoubleQuotes()
    {
        var result = Format.EscapeReference("he said \"hello\"");
        Assert.Equal("'he said \"hello\"'", result);
    }

    [Fact]
    public void UnescapeReference_DoubledQuotes()
    {
        Assert.Equal("he said \"hello\"", Format.UnescapeReference("he said \"\"hello\"\""));
        Assert.Equal("it's", Format.UnescapeReference("it''s"));
    }

    [Fact]
    public void FormatIndentedOrdered_Basic()
    {
        var pairs = new (string Key, string? Value)[]
        {
            ("uuid", "6dcf4c1b-ff3f-482c-95ab-711ea7d1b019"),
            ("status", "executed"),
            ("command", "echo test"),
            ("exitCode", "0")
        };
        var result = Format.FormatIndentedOrdered("6dcf4c1b-ff3f-482c-95ab-711ea7d1b019", pairs);
        var lines = result.Split('\n');
        Assert.Equal("6dcf4c1b-ff3f-482c-95ab-711ea7d1b019", lines[0]);
        Assert.Equal("  uuid \"6dcf4c1b-ff3f-482c-95ab-711ea7d1b019\"", lines[1]);
        Assert.Equal("  status \"executed\"", lines[2]);
        Assert.Equal("  command \"echo test\"", lines[3]);
        Assert.Equal("  exitCode \"0\"", lines[4]);
    }

    [Fact]
    public void FormatIndentedOrdered_CustomIndentation()
    {
        var pairs = new (string Key, string? Value)[] { ("key", "value") };
        var result = Format.FormatIndentedOrdered("test-id", pairs, "    ");
        var lines = result.Split('\n');
        Assert.Equal("test-id", lines[0]);
        Assert.Equal("    key \"value\"", lines[1]);
    }

    [Fact]
    public void FormatIndentedOrdered_ValueWithQuotes()
    {
        // Values containing double quotes are wrapped in single quotes (links-notation style)
        var pairs = new (string Key, string? Value)[] { ("message", "He said \"hello\"") };
        var result = Format.FormatIndentedOrdered("test-id", pairs);
        var lines = result.Split('\n');
        Assert.Equal("  message 'He said \"hello\"'", lines[1]);
    }

    [Fact]
    public void FormatIndented_RequiresId()
    {
        var obj = new Dictionary<string, string?> { { "key", "value" } };
        Assert.Throws<ArgumentException>(() => Format.FormatIndented("", obj));
    }

    [Fact]
    public void ParseIndented_Basic()
    {
        var text = "6dcf4c1b-ff3f-482c-95ab-711ea7d1b019\n  uuid \"6dcf4c1b-ff3f-482c-95ab-711ea7d1b019\"\n  status \"executed\"\n  exitCode \"0\"";
        var (id, obj) = Format.ParseIndented(text);
        Assert.Equal("6dcf4c1b-ff3f-482c-95ab-711ea7d1b019", id);
        Assert.Equal("6dcf4c1b-ff3f-482c-95ab-711ea7d1b019", obj["uuid"]);
        Assert.Equal("executed", obj["status"]);
        Assert.Equal("0", obj["exitCode"]);
    }

    [Fact]
    public void ParseIndented_WithQuotes()
    {
        // Links-notation style: use single quotes to wrap value containing double quotes
        var text = "test-id\n  message 'He said \"hello\"'";
        var (id, obj) = Format.ParseIndented(text);
        Assert.Equal("test-id", id);
        Assert.Equal("He said \"hello\"", obj["message"]);
    }

    [Fact]
    public void ParseIndented_EmptyLinesSkipped()
    {
        var text = "test-id\n\n  key \"value\"\n\n  another \"value2\"";
        var (id, obj) = Format.ParseIndented(text);
        Assert.Equal("test-id", id);
        Assert.Equal("value", obj["key"]);
        Assert.Equal("value2", obj["another"]);
    }

    [Fact]
    public void ParseIndented_RequiresText()
    {
        Assert.Throws<ArgumentException>(() => Format.ParseIndented(""));
    }

    [Fact]
    public void RoundtripFormatIndented_Basic()
    {
        var pairs = new (string Key, string? Value)[]
        {
            ("uuid", "6dcf4c1b-ff3f-482c-95ab-711ea7d1b019"),
            ("status", "executed"),
            ("command", "echo test"),
            ("exitCode", "0")
        };
        var formatted = Format.FormatIndentedOrdered("6dcf4c1b-ff3f-482c-95ab-711ea7d1b019", pairs);
        var (parsedId, parsedObj) = Format.ParseIndented(formatted);

        Assert.Equal("6dcf4c1b-ff3f-482c-95ab-711ea7d1b019", parsedId);
        foreach (var (key, value) in pairs)
        {
            Assert.Equal(value, parsedObj[key]);
        }
    }

    [Fact]
    public void RoundtripFormatIndented_WithQuotes()
    {
        var pairs = new (string Key, string? Value)[] { ("message", "He said \"hello\"") };
        var formatted = Format.FormatIndentedOrdered("test-id", pairs);
        var (parsedId, parsedObj) = Format.ParseIndented(formatted);

        Assert.Equal("test-id", parsedId);
        Assert.Equal("He said \"hello\"", parsedObj["message"]);
    }

    [Fact]
    public void FormatIndented_WithNullValue()
    {
        var obj = new Dictionary<string, string?> { { "key", null } };
        var result = Format.FormatIndented("test-id", obj);
        var lines = result.Split('\n');
        Assert.Equal("  key \"null\"", lines[1]);
    }

    [Fact]
    public void ParseIndented_NullValue()
    {
        var text = "test-id\n  key \"null\"";
        var (_, obj) = Format.ParseIndented(text);
        Assert.Null(obj["key"]);
    }
}
