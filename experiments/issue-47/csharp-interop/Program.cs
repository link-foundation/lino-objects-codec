// C# side of the cross-implementation round trip (issue #47).

using Lino.Objects.Codec;

// The record every implementation writes.
static Dictionary<string, object?> Record() => new()
{
    ["phase"] = "stream_end",
    ["bytes"] = 2827L,
    ["complete"] = true,
    ["server"] = new Dictionary<string, object?>
    {
        ["host"] = "127.0.0.1",
        ["port"] = 18878L,
    },
    ["models"] = new List<object?> { "claude-haiku", "claude-opus" },
};

var mode = args[0];
var target = args[1];

if (mode == "write")
{
    File.WriteAllText(target, Readable.EncodeLine(Record()) + "\n");
}
else if (mode == "read")
{
    foreach (var path in Directory.GetFiles(target, "*.lino").OrderBy(p => p, StringComparer.Ordinal))
    {
        var notation = File.ReadAllText(path).Trim();
        var value = Readable.DecodeLine(notation);
        Console.WriteLine($"csharp reading {Path.GetFileName(path)}: {Readable.EncodeLine(value)}");
    }
}
else
{
    Console.Error.WriteLine("usage: Interop write <path> | read <dir>");
    Environment.Exit(2);
}
