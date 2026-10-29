using System.Text.Json;
using Xunit;
using Lino.Objects.Codec;

namespace Lino.Objects.Codec.Tests;

public class IndentedMultilineTests
{
    [Fact]
    public void SharedIndentedStringsRoundtrip()
    {
        var root = new DirectoryInfo(AppContext.BaseDirectory);
        while (root is not null && !Directory.Exists(Path.Combine(root.FullName, "fixtures")))
        {
            root = root.Parent;
        }
        Assert.NotNull(root);
        using var cases = JsonDocument.Parse(File.ReadAllText(
            Path.Combine(root.FullName, "fixtures", "indented-format", "strings.json")));
        foreach (var item in cases.RootElement.EnumerateArray())
        {
            var value = item.GetProperty("value").GetString()!;
            var original = new Dictionary<string, string?> { ["t"] = value, ["after"] = "unchanged" };
            var ordered = Format.FormatIndentedOrdered("doc", [("t", value), ("after", "unchanged")]);
            foreach (var text in new[] { ordered, Format.FormatIndented("doc", original) })
            {
                var (id, actual) = Format.ParseIndented(text);
                Assert.Equal("doc", id);
                Assert.Equal(original, actual);
                var standard = "\n\ndoc:\n" + text[(text.IndexOf('\n') + 1)..] + "\n\n";
                var (standardId, standardActual) = Format.ParseIndented(standard);
                Assert.Equal("doc", standardId);
                Assert.Equal(original, standardActual);
            }
        }
    }
}
