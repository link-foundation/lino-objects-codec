// Tests for encoding/decoding basic C# types.

using Xunit;
using Lino.Objects.Codec;

namespace Lino.Objects.Codec.Tests;

/// <summary>
/// Tests for null type serialization.
/// </summary>
public class NullTypeTests
{
    [Fact]
    public void Encode_Null_ReturnsString()
    {
        var result = Codec.Encode(null);
        Assert.NotNull(result);
        Assert.IsType<string>(result);
    }

    [Fact]
    public void Decode_EncodedNull_ReturnsNull()
    {
        var encoded = Codec.Encode(null);
        var result = Codec.Decode(encoded);
        Assert.Null(result);
    }

    [Fact]
    public void Roundtrip_Null_PreservesValue()
    {
        object? original = null;
        var encoded = Codec.Encode(original);
        var decoded = Codec.Decode(encoded);
        Assert.Equal(original, decoded);
    }
}

/// <summary>
/// Tests for boolean type serialization.
/// </summary>
public class BooleanTests
{
    [Fact]
    public void Encode_True_ReturnsString()
    {
        var result = Codec.Encode(true);
        Assert.NotNull(result);
        Assert.IsType<string>(result);
    }

    [Fact]
    public void Encode_False_ReturnsString()
    {
        var result = Codec.Encode(false);
        Assert.NotNull(result);
        Assert.IsType<string>(result);
    }

    [Fact]
    public void Decode_EncodedTrue_ReturnsTrue()
    {
        var encoded = Codec.Encode(true);
        var result = Codec.Decode(encoded);
        Assert.True((bool)result!);
    }

    [Fact]
    public void Decode_EncodedFalse_ReturnsFalse()
    {
        var encoded = Codec.Encode(false);
        var result = Codec.Decode(encoded);
        Assert.False((bool)result!);
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public void Roundtrip_Boolean_PreservesValue(bool value)
    {
        var encoded = Codec.Encode(value);
        var decoded = Codec.Decode(encoded);
        Assert.IsType<bool>(decoded);
        Assert.Equal(value, decoded);
    }
}

/// <summary>
/// Tests for integer type serialization.
/// </summary>
public class IntegerTests
{
    [Fact]
    public void Encode_Zero_ReturnsString()
    {
        var result = Codec.Encode(0);
        Assert.NotNull(result);
        Assert.IsType<string>(result);
    }

    [Fact]
    public void Encode_PositiveInt_ReturnsString()
    {
        var result = Codec.Encode(42);
        Assert.NotNull(result);
        Assert.IsType<string>(result);
    }

    [Fact]
    public void Encode_NegativeInt_ReturnsString()
    {
        var result = Codec.Encode(-42);
        Assert.NotNull(result);
        Assert.IsType<string>(result);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(42)]
    [InlineData(-42)]
    [InlineData(999999)]
    public void Decode_EncodedInt_ReturnsCorrectValue(int value)
    {
        var encoded = Codec.Encode(value);
        var result = Codec.Decode(encoded);
        Assert.IsType<int>(result);
        Assert.Equal(value, result);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(1)]
    [InlineData(-1)]
    [InlineData(42)]
    [InlineData(-42)]
    [InlineData(123456789)]
    [InlineData(-123456789)]
    public void Roundtrip_Integer_PreservesValue(int value)
    {
        var encoded = Codec.Encode(value);
        var decoded = Codec.Decode(encoded);
        Assert.IsType<int>(decoded);
        Assert.Equal(value, decoded);
    }
}

/// <summary>
/// Tests for float/double type serialization.
/// </summary>
public class FloatTests
{
    [Fact]
    public void Encode_Float_ReturnsString()
    {
        var result = Codec.Encode(3.14);
        Assert.NotNull(result);
        Assert.IsType<string>(result);
    }

    [Fact]
    public void Decode_EncodedFloat_ReturnsCorrectValue()
    {
        var encoded = Codec.Encode(3.14);
        var result = Codec.Decode(encoded);
        Assert.IsType<double>(result);
        Assert.Equal(3.14, (double)result!, 10);
    }

    [Theory]
    [InlineData(0.0)]
    [InlineData(1.0)]
    [InlineData(-1.0)]
    [InlineData(3.14)]
    [InlineData(-3.14)]
    [InlineData(0.123456789)]
    [InlineData(-999.999)]
    public void Roundtrip_Float_PreservesValue(double value)
    {
        var encoded = Codec.Encode(value);
        var decoded = Codec.Decode(encoded);
        Assert.IsType<double>(decoded);
        Assert.Equal(value, (double)decoded!, 10);
    }

    [Fact]
    public void Roundtrip_PositiveInfinity_PreservesValue()
    {
        var encoded = Codec.Encode(double.PositiveInfinity);
        var decoded = Codec.Decode(encoded);
        Assert.Equal(double.PositiveInfinity, decoded);
    }

    [Fact]
    public void Roundtrip_NegativeInfinity_PreservesValue()
    {
        var encoded = Codec.Encode(double.NegativeInfinity);
        var decoded = Codec.Decode(encoded);
        Assert.Equal(double.NegativeInfinity, decoded);
    }

    [Fact]
    public void Roundtrip_NaN_PreservesValue()
    {
        var encoded = Codec.Encode(double.NaN);
        var decoded = Codec.Decode(encoded);
        Assert.True(double.IsNaN((double)decoded!));
    }
}

/// <summary>
/// Tests for string type serialization.
/// </summary>
public class StringTests
{
    [Fact]
    public void Encode_EmptyString_ReturnsString()
    {
        var result = Codec.Encode("");
        Assert.NotNull(result);
        Assert.IsType<string>(result);
    }

    [Fact]
    public void Encode_SimpleString_ReturnsString()
    {
        var result = Codec.Encode("hello");
        Assert.NotNull(result);
        Assert.IsType<string>(result);
    }

    [Fact]
    public void Decode_EncodedString_ReturnsCorrectValue()
    {
        var encoded = Codec.Encode("hello world");
        var result = Codec.Decode(encoded);
        Assert.Equal("hello world", result);
        Assert.IsType<string>(result);
    }

    [Theory]
    [InlineData("")]
    [InlineData("hello")]
    [InlineData("hello world")]
    [InlineData("Hello, World!")]
    [InlineData("multi\nline\nstring")]
    [InlineData("tab\tseparated")]
    [InlineData("special chars: @#$%^&*()")]
    public void Roundtrip_String_PreservesValue(string value)
    {
        var encoded = Codec.Encode(value);
        var decoded = Codec.Decode(encoded);
        Assert.IsType<string>(decoded);
        Assert.Equal(value, decoded);
    }

    [Fact]
    public void Roundtrip_UnicodeString_PreservesValue()
    {
        var value = "unicode: 你好世界 🌍";
        var encoded = Codec.Encode(value);
        var decoded = Codec.Decode(encoded);
        Assert.IsType<string>(decoded);
        Assert.Equal(value, decoded);
    }

    [Theory]
    [InlineData("string with 'single quotes'")]
    [InlineData("string with \"double quotes\"")]
    [InlineData("string with \"both\" 'quotes'")]
    public void Roundtrip_StringWithQuotes_PreservesValue(string value)
    {
        var encoded = Codec.Encode(value);
        var decoded = Codec.Decode(encoded);
        Assert.Equal(value, decoded);
    }
}
