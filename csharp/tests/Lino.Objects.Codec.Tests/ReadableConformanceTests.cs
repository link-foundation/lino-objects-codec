// Cross-language conformance tests for the readable format, indented and on a
// single line.
//
// The fixtures in fixtures/readable-format/cases.json are shared by the
// JavaScript, Python, Rust and C# suites. Each case is written by hand from the
// format specification, so the four implementations check each other instead of
// agreeing on a shared mistake: every language must encode `value` to exactly
// `text` and to exactly `line`, and decode both back to exactly `value`.

using System.Globalization;
using System.Text.Json;
using Xunit;
using Lino.Objects.Codec;

namespace Lino.Objects.Codec.Tests;

/// <summary>
/// Runs the shared readable-format conformance fixtures against the C# codec.
/// </summary>
public class ReadableConformanceTests
{
    /// <summary>The language id this suite answers to in a case's <c>skip</c> map.</summary>
    private const string Language = "csharp";

    private static readonly string FixturesPath = FindFixtures();

    private static string FindFixtures()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null)
        {
            var candidate = Path.Combine(dir.FullName, "fixtures", "readable-format", "cases.json");
            if (File.Exists(candidate))
            {
                return candidate;
            }
            dir = dir.Parent;
        }
        throw new FileNotFoundException("cannot locate fixtures/readable-format/cases.json");
    }

    private static JsonElement Section(string key)
    {
        using var document = JsonDocument.Parse(File.ReadAllText(FixturesPath));
        return document.RootElement.GetProperty(key).Clone();
    }

    private static JsonElement Cases() => Section("cases");

    /// <summary>
    /// Build a C# value from the fixtures' tagged encoding. A value is a
    /// single-key object naming its type, so a string "42" and the number 42
    /// stay distinguishable in JSON.
    /// </summary>
    private static object? Build(JsonElement value)
    {
        var property = value.EnumerateObject().Single();
        var payload = property.Value;
        switch (property.Name)
        {
            case "null":
                return null;
            case "bool":
                return payload.GetBoolean();
            case "int":
                return (int)payload.GetInt64();
            case "float":
                return payload.ValueKind == JsonValueKind.String
                    ? payload.GetString() switch
                    {
                        "NaN" => double.NaN,
                        "Infinity" => double.PositiveInfinity,
                        "-Infinity" => double.NegativeInfinity,
                        var other => throw new FormatException($"unknown float name {other}"),
                    }
                    : payload.GetDouble();
            case "str":
                return payload.GetString();
            case "array":
                return payload.EnumerateArray().Select(Build).ToList();
            case "object":
                var dict = new Dictionary<string, object?>();
                foreach (var pair in payload.EnumerateArray())
                {
                    var items = pair.EnumerateArray().ToArray();
                    dict[items[0].GetString()!] = Build(items[1]);
                }
                return dict;
            default:
                throw new FormatException($"unknown value tag {property.Name}");
        }
    }

    /// <summary>
    /// Compare two decoded values, treating NaN as equal to itself and object
    /// key order as significant -- key order is part of the document.
    /// </summary>
    private static bool Same(object? left, object? right)
    {
        switch (left, right)
        {
            case (null, null):
                return true;
            case (bool a, bool b):
                return a == b;
            case (int a, int b):
                return a == b;
            case (long a, long b):
                return a == b;
            case (double a, double b):
                return (double.IsNaN(a) && double.IsNaN(b)) || a.Equals(b);
            case (string a, string b):
                return a == b;
            case (List<object?> a, List<object?> b):
                return a.Count == b.Count && a.Zip(b).All(pair => Same(pair.First, pair.Second));
            case (IDictionary<string, object?> a, IDictionary<string, object?> b):
                return a.Count == b.Count
                    && a.Keys.SequenceEqual(b.Keys)
                    && a.All(entry => Same(entry.Value, b[entry.Key]));
            default:
                return false;
        }
    }

    private static bool IsSkipped(JsonElement @case) =>
        @case.TryGetProperty("skip", out var skip)
        && skip.TryGetProperty(Language, out _);

    public static IEnumerable<object[]> AllCases()
    {
        foreach (var @case in Cases().EnumerateArray())
        {
            yield return new object[] { @case.GetProperty("name").GetString()!, @case.Clone() };
        }
    }

    /// <summary>The documents an earlier version of this format wrote.</summary>
    public static IEnumerable<object[]> LegacyCases()
    {
        foreach (var @case in Section("legacy").EnumerateArray())
        {
            yield return new object[] { @case.GetProperty("name").GetString()!, @case.Clone() };
        }
    }

    [Fact]
    public void EveryCaseIsEitherActiveOrSkippedWithAReason()
    {
        var cases = Cases().EnumerateArray().ToArray();
        Assert.NotEmpty(cases);
        foreach (var @case in cases)
        {
            if (!@case.TryGetProperty("skip", out var skip))
            {
                continue;
            }
            foreach (var language in skip.EnumerateObject())
            {
                Assert.Contains(language.Name, new[] { "js", "python", "rust", "csharp" });
                Assert.True(
                    (language.Value.GetString() ?? "").Length > 20,
                    $"case {@case.GetProperty("name").GetString()} skips {language.Name} without explaining why");
            }
        }
    }

    [Theory]
    [MemberData(nameof(AllCases))]
    public void EncodesEachCaseToTheSharedText(string name, JsonElement @case)
    {
        _ = name;
        if (IsSkipped(@case))
        {
            return;
        }
        var encoded = Codec.Encode(Build(@case.GetProperty("value")));
        Assert.Equal(@case.GetProperty("text").GetString(), encoded);
    }

    [Theory]
    [MemberData(nameof(AllCases))]
    public void DecodesEachSharedTextBackToTheCaseValue(string name, JsonElement @case)
    {
        _ = name;
        if (IsSkipped(@case))
        {
            return;
        }
        var expected = Build(@case.GetProperty("value"));
        var decoded = Codec.Decode(@case.GetProperty("text").GetString()!);
        Assert.True(Same(expected, decoded), $"case {name} decoded to a different value");
    }

    [Theory]
    [MemberData(nameof(AllCases))]
    public void EncodesEachCaseToTheSharedLine(string name, JsonElement @case)
    {
        _ = name;
        if (IsSkipped(@case))
        {
            return;
        }
        var encoded = Codec.EncodeLine(Build(@case.GetProperty("value")));
        Assert.Equal(@case.GetProperty("line").GetString(), encoded);
    }

    [Theory]
    [MemberData(nameof(AllCases))]
    public void DecodesEachSharedLineBackToTheCaseValue(string name, JsonElement @case)
    {
        if (IsSkipped(@case))
        {
            return;
        }
        var expected = Build(@case.GetProperty("value"));
        var decoded = Codec.DecodeLine(@case.GetProperty("line").GetString()!);
        Assert.True(Same(expected, decoded), $"case {name} decoded to a different value");
    }

    /// <summary>A log record is one line, so no case may spread over two of them.</summary>
    [Theory]
    [MemberData(nameof(AllCases))]
    public void NoSharedLineContainsALineBreak(string name, JsonElement @case)
    {
        var line = @case.GetProperty("line").GetString()!;
        Assert.True(
            !line.Contains('\n') && !line.Contains('\r'),
            $"case {name} has a line break in its single-line form");
    }

    /// <summary>
    /// <see cref="Codec.Decode"/> reads both forms, so a log reader needs no flag
    /// saying which one it holds.
    /// </summary>
    [Theory]
    [MemberData(nameof(AllCases))]
    public void ThePlainDecoderReadsEachSharedLine(string name, JsonElement @case)
    {
        if (IsSkipped(@case))
        {
            return;
        }
        var expected = Build(@case.GetProperty("value"));
        var decoded = Codec.Decode(@case.GetProperty("line").GetString()!);
        Assert.True(Same(expected, decoded), $"case {name} decoded to a different value");
    }

    /// <summary>
    /// Documents written before this format wrote text as text keep decoding, so
    /// upgrading a reader never loses a stored record.
    /// </summary>
    [Theory]
    [MemberData(nameof(LegacyCases))]
    public void DecodesTheDocumentsAnEarlierVersionWrote(string name, JsonElement @case)
    {
        var expected = Build(@case.GetProperty("value"));
        var decoded = Codec.Decode(@case.GetProperty("text").GetString()!);
        Assert.True(Same(expected, decoded), $"legacy case {name} decoded to a different value");
    }

    /// <summary>
    /// The point of the change: an implementation may not reach for base64 while
    /// writing a readable document, whatever the text holds.
    /// </summary>
    [Theory]
    [MemberData(nameof(AllCases))]
    public void NoSharedDocumentHidesItsTextInBase64(string name, JsonElement @case)
    {
        Assert.DoesNotContain(
            "base64 \"", @case.GetProperty("text").GetString()!, StringComparison.Ordinal);
        Assert.DoesNotContain(
            "base64 \"", @case.GetProperty("line").GetString()!, StringComparison.Ordinal);
        Assert.NotEqual(string.Empty, name);
    }
}
