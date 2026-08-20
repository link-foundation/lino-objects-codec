// The compact format must be readable across languages.
//
// Booleans used to be written differently per language: JavaScript and Rust
// wrote (bool true) while Python and C# wrote (bool True), and each decoder only
// understood its own spelling, so a document written by one language decoded to
// the wrong value in another. Every language now writes the lowercase form and
// reads either spelling.

using Xunit;
using Lino.Objects.Codec;

namespace Lino.Objects.Codec.Tests;

/// <summary>
/// Verifies the compact format reads booleans written by any language.
/// </summary>
public class CompactInteropTests
{
    [Fact]
    public void BooleansAreWrittenLowercase()
    {
        Assert.Equal("(bool true)", Codec.EncodeCompact(true));
        Assert.Equal("(bool false)", Codec.EncodeCompact(false));
    }

    [Fact]
    public void LowercaseBooleansDecode()
    {
        Assert.Equal(true, Codec.DecodeCompact("(bool true)"));
        Assert.Equal(false, Codec.DecodeCompact("(bool false)"));
    }

    [Fact]
    public void CapitalizedBooleansFromOlderDocumentsStillDecode()
    {
        Assert.Equal(true, Codec.DecodeCompact("(bool True)"));
        Assert.Equal(false, Codec.DecodeCompact("(bool False)"));
    }
}
