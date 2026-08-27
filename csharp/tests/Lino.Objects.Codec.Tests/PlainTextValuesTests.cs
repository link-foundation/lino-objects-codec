// Real text stays real text in both readable forms (issue #45).
//
// Before the fix a single control character turned the whole string into
// base64: one newline in a log message hid the message, the stack trace and
// every word a reader would grep for. The readable forms now write the text as
// it is, and escape only the characters the form itself cannot carry.

using Xunit;
using Lino.Objects.Codec;

namespace Lino.Objects.Codec.Tests;

/// <summary>
/// Checks that the readable forms write text as text.
/// </summary>
public class PlainTextValuesTests
{
    /// <summary>A record of the shape a log line actually holds.</summary>
    private static Dictionary<string, object?> Message(string text) => new()
    {
        ["message"] = text,
    };

    /// <summary>How many times a piece of text occurs in another.</summary>
    private static int Occurrences(string haystack, string needle) =>
        haystack.Split(needle).Length - 1;

    /// <summary>Deep equality over the values these tests build.</summary>
    private static bool Same(object? left, object? right)
    {
        switch (left, right)
        {
            case (string a, string b):
                return a == b;
            case (int a, int b):
                return a == b;
            case (List<object?> a, List<object?> b):
                return a.Count == b.Count && a.Zip(b).All(pair => Same(pair.First, pair.Second));
            case (IDictionary<string, object?> a, IDictionary<string, object?> b):
                return a.Count == b.Count
                    && a.Keys.SequenceEqual(b.Keys)
                    && a.All(entry => Same(entry.Value, b[entry.Key]));
            default:
                return Equals(left, right);
        }
    }

    /// <summary>
    /// The reason for the issue: a log line holding a newline must stay greppable.
    /// </summary>
    [Fact]
    public void AMultiLineStringKeepsItsTextInTheIndentedForm()
    {
        var value = Message("line one\nline two");
        var encoded = Codec.Encode(value);

        Assert.Equal("(\n  message \"line one\nline two\"\n)", encoded);
        Assert.DoesNotContain("base64", encoded, StringComparison.Ordinal);
        Assert.Contains("line one", encoded, StringComparison.Ordinal);
        Assert.Contains("line two", encoded, StringComparison.Ordinal);
        Assert.True(Same(Codec.Decode(encoded), value));
    }

    /// <summary>
    /// On one line the record ends at the newline, so the newline -- and nothing
    /// else -- is escaped: the rest of the message stays as written.
    /// </summary>
    [Fact]
    public void OnlyTheNewlineIsEscapedInTheSingleLineForm()
    {
        var value = Message("line one\nline two");
        var line = Codec.EncodeLine(value);

        Assert.Equal("(o: (message (escaped \"line one%0Aline two\")))", line);
        Assert.DoesNotContain('\n', line);
        Assert.DoesNotContain("base64", line, StringComparison.Ordinal);
        Assert.True(Same(Codec.DecodeLine(line), value));
    }

    /// <summary>A tab is text a reader can see, so both forms keep it as it is.</summary>
    [Fact]
    public void ATabIsWrittenAsATabInBothForms()
    {
        var value = Message("a\tb");

        Assert.Equal("(\n  message \"a\tb\"\n)", Codec.Encode(value));
        Assert.Equal("(o: (message \"a\tb\"))", Codec.EncodeLine(value));
        Assert.True(Same(Codec.Decode(Codec.Encode(value)), value));
        Assert.True(Same(Codec.DecodeLine(Codec.EncodeLine(value)), value));
    }

    /// <summary>
    /// A carriage return is the one whitespace character a text file rewrites on
    /// its own -- CRLF normalisation would change the value -- so it is escaped.
    /// </summary>
    [Fact]
    public void ACarriageReturnIsEscapedSoCrlfNormalisationCannotRewriteIt()
    {
        var value = Message("first\r\nsecond");
        var encoded = Codec.Encode(value);

        Assert.Equal("(\n  message (escaped \"first%0D\nsecond\")\n)", encoded);
        Assert.True(Same(Codec.Decode(encoded), value));
    }

    /// <summary>
    /// The doubled-quote form desynchronises the notation's own parser, so a
    /// value holding both quote kinds is written with a run of delimiters instead.
    /// </summary>
    [Fact]
    public void AValueHoldingBothQuoteKindsUsesTheNQuoteForm()
    {
        var value = Message("both \"kinds\" of 'quotes'");
        var encoded = Codec.Encode(value);

        Assert.Contains(
            "\"\"\"both \"kinds\" of 'quotes'\"\"\"", encoded, StringComparison.Ordinal);
        Assert.DoesNotContain("\"\"kinds\"\"", encoded, StringComparison.Ordinal);
        Assert.True(Same(Codec.Decode(encoded), value));
    }

    /// <summary>
    /// A value that occurs twice is written twice: a shared reference would make
    /// a log line depend on another line, which a line-based reader cannot resolve.
    /// </summary>
    [Fact]
    public void ARepeatedValueIsWrittenOutEveryTime()
    {
        var value = new Dictionary<string, object?>
        {
            ["first"] = "same",
            ["second"] = "same",
            ["third"] = "same",
        };

        var encoded = Codec.Encode(value);
        Assert.Equal(3, Occurrences(encoded, "\"same\""));
        Assert.True(Same(Codec.Decode(encoded), value));

        var line = Codec.EncodeLine(value);
        Assert.Equal(3, Occurrences(line, "\"same\""));
        Assert.True(Same(Codec.DecodeLine(line), value));
    }

    /// <summary>
    /// A key is escaped like any other text, and stays a key rather than turning
    /// the object it belongs to into an array.
    /// </summary>
    [Fact]
    public void AKeyHoldingAControlCharacterStaysAKey()
    {
        var value = new Dictionary<string, object?> { ["a\u0000b"] = 1 };

        Assert.True(Same(Codec.Decode(Codec.Encode(value)), value));
        Assert.True(Same(Codec.DecodeLine(Codec.EncodeLine(value)), value));
    }

    /// <summary>Documents written by earlier versions keep decoding.</summary>
    [Fact]
    public void ThePreviousBase64MarkerStillDecodes()
    {
        var decoded = Codec.Decode("(\n  message (base64 \"bGluZTEKbGluZTI=\")\n)");
        Assert.True(Same(decoded, Message("line1\nline2")));
    }

    /// <summary>Every kind of text a value may hold.</summary>
    public static IEnumerable<object[]> EveryKindOfText() =>
        new[]
        {
            string.Empty,
            "plain",
            "with spaces",
            "it's",
            "he said \"hello\"",
            "both \"kinds\" of 'quotes'",
            "\"leading quote",
            "trailing quote\"",
            "a\"\"b",
            "a\"\"\"b'c",
            "'\"",
            "\"'",
            "line one\nline two",
            "trailing newline\n",
            "\ttab",
            "carriage\rreturn",
            "null\u0000byte",
            "escape\u001b[0m",
            "next\u0085line",
            "unicode: 你好世界 🌍",
            "percent %0A not an escape",
            "(parens) and: colons",
            "base64",
            "escaped",
            "o:",
        }.Select(text => new object[] { text });

    /// <summary>
    /// Every value the readable forms write must read back unchanged, whatever
    /// quotes, newlines and control characters it holds.
    /// </summary>
    [Theory]
    [MemberData(nameof(EveryKindOfText))]
    public void EveryKindOfTextRoundtripsThroughBothForms(string text)
    {
        var shapes = new object?[]
        {
            text,
            Message(text),
            new Dictionary<string, object?> { [text] = text },
            new List<object?> { text },
        };

        foreach (var value in shapes)
        {
            var encoded = Codec.Encode(value);
            Assert.True(Same(Codec.Decode(encoded), value), $"indented roundtrip failed: {encoded}");

            var line = Codec.EncodeLine(value);
            Assert.DoesNotContain('\n', line);
            Assert.True(Same(Codec.DecodeLine(line), value), $"single-line roundtrip failed: {line}");
        }
    }
}
