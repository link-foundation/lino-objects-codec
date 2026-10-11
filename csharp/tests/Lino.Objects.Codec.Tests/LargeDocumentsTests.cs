using Xunit;
using Lino.Objects.Codec;

namespace Lino.Objects.Codec.Tests;

/// <summary>Finite large-document and Unicode regressions for issue #68.</summary>
public class LargeDocumentsTests
{
    [Fact]
    public void TokenizingDoesNotCopyTheWholeDocument()
    {
        var notation = new string(' ', 4 * 1024 * 1024) + "42";
        _ = Codec.Decode("42");
        var before = GC.GetAllocatedBytesForCurrentThread();
        var restored = Codec.Decode(notation);
        var allocated = GC.GetAllocatedBytesForCurrentThread() - before;
        Assert.Equal(42, restored);
        Assert.True(allocated < 1024 * 1024, $"allocated {allocated} bytes");
    }

    [Fact]
    public void LargeValuesAndEveryQuoteDelimiterKeepUnicode()
    {
        var text = new string('a', 1024 * 1024) + "🍫\r%";
        Assert.Equal(text, Codec.Decode(Codec.Encode(text)));
        Assert.Equal(text, Codec.DecodeLine(Codec.EncodeLine(text)));
        foreach (var quote in new[] { '"', '\'', '`' })
        {
            Assert.Equal($"legacy {quote}🍫{quote} end", Codec.Decode($"{quote}legacy {quote}{quote}🍫{quote}{quote} end{quote}"));
            Assert.Equal($"🍫{quote}", Codec.Decode($"{quote}{quote}{quote}🍫{quote}{quote}{quote}{quote}"));
            Assert.Throws<FormatException>(() => Codec.Decode($"{quote}{quote}{quote}🍫{quote}{quote}"));
        }
    }

    [Theory]
    [InlineData(65529)]
    [InlineData(65530)]
    [InlineData(65531)]
    [InlineData(65532)]
    [InlineData(65533)]
    [InlineData(65534)]
    [InlineData(65535)]
    [InlineData(65536)]
    public void EscapedUnicodeSpansByteChunks(int offset)
    {
        var prefix = new string('a', offset);
        foreach (var unicode in new[] { "🍫", "%F0%9F%8D%AB" })
        {
            Assert.Equal($"{prefix}🍫\r", Codec.Decode($"(escaped \"{prefix}{unicode}%0D\")"));
        }
    }

    [Theory]
    [InlineData("%F0%9F")]
    [InlineData("%FF")]
    [InlineData("%C0%AF")]
    [InlineData("%ED%A0%80")]
    [InlineData("%80")]
    [InlineData("%0")]
    [InlineData("%GG")]
    public void InvalidEscapesDoNotContaminateTheNextValue(string payload)
    {
        Assert.Throws<FormatException>(() => Codec.Decode($"(escaped \"{payload}\")"));
        Assert.Equal("🍫", Codec.Decode("(escaped \"%F0%9F%8D%AB\")"));
        Assert.Equal("\uFEFFtext\uFEFF", Codec.Decode("(escaped \"%EF%BB%BFtext%EF%BB%BF\")"));
    }

    [Fact]
    public void InvalidLiteralSurrogatesKeepTheirReplacementBehavior()
    {
        var prefix = new string('a', 65529);
        Assert.Equal($"{prefix}\uFFFD日\r", Codec.Decode($"(escaped \"{prefix}\ud800日%0D\")"));
    }
}
