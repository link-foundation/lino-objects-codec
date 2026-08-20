// Readable, indented Links Notation representation.

using System.Globalization;
using System.Text;

namespace Lino.Objects.Codec;

/// <summary>
/// Raised when a value cannot be written because it refers back to itself.
/// </summary>
/// <remarks>
/// The readable form writes a plain tree and has no place to put the <c>obj_N</c>
/// definition ids that name a shared node, so a cycle cannot be represented.
/// <see cref="ObjectCodec.EncodeCompact"/> handles cycles.
/// </remarks>
public class CircularReferenceException : InvalidOperationException
{
    /// <summary>Create the exception with the default message.</summary>
    public CircularReferenceException()
        : base("Cannot write a circular reference in the readable format; "
            + "use EncodeCompact, which names shared nodes with obj_N ids")
    {
    }

    /// <summary>Create the exception with a message.</summary>
    /// <param name="message">Why the value could not be written</param>
    public CircularReferenceException(string message) : base(message)
    {
    }

    /// <summary>Create the exception with a message and an inner exception.</summary>
    /// <param name="message">Why the value could not be written</param>
    /// <param name="innerException">The cause</param>
    public CircularReferenceException(string message, Exception innerException)
        : base(message, innerException)
    {
    }
}

/// <summary>
/// Readable, indented Links Notation representation.
/// </summary>
/// <remarks>
/// <para>
/// This class implements the default output of <see cref="ObjectCodec.Encode(object?)"/>:
/// a plain-text, indented projection where keys and values are written as they
/// are, so the document can be read, grepped and reviewed without decoding
/// anything.
/// </para>
/// <para>
/// One construct — <c>( )</c> — is used for both objects and arrays, at every
/// level including the root. What distinguishes them is the content of the lines:
/// <c>key value</c> pairs make an object, bare values make an array.
/// </para>
/// <code>
/// (
///   type "RouterState"
///   server (
///     host "127.0.0.1"
///     port 18878
///   )
///   models (
///     "claude-haiku"
///     "claude-opus"
///   )
/// )
/// </code>
/// <para>
/// Empty containers keep their type: an empty array is <c>()</c> on one line,
/// while an empty object is written as <c>(</c> and <c>)</c> on two lines.
/// </para>
/// <para>
/// Only values that cannot be written as plain text are encoded: strings holding
/// control characters (including newlines and tabs, which line-based tooling and
/// CRLF normalisation would corrupt) are marked individually as
/// <c>(base64 "…")</c> instead of encoding the whole document.
/// </para>
/// </remarks>
public static class Readable
{
    /// <summary>Default indentation used by <see cref="Encode(object?, string)"/>.</summary>
    public const string DefaultIndent = "  ";

    /// <summary>Marker used for values that cannot be represented as plain text.</summary>
    public const string Base64Marker = "base64";

    /// <summary>Characters that cannot appear in a bare (unquoted) reference.</summary>
    private static readonly char[] QuoteChars = { '"', '\'', '`' };

    /// <summary>Characters that force an object key to be quoted.</summary>
    private static readonly char[] KeyNeedsQuotes = { '(', ')', '\'', '"', ':', '`' };

    /// <summary>
    /// Encode a value into the readable, indented Links Notation form.
    /// </summary>
    /// <param name="value">The value to encode</param>
    /// <param name="indent">Indentation string used per nesting level</param>
    /// <returns>The readable Links Notation document</returns>
    /// <exception cref="CircularReferenceException">If the value refers back to itself</exception>
    /// <exception cref="InvalidOperationException">If the value holds a type this format cannot write</exception>
    public static string Encode(object? value, string indent)
    {
        var output = new StringBuilder();
        WriteValue(value, indent, 0, output, new HashSet<object>(ReferenceEqualityComparer.Instance));
        return output.ToString();
    }

    /// <summary>
    /// Encode a value using the default indentation.
    /// </summary>
    /// <param name="value">The value to encode</param>
    /// <returns>The readable Links Notation document</returns>
    public static string Encode(object? value) => Encode(value, DefaultIndent);

    /// <summary>
    /// Decode the readable, indented Links Notation form back into a value.
    /// </summary>
    /// <param name="text">The readable Links Notation document</param>
    /// <returns>The reconstructed value</returns>
    /// <exception cref="FormatException">If the document is not well formed</exception>
    public static object? Decode(string text)
    {
        var tokens = Tokenize(text);
        CodecDebug.Trace("readable.decode", () => $"{tokens.Count} tokens");
        var cursor = new Cursor(tokens);
        var rows = cursor.ParseRows(true);

        if (cursor.Pos < tokens.Count)
        {
            throw new FormatException("unexpected ')' in readable notation");
        }

        // A document holding a single value (for example `42`) is that value.
        if (rows.Count == 1 && rows[0].Count == 1)
        {
            return NodeToValue(rows[0][0]);
        }

        return RowsToValue(rows, true);
    }

    // === Encoding ===

    private static void WriteValue(object? value, string indent, int level, StringBuilder output, HashSet<object> path)
    {
        if (value is IDictionary<string, object?> dict)
        {
            EnterPath(dict, path);
            if (dict.Count == 0)
            {
                // An empty object spans two lines; `()` on one line is an empty array.
                output.Append("(\n");
                PushIndent(indent, level, output);
                output.Append(')');
            }
            else
            {
                output.Append('(');
                foreach (var pair in dict)
                {
                    output.Append('\n');
                    PushIndent(indent, level + 1, output);
                    output.Append(FormatKey(pair.Key));
                    output.Append(' ');
                    WriteValue(pair.Value, indent, level + 1, output, path);
                }
                output.Append('\n');
                PushIndent(indent, level, output);
                output.Append(')');
            }
            path.Remove(dict);
            return;
        }

        if (value is System.Collections.IEnumerable items and not string)
        {
            EnterPath(items, path);
            var list = items.Cast<object?>().ToList();
            if (list.Count == 0)
            {
                output.Append("()");
            }
            else
            {
                output.Append('(');
                foreach (var item in list)
                {
                    output.Append('\n');
                    PushIndent(indent, level + 1, output);
                    WriteValue(item, indent, level + 1, output, path);
                }
                output.Append('\n');
                PushIndent(indent, level, output);
                output.Append(')');
            }
            path.Remove(items);
            return;
        }

        output.Append(FormatScalar(value));
    }

    /// <summary>
    /// Mark a container as being written, so a reference back to it is caught.
    /// </summary>
    /// <remarks>
    /// Only the containers on the way down are tracked: the same object appearing
    /// twice side by side is written twice, which reads back as two equal values.
    /// </remarks>
    private static void EnterPath(object container, HashSet<object> path)
    {
        if (!path.Add(container))
        {
            throw new CircularReferenceException();
        }
    }

    private static void PushIndent(string indent, int level, StringBuilder output)
    {
        for (int i = 0; i < level; i++)
        {
            output.Append(indent);
        }
    }

    /// <summary>
    /// Format a scalar value. Strings are quoted, everything else stays bare so
    /// that its type is recoverable when reading the document back.
    /// </summary>
    private static string FormatScalar(object? value)
    {
        return value switch
        {
            null => "null",
            // Written in lower case in every language, so the output is identical.
            bool b => b ? "true" : "false",
            string s => FormatString(s),
            sbyte or byte or short or ushort or int or uint or long or ulong =>
                Convert.ToString(value, CultureInfo.InvariantCulture) ?? "null",
            float f => FormatFloat(f),
            double d => FormatFloat(d),
            decimal m => m.ToString(CultureInfo.InvariantCulture),
            _ => throw new InvalidOperationException($"Unsupported type: {value.GetType().Name}"),
        };
    }

    private static string FormatFloat(double value)
    {
        if (double.IsNaN(value))
        {
            return "NaN";
        }
        if (double.IsPositiveInfinity(value))
        {
            return "Infinity";
        }
        if (double.IsNegativeInfinity(value))
        {
            return "-Infinity";
        }

        // The decimal point is what tells a float apart from an integer when the
        // document is read back, so a whole float keeps one.
        var text = value.ToString("R", CultureInfo.InvariantCulture);
        if (text.IndexOfAny(new[] { '.', 'e', 'E' }) < 0)
        {
            text += ".0";
        }
        return text;
    }

    /// <summary>
    /// Format a string value: quoted plain text, or an individually marked
    /// base64 payload when the text cannot be written literally.
    /// </summary>
    private static string FormatString(string value)
    {
        if (NeedsEncoding(value))
        {
            var payload = Convert.ToBase64String(Encoding.UTF8.GetBytes(value));
            return $"({Base64Marker} {Quote(payload)})";
        }
        return Quote(value);
    }

    /// <summary>
    /// A value can be written as text unless it contains control characters:
    /// newlines break the line structure and CRLF normalisation would rewrite them.
    /// </summary>
    private static bool NeedsEncoding(string value)
    {
        foreach (var c in value)
        {
            // Unicode category Cc: the C0 and C1 control ranges.
            if (c <= 0x1f || (c >= 0x7f && c <= 0x9f))
            {
                return true;
            }
        }
        return false;
    }

    private static string Quote(string value)
    {
        if (!value.Contains('"'))
        {
            return $"\"{value}\"";
        }
        if (!value.Contains('\''))
        {
            return $"'{value}'";
        }
        // Both quote styles are present: double the double quotes, as the parser expects.
        return $"\"{value.Replace("\"", "\"\"", StringComparison.Ordinal)}\"";
    }

    /// <summary>Format an object key. Keys are bare when they read as plain identifiers.</summary>
    private static string FormatKey(string key)
    {
        var plain = key.Length > 0
            && key != Base64Marker
            && !NeedsEncoding(key)
            && !key.Any(c => char.IsWhiteSpace(c) || KeyNeedsQuotes.Contains(c));

        return plain ? key : FormatString(key);
    }

    // === Decoding ===

    private enum TokenKind
    {
        Open,
        Close,
        Newline,
        Ref,
    }

    private readonly record struct Token(TokenKind Kind, string Value, bool Quoted);

    /// <summary>
    /// A parsed element of the readable form: either a reference (remembering
    /// whether it was quoted, which is what distinguishes a string from a number)
    /// or a link.
    /// </summary>
    private sealed class Node
    {
        public bool IsRef { get; init; }
        public string Value { get; init; } = string.Empty;
        public bool Quoted { get; init; }
        public List<List<Node>> Rows { get; init; } = new();
        public bool Multiline { get; init; }
    }

    /// <summary>
    /// Split a document into tokens: parentheses, newlines and references.
    /// </summary>
    private static List<Token> Tokenize(string text)
    {
        var chars = text.ToCharArray();
        var tokens = new List<Token>();
        int i = 0;

        while (i < chars.Length)
        {
            var c = chars[i];

            if (c == '\n')
            {
                tokens.Add(new Token(TokenKind.Newline, string.Empty, false));
                i++;
            }
            else if (char.IsWhiteSpace(c))
            {
                i++;
            }
            else if (c == '(')
            {
                tokens.Add(new Token(TokenKind.Open, string.Empty, false));
                i++;
            }
            else if (c == ')')
            {
                tokens.Add(new Token(TokenKind.Close, string.Empty, false));
                i++;
            }
            else if (QuoteChars.Contains(c))
            {
                var (value, next) = ReadQuoted(chars, i, c);
                tokens.Add(new Token(TokenKind.Ref, value, true));
                i = next;
            }
            else
            {
                int start = i;
                while (i < chars.Length
                    && !char.IsWhiteSpace(chars[i])
                    && chars[i] != '('
                    && chars[i] != ')'
                    && !QuoteChars.Contains(chars[i]))
                {
                    i++;
                }
                tokens.Add(new Token(TokenKind.Ref, new string(chars, start, i - start), false));
            }
        }

        return tokens;
    }

    /// <summary>Read a quoted reference, where a doubled quote character means a literal one.</summary>
    private static (string Value, int Next) ReadQuoted(char[] chars, int start, char quoteChar)
    {
        var value = new StringBuilder();
        int i = start + 1;

        while (i < chars.Length)
        {
            if (chars[i] == quoteChar)
            {
                if (i + 1 < chars.Length && chars[i + 1] == quoteChar)
                {
                    value.Append(quoteChar);
                    i += 2;
                    continue;
                }
                return (value.ToString(), i + 1);
            }
            value.Append(chars[i]);
            i++;
        }

        throw new FormatException(
            $"unterminated quoted value starting at character {start.ToString(CultureInfo.InvariantCulture)}");
    }

    /// <summary>Cursor over the token stream, turning tokens into nodes and rows.</summary>
    private sealed class Cursor
    {
        private readonly List<Token> _tokens;

        public Cursor(List<Token> tokens)
        {
            _tokens = tokens;
        }

        public int Pos { get; private set; }

        /// <summary>
        /// Parse rows until the matching <c>)</c> (or the end of input at the top
        /// level). A row is one line: the values written between two newlines.
        /// </summary>
        public List<List<Node>> ParseRows(bool topLevel)
        {
            var rows = new List<List<Node>>();
            var row = new List<Node>();

            while (Pos < _tokens.Count)
            {
                var token = _tokens[Pos];

                if (token.Kind == TokenKind.Close)
                {
                    if (topLevel)
                    {
                        break;
                    }
                    Pos++;
                    if (row.Count > 0)
                    {
                        rows.Add(row);
                    }
                    return rows;
                }

                if (token.Kind == TokenKind.Newline)
                {
                    Pos++;
                    if (row.Count > 0)
                    {
                        rows.Add(row);
                        row = new List<Node>();
                    }
                    continue;
                }

                row.Add(ParseNode());
            }

            if (!topLevel)
            {
                throw new FormatException("unterminated '(' in readable notation");
            }

            if (row.Count > 0)
            {
                rows.Add(row);
            }
            return rows;
        }

        private Node ParseNode()
        {
            var token = _tokens[Pos];

            if (token.Kind == TokenKind.Ref)
            {
                Pos++;
                return new Node { IsRef = true, Value = token.Value, Quoted = token.Quoted };
            }

            if (token.Kind == TokenKind.Open)
            {
                Pos++;
                var multiline = LinkIsMultiline();
                var rows = ParseRows(false);
                return new Node { IsRef = false, Rows = rows, Multiline = multiline };
            }

            throw new FormatException("unexpected token in readable notation");
        }

        /// <summary>
        /// Whether the link that just opened spans more than one line, which is
        /// what tells an empty object (<c>(\n)</c>) from an empty array (<c>()</c>).
        /// </summary>
        private bool LinkIsMultiline()
        {
            for (int i = Pos; i < _tokens.Count; i++)
            {
                if (_tokens[i].Kind == TokenKind.Close)
                {
                    return false;
                }
                if (_tokens[i].Kind == TokenKind.Newline)
                {
                    return true;
                }
            }
            return false;
        }
    }

    private static object? NodeToValue(Node node) =>
        node.IsRef ? RefToValue(node.Value, node.Quoted) : RowsToValue(node.Rows, node.Multiline);

    private static object? RowsToValue(List<List<Node>> rows, bool multiline)
    {
        if (rows.Count == 0)
        {
            return multiline ? new Dictionary<string, object?>() : new List<object?>();
        }

        var marked = DecodeMarkedValue(rows);
        if (marked is not null)
        {
            return marked;
        }

        // `key value` on every line makes an object; anything else is a list of values.
        var isObject = rows.All(row => row.Count == 2 && row[0].IsRef);

        if (isObject)
        {
            var result = new Dictionary<string, object?>();
            foreach (var row in rows)
            {
                result[row[0].Value] = NodeToValue(row[1]);
            }
            return result;
        }

        var items = new List<object?>();
        foreach (var row in rows)
        {
            foreach (var node in row)
            {
                items.Add(NodeToValue(node));
            }
        }
        return items;
    }

    /// <summary>
    /// Recognise <c>(base64 "…")</c>, the individual marker for values that could
    /// not be written as text. A quoted <c>base64</c> key is an ordinary object
    /// key, not a marker.
    /// </summary>
    private static string? DecodeMarkedValue(List<List<Node>> rows)
    {
        if (rows.Count != 1 || rows[0].Count != 2)
        {
            return null;
        }

        var marker = rows[0][0];
        var payload = rows[0][1];

        if (!marker.IsRef || marker.Quoted || marker.Value != Base64Marker)
        {
            return null;
        }
        if (!payload.IsRef || !payload.Quoted)
        {
            return null;
        }

        try
        {
            return Encoding.UTF8.GetString(Convert.FromBase64String(payload.Value));
        }
        catch (FormatException e)
        {
            throw new FormatException($"invalid base64 value: {payload.Value}", e);
        }
    }

    /// <summary>
    /// Convert a reference to a value. Quoted references are always strings; bare
    /// references keep the type they were written with.
    /// </summary>
    private static object? RefToValue(string value, bool quoted)
    {
        if (quoted)
        {
            return value;
        }

        switch (value)
        {
            case "null":
                return null;
            case "true":
                return true;
            case "false":
                return false;
            case "NaN":
                return double.NaN;
            case "Infinity":
                return double.PositiveInfinity;
            case "-Infinity":
                return double.NegativeInfinity;
            default:
                break;
        }

        if (long.TryParse(value, NumberStyles.AllowLeadingSign, CultureInfo.InvariantCulture, out var parsedLong))
        {
            // The compact codec reads whole numbers as `int` where they fit, so
            // the two formats decode the same document to the same types.
            if (parsedLong >= int.MinValue && parsedLong <= int.MaxValue)
            {
                return (int)parsedLong;
            }
            return parsedLong;
        }

        if (value.IndexOfAny(new[] { '.', 'e', 'E' }) >= 0
            && double.TryParse(value, NumberStyles.Float, CultureInfo.InvariantCulture, out var parsedDouble))
        {
            return parsedDouble;
        }

        return value;
    }
}
