//! Readable, indented Links Notation representation.
//!
//! This module implements the default output of [`crate::encode`]: a plain-text,
//! indented projection where keys and values are written as they are, so the file
//! can be read, grepped and reviewed without decoding anything.
//!
//! # Shape
//!
//! One construct — `( )` — is used for both objects and arrays, at every level
//! including the root. What distinguishes them is the content of the lines:
//! `key value` pairs make an object, bare values make an array.
//!
//! ```text
//! (
//!   type "RouterState"
//!   server (
//!     host "127.0.0.1"
//!     port 18878
//!   )
//!   models (
//!     "claude-haiku"
//!     "claude-opus"
//!   )
//! )
//! ```
//!
//! # Value mapping
//!
//! | `LinoValue`                | Readable form                                  |
//! |----------------------------|------------------------------------------------|
//! | `Object`                   | `( )` with one `key value` pair per line        |
//! | `Array`                    | `( )` with one value per line                   |
//! | `String`                   | quoted, never encoded                           |
//! | `Int` / `Float` / `Bool` / `Null` | bare, so the type survives the round trip |
//!
//! Empty containers keep their type: an empty array is `()` on one line, while an
//! empty object is written as `(` and `)` on two lines.
//!
//! Only values that cannot be written as plain text are encoded: strings holding
//! control characters (including newlines and tabs, which line-based tooling and
//! CRLF normalisation would corrupt) are marked individually as
//! `(base64 "…")` instead of encoding the whole document.
//!
//! # Single-line form
//!
//! [`encode_line`] writes the same document on one line, so one record is one
//! line and an append-only log stays greppable, tailable and countable by
//! `wc -l`. Rows can no longer be told apart by line breaks there, so an object
//! names itself with the `o` link id the notation already has, and its pairs are
//! written as their own links:
//!
//! ```text
//! (o: (type "RouterState") (server (o: (host "127.0.0.1") (port 18878))) (models ("claude-haiku" "claude-opus")))
//! ```
//!
//! | Value            | Single-line form              |
//! |------------------|-------------------------------|
//! | `Object`         | `(o: (key value) …)`          |
//! | empty `Object`   | `(o:)`                        |
//! | `Array`          | `(value …)`                   |
//! | empty `Array`    | `()`                          |
//! | scalars          | exactly as in the indented form |
//!
//! The marker is what answers the ambiguity a flat layout otherwise has: without
//! it `((key value))` reads both as the one-pair object and as the array holding
//! the two-element array, and an empty key makes it worse. With it, a bare `( )`
//! is always an array and a marked one is always an object, so every value —
//! empty key included — survives the round trip. Consequently a *hand-written*
//! one-line link such as `(a 1)` is the two-element array, not the one-pair
//! object: on one line, objects say so.

use crate::debug::trace;
use crate::{CodecError, LinoValue};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};

/// Default indentation used by [`encode`].
pub const DEFAULT_INDENT: &str = "  ";

/// Marker used for values that cannot be represented as plain text.
pub const BASE64_MARKER: &str = "base64";

/// Link id naming an object in the single-line form, written as `(o: …)`.
pub const OBJECT_MARKER: &str = "o";

/// Encode a value into the readable, indented Links Notation form.
pub fn encode(value: &LinoValue, indent: &str) -> String {
    let mut out = String::new();
    write_value(value, indent, 0, &mut out);
    out
}

/// Encode a value into the readable, single-line Links Notation form.
///
/// The result never contains a newline, so one value is one line of an
/// append-only log. See the module documentation for the shape.
pub fn encode_line(value: &LinoValue) -> String {
    let mut out = String::new();
    write_line_value(value, &mut out);
    out
}

/// Decode the readable, single-line Links Notation form back into a value.
///
/// This is the exact inverse of [`encode_line`]. Input spanning more than one
/// line is rejected: a line-based reader hands over one record at a time, and
/// silently accepting several would merge two records into one value.
pub fn decode_line(text: &str) -> Result<LinoValue, CodecError> {
    let line = text.trim_matches(|c: char| c == '\n' || c == '\r');
    if line.contains('\n') || line.contains('\r') {
        return Err(CodecError::ParseError(
            "a single-line document cannot contain a line break".to_string(),
        ));
    }
    decode(line)
}

/// Decode the readable, indented Links Notation form back into a value.
pub fn decode(text: &str) -> Result<LinoValue, CodecError> {
    let tokens = tokenize(text)?;
    trace("readable.decode", || format!("{} tokens", tokens.len()));
    let mut cursor = Cursor { tokens, pos: 0 };
    let rows = cursor.parse_rows(true)?;

    if cursor.pos < cursor.tokens.len() {
        return Err(CodecError::ParseError(
            "unexpected ')' in readable notation".to_string(),
        ));
    }

    // A document holding a single value (for example `42`) is that value.
    if rows.len() == 1 && rows[0].len() == 1 {
        return node_to_value(&rows[0][0]);
    }

    rows_to_value(&rows, true, false)
}

// === Encoding ===

fn write_value(value: &LinoValue, indent: &str, level: usize, out: &mut String) {
    match value {
        LinoValue::Object(pairs) => {
            if pairs.is_empty() {
                // An empty object spans two lines; `()` on one line is an empty array.
                out.push_str("(\n");
                push_indent(indent, level, out);
                out.push(')');
                return;
            }

            out.push('(');
            for (key, child) in pairs {
                out.push('\n');
                push_indent(indent, level + 1, out);
                out.push_str(&format_key(key));
                out.push(' ');
                write_value(child, indent, level + 1, out);
            }
            out.push('\n');
            push_indent(indent, level, out);
            out.push(')');
        }

        LinoValue::Array(items) => {
            if items.is_empty() {
                out.push_str("()");
                return;
            }

            out.push('(');
            for item in items {
                out.push('\n');
                push_indent(indent, level + 1, out);
                write_value(item, indent, level + 1, out);
            }
            out.push('\n');
            push_indent(indent, level, out);
            out.push(')');
        }

        scalar => out.push_str(&format_scalar(scalar)),
    }
}

/// Write a value on one line. Objects name themselves with the `o` link id and
/// write each pair as its own link, so nothing depends on where lines break.
fn write_line_value(value: &LinoValue, out: &mut String) {
    match value {
        LinoValue::Object(pairs) => {
            if pairs.is_empty() {
                // `()` is the empty array, so the empty object keeps its marker.
                out.push('(');
                out.push_str(OBJECT_MARKER);
                out.push_str(":)");
                return;
            }

            out.push('(');
            out.push_str(OBJECT_MARKER);
            out.push(':');
            for (key, child) in pairs {
                out.push_str(" (");
                out.push_str(&format_key(key));
                out.push(' ');
                write_line_value(child, out);
                out.push(')');
            }
            out.push(')');
        }

        LinoValue::Array(items) => {
            out.push('(');
            for (index, item) in items.iter().enumerate() {
                if index > 0 {
                    out.push(' ');
                }
                write_line_value(item, out);
            }
            out.push(')');
        }

        scalar => out.push_str(&format_scalar(scalar)),
    }
}

fn push_indent(indent: &str, level: usize, out: &mut String) {
    for _ in 0..level {
        out.push_str(indent);
    }
}

/// Format a scalar value. Strings are quoted, everything else stays bare so that
/// its type is recoverable when reading the document back.
fn format_scalar(value: &LinoValue) -> String {
    match value {
        LinoValue::Null => "null".to_string(),
        LinoValue::Bool(b) => b.to_string(),
        LinoValue::Int(i) => i.to_string(),
        LinoValue::Float(f) => format_float(*f),
        LinoValue::String(s) => format_string(s),
        // Containers are handled by write_value.
        LinoValue::Array(_) | LinoValue::Object(_) => String::new(),
    }
}

fn format_float(f: f64) -> String {
    if f.is_nan() {
        "NaN".to_string()
    } else if f.is_infinite() {
        if f.is_sign_positive() {
            "Infinity".to_string()
        } else {
            "-Infinity".to_string()
        }
    } else {
        // `{:?}` keeps the decimal point for whole floats (`1.0`), which is what
        // tells a float apart from an integer when reading the document back.
        format!("{:?}", f)
    }
}

/// Format a string value: quoted plain text, or an individually marked
/// base64 payload when the text cannot be written literally.
fn format_string(value: &str) -> String {
    if needs_encoding(value) {
        return format!(
            "({} {})",
            BASE64_MARKER,
            quote(&BASE64.encode(value.as_bytes()))
        );
    }
    quote(value)
}

/// A value can be written as text unless it contains control characters:
/// newlines break the line structure and CRLF normalisation would rewrite them.
fn needs_encoding(value: &str) -> bool {
    value.chars().any(char::is_control)
}

fn quote(value: &str) -> String {
    let has_double = value.contains('"');
    let has_single = value.contains('\'');

    if !has_double {
        return format!("\"{}\"", value);
    }
    if !has_single {
        return format!("'{}'", value);
    }
    // Both quote styles are present: double the double quotes, as the parser expects.
    format!("\"{}\"", value.replace('"', "\"\""))
}

/// Format an object key. Keys are bare when they read as plain identifiers.
fn format_key(key: &str) -> String {
    let plain = !key.is_empty()
        && key != BASE64_MARKER
        && !needs_encoding(key)
        && !key
            .chars()
            .any(|c| c.is_whitespace() || matches!(c, '(' | ')' | '\'' | '"' | ':' | '`'));

    if plain {
        key.to_string()
    } else {
        format_string(key)
    }
}

// === Decoding ===

#[derive(Debug, Clone, PartialEq, Eq)]
enum Token {
    Open,
    Close,
    Newline,
    Ref { value: String, quoted: bool },
}

/// A parsed element of the readable form: either a reference (remembering whether
/// it was quoted, which is what distinguishes a string from a number) or a link.
#[derive(Debug, Clone)]
enum Node {
    Ref {
        value: String,
        quoted: bool,
    },
    Link {
        rows: Vec<Vec<Node>>,
        multiline: bool,
        /// Whether the link named itself an object with the `o:` marker.
        object: bool,
    },
}

fn tokenize(text: &str) -> Result<Vec<Token>, CodecError> {
    let chars: Vec<char> = text.chars().collect();
    let mut tokens = Vec::new();
    let mut i = 0;

    while i < chars.len() {
        let c = chars[i];

        if c == '\n' {
            tokens.push(Token::Newline);
            i += 1;
        } else if c.is_whitespace() {
            i += 1;
        } else if c == '(' {
            tokens.push(Token::Open);
            i += 1;
        } else if c == ')' {
            tokens.push(Token::Close);
            i += 1;
        } else if matches!(c, '"' | '\'' | '`') {
            let (value, next) = read_quoted(&chars, i, c)?;
            tokens.push(Token::Ref {
                value,
                quoted: true,
            });
            i = next;
        } else {
            let start = i;
            while i < chars.len()
                && !chars[i].is_whitespace()
                && !matches!(chars[i], '(' | ')' | '"' | '\'' | '`')
            {
                i += 1;
            }
            tokens.push(Token::Ref {
                value: chars[start..i].iter().collect(),
                quoted: false,
            });
        }
    }

    Ok(tokens)
}

/// Read a quoted reference, where a doubled quote character means a literal one.
fn read_quoted(
    chars: &[char],
    start: usize,
    quote_char: char,
) -> Result<(String, usize), CodecError> {
    let mut value = String::new();
    let mut i = start + 1;

    while i < chars.len() {
        if chars[i] == quote_char {
            if chars.get(i + 1) == Some(&quote_char) {
                value.push(quote_char);
                i += 2;
                continue;
            }
            return Ok((value, i + 1));
        }
        value.push(chars[i]);
        i += 1;
    }

    Err(CodecError::ParseError(format!(
        "unterminated quoted value starting at character {}",
        start
    )))
}

struct Cursor {
    tokens: Vec<Token>,
    pos: usize,
}

impl Cursor {
    /// Parse rows until the matching `)` (or the end of input at the top level).
    /// A row is one line: the values written between two newlines.
    fn parse_rows(&mut self, top_level: bool) -> Result<Vec<Vec<Node>>, CodecError> {
        let mut rows: Vec<Vec<Node>> = Vec::new();
        let mut row: Vec<Node> = Vec::new();

        while self.pos < self.tokens.len() {
            match &self.tokens[self.pos] {
                Token::Close => {
                    if top_level {
                        break;
                    }
                    self.pos += 1;
                    if !row.is_empty() {
                        rows.push(row);
                    }
                    return Ok(rows);
                }
                Token::Newline => {
                    self.pos += 1;
                    if !row.is_empty() {
                        rows.push(std::mem::take(&mut row));
                    }
                }
                _ => row.push(self.parse_node()?),
            }
        }

        if !top_level {
            return Err(CodecError::ParseError(
                "unterminated '(' in readable notation".to_string(),
            ));
        }

        if !row.is_empty() {
            rows.push(row);
        }
        Ok(rows)
    }

    fn parse_node(&mut self) -> Result<Node, CodecError> {
        match self.tokens[self.pos].clone() {
            Token::Ref { value, quoted } => {
                self.pos += 1;
                Ok(Node::Ref { value, quoted })
            }
            Token::Open => {
                self.pos += 1;
                let object = self.take_object_marker();
                let multiline = self.link_is_multiline();
                let rows = self.parse_rows(false)?;
                Ok(Node::Link {
                    rows,
                    multiline,
                    object,
                })
            }
            Token::Close | Token::Newline => Err(CodecError::ParseError(
                "unexpected token in readable notation".to_string(),
            )),
        }
    }

    /// Consume the `o:` marker if the link that just opened carries one, which is
    /// how the single-line form says "this link is an object, not an array".
    fn take_object_marker(&mut self) -> bool {
        let marker = format!("{}:", OBJECT_MARKER);
        let is_marker = matches!(
            self.tokens.get(self.pos),
            Some(Token::Ref { value, quoted: false }) if *value == marker
        );
        if is_marker {
            self.pos += 1;
        }
        is_marker
    }

    /// Whether the link that just opened spans more than one line, which is what
    /// tells an empty object (`(\n)`) from an empty array (`()`).
    fn link_is_multiline(&self) -> bool {
        self.tokens[self.pos..]
            .iter()
            .take_while(|t| **t != Token::Close)
            .any(|t| *t == Token::Newline)
    }
}

fn node_to_value(node: &Node) -> Result<LinoValue, CodecError> {
    match node {
        Node::Ref { value, quoted } => Ok(ref_to_value(value, *quoted)),
        Node::Link {
            rows,
            multiline,
            object,
        } => rows_to_value(rows, *multiline, *object),
    }
}

fn rows_to_value(
    rows: &[Vec<Node>],
    multiline: bool,
    object_marker: bool,
) -> Result<LinoValue, CodecError> {
    if object_marker {
        return marked_object_to_value(rows);
    }

    if rows.is_empty() {
        return Ok(if multiline {
            LinoValue::Object(vec![])
        } else {
            LinoValue::Array(vec![])
        });
    }

    if let Some(marked) = decode_marked_value(rows) {
        return marked;
    }

    // Written on one line, a link is a list of values: an object on one line says
    // so with the `o:` marker, which is what keeps `(key value)` unambiguous.
    if !multiline {
        let mut items = Vec::new();
        for row in rows {
            for node in row {
                items.push(node_to_value(node)?);
            }
        }
        return Ok(LinoValue::Array(items));
    }

    // `key value` on every line makes an object; anything else is a list of values.
    let is_object = rows
        .iter()
        .all(|row| row.len() == 2 && matches!(row[0], Node::Ref { .. }));

    if is_object {
        let mut pairs = Vec::with_capacity(rows.len());
        for row in rows {
            let Node::Ref { value: key, .. } = &row[0] else {
                unreachable!("checked by is_object")
            };
            pairs.push((key.clone(), node_to_value(&row[1])?));
        }
        return Ok(LinoValue::Object(pairs));
    }

    let mut items = Vec::new();
    for row in rows {
        for node in row {
            items.push(node_to_value(node)?);
        }
    }
    Ok(LinoValue::Array(items))
}

/// Build the object a `(o: (key value) …)` link describes. Every value in it is
/// a pair, so anything else is a malformed document rather than a silent array.
fn marked_object_to_value(rows: &[Vec<Node>]) -> Result<LinoValue, CodecError> {
    let mut pairs = Vec::new();

    for node in rows.iter().flatten() {
        let Node::Link {
            rows: pair,
            object: false,
            ..
        } = node
        else {
            return Err(CodecError::ParseError(format!(
                "an object marked '{}:' holds (key value) pairs, found a value that is not a pair",
                OBJECT_MARKER
            )));
        };

        let [row] = pair.as_slice() else {
            return Err(CodecError::ParseError(format!(
                "an object marked '{}:' holds (key value) pairs, found a link of {} lines",
                OBJECT_MARKER,
                pair.len()
            )));
        };

        let [Node::Ref { value: key, .. }, value] = row.as_slice() else {
            return Err(CodecError::ParseError(format!(
                "an object marked '{}:' holds (key value) pairs, found a link of {} values",
                OBJECT_MARKER,
                row.len()
            )));
        };

        pairs.push((key.clone(), node_to_value(value)?));
    }

    Ok(LinoValue::Object(pairs))
}

/// Recognise `(base64 "…")`, the individual marker for values that could not be
/// written as text. A quoted `base64` key is an ordinary object key, not a marker.
fn decode_marked_value(rows: &[Vec<Node>]) -> Option<Result<LinoValue, CodecError>> {
    if rows.len() != 1 || rows[0].len() != 2 {
        return None;
    }

    let Node::Ref {
        value: marker,
        quoted: false,
    } = &rows[0][0]
    else {
        return None;
    };
    if marker != BASE64_MARKER {
        return None;
    }

    let Node::Ref {
        value: payload,
        quoted: true,
    } = &rows[0][1]
    else {
        return None;
    };

    Some(
        BASE64
            .decode(payload)
            .map_err(|e| CodecError::DecodeError(format!("invalid base64 value: {}", e)))
            .and_then(|bytes| {
                String::from_utf8(bytes)
                    .map(LinoValue::String)
                    .map_err(|e| CodecError::DecodeError(format!("invalid UTF-8 value: {}", e)))
            }),
    )
}

/// Convert a reference to a value. Quoted references are always strings; bare
/// references keep the type they were written with.
fn ref_to_value(value: &str, quoted: bool) -> LinoValue {
    if quoted {
        return LinoValue::String(value.to_string());
    }

    match value {
        "null" => return LinoValue::Null,
        "true" => return LinoValue::Bool(true),
        "false" => return LinoValue::Bool(false),
        "NaN" => return LinoValue::Float(f64::NAN),
        "Infinity" => return LinoValue::Float(f64::INFINITY),
        "-Infinity" => return LinoValue::Float(f64::NEG_INFINITY),
        _ => {}
    }

    if let Ok(i) = value.parse::<i64>() {
        return LinoValue::Int(i);
    }
    if value.contains(['.', 'e', 'E']) {
        if let Ok(f) = value.parse::<f64>() {
            return LinoValue::Float(f);
        }
    }

    LinoValue::String(value.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn roundtrip(value: &LinoValue) -> LinoValue {
        let text = encode(value, DEFAULT_INDENT);
        decode(&text).unwrap_or_else(|e| panic!("failed to decode {:?}: {}", text, e))
    }

    #[test]
    fn empty_containers_keep_their_type() {
        assert_eq!(encode(&LinoValue::Array(vec![]), DEFAULT_INDENT), "()");
        assert_eq!(encode(&LinoValue::Object(vec![]), DEFAULT_INDENT), "(\n)");
        assert_eq!(
            roundtrip(&LinoValue::Array(vec![])),
            LinoValue::Array(vec![])
        );
        assert_eq!(
            roundtrip(&LinoValue::Object(vec![])),
            LinoValue::Object(vec![])
        );
    }

    #[test]
    fn single_pair_object_is_not_an_array() {
        let value = LinoValue::object([("a", LinoValue::Int(1))]);
        assert_eq!(encode(&value, DEFAULT_INDENT), "(\n  a 1\n)");
        assert_eq!(roundtrip(&value), value);
    }

    #[test]
    fn numeric_looking_strings_stay_strings() {
        let value = LinoValue::object([
            ("count", LinoValue::Int(42)),
            ("zip", LinoValue::String("10001".to_string())),
            ("flag", LinoValue::String("true".to_string())),
        ]);
        assert_eq!(roundtrip(&value), value);
    }

    #[test]
    fn whole_floats_stay_floats() {
        let value = LinoValue::Float(1.0);
        assert_eq!(encode(&value, DEFAULT_INDENT), "1.0");
        assert!(matches!(roundtrip(&value), LinoValue::Float(f) if (f - 1.0).abs() < f64::EPSILON));
    }

    #[test]
    fn base64_key_is_quoted_so_it_is_not_a_marker() {
        let value = LinoValue::object([("base64", LinoValue::String("plain".to_string()))]);
        assert_eq!(
            encode(&value, DEFAULT_INDENT),
            "(\n  \"base64\" \"plain\"\n)"
        );
        assert_eq!(roundtrip(&value), value);
    }

    #[test]
    fn control_characters_are_marked_individually() {
        let value = LinoValue::object([
            ("plain", LinoValue::String("visible".to_string())),
            ("raw", LinoValue::String("line1\nline2".to_string())),
        ]);
        let text = encode(&value, DEFAULT_INDENT);
        assert!(text.contains("plain \"visible\""), "{}", text);
        assert!(
            text.contains("raw (base64 \"bGluZTEKbGluZTI=\")"),
            "{}",
            text
        );
        assert_eq!(roundtrip(&value), value);
    }

    #[test]
    fn custom_indent_is_used() {
        let value = LinoValue::object([("a", LinoValue::Int(1))]);
        assert_eq!(encode(&value, "    "), "(\n    a 1\n)");
    }

    #[test]
    fn handwritten_document_without_root_parentheses_decodes() {
        let decoded = decode("a 1\nb \"two\"").unwrap();
        assert_eq!(
            decoded,
            LinoValue::object([
                ("a", LinoValue::Int(1)),
                ("b", LinoValue::String("two".into()))
            ])
        );
    }

    fn line_roundtrip(value: &LinoValue) -> LinoValue {
        let text = encode_line(value);
        assert!(!text.contains('\n'), "line form must hold no newline: {:?}", text);
        decode_line(&text).unwrap_or_else(|e| panic!("failed to decode {:?}: {}", text, e))
    }

    #[test]
    fn line_form_marks_objects_and_leaves_arrays_bare() {
        assert_eq!(encode_line(&LinoValue::Array(vec![])), "()");
        assert_eq!(encode_line(&LinoValue::Object(vec![])), "(o:)");
        assert_eq!(
            encode_line(&LinoValue::object([("a", LinoValue::Int(1))])),
            "(o: (a 1))"
        );
        assert_eq!(
            encode_line(&LinoValue::array([
                LinoValue::String("key".into()),
                LinoValue::String("value".into()),
            ])),
            "(\"key\" \"value\")"
        );
    }

    #[test]
    fn line_form_tells_a_one_pair_object_from_a_two_element_array() {
        let object = LinoValue::object([("key", LinoValue::String("value".into()))]);
        let array = LinoValue::array([
            LinoValue::String("key".into()),
            LinoValue::String("value".into()),
        ]);
        assert_ne!(encode_line(&object), encode_line(&array));
        assert_eq!(line_roundtrip(&object), object);
        assert_eq!(line_roundtrip(&array), array);
    }

    #[test]
    fn line_form_roundtrips_nested_and_empty_containers() {
        let value = LinoValue::object([
            ("empty_array", LinoValue::Array(vec![])),
            ("empty_object", LinoValue::Object(vec![])),
            (
                "records",
                LinoValue::array([
                    LinoValue::object([("id", LinoValue::Int(1))]),
                    LinoValue::object([("id", LinoValue::Int(2))]),
                ]),
            ),
        ]);
        assert_eq!(
            encode_line(&value),
            "(o: (empty_array ()) (empty_object (o:)) (records ((o: (id 1)) (o: (id 2)))))"
        );
        assert_eq!(line_roundtrip(&value), value);
    }

    #[test]
    fn line_form_keeps_the_empty_key() {
        let value = LinoValue::object([("", LinoValue::Int(2))]);
        assert_eq!(encode_line(&value), "(o: (\"\" 2))");
        assert_eq!(line_roundtrip(&value), value);
    }

    #[test]
    fn line_form_keeps_strings_on_one_line() {
        let value = LinoValue::object([
            ("quotes", LinoValue::String("both \"kinds\" of 'quotes'".into())),
            ("unicode", LinoValue::String("héllo 世界 🌍".into())),
            ("multiline", LinoValue::String("line1\nline2".into())),
        ]);
        let text = encode_line(&value);
        assert!(!text.contains('\n'), "{}", text);
        assert_eq!(line_roundtrip(&value), value);
    }

    #[test]
    fn a_line_form_object_holds_pairs_only() {
        assert!(decode_line("(o: 1 2)").is_err());
        assert!(decode_line("(o: (a 1 2))").is_err());
        assert!(decode_line("(o: (a))").is_err());
    }

    #[test]
    fn decode_line_rejects_a_document_of_several_lines() {
        assert!(decode_line("(o: (a 1))\n(o: (a 2))").is_err());
        // A trailing line break is what a line-based reader hands over, so it is
        // stripped rather than rejected.
        assert_eq!(
            decode_line("(o: (a 1))\n").unwrap(),
            LinoValue::object([("a", LinoValue::Int(1))])
        );
    }

    #[test]
    fn unterminated_input_is_an_error() {
        assert!(decode("(\n  a 1\n").is_err());
        assert!(decode("(\n  a \"unterminated\n").is_err());
        assert!(decode("a 1)").is_err());
    }
}
