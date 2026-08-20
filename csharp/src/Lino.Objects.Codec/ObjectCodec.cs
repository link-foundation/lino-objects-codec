// Object encoder/decoder for Links Notation format.

using System.Runtime.CompilerServices;
using System.Text;
using Link.Foundation.Links.Notation;

namespace Lino.Objects.Codec;

/// <summary>
/// Codec for encoding/decoding C# objects to/from Links Notation.
/// </summary>
public class ObjectCodec
{
    /// <summary>Type identifier for null values.</summary>
    public const string TypeNull = "null";
    /// <summary>Type identifier for boolean values.</summary>
    public const string TypeBool = "bool";
    /// <summary>Type identifier for integer values.</summary>
    public const string TypeInt = "int";
    /// <summary>Type identifier for float/double values.</summary>
    public const string TypeFloat = "float";
    /// <summary>Type identifier for string values.</summary>
    public const string TypeStr = "str";
    /// <summary>Type identifier for list/array values.</summary>
    public const string TypeList = "list";
    /// <summary>Type identifier for dictionary/object values.</summary>
    public const string TypeDict = "dict";

    private readonly Parser _parser = new();

    // For tracking object identity during encoding
    private Dictionary<object, string> _encodeMemo = new(ReferenceEqualityComparer.Instance);
    private int _encodeCounter = 0;
    // For tracking which objects need IDs (referenced multiple times or circularly)
    private HashSet<object> _needsId = new(ReferenceEqualityComparer.Instance);
    // For storing all definitions during encoding
    private List<(string RefId, Link<string> Link)> _allDefinitions = new();
    // For tracking references during decoding
    private Dictionary<string, object?> _decodeMemo = new();
    // For storing all links during multi-link decoding
    private List<Link<string>> _allLinks = new();

    /// <summary>
    /// Create a Link from string parts.
    /// </summary>
    private static Link<string> MakeLink(params string[] parts)
    {
        // Each part becomes a Link with that id
        var values = parts.Select(part => new Link<string>(part)).ToList();
        return new Link<string>(null, values);
    }

    /// <summary>
    /// First pass: identify which objects need IDs (referenced multiple times or circularly).
    /// </summary>
    private void FindObjectsNeedingIds(object? obj, Dictionary<object, bool>? seen = null, List<object>? path = null)
    {
        seen ??= new Dictionary<object, bool>(ReferenceEqualityComparer.Instance);
        path ??= new List<object>();

        // Only track mutable objects (lists and dictionaries)
        if (obj is null || (obj is not IList<object?> && obj is not IDictionary<string, object?>))
        {
            return;
        }

        // If we've seen this object before, it's referenced multiple times or circularly
        if (seen.ContainsKey(obj))
        {
            _needsId.Add(obj);
            // Also mark all objects in the cycle as needing IDs
            int cycleStart = path.IndexOf(obj);
            if (cycleStart >= 0)
            {
                // This is a circular reference - mark all objects in the cycle
                for (int i = cycleStart; i < path.Count; i++)
                {
                    _needsId.Add(path[i]);
                }
            }
            return; // Don't recurse again
        }

        // Mark as seen
        seen[obj] = true;
        // Add to current path
        var newPath = new List<object>(path) { obj };

        // Recurse into structure
        if (obj is IList<object?> list)
        {
            foreach (var item in list)
            {
                if (item is not null)
                {
                    FindObjectsNeedingIds(item, seen, newPath);
                }
            }
        }
        else if (obj is IDictionary<string, object?> dict)
        {
            foreach (var kvp in dict)
            {
                FindObjectsNeedingIds(kvp.Value, seen, newPath);
            }
        }
    }

    /// <summary>
    /// Encode a C# object into the readable, indented Links Notation format.
    /// </summary>
    /// <remarks>
    /// This is the default output: keys and values are written as they are, so the
    /// document can be read, grepped and reviewed without decoding anything. Use
    /// <see cref="EncodeCompact"/> for the single-line, base64 encoded form, which
    /// is the only one that can represent shared nodes and circular references.
    /// </remarks>
    /// <param name="obj">The C# object to encode</param>
    /// <returns>String representation in readable Links Notation format</returns>
    public string Encode(object? obj) => Readable.Encode(obj, Readable.DefaultIndent);

    /// <summary>
    /// Encode a C# object into the readable format with a custom indentation.
    /// </summary>
    /// <param name="obj">The C# object to encode</param>
    /// <param name="indent">Indentation string used per nesting level</param>
    /// <returns>String representation in readable Links Notation format</returns>
    public string Encode(object? obj, string indent) => Readable.Encode(obj, indent);

    /// <summary>
    /// Encode a C# object to the compact Links Notation format.
    /// </summary>
    /// <remarks>
    /// Every value carries its type marker and every string is base64 encoded, so
    /// the result is a single machine-oriented line. Unlike the readable format,
    /// this one names shared nodes with <c>obj_N</c> ids and can therefore
    /// represent circular references.
    /// </remarks>
    /// <param name="obj">The C# object to encode</param>
    /// <returns>String representation in compact Links Notation format</returns>
    public string EncodeCompact(object? obj)
    {
        // Reset state for each encode operation
        _encodeMemo = new Dictionary<object, string>(ReferenceEqualityComparer.Instance);
        _encodeCounter = 0;
        _needsId = new HashSet<object>(ReferenceEqualityComparer.Instance);
        _allDefinitions = new List<(string, Link<string>)>();

        // First pass: identify which objects need IDs (referenced multiple times or circularly)
        FindObjectsNeedingIds(obj);

        // Encode the object (this populates _allDefinitions)
        var mainLink = EncodeValue(obj, depth: 0);

        // If we have additional definitions, output them all as multi-link format
        if (_allDefinitions.Count > 0)
        {
            // The main link should be first
            var allLinks = new List<Link<string>> { mainLink };
            // Add all other definitions
            foreach (var (refId, link) in _allDefinitions)
            {
                // Only add if not the main link (avoid duplicates)
                if (mainLink.Id is null || mainLink.Id != refId)
                {
                    allLinks.Add(link);
                }
            }

            // Format as multi-link (newline separated)
            return string.Join("\n", allLinks.Select(link => new List<Link<string>> { link }.Format()));
        }

        // Single link output
        return new List<Link<string>> { mainLink }.Format();
    }

    /// <summary>
    /// Encode a C# object to the compact Links Notation format.
    /// </summary>
    /// <remarks>Kept as the historical name of <see cref="EncodeCompact"/>.</remarks>
    /// <param name="obj">The C# object to encode</param>
    /// <returns>String representation in compact Links Notation format</returns>
    public string EncodeObfuscated(object? obj) => EncodeCompact(obj);

    /// <summary>
    /// Decode Links Notation format to a C# object, in either format.
    /// </summary>
    /// <remarks>
    /// The format is detected from the document itself, so a document written by
    /// <see cref="Encode(object?)"/> and one written by <see cref="EncodeCompact"/>
    /// are both read back here.
    /// </remarks>
    /// <param name="notation">String in Links Notation format</param>
    /// <returns>Reconstructed C# object</returns>
    public object? Decode(string notation)
    {
        if (string.IsNullOrWhiteSpace(notation))
        {
            return null;
        }

        if (IsCompactNotation(notation))
        {
            CodecDebug.Trace("decode", () => "compact notation detected");
            return DecodeCompact(notation);
        }

        CodecDebug.Trace("decode", () => "readable notation detected");
        return Readable.Decode(notation);
    }

    /// <summary>
    /// Decode the compact Links Notation format to a C# object.
    /// </summary>
    /// <param name="notation">String in compact Links Notation format</param>
    /// <returns>Reconstructed C# object</returns>
    public object? DecodeCompact(string notation)
    {
        // Reset state for each decode operation
        _decodeMemo = new Dictionary<string, object?>();
        _allLinks = new List<Link<string>>();

        var links = _parser.Parse(notation);
        if (links is null || links.Count == 0)
        {
            return null;
        }

        // If there are multiple links, store them all for forward reference resolution
        if (links.Count > 1)
        {
            _allLinks = links.ToList();
            // Decode the first link (this will be the main result)
            // Forward references will be resolved automatically
            return DecodeLink(links[0]);
        }

        var link = links[0];

        // Handle case where format() creates output like (obj_0) which parser wraps
        // The parser returns a wrapper Link with no ID, containing the actual Link as first value
        if (link.Id is null && link.Values is not null && link.Values.Count == 1 &&
            link.Values[0].Id is string firstValueId && firstValueId.StartsWith("obj_"))
        {
            // Extract the actual Link
            link = link.Values[0];
        }

        return DecodeLink(link);
    }

    /// <summary>
    /// Encode a value into a Link.
    /// </summary>
    private Link<string> EncodeValue(object? obj, HashSet<object>? visited = null, int depth = 0)
    {
        visited ??= new HashSet<object>(ReferenceEqualityComparer.Instance);

        // Check if we've seen this object before (for circular references and shared objects)
        // Only track mutable objects (lists, dicts)
        if (obj is not null && (obj is IList<object?> || obj is IDictionary<string, object?>))
        {
            if (_encodeMemo.ContainsKey(obj))
            {
                // Return a reference to the previously defined object
                var refId = _encodeMemo[obj];
                return new Link<string>(refId);
            }

            // For mutable objects that need IDs, assign them
            if (_needsId.Contains(obj))
            {
                // Assign an ID if not already assigned
                if (!_encodeMemo.ContainsKey(obj))
                {
                    var refId = $"obj_{_encodeCounter}";
                    _encodeCounter++;
                    _encodeMemo[obj] = refId;
                }

                if (visited.Contains(obj))
                {
                    // We're in a cycle, create a direct reference
                    var refId = _encodeMemo[obj];
                    return new Link<string>(refId);
                }

                // Add to visited set
                visited = new HashSet<object>(visited, ReferenceEqualityComparer.Instance) { obj };
            }
        }

        // Encode based on type
        if (obj is null)
        {
            return MakeLink(TypeNull);
        }

        if (obj is bool boolVal)
        {
            return MakeLink(TypeBool, boolVal ? "true" : "false");
        }

        if (obj is int intVal)
        {
            return MakeLink(TypeInt, intVal.ToString());
        }

        if (obj is long longVal)
        {
            return MakeLink(TypeInt, longVal.ToString());
        }

        if (obj is double doubleVal)
        {
            // Handle special float values
            if (double.IsNaN(doubleVal))
            {
                return MakeLink(TypeFloat, "NaN");
            }
            if (double.IsPositiveInfinity(doubleVal))
            {
                return MakeLink(TypeFloat, "Infinity");
            }
            if (double.IsNegativeInfinity(doubleVal))
            {
                return MakeLink(TypeFloat, "-Infinity");
            }
            return MakeLink(TypeFloat, doubleVal.ToString(System.Globalization.CultureInfo.InvariantCulture));
        }

        if (obj is float floatVal)
        {
            // Handle special float values
            if (float.IsNaN(floatVal))
            {
                return MakeLink(TypeFloat, "NaN");
            }
            if (float.IsPositiveInfinity(floatVal))
            {
                return MakeLink(TypeFloat, "Infinity");
            }
            if (float.IsNegativeInfinity(floatVal))
            {
                return MakeLink(TypeFloat, "-Infinity");
            }
            return MakeLink(TypeFloat, floatVal.ToString(System.Globalization.CultureInfo.InvariantCulture));
        }

        if (obj is string strVal)
        {
            // Encode strings as base64 to handle special characters, newlines, etc.
            var b64Encoded = Convert.ToBase64String(Encoding.UTF8.GetBytes(strVal));
            return MakeLink(TypeStr, b64Encoded);
        }

        if (obj is IList<object?> list)
        {
            var parts = new List<Link<string>>();
            foreach (var item in list)
            {
                // Encode each item with increased depth
                var itemLink = EncodeValue(item, visited, depth + 1);
                parts.Add(itemLink);
            }

            // If this list has an ID, use self-reference format: (obj_id: list item1 item2 ...)
            if (_encodeMemo.TryGetValue(obj, out var listRefId))
            {
                var allValues = new List<Link<string>> { new(TypeList) };
                allValues.AddRange(parts);
                // Create the definition with self-reference ID
                var definition = new Link<string>(listRefId, allValues);
                // Store for multi-link output if not at top level
                if (depth > 0)
                {
                    _allDefinitions.Add((listRefId, definition));
                    // Return a reference instead of the full definition
                    return new Link<string>(listRefId);
                }
                return definition;
            }
            else
            {
                // Wrap in a type marker for lists without IDs: (list item1 item2 ...)
                var allValues = new List<Link<string>> { new(TypeList) };
                allValues.AddRange(parts);
                return new Link<string>(null, allValues);
            }
        }

        if (obj is IDictionary<string, object?> dict)
        {
            var parts = new List<Link<string>>();
            foreach (var kvp in dict)
            {
                // Encode key and value with increased depth
                var keyLink = EncodeValue(kvp.Key, visited, depth + 1);
                var valueLink = EncodeValue(kvp.Value, visited, depth + 1);
                // Create a pair link
                var pair = new Link<string>(null, new List<Link<string>> { keyLink, valueLink });
                parts.Add(pair);
            }

            // If this dict has an ID, use self-reference format: (obj_id: dict (key val) ...)
            if (_encodeMemo.TryGetValue(obj, out var dictRefId))
            {
                var allValues = new List<Link<string>> { new(TypeDict) };
                allValues.AddRange(parts);
                // Create the definition with self-reference ID
                var definition = new Link<string>(dictRefId, allValues);
                // Store for multi-link output if not at top level
                if (depth > 0)
                {
                    _allDefinitions.Add((dictRefId, definition));
                    // Return a reference instead of the full definition
                    return new Link<string>(dictRefId);
                }
                return definition;
            }
            else
            {
                // Wrap in a type marker for dicts without IDs: (dict (key val) ...)
                var allValues = new List<Link<string>> { new(TypeDict) };
                allValues.AddRange(parts);
                return new Link<string>(null, allValues);
            }
        }

        throw new NotSupportedException($"Unsupported type: {obj.GetType()}");
    }

    /// <summary>
    /// Decode a Link into a C# value.
    /// </summary>
    private object? DecodeLink(Link<string> link)
    {
        // Check if this is a direct reference to a previously decoded object
        // Direct references have an id but no values, or the id refers to an existing object
        if (link.Id is not null && _decodeMemo.ContainsKey(link.Id))
        {
            return _decodeMemo[link.Id];
        }

        if (link.Values is null || link.Values.Count == 0)
        {
            // Empty link - this might be a simple id, reference, or empty collection
            if (link.Id is not null)
            {
                // If it's in memo, return the cached object
                if (_decodeMemo.TryGetValue(link.Id, out var cached))
                {
                    return cached;
                }

                // If it starts with obj_, check if we have a forward reference in _allLinks
                if (link.Id.StartsWith("obj_") && _allLinks.Count > 0)
                {
                    // Look for this ID in the remaining links
                    foreach (var otherLink in _allLinks)
                    {
                        if (otherLink.Id == link.Id)
                        {
                            // Found it! Decode it now
                            return DecodeLink(otherLink);
                        }
                    }

                    // Not found in links - create empty list as fallback
                    var fallbackResult = new List<object?>();
                    _decodeMemo[link.Id] = fallbackResult;
                    return fallbackResult;
                }

                // Otherwise it's just a string ID
                return link.Id;
            }
            return null;
        }

        // Check if this link has a self-reference ID (format: obj_0: type ...)
        string? selfRefId = null;
        if (link.Id is not null && link.Id.StartsWith("obj_"))
        {
            selfRefId = link.Id;
            // If this is a back-reference (already in memo), return it
            if (_decodeMemo.TryGetValue(selfRefId, out var existing))
            {
                return existing;
            }
        }

        // Get the type marker from the first value
        var firstValue = link.Values[0];
        if (firstValue.Id is null)
        {
            // Not a type marker we recognize
            return null;
        }

        var typeMarker = firstValue.Id;

        if (typeMarker == TypeNull)
        {
            return null;
        }

        if (typeMarker == TypeBool)
        {
            if (link.Values.Count > 1)
            {
                var boolValue = link.Values[1];
                if (boolValue.Id is not null)
                {
                    return string.Equals(boolValue.Id, "true", StringComparison.OrdinalIgnoreCase);
                }
            }
            return false;
        }

        if (typeMarker == TypeInt)
        {
            if (link.Values.Count > 1)
            {
                var intValue = link.Values[1];
                if (intValue.Id is not null)
                {
                    return int.Parse(intValue.Id);
                }
            }
            return 0;
        }

        if (typeMarker == TypeFloat)
        {
            if (link.Values.Count > 1)
            {
                var floatValue = link.Values[1];
                if (floatValue.Id is not null)
                {
                    var valueStr = floatValue.Id;
                    if (valueStr == "NaN")
                    {
                        return double.NaN;
                    }
                    if (valueStr == "Infinity")
                    {
                        return double.PositiveInfinity;
                    }
                    if (valueStr == "-Infinity")
                    {
                        return double.NegativeInfinity;
                    }
                    return double.Parse(valueStr, System.Globalization.CultureInfo.InvariantCulture);
                }
            }
            return 0.0;
        }

        if (typeMarker == TypeStr)
        {
            if (link.Values.Count > 1)
            {
                var strValue = link.Values[1];
                if (strValue.Id is not null)
                {
                    var b64Str = strValue.Id;
                    // Decode from base64
                    try
                    {
                        var decodedBytes = Convert.FromBase64String(b64Str);
                        return Encoding.UTF8.GetString(decodedBytes);
                    }
                    catch
                    {
                        // If decode fails, return the raw value
                        return b64Str;
                    }
                }
            }
            return "";
        }

        if (typeMarker == TypeList)
        {
            // New format with self-reference: (obj_0: list item1 item2 ...)
            var startIdx = 1;
            var listId = selfRefId;  // Use self-reference ID from link.Id if present

            var resultList = new List<object?>();
            if (listId is not null)
            {
                _decodeMemo[listId] = resultList;
            }

            for (int i = startIdx; i < link.Values.Count; i++)
            {
                var itemLink = link.Values[i];
                var decodedItem = DecodeLink(itemLink);
                resultList.Add(decodedItem);
            }
            return resultList;
        }

        if (typeMarker == TypeDict)
        {
            // New format with self-reference: (obj_0: dict (key val) ...)
            var startIdx = 1;
            var dictId = selfRefId;  // Use self-reference ID from link.Id if present

            var resultDict = new Dictionary<string, object?>();
            if (dictId is not null)
            {
                _decodeMemo[dictId] = resultDict;
            }

            for (int i = startIdx; i < link.Values.Count; i++)
            {
                var pairLink = link.Values[i];
                if (pairLink.Values is not null && pairLink.Values.Count >= 2)
                {
                    var keyLink = pairLink.Values[0];
                    var valueLink = pairLink.Values[1];

                    var decodedKey = DecodeLink(keyLink);
                    var decodedValue = DecodeLink(valueLink);

                    if (decodedKey is string keyStr)
                    {
                        resultDict[keyStr] = decodedValue;
                    }
                }
            }
            return resultDict;
        }

        // Unknown type marker
        throw new InvalidOperationException($"Unknown type marker: {typeMarker}");
    }

    /// <summary>
    /// Type markers that open a compact document, across all implementations.
    /// </summary>
    /// <remarks>
    /// The languages historically disagreed on three of them — Python writes
    /// <c>None</c>/<c>list</c>/<c>dict</c> where JavaScript and Rust write
    /// <c>null</c>/<c>array</c>/<c>object</c> — so every implementation accepts
    /// the union and can read a compact document written by any of the others.
    /// </remarks>
    private static readonly HashSet<string> CompactTypeMarkers = new(StringComparer.Ordinal)
    {
        TypeNull, "None", TypeBool, TypeInt, TypeFloat, TypeStr,
        "array", TypeList, "object", TypeDict,
    };

    /// <summary>
    /// Whether a document is in the compact format.
    /// </summary>
    /// <remarks>
    /// A compact document always opens with a parenthesis followed by a type
    /// marker — optionally preceded by an object id, as in <c>(obj_0: object …)</c>.
    /// Readable output never does: its first line is either a lone <c>(</c> or a
    /// scalar.
    /// </remarks>
    /// <param name="notation">The document to classify</param>
    /// <returns>True when the document should be read by <see cref="DecodeCompact"/></returns>
    public static bool IsCompactNotation(string notation)
    {
        var firstLine = notation
            .Split('\n')
            .Select(line => line.Trim())
            .FirstOrDefault(line => line.Length > 0);

        if (firstLine is null || !firstLine.StartsWith('('))
        {
            return false;
        }

        var tokens = firstLine[1..]
            .Split(new[] { ' ', '\t', '\r', '(', ')' }, StringSplitOptions.RemoveEmptyEntries);

        if (tokens.Length == 0)
        {
            return false;
        }

        var marker = tokens[0];

        // Skip the `obj_N:` definition id, if present.
        if (marker.EndsWith(':'))
        {
            if (!marker[..^1].StartsWith("obj_", StringComparison.Ordinal) || tokens.Length < 2)
            {
                return false;
            }
            marker = tokens[1];
        }

        return CompactTypeMarkers.Contains(marker);
    }
}

/// <summary>
/// Comparer that compares objects by reference equality.
/// </summary>
internal class ReferenceEqualityComparer : IEqualityComparer<object>
{
    public static readonly ReferenceEqualityComparer Instance = new();

    public new bool Equals(object? x, object? y) => ReferenceEquals(x, y);

    public int GetHashCode(object obj) => RuntimeHelpers.GetHashCode(obj);
}

/// <summary>
/// Convenience functions for encoding/decoding objects.
/// </summary>
public static class Codec
{
    /// <summary>
    /// Encode a C# object into the readable, indented Links Notation format.
    /// </summary>
    /// <param name="obj">The C# object to encode</param>
    /// <returns>String representation in readable Links Notation format</returns>
    public static string Encode(object? obj) => new ObjectCodec().Encode(obj);

    /// <summary>
    /// Encode a C# object into the readable format with a custom indentation.
    /// </summary>
    /// <param name="obj">The C# object to encode</param>
    /// <param name="indent">Indentation string used per nesting level</param>
    /// <returns>String representation in readable Links Notation format</returns>
    public static string Encode(object? obj, string indent) => new ObjectCodec().Encode(obj, indent);

    /// <summary>
    /// Encode a C# object to the compact Links Notation format.
    /// </summary>
    /// <param name="obj">The C# object to encode</param>
    /// <returns>String representation in compact Links Notation format</returns>
    public static string EncodeCompact(object? obj) => new ObjectCodec().EncodeCompact(obj);

    /// <summary>
    /// Encode a C# object to the compact Links Notation format.
    /// </summary>
    /// <param name="obj">The C# object to encode</param>
    /// <returns>String representation in compact Links Notation format</returns>
    public static string EncodeObfuscated(object? obj) => new ObjectCodec().EncodeCompact(obj);

    /// <summary>
    /// Decode Links Notation format to a C# object, in either format.
    /// </summary>
    /// <param name="notation">String in Links Notation format</param>
    /// <returns>Reconstructed C# object</returns>
    public static object? Decode(string notation) => new ObjectCodec().Decode(notation);

    /// <summary>
    /// Decode the compact Links Notation format to a C# object.
    /// </summary>
    /// <param name="notation">String in compact Links Notation format</param>
    /// <returns>Reconstructed C# object</returns>
    public static object? DecodeCompact(string notation) => new ObjectCodec().DecodeCompact(notation);

    /// <summary>
    /// Whether a document is in the compact format.
    /// </summary>
    /// <param name="notation">The document to classify</param>
    /// <returns>True when the document is compact</returns>
    public static bool IsCompactNotation(string notation) => ObjectCodec.IsCompactNotation(notation);
}

/// <summary>
/// Formatting utilities for indented Links Notation format.
/// </summary>
public static class Format
{
    /// <summary>
    /// Escape a reference for Links Notation.
    /// References need escaping when they contain spaces, quotes, parentheses, colons, or newlines.
    /// </summary>
    /// <param name="value">The value to escape</param>
    /// <returns>The escaped reference string</returns>
    public static string EscapeReference(string value)
    {
        // Check if escaping is needed
        bool needsEscaping = value.Any(c => char.IsWhiteSpace(c) || c == '(' || c == ')' || c == '\'' || c == '"' || c == ':')
            || value.Contains('\n');

        if (!needsEscaping)
        {
            return value;
        }

        bool hasSingle = value.Contains('\'');
        bool hasDouble = value.Contains('"');

        // If contains single quotes but not double quotes, use double quotes
        if (hasSingle && !hasDouble)
        {
            return $"\"{value}\"";
        }

        // If contains double quotes but not single quotes, use single quotes
        if (hasDouble && !hasSingle)
        {
            return $"'{value}'";
        }

        // If contains both quotes, count which one appears more
        if (hasSingle && hasDouble)
        {
            int singleCount = value.Count(c => c == '\'');
            int doubleCount = value.Count(c => c == '"');

            if (doubleCount < singleCount)
            {
                // Use double quotes, escape internal double quotes by doubling
                var escaped = value.Replace("\"", "\"\"");
                return $"\"{escaped}\"";
            }
            else
            {
                // Use single quotes, escape internal single quotes by doubling
                var escaped = value.Replace("'", "''");
                return $"'{escaped}'";
            }
        }

        // Just spaces or other special characters, use single quotes by default
        return $"'{value}'";
    }

    /// <summary>
    /// Unescape a reference from Links Notation format.
    /// Reverses the escaping done by EscapeReference.
    /// </summary>
    /// <param name="str">The escaped reference string</param>
    /// <returns>The unescaped string</returns>
    public static string UnescapeReference(string str)
    {
        if (str is null) return str!;

        // Unescape doubled quotes
        return str.Replace("\"\"", "\"").Replace("''", "'");
    }

    // Shared parser instance for ParseIndented
    private static readonly Parser SharedParser = new();

    /// <summary>
    /// Format a value for display in indented Links Notation.
    /// Uses quoting strategy compatible with the links-notation parser:
    /// - If value contains double quotes, wrap in single quotes
    /// - Otherwise, wrap in double quotes
    /// </summary>
    private static string FormatIndentedValue(string? value)
    {
        if (value is null)
        {
            return "\"null\"";
        }

        bool hasSingle = value.Contains('\'');
        bool hasDouble = value.Contains('"');

        // If contains double quotes but no single quotes, use single quotes
        if (hasDouble && !hasSingle)
        {
            return $"'{value}'";
        }

        // If contains single quotes but no double quotes, use double quotes
        if (hasSingle && !hasDouble)
        {
            return $"\"{value}\"";
        }

        // If contains both, use single quotes and escape internal single quotes
        if (hasSingle && hasDouble)
        {
            var escaped = value.Replace("'", "''");
            return $"'{escaped}'";
        }

        // Default: use double quotes
        return $"\"{value}\"";
    }

    /// <summary>
    /// Format an object in indented Links Notation format.
    ///
    /// This format is designed for human readability, displaying objects as:
    /// <code>
    /// &lt;identifier&gt;
    ///   &lt;key&gt; "&lt;value&gt;"
    ///   &lt;key&gt; "&lt;value&gt;"
    ///   ...
    /// </code>
    /// </summary>
    /// <param name="id">The object identifier (displayed on first line)</param>
    /// <param name="obj">The dictionary with key-value pairs to format</param>
    /// <param name="indent">The indentation string (default: 2 spaces)</param>
    /// <returns>Formatted indented Links Notation string</returns>
    /// <exception cref="ArgumentException">If id is null or empty</exception>
    /// <example>
    /// <code>
    /// var obj = new Dictionary&lt;string, string&gt;
    /// {
    ///     { "status", "executed" },
    ///     { "exitCode", "0" }
    /// };
    /// var result = Format.FormatIndented("my-uuid", obj);
    /// </code>
    /// </example>
    public static string FormatIndented(string id, IDictionary<string, string?> obj, string indent = "  ")
    {
        if (string.IsNullOrEmpty(id))
        {
            throw new ArgumentException("id is required for FormatIndented", nameof(id));
        }

        if (obj is null)
        {
            throw new ArgumentNullException(nameof(obj), "obj must be a dictionary for FormatIndented");
        }

        var lines = new List<string> { id };

        foreach (var kvp in obj)
        {
            var escapedKey = EscapeReference(kvp.Key);
            var formattedValue = FormatIndentedValue(kvp.Value);
            lines.Add($"{indent}{escapedKey} {formattedValue}");
        }

        return string.Join("\n", lines);
    }

    /// <summary>
    /// Format an object in indented Links Notation format, maintaining key order.
    /// This is similar to FormatIndented but takes an array of tuples to preserve
    /// the order of keys.
    /// </summary>
    /// <param name="id">The object identifier (displayed on first line)</param>
    /// <param name="pairs">The key-value pairs in order</param>
    /// <param name="indent">The indentation string (default: 2 spaces)</param>
    /// <returns>Formatted indented Links Notation string</returns>
    public static string FormatIndentedOrdered(string id, (string Key, string? Value)[] pairs, string indent = "  ")
    {
        if (string.IsNullOrEmpty(id))
        {
            throw new ArgumentException("id is required for FormatIndentedOrdered", nameof(id));
        }

        var lines = new List<string> { id };

        foreach (var (key, value) in pairs)
        {
            var escapedKey = EscapeReference(key);
            var formattedValue = FormatIndentedValue(value);
            lines.Add($"{indent}{escapedKey} {formattedValue}");
        }

        return string.Join("\n", lines);
    }

    /// <summary>
    /// Parse an indented Links Notation string back to an object.
    ///
    /// This function uses the links-notation parser for proper parsing,
    /// supporting the standard Links Notation indented syntax.
    ///
    /// Parses strings like:
    /// <code>
    /// &lt;identifier&gt;
    ///   &lt;key&gt; "&lt;value&gt;"
    ///   &lt;key&gt; "&lt;value&gt;"
    ///   ...
    /// </code>
    ///
    /// The format with colon after identifier is also supported (standard lino):
    /// <code>
    /// &lt;identifier&gt;:
    ///   &lt;key&gt; "&lt;value&gt;"
    /// </code>
    /// </summary>
    /// <param name="text">The indented Links Notation string to parse</param>
    /// <returns>A tuple of (id, dictionary of key-value pairs)</returns>
    /// <exception cref="ArgumentException">If text is null or empty</exception>
    /// <example>
    /// <code>
    /// var text = "my-uuid\n  status \"executed\"\n  exitCode \"0\"";
    /// var (id, obj) = Format.ParseIndented(text);
    /// // id = "my-uuid"
    /// // obj["status"] = "executed"
    /// </code>
    /// </example>
    public static (string Id, Dictionary<string, string?> Obj) ParseIndented(string text)
    {
        if (string.IsNullOrEmpty(text))
        {
            throw new ArgumentException("text is required for ParseIndented", nameof(text));
        }

        var lines = text.Split('\n');
        if (lines.Length == 0)
        {
            throw new ArgumentException("text must have at least one line (the identifier)", nameof(text));
        }

        // Filter out empty lines to preserve indentation structure for the parser
        // Empty lines would break the indentation context in links-notation
        var nonEmptyLines = lines.Where(l => !string.IsNullOrWhiteSpace(l)).ToArray();

        if (nonEmptyLines.Length == 0)
        {
            throw new ArgumentException("text must have at least one non-empty line (the identifier)", nameof(text));
        }

        // Convert to standard lino format by adding colon after first line if not present
        // This allows the links-notation parser to properly parse the indented structure
        var firstLine = nonEmptyLines[0].Trim();
        string linoText;
        if (firstLine.EndsWith(':'))
        {
            linoText = string.Join("\n", nonEmptyLines);
        }
        else
        {
            linoText = $"{firstLine}:\n{string.Join("\n", nonEmptyLines.Skip(1))}";
        }

        // Use links-notation parser
        var parsed = SharedParser.Parse(linoText);

        if (parsed is null || parsed.Count == 0)
        {
            throw new ArgumentException("Failed to parse indented Links Notation", nameof(text));
        }

        // Extract id and key-value pairs from parsed result
        var mainLink = parsed[0];
        var resultId = mainLink.Id ?? "";
        var obj = new Dictionary<string, string?>();

        // Process the values list - each entry is a doublet (key value)
        if (mainLink.Values is not null)
        {
            foreach (var child in mainLink.Values)
            {
                if (child.Values is not null && child.Values.Count == 2)
                {
                    var keyRef = child.Values[0];
                    var valueRef = child.Values[1];

                    // Get key string
                    var key = keyRef.Id ?? "";

                    // Get value string, handling null
                    var valueStr = valueRef.Id;
                    if (valueStr == "null")
                    {
                        obj[key] = null;
                    }
                    else
                    {
                        obj[key] = valueStr;
                    }
                }
            }
        }

        return (resultId, obj);
    }
}
