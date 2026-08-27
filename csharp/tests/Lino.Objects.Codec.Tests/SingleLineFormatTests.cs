// Tests for the readable, single-line format produced by EncodeLine (issue #43).
//
// An append-only log wants one record per line: appending is one write,
// compaction cuts at a newline, and `grep`, `tail -f` and `wc -l` all treat a
// line as an event. Encode spreads a record over many lines and EncodeCompact
// hides it in base64, so neither serves that reader.

using Xunit;
using Link.Foundation.Links.Notation;
using Lino.Objects.Codec;

namespace Lino.Objects.Codec.Tests;

/// <summary>
/// Checks the single-line form: one record, one line, read back exactly.
/// </summary>
public class SingleLineFormatTests
{
    /// <summary>A record of the shape an append-only log actually holds.</summary>
    private static Dictionary<string, object?> LogRecord() => new()
    {
        ["bytes"] = 2827,
        ["complete"] = true,
        ["server"] = new Dictionary<string, object?>
        {
            ["host"] = "127.0.0.1",
            ["port"] = 18878,
        },
        ["models"] = new List<object?> { "claude-haiku", "claude-opus" },
    };

    /// <summary>The dialect a downstream project invented for the same need.</summary>
    private const string HandRolledDialect = "((:\"bytes\" 2827) (:\"complete\" true))";

    [Fact]
    public void ARecordIsWrittenOnOneLine()
    {
        var line = Codec.EncodeLine(LogRecord());
        Assert.DoesNotContain('\n', line);
        Assert.DoesNotContain('\r', line);
        Assert.Equal(
            "(o: (bytes 2827) (complete true) (server (o: (host \"127.0.0.1\") (port 18878))) "
                + "(models (\"claude-haiku\" \"claude-opus\")))",
            line);
    }

    [Fact]
    public void ALineIsValidLinksNotation()
    {
        var line = Codec.EncodeLine(LogRecord());
        var links = new Parser().Parse(line);
        Assert.NotNull(links);
        Assert.NotEmpty(links);
    }

    /// <summary>
    /// The hand-rolled dialect is what this format replaces: it does not read
    /// back as the record it was written from.
    /// </summary>
    [Fact]
    public void TheHandRolledDialectIsNotReadAsARecord()
    {
        var decoded = Codec.Decode(HandRolledDialect);
        Assert.False(
            decoded is IDictionary<string, object?> dict
                && dict.ContainsKey("bytes")
                && dict.ContainsKey("complete"),
            $"the hand-rolled dialect unexpectedly read back as a record: {decoded}");
    }

    [Fact]
    public void BothFormsOfTheSameValueDecodeAlike()
    {
        var values = new object?[]
        {
            LogRecord(),
            new List<object?>(),
            new Dictionary<string, object?>(),
            new List<object?> { new Dictionary<string, object?>(), new List<object?>() },
            new Dictionary<string, object?> { ["empty"] = new List<object?>() },
            42,
            null,
        };

        foreach (var value in values)
        {
            var fromLine = Codec.Decode(Codec.EncodeLine(value));
            var fromText = Codec.Decode(Codec.Encode(value));
            Assert.True(Equivalent(fromLine, fromText), $"the two forms disagree about {value}");
            Assert.True(Equivalent(Codec.DecodeLine(Codec.EncodeLine(value)), value));
        }
    }

    [Fact]
    public void AStringKeepsItsOwnCharactersOnOneLine()
    {
        var value = new Dictionary<string, object?> { ["text"] = "quote \" backslash \\ ünïcödé" };
        var line = Codec.EncodeLine(value);
        Assert.Equal("(o: (text 'quote \" backslash \\ ünïcödé'))", line);
        Assert.True(Equivalent(Codec.DecodeLine(line), value));
    }

    /// <summary>
    /// A newline inside a string would end the record, so such a string is the
    /// one thing written encoded -- individually, so the rest stays readable.
    /// </summary>
    [Fact]
    public void AStringHoldingANewlineStillFitsOnOneLine()
    {
        var value = new Dictionary<string, object?>
        {
            ["readable"] = "still visible",
            ["multiline"] = "line1\nline2",
        };
        var line = Codec.EncodeLine(value);
        Assert.Equal(
            "(o: (readable \"still visible\") (multiline (base64 \"bGluZTEKbGluZTI=\")))",
            line);
        Assert.DoesNotContain('\n', line);
        Assert.True(Equivalent(Codec.DecodeLine(line), value));
    }

    /// <summary>
    /// The one ambiguity a flat layout has: is <c>(a 1)</c> a one-pair object or
    /// a two-element array? On one line an object says so with the <c>o:</c>
    /// marker, so both values keep their own spelling.
    /// </summary>
    [Fact]
    public void AOnePairObjectIsNotATwoElementArray()
    {
        var @object = new Dictionary<string, object?> { ["a"] = 1 };
        var array = new List<object?> { "a", 1 };

        Assert.Equal("(o: (a 1))", Codec.EncodeLine(@object));
        Assert.Equal("(\"a\" 1)", Codec.EncodeLine(array));
        Assert.True(Equivalent(Codec.DecodeLine("(o: (a 1))"), @object));
        Assert.True(Equivalent(Codec.DecodeLine("(\"a\" 1)"), array));
    }

    /// <summary>
    /// Because the marker answers it, the empty key round-trips instead of being
    /// rejected: <c>("" 2)</c> is a pair like any other inside a marked object.
    /// </summary>
    [Fact]
    public void TheEmptyKeySurvivesTheRoundTrip()
    {
        var value = new Dictionary<string, object?> { [""] = 2 };
        Assert.Equal("(o: (\"\" 2))", Codec.EncodeLine(value));
        Assert.True(Equivalent(Codec.DecodeLine(Codec.EncodeLine(value)), value));
    }

    [Fact]
    public void AMarkedObjectHoldingSomethingThatIsNotAPairIsRejected()
    {
        var error = Assert.Throws<FormatException>(() => Codec.DecodeLine("(o: 1 2)"));
        Assert.Contains("pairs", error.Message, StringComparison.Ordinal);
    }

    /// <summary>
    /// Reading a log means handing over one record at a time, so a decoder that
    /// silently accepted two lines would merge two records into one value.
    /// </summary>
    [Fact]
    public void SeveralLinesAreNotOneRecord()
    {
        Assert.Throws<FormatException>(() => Codec.DecodeLine("(o: (a 1))\n(o: (b 2))"));
    }

    /// <summary>
    /// A trailing newline is what a line reader may keep, so it is trimmed rather
    /// than refused.
    /// </summary>
    [Fact]
    public void ATrailingNewlineIsNotASecondRecord()
    {
        var decoded = Codec.DecodeLine("(o: (a 1))\n");
        Assert.True(Equivalent(decoded, new Dictionary<string, object?> { ["a"] = 1 }));
    }

    /// <summary>
    /// A line whose first value is null is a readable line, not the compact null:
    /// Decode must not route it to the base64 reader.
    /// </summary>
    [Fact]
    public void ALineStartingWithNullIsStillReadAsALine()
    {
        Assert.True(Equivalent(Codec.Decode("(null 1)"), new List<object?> { null, 1 }));
        Assert.True(Equivalent(
            Codec.Decode("(o: (a null))"),
            new Dictionary<string, object?> { ["a"] = null }));
        // The one document both forms claim: `(null)` is the compact null, and
        // stays read that way, so documents written before this format keep
        // decoding.
        Assert.Null(Codec.Decode("(null)"));
    }

    /// <summary>
    /// The JavaScript sibling trimmed the framing newlines with a regular
    /// expression that backtracked once per newline (CodeQL js/polynomial-redos).
    /// Every language strips them with a linear scan instead, and still refuses
    /// input holding more than one line.
    /// </summary>
    [Fact]
    public void ALongRunOfLineBreaksIsRejectedWithoutASlowdown()
    {
        var notation = Codec.EncodeLine(LogRecord()) + new string('\n', 200_000) + "x";
        var started = System.Diagnostics.Stopwatch.StartNew();
        Assert.Throws<FormatException>(() => Codec.DecodeLine(notation));
        Assert.True(started.Elapsed < TimeSpan.FromSeconds(2), $"took {started.Elapsed}");
    }

    /// <summary>Structural comparison, since dictionaries and lists compare by reference.</summary>
    private static bool Equivalent(object? left, object? right)
    {
        switch (left, right)
        {
            case (null, null):
                return true;
            case (IDictionary<string, object?> a, IDictionary<string, object?> b):
                return a.Count == b.Count
                    && a.Keys.SequenceEqual(b.Keys)
                    && a.All(entry => Equivalent(entry.Value, b[entry.Key]));
            case (System.Collections.IEnumerable a and not string, System.Collections.IEnumerable b and not string):
                var left_items = a.Cast<object?>().ToList();
                var right_items = b.Cast<object?>().ToList();
                return left_items.Count == right_items.Count
                    && left_items.Zip(right_items).All(pair => Equivalent(pair.First, pair.Second));
            default:
                return Equals(left, right);
        }
    }
}
