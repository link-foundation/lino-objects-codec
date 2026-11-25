//! Formatting utilities for indented Links Notation and individual values.

use super::{LiNo, parse_lino_to_links};
use links_notation::encode_reference_literal;

// Public access to the same quoting rules used by both readable encoders.
pub use crate::readable::{format_value_single_line, format_value_verbatim, quote, unescape};
use std::collections::HashMap;

/// Error types for format operations
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FormatError {
    /// Missing required field
    MissingField(String),
    /// Invalid input
    InvalidInput(String),
}

impl std::fmt::Display for FormatError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            FormatError::MissingField(field) => write!(f, "Missing required field: {}", field),
            FormatError::InvalidInput(msg) => write!(f, "Invalid input: {}", msg),
        }
    }
}

impl std::error::Error for FormatError {}

/// Whether the links-notation Parser would not read `value` back as a bare reference.
fn needs_reference_quoting(value: &str) -> bool {
    value.is_empty()
        || value
            .chars()
            .any(|c| c.is_whitespace() || matches!(c, '(' | ')' | '\'' | '"' | ':' | '`'))
        || value.starts_with('#')
        || starts_with_reference_literal(value)
}

/// Whether `value` starts with `~<digits>{`, the reference-literal prefix.
fn starts_with_reference_literal(value: &str) -> bool {
    value.strip_prefix('~').is_some_and(|rest| {
        let digits = rest.bytes().take_while(u8::is_ascii_digit).count();
        digits > 0 && rest.as_bytes().get(digits) == Some(&b'{')
    })
}

/// Quote `value` so the links-notation Parser reads it back unchanged.
///
/// The empty string becomes the reference literal `~1{}`. Otherwise `prefer` is
/// used when `value` does not contain it, then the other quote. When `value`
/// contains both quotes, the less frequent one is doubled inside, unless
/// `value` starts or ends with it (a leading run of quotes is read as a wider
/// delimiter). The fallbacks are a backtick, then a reference literal.
fn quote_text(value: &str, prefer: char) -> String {
    if value.is_empty() {
        return encode_reference_literal("");
    }
    let other = if prefer == '\'' { '"' } else { '\'' };
    for quote in [prefer, other] {
        if !value.contains(quote) {
            return format!("{quote}{value}{quote}");
        }
    }
    let single_count = value.matches('\'').count();
    let double_count = value.matches('"').count();
    let candidates = if double_count < single_count {
        ['"', '\'']
    } else {
        ['\'', '"']
    };
    for quote in candidates {
        if !value.starts_with(quote) && !value.ends_with(quote) {
            let doubled = value.replace(quote, &format!("{quote}{quote}"));
            return format!("{quote}{doubled}{quote}");
        }
    }
    if !value.contains('`') {
        return format!("`{value}`");
    }
    encode_reference_literal(value)
}

/// Escape a reference for Links Notation.
///
/// References need escaping when they are empty, contain spaces, quotes,
/// parentheses, colons, or newlines, start with `#` (a comment), or start with
/// `~<digits>{` (a reference literal). The empty string is written as `~1{}`.
///
/// # Arguments
///
/// * `value` - The value to escape
///
/// # Returns
///
/// The escaped reference string
pub fn escape_reference(value: &str) -> String {
    if !needs_reference_quoting(value) {
        return value.to_string();
    }
    quote_text(value, '\'')
}

/// Unescape a reference from Links Notation format.
///
/// Reverses the escaping done by escape_reference.
///
/// # Arguments
///
/// * `s` - The escaped reference string
///
/// # Returns
///
/// The unescaped string
pub fn unescape_reference(s: &str) -> String {
    s.replace("\"\"", "\"").replace("''", "'")
}

/// Format a value for display in indented Links Notation.
///
/// Values are quoted, preferring double quotes, so that the links-notation
/// Parser reads them back unchanged (see `quote_text`). The empty string is
/// written as the reference literal `~1{}`.
fn format_indented_value(value: &str) -> String {
    quote_text(value, '"')
}

/// Format an object in indented Links Notation format.
///
/// This format is designed for human readability, displaying objects as:
///
/// ```text
/// <identifier>
///   <key> "<value>"
///   <key> "<value>"
///   ...
/// ```
///
/// # Arguments
///
/// * `id` - The object identifier (displayed on first line)
/// * `obj` - The object as key-value pairs to format
/// * `indent` - The indentation string (default: 2 spaces)
///
/// # Returns
///
/// Formatted indented Links Notation string, or an error
///
/// # Example
///
/// ```rust
/// use lino_objects_codec::format::format_indented;
/// use std::collections::HashMap;
///
/// let mut obj = HashMap::new();
/// obj.insert("status".to_string(), "executed".to_string());
/// obj.insert("exitCode".to_string(), "0".to_string());
///
/// let result = format_indented("my-uuid", &obj, "  ").unwrap();
/// assert!(result.starts_with("my-uuid\n"));
/// ```
pub fn format_indented<S: ::std::hash::BuildHasher>(
    id: &str,
    obj: &HashMap<String, String, S>,
    indent: &str,
) -> Result<String, FormatError> {
    if id.is_empty() {
        return Err(FormatError::MissingField("id".to_string()));
    }

    let mut lines = vec![id.to_string()];

    for (key, value) in obj {
        let escaped_key = escape_reference(key);
        let formatted_value = format_indented_value(value);
        lines.push(format!("{}{} {}", indent, escaped_key, formatted_value));
    }

    Ok(lines.join("\n"))
}

/// Format an object in indented Links Notation format, maintaining key order.
///
/// This is similar to `format_indented` but takes a slice of tuples to preserve
/// the order of keys.
///
/// # Arguments
///
/// * `id` - The object identifier (displayed on first line)
/// * `pairs` - The key-value pairs in order
/// * `indent` - The indentation string (default: 2 spaces)
///
/// # Returns
///
/// Formatted indented Links Notation string, or an error
pub fn format_indented_ordered(
    id: &str,
    pairs: &[(&str, &str)],
    indent: &str,
) -> Result<String, FormatError> {
    if id.is_empty() {
        return Err(FormatError::MissingField("id".to_string()));
    }

    let mut lines = vec![id.to_string()];

    for (key, value) in pairs {
        let escaped_key = escape_reference(key);
        let formatted_value = format_indented_value(value);
        lines.push(format!("{}{} {}", indent, escaped_key, formatted_value));
    }

    Ok(lines.join("\n"))
}

/// Parse an indented Links Notation string back to an object.
///
/// This function uses the links-notation parser for proper parsing,
/// supporting the standard Links Notation indented syntax.
///
/// Parses strings like:
///
/// ```text
/// <identifier>
///   <key> "<value>"
///   <key> "<value>"
///   ...
/// ```
///
/// The format with colon after identifier is also supported (standard lino):
///
/// ```text
/// <identifier>:
///   <key> "<value>"
/// ```
///
/// # Arguments
///
/// * `text` - The indented Links Notation string to parse
///
/// # Returns
///
/// A tuple of (id, HashMap of key-value pairs), or an error
///
/// # Example
///
/// ```rust
/// use lino_objects_codec::format::parse_indented;
///
/// let text = "my-uuid\n  status \"executed\"\n  exitCode \"0\"";
/// let (id, obj) = parse_indented(text).unwrap();
/// assert_eq!(id, "my-uuid");
/// assert_eq!(obj.get("status"), Some(&"executed".to_string()));
/// ```
pub fn parse_indented(text: &str) -> Result<(String, HashMap<String, String>), FormatError> {
    if text.is_empty() {
        return Err(FormatError::InvalidInput(
            "text is required for parse_indented".to_string(),
        ));
    }

    // Skip only whitespace before the header. Preserve the body for the parser,
    // including quoted blank lines and CRLFs (`lines()` would strip the CRs).
    let remaining = text.trim_start();
    if remaining.is_empty() {
        return Err(FormatError::InvalidInput(
            "text must have at least one non-empty line (the identifier)".to_string(),
        ));
    }

    // Convert to standard lino format by adding colon after first line if not present
    // This allows the links-notation parser to properly parse the indented structure
    let (header, body) = remaining.split_once('\n').unwrap_or((remaining, ""));
    let first_line = header.trim_end();
    let lino_text = if first_line.ends_with(':') {
        format!("{first_line}\n{body}")
    } else {
        format!("{first_line}:\n{body}")
    };
    crate::debug::trace("format.parse_indented", || {
        format!("preserved {} input bytes", lino_text.len())
    });

    // Use links-notation parser
    let parsed = parse_lino_to_links(&lino_text)
        .map_err(|e| FormatError::InvalidInput(format!("Parse error: {:?}", e)))?;

    if parsed.is_empty() {
        return Err(FormatError::InvalidInput(
            "Failed to parse indented Links Notation".to_string(),
        ));
    }

    // Extract id and key-value pairs from parsed result
    let main_link = &parsed[0];
    let (result_id, values) = match main_link {
        LiNo::Link { id, values } => (id.clone().unwrap_or_default(), values),
        LiNo::Ref(id) => (id.clone(), &vec![]),
    };

    let mut obj = HashMap::new();

    // Process the values array - each entry is a doublet (key value)
    for child in values {
        if let LiNo::Link {
            values: child_values,
            ..
        } = child
            && child_values.len() == 2
        {
            let key_ref = &child_values[0];
            let value_ref = &child_values[1];

            // Get key string
            let key = match key_ref {
                LiNo::Ref(k) => k.clone(),
                LiNo::Link { id, .. } => id.clone().unwrap_or_default(),
            };

            // Get value string
            let value = match value_ref {
                LiNo::Ref(v) => v.clone(),
                LiNo::Link { id, .. } => id.clone().unwrap_or_default(),
            };

            obj.insert(key, value);
        }
    }

    Ok((result_id, obj))
}
