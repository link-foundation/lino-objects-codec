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
/// Text is written as text. A string keeps every character a reader would grep
/// for, including newlines and tabs, and is quoted with a run of delimiters —
/// <c>"""say "hi""""</c> — when it holds the delimiter itself. Only the
/// characters a form cannot carry are escaped, and only they: the value is then
/// written as <c>(escaped "…")</c>, where <c>%XX</c> stands for one escaped
/// byte. The indented form escapes the carriage return, which CRLF normalisation
/// would otherwise rewrite, and the other control characters; the single-line
/// form escapes the newline as well, because there a record ends at the end of
/// the line. Nothing else is encoded: base64 lives in
/// <see cref="ObjectCodec.EncodeCompact"/>, which a caller asks for by name.
/// </para>
/// <para>
/// <see cref="EncodeLine"/> writes the same document on one line, so one record
/// is one line and an append-only log stays greppable, tailable and countable by
/// <c>wc -l</c>. Rows can no longer be told apart by line breaks there, so an
/// object names itself with the <c>o</c> link id the notation already has, and
/// its pairs are written as their own links:
/// </para>
/// <code>
/// (o: (type "RouterState") (server (o: (host "127.0.0.1") (port 18878))) (models ("claude-haiku" "claude-opus")))
/// </code>
/// <para>
/// An object is <c>(o: (key value) …)</c> and an empty one is <c>(o:)</c>; an
/// array is <c>(value …)</c> and an empty one is <c>()</c>; scalars are written
/// exactly as in the indented form.
/// </para>
/// <para>
/// The marker is what answers the ambiguity a flat layout otherwise has: without
/// it <c>((key value))</c> reads both as the one-pair object and as the array
/// holding the two-element array, and an empty key makes it worse. With it, a
/// bare <c>( )</c> is always an array and a marked one is always an object, so
/// every value — empty key included — survives the round trip. Consequently a
/// <em>hand-written</em> one-line link such as <c>(a 1)</c> is the two-element
/// array, not the one-pair object: on one line, objects say so.
/// </para>
/// </remarks>
public static class Readable
{
    /// <summary>Default indentation used by <see cref="Encode(object?, string)"/>.</summary>
    public const string DefaultIndent = "  ";

    /// <summary>Marker of a string written as base64 by versions up to 0.6.0, still read.</summary>
    public const string Base64Marker = "base64";

    /// <summary>
    /// Marker of a string whose unwritable characters are percent-escaped.
    /// </summary>
    /// <remarks>
    /// It reads as <c>(escaped "line one%0Aline two")</c>. Only those characters
    /// change; the rest of the text is written as it is, so the value stays
    /// readable and greppable.
    /// </remarks>
    public const string EscapedMarker = "escaped";

    /// <summary>Link id naming an object in the single-line form, written as <c>(o: …)</c>.</summary>
    public const string ObjectMarker = "o";

    /// <summary>Characters that cannot appear in a bare (unquoted) reference.</summary>
    private static readonly char[] QuoteChars = { '"', '\'', '`' };

    /// <summary>Characters that force an object key to be quoted.</summary>
    private static readonly char[] KeyNeedsQuotes = { '(', ')', '\'', '"', ':', '`' };

    /// <summary>Reads an escaped payload back, rejecting invalid UTF-8.</summary>
    private static readonly UTF8Encoding StrictUtf8 = new(false, true);

    /// <summary>Which readable form is being written, which is what says how much has to be escaped.</summary>
    private enum Form
    {
        /// <summary>The indented form, where a value may hold a line break of its own.</summary>
        Indented,

        /// <summary>The single-line form, where a record ends at the end of the line.</summary>
        Line,
    }

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
    /// Encode a value into the readable, single-line Links Notation form.
    /// </summary>
    /// <remarks>
    /// The result never contains a newline, so one value is one line of an
    /// append-only log. See the class documentation for the shape.
    /// </remarks>
    /// <param name="value">The value to encode</param>
    /// <returns>The readable Links Notation document, on one line</returns>
    /// <exception cref="CircularReferenceException">If the value refers back to itself</exception>
    public static string EncodeLine(object? value)
    {
        var output = new StringBuilder();
        WriteLineValue(value, output, new HashSet<object>(ReferenceEqualityComparer.Instance));
        return output.ToString();
    }

    /// <summary>
    /// Decode the readable, single-line Links Notation form back into a value.
    /// </summary>
    /// <remarks>
    /// This is the exact inverse of <see cref="EncodeLine"/>. Input spanning more
    /// than one line is rejected: a line-based reader hands over one record at a
    /// time, and silently accepting several would merge two records into one value.
    /// </remarks>
    /// <param name="text">One line of a readable Links Notation log</param>
    /// <returns>The reconstructed value</returns>
    /// <exception cref="FormatException">If the document is not well formed or holds a line break</exception>
    public static object? DecodeLine(string text)
    {
        var line = text.Trim('\n', '\r');
        if (line.Contains('\n') || line.Contains('\r'))
        {
            throw new FormatException("a single-line document cannot contain a line break");
        }
        return Decode(line);
    }

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

        return RowsToValue(rows, true, false);
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
                    output.Append(FormatKey(pair.Key, Form.Indented));
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

        output.Append(FormatScalar(value, Form.Indented));
    }

    /// <summary>
    /// Write a value on one line. Objects name themselves with the <c>o</c> link
    /// id and write each pair as its own link, so nothing depends on where lines
    /// break.
    /// </summary>
    private static void WriteLineValue(object? value, StringBuilder output, HashSet<object> path)
    {
        if (value is IDictionary<string, object?> dict)
        {
            EnterPath(dict, path);
            if (dict.Count == 0)
            {
                // `()` is the empty array, so the empty object keeps its marker.
                output.Append('(').Append(ObjectMarker).Append(":)");
            }
            else
            {
                output.Append('(').Append(ObjectMarker).Append(':');
                foreach (var pair in dict)
                {
                    output.Append(" (").Append(FormatKey(pair.Key, Form.Line)).Append(' ');
                    WriteLineValue(pair.Value, output, path);
                    output.Append(')');
                }
                output.Append(')');
            }
            path.Remove(dict);
            return;
        }

        if (value is System.Collections.IEnumerable items and not string)
        {
            EnterPath(items, path);
            output.Append('(');
            var first = true;
            foreach (var item in items)
            {
                if (!first)
                {
                    output.Append(' ');
                }
                first = false;
                WriteLineValue(item, output, path);
            }
            output.Append(')');
            path.Remove(items);
            return;
        }

        output.Append(FormatScalar(value, Form.Line));
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
    private static string FormatScalar(object? value, Form form)
    {
        return value switch
        {
            null => "null",
            // Written in lower case in every language, so the output is identical.
            bool b => b ? "true" : "false",
            string s => FormatString(s, form),
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
    /// Format a string value. The text is written as text; when it holds
    /// characters this form cannot carry, those characters — and only those —
    /// are percent-escaped and the value is marked, so the rest of it stays
    /// readable and greppable.
    /// </summary>
    private static string FormatString(string value, Form form)
    {
        var escaped = EscapeUnwritable(value, form);
        return escaped is null ? Quote(value) : $"({EscapedMarker} {Quote(escaped)})";
    }

    /// <summary>
    /// Percent-escape the characters this form cannot carry, or <c>null</c> when
    /// the text can be written as it is. <c>%</c> is escaped too, so escaping is
    /// reversible.
    /// </summary>
    private static string? EscapeUnwritable(string value, Form form)
    {
        if (!value.Any(c => IsUnwritable(c, form)))
        {
            return null;
        }

        var output = new StringBuilder(value.Length);
        var plain = new StringBuilder();

        void FlushPlain()
        {
            if (plain.Length > 0)
            {
                output.Append(plain);
                plain.Clear();
            }
        }

        foreach (var c in value)
        {
            if (c != '%' && !IsUnwritable(c, form))
            {
                // Kept as it is, surrogate pairs included: only the characters
                // this form cannot carry turn into escapes.
                plain.Append(c);
                continue;
            }
            FlushPlain();
            foreach (var b in Encoding.UTF8.GetBytes(c.ToString()))
            {
                output.Append('%').Append(b.ToString("X2", CultureInfo.InvariantCulture));
            }
        }
        FlushPlain();

        return output.ToString();
    }

    /// <summary>
    /// Whether a character has to be escaped in this form. A tab is text a reader
    /// can see, and so is a newline in the indented form, where a value may span
    /// lines. A carriage return is escaped because CRLF normalisation rewrites
    /// it, and the remaining control characters because they are not text at all.
    /// </summary>
    private static bool IsUnwritable(char c, Form form)
    {
        if (!IsControl(c))
        {
            return false;
        }
        if (c == '\t')
        {
            return false;
        }
        if (c == '\n')
        {
            return form == Form.Line;
        }
        return true;
    }

    /// <summary>Unicode category Cc: the C0 and C1 control ranges.</summary>
    private static bool IsControl(char c) => c <= 0x1f || (c >= 0x7f && c <= 0x9f);

    /// <summary>
    /// Quote a value so that both this reader and the notation's own parser read
    /// it back unchanged. One delimiter is enough while the text holds none of
    /// that kind; when it holds both kinds, a run of at least three opens the
    /// notation's n-quote form, where the text is literal and only a run at least
    /// as long closes it. A value starting with the delimiter would lengthen the
    /// opening run, so the other delimiter is used for it.
    /// </summary>
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

        var delimiter = value.StartsWith('"') ? '\'' : '"';
        // A run of two delimiters is the empty value, so the n-quote form starts
        // at three; beyond that the run only has to outrun the longest one inside.
        var count = Math.Max(LongestRun(value, delimiter) + 1, 3);
        var run = new string(delimiter, count);
        return $"{run}{value}{run}";
    }

    /// <summary>The length of the longest run of a character in a text.</summary>
    private static int LongestRun(string value, char c)
    {
        var longest = 0;
        var current = 0;
        foreach (var candidate in value)
        {
            current = candidate == c ? current + 1 : 0;
            longest = Math.Max(longest, current);
        }
        return longest;
    }

    /// <summary>Format an object key. Keys are bare when they read as plain identifiers.</summary>
    private static string FormatKey(string key, Form form)
    {
        var plain = key.Length > 0
            && key != Base64Marker
            && key != EscapedMarker
            && !key.Any(c => char.IsWhiteSpace(c) || IsControl(c) || KeyNeedsQuotes.Contains(c));

        return plain ? key : FormatString(key, form);
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

        /// <summary>Whether the link named itself an object with the <c>o:</c> marker.</summary>
        public bool IsObject { get; init; }
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

    /// <summary>
    /// Read a quoted reference. The opening run of delimiters says how it is
    /// read, which is what the notation's own parser does:
    /// </summary>
    /// <remarks>
    /// <list type="bullet">
    /// <item>one delimiter — the text is literal and a doubled delimiter is one
    /// literal delimiter, which is how versions up to 0.6.0 wrote such values;</item>
    /// <item>two — the empty value;</item>
    /// <item>three or more — the n-quote form: the text is literal, and the value
    /// ends at the first run at least as long, whose last delimiters close it. A
    /// longer run therefore belongs to the text, so a value may end with a
    /// delimiter.</item>
    /// </list>
    /// </remarks>
    private static (string Value, int Next) ReadQuoted(char[] chars, int start, char quoteChar)
    {
        var opening = RunLength(chars, start, quoteChar);

        if (opening == 2)
        {
            return (string.Empty, start + 2);
        }

        if (opening == 1)
        {
            return ReadDoubledQuoted(chars, start, quoteChar);
        }

        int i = start + opening;
        while (i < chars.Length)
        {
            if (chars[i] != quoteChar)
            {
                i++;
                continue;
            }

            var run = RunLength(chars, i, quoteChar);
            if (run >= opening)
            {
                var length = i + run - opening - (start + opening);
                var value = new string(chars, start + opening, length);
                return (value, i + run);
            }
            i += run;
        }

        throw UnterminatedQuote(start);
    }

    /// <summary>
    /// Read the single-delimiter form, where a doubled delimiter is one literal
    /// delimiter. This is how versions up to 0.6.0 wrote a value holding both
    /// quote kinds, so their documents keep decoding.
    /// </summary>
    private static (string Value, int Next) ReadDoubledQuoted(char[] chars, int start, char quoteChar)
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

        throw UnterminatedQuote(start);
    }

    /// <summary>The length of the run of a character that starts at an index.</summary>
    private static int RunLength(char[] chars, int start, char c)
    {
        int i = start;
        while (i < chars.Length && chars[i] == c)
        {
            i++;
        }
        return i - start;
    }

    /// <summary>The error a quoted value that never closes raises.</summary>
    private static FormatException UnterminatedQuote(int start) =>
        new($"unterminated quoted value starting at character {start.ToString(CultureInfo.InvariantCulture)}");

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
                var isObject = TakeObjectMarker();
                var multiline = LinkIsMultiline();
                var rows = ParseRows(false);
                return new Node { IsRef = false, Rows = rows, Multiline = multiline, IsObject = isObject };
            }

            throw new FormatException("unexpected token in readable notation");
        }

        /// <summary>
        /// Consume the <c>o:</c> marker if the link that just opened carries one,
        /// which is how the single-line form says "this link is an object, not an
        /// array".
        /// </summary>
        private bool TakeObjectMarker()
        {
            if (Pos >= _tokens.Count)
            {
                return false;
            }
            var token = _tokens[Pos];
            if (token.Kind != TokenKind.Ref || token.Quoted || token.Value != ObjectMarker + ":")
            {
                return false;
            }
            Pos++;
            return true;
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
        node.IsRef
            ? RefToValue(node.Value, node.Quoted)
            : RowsToValue(node.Rows, node.Multiline, node.IsObject);

    private static object? RowsToValue(List<List<Node>> rows, bool multiline, bool objectMarker)
    {
        if (objectMarker)
        {
            return MarkedObjectToValue(rows);
        }

        if (rows.Count == 0)
        {
            return multiline ? new Dictionary<string, object?>() : new List<object?>();
        }

        var marked = DecodeMarkedValue(rows);
        if (marked is not null)
        {
            return marked;
        }

        // Written on one line, a link is a list of values: an object on one line
        // says so with the `o:` marker, which is what keeps `(key value)`
        // unambiguous.
        if (!multiline)
        {
            var line = new List<object?>();
            foreach (var row in rows)
            {
                foreach (var node in row)
                {
                    line.Add(NodeToValue(node));
                }
            }
            return line;
        }

        // `key value` on every line makes an object; anything else is a list of values.
        var isObject = rows.All(row => row.Count == 2 && NodeToKey(row[0]) is not null);

        if (isObject)
        {
            var result = new Dictionary<string, object?>();
            foreach (var row in rows)
            {
                result[NodeToKey(row[0])!] = NodeToValue(row[1]);
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
    /// Build the object a <c>(o: (key value) …)</c> link describes. Every value in
    /// it is a pair, so anything else is a malformed document rather than a
    /// silent array.
    /// </summary>
    private static object? MarkedObjectToValue(List<List<Node>> rows)
    {
        var result = new Dictionary<string, object?>();

        foreach (var node in rows.SelectMany(row => row))
        {
            if (node.IsRef || node.IsObject)
            {
                throw new FormatException(
                    $"an object marked '{ObjectMarker}:' holds (key value) pairs, "
                    + "found a value that is not a pair");
            }
            if (node.Rows.Count != 1)
            {
                throw new FormatException(
                    $"an object marked '{ObjectMarker}:' holds (key value) pairs, "
                    + $"found a link of {node.Rows.Count.ToString(CultureInfo.InvariantCulture)} lines");
            }
            var pair = node.Rows[0];
            if (pair.Count != 2)
            {
                throw new FormatException(
                    $"an object marked '{ObjectMarker}:' holds (key value) pairs, "
                    + $"found a link of {pair.Count.ToString(CultureInfo.InvariantCulture)} values");
            }
            var key = NodeToKey(pair[0]);
            if (key is null)
            {
                throw new FormatException(
                    $"an object marked '{ObjectMarker}:' holds (key value) pairs, "
                    + "found a pair whose key is not text");
            }
            result[key] = NodeToValue(pair[1]);
        }

        return result;
    }

    /// <summary>
    /// The key a node in key position spells: a reference is the key itself, and
    /// a marked link is the text its marker escapes, which is how a key holding a
    /// character the form cannot carry stays a key instead of turning its object
    /// into an array.
    /// </summary>
    /// <returns>The key, or <c>null</c> when the node is not one</returns>
    private static string? NodeToKey(Node node)
    {
        if (node.IsRef)
        {
            return node.Value;
        }
        if (node.IsObject)
        {
            return null;
        }
        try
        {
            return DecodeMarkedValue(node.Rows);
        }
        catch (FormatException)
        {
            return null;
        }
    }

    /// <summary>
    /// Recognise a marked value: <c>(escaped "…")</c>, whose text is written as it
    /// is except for the percent-escaped characters this form cannot carry, and
    /// <c>(base64 "…")</c>, which versions up to 0.6.0 wrote and which is still
    /// read. A quoted marker is an ordinary object key, not a marker.
    /// </summary>
    /// <returns>The decoded string, or <c>null</c> when the link is not a marked value</returns>
    private static string? DecodeMarkedValue(List<List<Node>> rows)
    {
        if (rows.Count != 1 || rows[0].Count != 2)
        {
            return null;
        }

        var marker = rows[0][0];
        var payload = rows[0][1];

        if (!marker.IsRef || marker.Quoted)
        {
            return null;
        }
        if (!payload.IsRef || !payload.Quoted)
        {
            return null;
        }

        if (marker.Value == EscapedMarker)
        {
            return Unescape(payload.Value);
        }

        if (marker.Value != Base64Marker)
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
    /// Undo the percent-escaping of an <c>(escaped "…")</c> payload. Escapes stand
    /// for bytes, so a character outside ASCII is written as its UTF-8 bytes and
    /// read back from them.
    /// </summary>
    /// <exception cref="FormatException">If an escape is truncated, malformed or not UTF-8</exception>
    private static string Unescape(string payload)
    {
        var bytes = new List<byte>(payload.Length);
        int i = 0;
        int position = 0;

        while (i < payload.Length)
        {
            if (payload[i] != '%')
            {
                // Copied over as it is, one whole character at a time, so that a
                // surrogate pair keeps standing for the character it spells.
                var width = char.IsHighSurrogate(payload[i]) && i + 1 < payload.Length ? 2 : 1;
                bytes.AddRange(Encoding.UTF8.GetBytes(payload.Substring(i, width)));
                i += width;
                position++;
                continue;
            }

            if (i + 2 >= payload.Length)
            {
                throw new FormatException(
                    "truncated escape at character "
                    + position.ToString(CultureInfo.InvariantCulture)
                    + " of an escaped value");
            }

            var escape = payload.Substring(i + 1, 2);
            if (!byte.TryParse(escape, NumberStyles.AllowHexSpecifier, CultureInfo.InvariantCulture, out var value))
            {
                throw new FormatException($"invalid escape '%{escape}' in an escaped value");
            }
            bytes.Add(value);
            i += 3;
            position += 3;
        }

        try
        {
            return StrictUtf8.GetString(bytes.ToArray());
        }
        catch (DecoderFallbackException e)
        {
            throw new FormatException("invalid UTF-8 escaped value", e);
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
