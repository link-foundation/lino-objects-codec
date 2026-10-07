using Xunit;

namespace Lino.Objects.Codec.Tests;

public class ValueHelpersTests
{
    [Fact]
    public void PublicValueHelpersPreserveText()
    {
        foreach (var value in new[] { "", "both \"quotes\" and 'quotes'", "line\n\nnext\r\n", "\\n %0A\t\0", "世界🌍" })
        {
            var line = Format.FormatValueSingleLine(value);
            Assert.DoesNotContain("\n", line);
            Assert.DoesNotContain("\r", line);
            Assert.Equal(value, Codec.DecodeLine(line));
            Assert.Equal(value, Codec.Decode(Format.FormatValueVerbatim(value)));
        }
    }
}
