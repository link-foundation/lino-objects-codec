//! Formatting utilities for indented Links Notation and individual values.

use super::{LiNo, parse_lino_to_links};

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

/// Escape a reference for Links Notation.
///
/// References need escaping when they contain spaces, quotes, parentheses, colons, or newlines.
///
/// # Arguments
///
/// * `value` - The value to escape
///
/// # Returns
///
/// The escaped reference string
pub fn escape_reference(value: &str) -> String {
    // Check if escaping is needed
    let needs_escaping = value
        .chars()
        .any(|c| c.is_whitespace() || c == '(' || c == ')' || c == '\'' || c == '"' || c == ':')
        || value.contains('\n');

    if !needs_escaping {
        return value.to_string();
    }

    let has_single = value.contains('\'');
    let has_double = value.contains('"');

    // If contains single quotes but not double quotes, use double quotes
    if has_single && !has_double {
        return format!("\"{}\"", value);
    }

    // If contains double quotes but not single quotes, use single quotes
    if has_double && !has_single {
        return format!("'{}'", value);
    }

    // If contains both quotes, count which one appears more
    if has_single && has_double {
        let single_count = value.chars().filter(|&c| c == '\'').count();
        let double_count = value.chars().filter(|&c| c == '"').count();

        if double_count < single_count {
            // Use double quotes, escape internal double quotes by doubling
            let escaped = value.replace('"', "\"\"");
            return format!("\"{}\"", escaped);
        }
        // Use single quotes, escape internal single quotes by doubling
        let escaped = value.replace('\'', "''");
        return format!("'{}'", escaped);
    }

    // Just spaces or other special characters, use single quotes by default
    format!("'{}'", value)
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
/// Uses quoting strategy compatible with the links-notation parser:
/// - If value contains double quotes, wrap in single quotes
/// - Otherwise, wrap in double quotes
fn format_indented_value(value: &str) -> String {
    let has_single = value.contains('\'');
    let has_double = value.contains('"');

    // If contains double quotes but no single quotes, use single quotes
    if has_double && !has_single {
        return format!("'{}'", value);
    }

    // If contains single quotes but no double quotes, use double quotes
    if has_single && !has_double {
        return format!("\"{}\"", value);
    }

    // If contains both, use single quotes and escape internal single quotes
    if has_single && has_double {
        let escaped = value.replace('\'', "''");
        return format!("'{}'", escaped);
    }

    // Default: use double quotes
    format!("\"{}\"", value)
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

    let lines: Vec<&str> = text.lines().collect();
    if lines.is_empty() {
        return Err(FormatError::InvalidInput(
            "text must have at least one line (the identifier)".to_string(),
        ));
    }

    // Filter out empty lines to preserve indentation structure for the parser
    // Empty lines would break the indentation context in links-notation
    let non_empty_lines: Vec<&str> = lines
        .iter()
        .filter(|l| !l.trim().is_empty())
        .copied()
        .collect();

    if non_empty_lines.is_empty() {
        return Err(FormatError::InvalidInput(
            "text must have at least one non-empty line (the identifier)".to_string(),
        ));
    }

    // Convert to standard lino format by adding colon after first line if not present
    // This allows the links-notation parser to properly parse the indented structure
    let first_line = non_empty_lines[0].trim();
    let lino_text = if first_line.ends_with(':') {
        non_empty_lines.join("\n")
    } else {
        format!("{}:\n{}", first_line, non_empty_lines[1..].join("\n"))
    };

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
        {
            if child_values.len() == 2 {
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
    }

    Ok((result_id, obj))
}
