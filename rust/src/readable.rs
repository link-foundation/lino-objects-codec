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
//! Text is written as text. A string keeps every character a reader would grep
//! for, including newlines and tabs, and is quoted with a run of delimiters —
//! `"""say "hi""""` — when it holds the delimiter itself. Only the characters a
//! form cannot carry are escaped, and only they: the value is then written as
//! `(escaped "…")`, where `%XX` stands for one escaped byte. The indented form
//! escapes the carriage return, which CRLF normalisation would otherwise rewrite,
//! and the other control characters; the single-line form escapes the newline as
//! well, because there a record ends at the end of the line. Nothing else is
//! encoded: base64 lives in [`crate::encode_compact`], which a caller asks for by
//! name.
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
use base64::{Engine, engine::general_purpose::STANDARD as BASE64};

/// Default indentation used by [`encode`].
pub const DEFAULT_INDENT: &str = "  ";

/// Marker of a base64 payload. Written by [`crate::encode_compact`] and by
/// versions up to 0.6.0 of the readable form, which is why it is still read.
pub const BASE64_MARKER: &str = "base64";

/// Marker of a string whose unwritable characters are percent-escaped.
///
/// It reads as `(escaped "line one%0Aline two")`. Only those characters change;
/// the rest of the text is written as it is, so the value stays readable and
/// greppable.
pub const ESCAPED_MARKER: &str = "escaped";

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

/// The line structure of the text being written, which is what decides whether a
/// newline can be written literally: in the indented form a value ends at its
/// closing quote, so it may span lines; in the single-line form a record ends at
/// the end of the line, so a newline inside a value would end the record.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Form {
    Indented,
    Line,
}

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
                out.push_str(&format_key(key, Form::Indented));
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

        scalar => out.push_str(&format_scalar(scalar, Form::Indented)),
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
                out.push_str(&format_key(key, Form::Line));
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

        scalar => out.push_str(&format_scalar(scalar, Form::Line)),
    }
}

fn push_indent(indent: &str, level: usize, out: &mut String) {
    for _ in 0..level {
        out.push_str(indent);
    }
}

/// Format a scalar value. Strings are quoted, everything else stays bare so that
/// its type is recoverable when reading the document back.
fn format_scalar(value: &LinoValue, form: Form) -> String {
    match value {
        LinoValue::Null => "null".to_string(),
        LinoValue::Bool(b) => b.to_string(),
        LinoValue::Int(i) => i.to_string(),
        LinoValue::Float(f) => format_float(*f),
        LinoValue::String(s) => format_string(s, form),
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

/// Format a string value. The text is written as text; when it holds characters
/// this form cannot carry, those characters — and only those — are percent-escaped
/// and the value is marked, so the rest of it stays readable and greppable.
fn format_string(value: &str, form: Form) -> String {
    match escape_unwritable(value, form) {
        Some(escaped) => format!("({} {})", ESCAPED_MARKER, quote(&escaped)),
        None => quote(value),
    }
}

/// Percent-escape the characters this form cannot carry, or `None` when the text
/// can be written as it is. `%` is escaped too, so escaping is reversible.
fn escape_unwritable(value: &str, form: Form) -> Option<String> {
    if !value.chars().any(|c| is_unwritable(c, form)) {
        return None;
    }

    let mut out = String::with_capacity(value.len());
    let mut buffer = [0u8; 4];
    for c in value.chars() {
        if c == '%' || is_unwritable(c, form) {
            for byte in c.encode_utf8(&mut buffer).as_bytes() {
                out.push('%');
                out.push(hex_digit(byte >> 4));
                out.push(hex_digit(byte & 0xf));
            }
        } else {
            out.push(c);
        }
    }
    Some(out)
}

/// One upper-case hexadecimal digit of a percent escape.
fn hex_digit(value: u8) -> char {
    char::from_digit(u32::from(value), 16).map_or('0', |digit| digit.to_ascii_uppercase())
}

/// Whether a character has to be escaped in this form. A tab is text a reader can
/// see, and so is a newline in the indented form, where a value may span lines.
/// A carriage return is escaped because CRLF normalisation rewrites it, and the
/// remaining control characters because they are not text at all.
fn is_unwritable(c: char, form: Form) -> bool {
    if !c.is_control() {
        return false;
    }
    match c {
        '\t' => false,
        '\n' => form == Form::Line,
        _ => true,
    }
}

/// Quote a value so that both this reader and the notation's own parser read it
/// back unchanged. One delimiter is enough while the text holds none of that
/// kind; when it holds both kinds, a run of at least three opens the notation's
/// n-quote form, where the text is literal and only a run at least as long closes
/// it. A value starting with the delimiter would lengthen the opening run, so the
/// other delimiter is used for it.
fn quote(value: &str) -> String {
    if !value.contains('"') {
        return format!("\"{}\"", value);
    }
    if !value.contains('\'') {
        return format!("'{}'", value);
    }

    let delimiter = if value.starts_with('"') { '\'' } else { '"' };
    // A run of two delimiters is the empty value, so the n-quote form starts at
    // three; beyond that the run only has to outrun the longest one inside.
    let count = (longest_run(value, delimiter) + 1).max(3);
    let run: String = std::iter::repeat_n(delimiter, count).collect();
    format!("{run}{value}{run}")
}

/// The length of the longest run of `c` in `value`.
fn longest_run(value: &str, c: char) -> usize {
    let mut longest = 0;
    let mut current = 0;
    for candidate in value.chars() {
        if candidate == c {
            current += 1;
            longest = longest.max(current);
        } else {
            current = 0;
        }
    }
    longest
}

/// Format an object key. Keys are bare when they read as plain identifiers.
fn format_key(key: &str, form: Form) -> String {
    let plain = !key.is_empty()
        && key != BASE64_MARKER
        && key != ESCAPED_MARKER
        && !key.chars().any(|c| {
            c.is_whitespace() || c.is_control() || matches!(c, '(' | ')' | '\'' | '"' | ':' | '`')
        });

    if plain {
        key.to_string()
    } else {
        format_string(key, form)
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

/// Read a quoted reference. The opening run of delimiters says how it is read,
/// which is what the notation's own parser does:
///
/// * one delimiter — the text is literal and a doubled delimiter is one literal
///   delimiter, which is how versions up to 0.6.0 wrote such values;
/// * two — the empty value;
/// * three or more — the n-quote form: the text is literal, and the value ends at
///   the first run at least as long, whose last delimiters close it. A longer run
///   therefore belongs to the text, so a value may end with a delimiter.
fn read_quoted(
    chars: &[char],
    start: usize,
    quote_char: char,
) -> Result<(String, usize), CodecError> {
    let opening = run_length(chars, start, quote_char);

    if opening == 2 {
        return Ok((String::new(), start + 2));
    }

    if opening == 1 {
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

        return Err(unterminated_quote(start));
    }

    let mut i = start + opening;
    while i < chars.len() {
        if chars[i] != quote_char {
            i += 1;
            continue;
        }

        let run = run_length(chars, i, quote_char);
        if run >= opening {
            let value = chars[start + opening..i + run - opening].iter().collect();
            return Ok((value, i + run));
        }
        i += run;
    }

    Err(unterminated_quote(start))
}

/// The length of the run of `c` that starts at `start`.
fn run_length(chars: &[char], start: usize, c: char) -> usize {
    chars[start..].iter().take_while(|&&x| x == c).count()
}

fn unterminated_quote(start: usize) -> CodecError {
    CodecError::ParseError(format!(
        "unterminated quoted value starting at character {}",
        start
    ))
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
        .all(|row| row.len() == 2 && node_to_key(&row[0]).is_some());

    if is_object {
        let mut pairs = Vec::with_capacity(rows.len());
        for row in rows {
            let Some(key) = node_to_key(&row[0]) else {
                unreachable!("checked by is_object")
            };
            pairs.push((key, node_to_value(&row[1])?));
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

        let [key_node, value] = row.as_slice() else {
            return Err(CodecError::ParseError(format!(
                "an object marked '{}:' holds (key value) pairs, found a link of {} values",
                OBJECT_MARKER,
                row.len()
            )));
        };

        let Some(key) = node_to_key(key_node) else {
            return Err(CodecError::ParseError(format!(
                "an object marked '{}:' holds (key value) pairs, found a pair whose key is not text",
                OBJECT_MARKER
            )));
        };

        pairs.push((key, node_to_value(value)?));
    }

    Ok(LinoValue::Object(pairs))
}

/// The key a node in key position spells: a reference is the key itself, and a
/// marked link is the text its marker escapes, which is how a key holding a
/// character the form cannot carry stays a key instead of turning its object into
/// an array.
fn node_to_key(node: &Node) -> Option<String> {
    match node {
        Node::Ref { value, .. } => Some(value.clone()),
        Node::Link {
            rows,
            object: false,
            ..
        } => match decode_marked_value(rows)? {
            Ok(LinoValue::String(key)) => Some(key),
            _ => None,
        },
        Node::Link { .. } => None,
    }
}

/// Recognise a marked value: `(escaped "…")`, whose text is written as it is
/// except for the percent-escaped characters this form cannot carry, and
/// `(base64 "…")`, which versions up to 0.6.0 wrote and which is still read. A
/// quoted marker is an ordinary object key, not a marker.
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

    let Node::Ref {
        value: payload,
        quoted: true,
    } = &rows[0][1]
    else {
        return None;
    };

    if marker == ESCAPED_MARKER {
        return Some(unescape(payload).map(LinoValue::String));
    }

    if marker == BASE64_MARKER {
        return Some(
            BASE64
                .decode(payload)
                .map_err(|e| CodecError::DecodeError(format!("invalid base64 value: {}", e)))
                .and_then(|bytes| {
                    String::from_utf8(bytes)
                        .map(LinoValue::String)
                        .map_err(|e| CodecError::DecodeError(format!("invalid UTF-8 value: {}", e)))
                }),
        );
    }

    None
}

/// Undo the percent-escaping of an `(escaped "…")` payload. Escapes stand for
/// bytes, so a character outside ASCII is written as its UTF-8 bytes and read
/// back from them.
fn unescape(payload: &str) -> Result<String, CodecError> {
    let bytes = payload.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut i = 0;

    while i < bytes.len() {
        if bytes[i] != b'%' {
            out.push(bytes[i]);
            i += 1;
            continue;
        }

        let escape = payload.get(i + 1..i + 3).ok_or_else(|| {
            CodecError::DecodeError(format!(
                "truncated escape at character {} of an escaped value",
                i
            ))
        })?;
        let byte = u8::from_str_radix(escape, 16).map_err(|_| {
            CodecError::DecodeError(format!("invalid escape '%{}' in an escaped value", escape))
        })?;
        out.push(byte);
        i += 3;
    }

    String::from_utf8(out)
        .map_err(|e| CodecError::DecodeError(format!("invalid UTF-8 escaped value: {}", e)))
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
    fn text_is_written_as_text_and_only_the_rest_is_escaped() {
        let value = LinoValue::object([
            ("plain", LinoValue::String("visible".to_string())),
            ("raw", LinoValue::String("line1\nline2".to_string())),
            ("returned", LinoValue::String("line1\r\nline2".to_string())),
        ]);
        let text = encode(&value, DEFAULT_INDENT);
        assert!(text.contains("plain \"visible\""), "{}", text);
        assert!(text.contains("raw \"line1\nline2\""), "{}", text);
        assert!(
            text.contains("returned (escaped \"line1%0D\nline2\")"),
            "{}",
            text
        );
        assert!(!text.contains("base64"), "{}", text);
        assert_eq!(roundtrip(&value), value);
    }

    /// The readable form is Links Notation, so the notation's own parser has to
    /// read every document it writes -- quotes, newlines and escapes included.
    #[test]
    fn every_written_document_parses_as_links_notation() {
        let texts = [
            "plain",
            "it's",
            "he said \"hello\"",
            "both \"kinds\" of 'quotes'",
            "a\"\"b'c",
            "a\"\"\"b'c",
            "trailing quote\"'",
            "'\"",
            "line one\nline two",
            "a\tb",
            "null\u{0}byte",
            "unicode: 你好世界 🌍",
        ];

        for text in texts {
            let value = LinoValue::object([
                ("message", LinoValue::String(text.to_string())),
                ("level", LinoValue::String("info".to_string())),
            ]);

            for document in [encode(&value, DEFAULT_INDENT), encode_line(&value)] {
                assert!(
                    links_notation::parse_lino(&document).is_ok(),
                    "links-notation rejected {:?}",
                    document
                );
            }
        }
    }

    /// The value the notation's parser reads back has to be the value written,
    /// not merely something that parses.
    #[test]
    fn links_notation_reads_back_the_text_that_was_written() {
        for text in [
            "he said \"hello\"",
            "both \"kinds\" of 'quotes'",
            "a\"\"b'c",
            "line one\nline two",
        ] {
            let document = encode(
                &LinoValue::object([("message", LinoValue::String(text.to_string()))]),
                DEFAULT_INDENT,
            );
            let parsed = links_notation::parse_lino(&document)
                .unwrap_or_else(|e| panic!("links-notation rejected {:?}: {}", document, e));

            let mut refs = Vec::new();
            collect_refs(&parsed, &mut refs);
            assert!(
                refs.contains(&text.to_string()),
                "links-notation read {:?} out of {:?}",
                refs,
                document
            );
        }
    }

    fn collect_refs(node: &links_notation::LiNo<String>, out: &mut Vec<String>) {
        match node {
            links_notation::LiNo::Ref(value) => out.push(value.clone()),
            links_notation::LiNo::Link { values, .. } => {
                for value in values {
                    collect_refs(value, out);
                }
            }
        }
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
        assert!(
            !text.contains('\n'),
            "line form must hold no newline: {:?}",
            text
        );
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
            (
                "quotes",
                LinoValue::String("both \"kinds\" of 'quotes'".into()),
            ),
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
        assert!(decode("(\n  a \"\"\"unterminated\n").is_err());
        assert!(decode("a 1)").is_err());
    }

    /// The three ways a run of delimiters reads, which is what keeps documents
    /// written by earlier versions decoding as they did.
    #[test]
    fn a_run_of_delimiters_says_how_the_value_is_read() {
        // One delimiter: a doubled delimiter is one literal delimiter.
        assert_eq!(
            decode("\"both \"\"kinds\"\" of 'quotes'\"").unwrap(),
            LinoValue::String("both \"kinds\" of 'quotes'".to_string())
        );
        // Two: the empty value.
        assert_eq!(decode("\"\"").unwrap(), LinoValue::String(String::new()));
        // Three or more: the text is literal, and the last delimiters close it.
        assert_eq!(
            decode("\"\"\"say \"hi\"\"\"\"").unwrap(),
            LinoValue::String("say \"hi\"".to_string())
        );
    }
}
