namespace Lino.Objects.Codec;

/// <summary>Opt-in restrictions for decoding readable Links Notation.</summary>
public sealed class DecodeOptions
{
    /// <summary>Reject compact notation. Either of the other restrictions also requires readable input.</summary>
    public bool ReadableOnly { get; init; }

    /// <summary>Reject duplicate decoded keys within each object.</summary>
    public bool RejectDuplicateKeys { get; init; }

    /// <summary>Limit open parentheses outside quotes. A top-level scalar has depth zero.</summary>
    public int? MaxDepth { get; init; }
}
