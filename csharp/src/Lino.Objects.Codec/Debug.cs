// Opt-in tracing for the codec.

namespace Lino.Objects.Codec;

/// <summary>
/// Opt-in tracing for the codec.
/// </summary>
/// <remarks>
/// Tracing is off by default and writes nothing. It is turned on either by
/// setting the <c>LINO_CODEC_DEBUG</c> environment variable to a truthy value
/// (<c>1</c>, <c>true</c>, <c>yes</c>, <c>on</c>) or by calling
/// <see cref="SetEnabled"/> from code.
/// <para>
/// The same switch and the same environment variable exist in the JavaScript,
/// Python and Rust implementations, so a problem can be traced the same way in
/// every language.
/// </para>
/// </remarks>
public static class CodecDebug
{
    /// <summary>Name of the environment variable that turns tracing on.</summary>
    public const string DebugEnvVar = "LINO_CODEC_DEBUG";

    private static readonly HashSet<string> Truthy = new(StringComparer.OrdinalIgnoreCase)
    {
        "1", "true", "yes", "on",
    };

    private static bool? _overridden;

    /// <summary>
    /// Whether tracing is currently on.
    /// </summary>
    /// <returns><c>true</c> when trace messages are written.</returns>
    public static bool IsEnabled()
    {
        if (_overridden is bool forced)
        {
            return forced;
        }
        var raw = Environment.GetEnvironmentVariable(DebugEnvVar);
        return raw is not null && Truthy.Contains(raw.Trim());
    }

    /// <summary>
    /// Turn tracing on or off from code, overriding the environment variable.
    /// </summary>
    /// <param name="enabled"><c>true</c>/<c>false</c> to force, <c>null</c> to follow the environment.</param>
    public static void SetEnabled(bool? enabled)
    {
        _overridden = enabled;
    }

    /// <summary>
    /// Write a trace message when tracing is on.
    /// </summary>
    /// <remarks>
    /// The message is built by a delegate so that building it costs nothing
    /// while tracing is off, which is the normal case.
    /// </remarks>
    /// <param name="scope">Where the message comes from, for example <c>readable.decode</c>.</param>
    /// <param name="message">Builds the message text.</param>
    public static void Trace(string scope, Func<string> message)
    {
        if (!IsEnabled())
        {
            return;
        }
        Console.Error.WriteLine($"[lino-codec] {scope}: {message()}");
    }
}
