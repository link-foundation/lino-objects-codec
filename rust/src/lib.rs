//! Object encoder/decoder for Links Notation format.
//!
//! This library provides encoding and decoding of JSON-like objects to/from
//! Links Notation format. It supports all common JSON types plus special
//! float values (NaN, Infinity, -Infinity).
//!
//! # Features
//!
//! - **Readable by Default**: `encode()` writes plain, indented text that can be read and reviewed
//! - **Universal Serialization**: Encode objects to Links Notation format
//! - **Type Support**: Handle all common types: null, boolean, integer, float, string, array, object
//! - **Special Float Values**: Support for NaN, Infinity, -Infinity (which are not valid JSON)
//! - **Circular References**: Detect and preserve circular references (via object IDs)
//! - **Object Identity**: Maintain object identity for shared references
//! - **UTF-8 Support**: Full Unicode string support, written as text; only values that cannot be
//!   represented as text (strings holding control characters) are base64-encoded, and they are
//!   marked individually as `(base64 "…")`
//! - **Simple API**: Easy-to-use `encode()` and `decode()` functions
//!
//! # Example
//!
//! ```rust
//! use lino_objects_codec::{encode, decode, LinoValue};
//!
//! // Encode a simple object
//! let data = LinoValue::object([
//!     ("name", LinoValue::String("Alice".to_string())),
//!     ("age", LinoValue::Int(30)),
//!     ("active", LinoValue::Bool(true)),
//! ]);
//! let encoded = encode(&data);
//! assert_eq!(encoded, "(\n  name \"Alice\"\n  age 30\n  active true\n)");
//! let decoded = decode(&encoded).unwrap();
//! assert_eq!(decoded, data);
//! ```
//!
//! # Output formats
//!
//! | Function | Output |
//! |---|---|
//! | [`encode`] | readable, indented plain text (default) |
//! | [`encode_with_indent`] | the same, with a custom indentation string |
//! | [`encode_compact`] / [`encode_obfuscated`] | the previous single-line, base64 form |
//!
//! [`decode`] accepts both forms, so files written by earlier versions keep working
//! and migrate to the readable form on the next write.

use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use links_notation::{parse_lino_to_links, LiNo};
use std::collections::{HashMap, HashSet};
use std::fmt;

pub mod debug;
pub mod readable;

pub use readable::{BASE64_MARKER, DEFAULT_INDENT};

/// Type identifiers used in the compact (base64) Links Notation format
mod type_ids {
    pub const NULL: &str = "null";
    pub const BOOL: &str = "bool";
    pub const INT: &str = "int";
    pub const FLOAT: &str = "float";
    pub const STR: &str = "str";
    pub const ARRAY: &str = "array";
    pub const OBJECT: &str = "object";
}

/// Error types for codec operations
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CodecError {
    /// Parsing error
    ParseError(String),
    /// Decoding error
    DecodeError(String),
    /// Unknown type marker
    UnknownType(String),
}

impl fmt::Display for CodecError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            CodecError::ParseError(msg) => write!(f, "Parse error: {}", msg),
            CodecError::DecodeError(msg) => write!(f, "Decode error: {}", msg),
            CodecError::UnknownType(t) => write!(f, "Unknown type marker: {}", t),
        }
    }
}

impl std::error::Error for CodecError {}

/// A value that can be encoded/decoded using the Links Notation codec.
///
/// This type supports all the types available in Python/JavaScript versions
/// including special float values (NaN, Infinity) that are not valid JSON.
#[derive(Debug, Clone)]
pub enum LinoValue {
    /// Null value
    Null,
    /// Boolean value
    Bool(bool),
    /// Integer value (64-bit signed)
    Int(i64),
    /// Floating point value (64-bit)
    Float(f64),
    /// String value
    String(String),
    /// Array of values
    Array(Vec<LinoValue>),
    /// Object/dictionary with string keys
    Object(Vec<(String, LinoValue)>),
}

impl PartialEq for LinoValue {
    fn eq(&self, other: &Self) -> bool {
        match (self, other) {
            (LinoValue::Null, LinoValue::Null) => true,
            (LinoValue::Bool(a), LinoValue::Bool(b)) => a == b,
            (LinoValue::Int(a), LinoValue::Int(b)) => a == b,
            (LinoValue::Float(a), LinoValue::Float(b)) => {
                // Handle NaN comparison
                if a.is_nan() && b.is_nan() {
                    true
                } else {
                    a == b
                }
            }
            (LinoValue::String(a), LinoValue::String(b)) => a == b,
            (LinoValue::Array(a), LinoValue::Array(b)) => a == b,
            (LinoValue::Object(a), LinoValue::Object(b)) => {
                // Objects are equal if they have the same keys and values
                if a.len() != b.len() {
                    return false;
                }
                // Create hashmaps for comparison (order-independent)
                let a_map: HashMap<&str, &LinoValue> =
                    a.iter().map(|(k, v)| (k.as_str(), v)).collect();
                let b_map: HashMap<&str, &LinoValue> =
                    b.iter().map(|(k, v)| (k.as_str(), v)).collect();
                a_map == b_map
            }
            _ => false,
        }
    }
}

impl LinoValue {
    /// Create an object from an iterator of key-value pairs.
    pub fn object<I, K, V>(iter: I) -> Self
    where
        I: IntoIterator<Item = (K, V)>,
        K: Into<String>,
        V: Into<LinoValue>,
    {
        LinoValue::Object(
            iter.into_iter()
                .map(|(k, v)| (k.into(), v.into()))
                .collect(),
        )
    }

    /// Create an array from an iterator of values.
    pub fn array<I, V>(iter: I) -> Self
    where
        I: IntoIterator<Item = V>,
        V: Into<LinoValue>,
    {
        LinoValue::Array(iter.into_iter().map(|v| v.into()).collect())
    }

    /// Check if this is a null value.
    pub fn is_null(&self) -> bool {
        matches!(self, LinoValue::Null)
    }

    /// Get as a boolean, if this is a bool.
    pub fn as_bool(&self) -> Option<bool> {
        match self {
            LinoValue::Bool(b) => Some(*b),
            _ => None,
        }
    }

    /// Get as an integer, if this is an int.
    pub fn as_int(&self) -> Option<i64> {
        match self {
            LinoValue::Int(i) => Some(*i),
            _ => None,
        }
    }

    /// Get as a float, if this is a float or int.
    pub fn as_float(&self) -> Option<f64> {
        match self {
            LinoValue::Float(f) => Some(*f),
            LinoValue::Int(i) => Some(*i as f64),
            _ => None,
        }
    }

    /// Get as a string, if this is a string.
    pub fn as_str(&self) -> Option<&str> {
        match self {
            LinoValue::String(s) => Some(s),
            _ => None,
        }
    }

    /// Get as an array, if this is an array.
    pub fn as_array(&self) -> Option<&Vec<LinoValue>> {
        match self {
            LinoValue::Array(a) => Some(a),
            _ => None,
        }
    }

    /// Get as an object, if this is an object.
    pub fn as_object(&self) -> Option<&Vec<(String, LinoValue)>> {
        match self {
            LinoValue::Object(o) => Some(o),
            _ => None,
        }
    }

    /// Get a value from an object by key.
    pub fn get(&self, key: &str) -> Option<&LinoValue> {
        match self {
            LinoValue::Object(o) => o.iter().find(|(k, _)| k == key).map(|(_, v)| v),
            _ => None,
        }
    }

    /// Get a value from an array by index.
    pub fn get_index(&self, index: usize) -> Option<&LinoValue> {
        match self {
            LinoValue::Array(a) => a.get(index),
            _ => None,
        }
    }
}

// Implement From traits for convenience
impl From<()> for LinoValue {
    fn from(_: ()) -> Self {
        LinoValue::Null
    }
}

impl From<bool> for LinoValue {
    fn from(b: bool) -> Self {
        LinoValue::Bool(b)
    }
}

impl From<i32> for LinoValue {
    fn from(i: i32) -> Self {
        LinoValue::Int(i as i64)
    }
}

impl From<i64> for LinoValue {
    fn from(i: i64) -> Self {
        LinoValue::Int(i)
    }
}

impl From<f64> for LinoValue {
    fn from(f: f64) -> Self {
        LinoValue::Float(f)
    }
}

impl From<&str> for LinoValue {
    fn from(s: &str) -> Self {
        LinoValue::String(s.to_string())
    }
}

impl From<String> for LinoValue {
    fn from(s: String) -> Self {
        LinoValue::String(s)
    }
}

impl<T: Into<LinoValue>> From<Vec<T>> for LinoValue {
    fn from(v: Vec<T>) -> Self {
        LinoValue::Array(v.into_iter().map(|x| x.into()).collect())
    }
}

impl<T: Into<LinoValue>> From<Option<T>> for LinoValue {
    fn from(opt: Option<T>) -> Self {
        match opt {
            Some(v) => v.into(),
            None => LinoValue::Null,
        }
    }
}

/// Codec for encoding/decoding LinoValue to/from Links Notation.
///
/// This codec handles the conversion between `LinoValue` and Links Notation
/// format strings. It supports circular references and shared object identity
/// through object ID references.
pub struct ObjectCodec {
    /// Counter for generating unique object IDs
    encode_counter: usize,
    /// Maps object representations to their assigned IDs (for detecting shared references)
    encode_memo: HashMap<String, String>,
    /// Set of object representations that need IDs (referenced multiple times)
    needs_id: HashSet<String>,
    /// All link definitions generated during encoding (for multi-link format)
    all_definitions: Vec<(String, LiNo<String>)>,
    /// Maps object IDs to decoded values during decoding
    decode_memo: HashMap<String, LinoValue>,
    /// All links available for forward reference resolution
    all_links: Vec<LiNo<String>>,
}

impl Default for ObjectCodec {
    fn default() -> Self {
        Self::new()
    }
}

impl ObjectCodec {
    /// Create a new ObjectCodec instance.
    pub fn new() -> Self {
        ObjectCodec {
            encode_counter: 0,
            encode_memo: HashMap::new(),
            needs_id: HashSet::new(),
            all_definitions: Vec::new(),
            decode_memo: HashMap::new(),
            all_links: Vec::new(),
        }
    }

    /// Reset the encoder state for a new encoding operation.
    fn reset_encode_state(&mut self) {
        self.encode_counter = 0;
        self.encode_memo.clear();
        self.needs_id.clear();
        self.all_definitions.clear();
    }

    /// Reset the decoder state for a new decoding operation.
    fn reset_decode_state(&mut self) {
        self.decode_memo.clear();
        self.all_links.clear();
    }

    /// Create a Link from string parts.
    fn make_link(&self, parts: &[&str]) -> LiNo<String> {
        let values: Vec<LiNo<String>> = parts.iter().map(|p| LiNo::Ref(p.to_string())).collect();
        LiNo::Link { id: None, values }
    }

    /// Create a reference Link with just an ID.
    fn make_ref(&self, id: &str) -> LiNo<String> {
        LiNo::Ref(id.to_string())
    }

    /// Generate a unique object key for detecting shared references.
    fn object_key(&self, value: &LinoValue) -> String {
        // Use pointer-based identity
        format!("{:p}", value)
    }

    /// First pass: identify which objects need IDs (referenced multiple times or circularly).
    fn find_objects_needing_ids(&mut self, value: &LinoValue, seen: &mut HashMap<String, bool>) {
        // Only track arrays and objects (compound types)
        match value {
            LinoValue::Array(arr) => {
                let key = self.object_key(value);

                if seen.contains_key(&key) {
                    // Already seen - needs an ID
                    self.needs_id.insert(key);
                    return;
                }

                seen.insert(key, true);

                for item in arr {
                    self.find_objects_needing_ids(item, seen);
                }
            }
            LinoValue::Object(obj) => {
                let key = self.object_key(value);

                if seen.contains_key(&key) {
                    // Already seen - needs an ID
                    self.needs_id.insert(key);
                    return;
                }

                seen.insert(key, true);

                for (_, v) in obj {
                    self.find_objects_needing_ids(v, seen);
                }
            }
            _ => {}
        }
    }

    /// Encode a LinoValue to the readable, indented Links Notation format.
    ///
    /// This is the default representation: keys and values are written as plain
    /// text, one per line, so the result can be read and reviewed directly.
    /// See [`readable`] for the exact shape.
    ///
    /// # Arguments
    ///
    /// * `value` - The value to encode
    ///
    /// # Returns
    ///
    /// A string in readable Links Notation format
    pub fn encode(&mut self, value: &LinoValue) -> String {
        readable::encode(value, DEFAULT_INDENT)
    }

    /// Encode a LinoValue to the readable format using a custom indentation string.
    ///
    /// # Arguments
    ///
    /// * `value` - The value to encode
    /// * `indent` - The indentation string used per nesting level (for example `"    "`)
    pub fn encode_with_indent(&mut self, value: &LinoValue, indent: &str) -> String {
        readable::encode(value, indent)
    }

    /// Encode a LinoValue to the compact, single-line Links Notation format.
    ///
    /// Every value is tagged with its type and every string is base64-encoded, so
    /// the whole document fits on one line and carries no readable text. This was
    /// the default before the readable format; callers now opt into it explicitly.
    ///
    /// # Arguments
    ///
    /// * `value` - The value to encode
    ///
    /// # Returns
    ///
    /// A string in compact Links Notation format
    pub fn encode_compact(&mut self, value: &LinoValue) -> String {
        self.reset_encode_state();

        // First pass: identify which objects need IDs
        let mut seen = HashMap::new();
        self.find_objects_needing_ids(value, &mut seen);

        // Encode the value
        let mut visited = HashSet::new();
        let main_link = self.encode_value(value, &mut visited, 0);

        // If we have additional definitions, output them all as multi-link format
        if !self.all_definitions.is_empty() {
            let mut all_links = vec![main_link];

            // Add all other definitions (avoid duplicates)
            for (ref_id, link) in &self.all_definitions {
                let main_id = match &all_links[0] {
                    LiNo::Link { id: Some(id), .. } => Some(id.clone()),
                    _ => None,
                };
                if main_id.as_ref() != Some(ref_id) {
                    all_links.push(link.clone());
                }
            }

            // Format as multi-link (newline separated)
            all_links
                .iter()
                .map(Self::format_link)
                .collect::<Vec<_>>()
                .join("\n")
        } else {
            Self::format_link(&main_link)
        }
    }

    /// Encode a LinoValue to the compact, base64 form.
    ///
    /// Alias of [`ObjectCodec::encode_compact`], named after what the form does to
    /// its content: nothing in the output can be read without decoding it.
    pub fn encode_obfuscated(&mut self, value: &LinoValue) -> String {
        self.encode_compact(value)
    }

    /// Format a single link to its string representation.
    fn format_link(link: &LiNo<String>) -> String {
        match link {
            LiNo::Ref(s) => s.clone(),
            LiNo::Link { id, values } => {
                let inner: Vec<String> = values.iter().map(Self::format_link).collect();

                if let Some(link_id) = id {
                    if inner.is_empty() {
                        format!("({}:)", link_id)
                    } else {
                        format!("({}: {})", link_id, inner.join(" "))
                    }
                } else if inner.is_empty() {
                    "()".to_string()
                } else {
                    format!("({})", inner.join(" "))
                }
            }
        }
    }

    /// Encode a value into a Link.
    fn encode_value(
        &mut self,
        value: &LinoValue,
        visited: &mut HashSet<String>,
        depth: usize,
    ) -> LiNo<String> {
        match value {
            LinoValue::Null => self.make_link(&[type_ids::NULL]),

            LinoValue::Bool(b) => {
                if *b {
                    self.make_link(&[type_ids::BOOL, "true"])
                } else {
                    self.make_link(&[type_ids::BOOL, "false"])
                }
            }

            LinoValue::Int(i) => self.make_link(&[type_ids::INT, &i.to_string()]),

            LinoValue::Float(f) => {
                if f.is_nan() {
                    self.make_link(&[type_ids::FLOAT, "NaN"])
                } else if f.is_infinite() {
                    if f.is_sign_positive() {
                        self.make_link(&[type_ids::FLOAT, "Infinity"])
                    } else {
                        self.make_link(&[type_ids::FLOAT, "-Infinity"])
                    }
                } else {
                    self.make_link(&[type_ids::FLOAT, &f.to_string()])
                }
            }

            LinoValue::String(s) => {
                let b64_encoded = BASE64.encode(s.as_bytes());
                self.make_link(&[type_ids::STR, &b64_encoded])
            }

            LinoValue::Array(arr) => {
                let obj_key = self.object_key(value);

                // Check if we've already encoded this object
                if let Some(ref_id) = self.encode_memo.get(&obj_key).cloned() {
                    return self.make_ref(&ref_id);
                }

                // Check if this object needs an ID
                let needs_id = self.needs_id.contains(&obj_key);

                if needs_id {
                    // Check for cycle
                    if visited.contains(&obj_key) {
                        // We're in a cycle - must have assigned ID already
                        if let Some(ref_id) = self.encode_memo.get(&obj_key) {
                            return self.make_ref(ref_id);
                        }
                    }

                    // Assign an ID
                    let ref_id = format!("obj_{}", self.encode_counter);
                    self.encode_counter += 1;
                    self.encode_memo.insert(obj_key.clone(), ref_id.clone());
                    visited.insert(obj_key.clone());

                    // Encode items
                    let mut parts: Vec<LiNo<String>> = vec![LiNo::Ref(type_ids::ARRAY.to_string())];
                    for item in arr {
                        let item_link = self.encode_value(item, visited, depth + 1);
                        parts.push(item_link);
                    }

                    let definition = LiNo::Link {
                        id: Some(ref_id.clone()),
                        values: parts,
                    };

                    // Store for multi-link output if not at top level
                    if depth > 0 {
                        self.all_definitions.push((ref_id.clone(), definition));
                        return self.make_ref(&ref_id);
                    }

                    definition
                } else {
                    // No ID needed - simple array
                    let mut parts: Vec<LiNo<String>> = vec![LiNo::Ref(type_ids::ARRAY.to_string())];
                    for item in arr {
                        let item_link = self.encode_value(item, visited, depth + 1);
                        parts.push(item_link);
                    }
                    LiNo::Link {
                        id: None,
                        values: parts,
                    }
                }
            }

            LinoValue::Object(obj) => {
                let obj_key = self.object_key(value);

                // Check if we've already encoded this object
                if let Some(ref_id) = self.encode_memo.get(&obj_key).cloned() {
                    return self.make_ref(&ref_id);
                }

                // Check if this object needs an ID
                let needs_id = self.needs_id.contains(&obj_key);

                if needs_id {
                    // Check for cycle
                    if visited.contains(&obj_key) {
                        // We're in a cycle - must have assigned ID already
                        if let Some(ref_id) = self.encode_memo.get(&obj_key) {
                            return self.make_ref(ref_id);
                        }
                    }

                    // Assign an ID
                    let ref_id = format!("obj_{}", self.encode_counter);
                    self.encode_counter += 1;
                    self.encode_memo.insert(obj_key.clone(), ref_id.clone());
                    visited.insert(obj_key.clone());

                    // Encode key-value pairs
                    let mut parts: Vec<LiNo<String>> =
                        vec![LiNo::Ref(type_ids::OBJECT.to_string())];
                    for (k, v) in obj {
                        let key_link =
                            self.encode_value(&LinoValue::String(k.clone()), visited, depth + 1);
                        let value_link = self.encode_value(v, visited, depth + 1);
                        let pair = LiNo::Link {
                            id: None,
                            values: vec![key_link, value_link],
                        };
                        parts.push(pair);
                    }

                    let definition = LiNo::Link {
                        id: Some(ref_id.clone()),
                        values: parts,
                    };

                    // Store for multi-link output if not at top level
                    if depth > 0 {
                        self.all_definitions.push((ref_id.clone(), definition));
                        return self.make_ref(&ref_id);
                    }

                    definition
                } else {
                    // No ID needed - simple object
                    let mut parts: Vec<LiNo<String>> =
                        vec![LiNo::Ref(type_ids::OBJECT.to_string())];
                    for (k, v) in obj {
                        let key_link =
                            self.encode_value(&LinoValue::String(k.clone()), visited, depth + 1);
                        let value_link = self.encode_value(v, visited, depth + 1);
                        let pair = LiNo::Link {
                            id: None,
                            values: vec![key_link, value_link],
                        };
                        parts.push(pair);
                    }
                    LiNo::Link {
                        id: None,
                        values: parts,
                    }
                }
            }
        }
    }

    /// Decode Links Notation format to a LinoValue.
    ///
    /// # Arguments
    ///
    /// * `notation` - String in Links Notation format
    ///
    /// # Returns
    ///
    /// The reconstructed value, or an error
    ///
    /// Both the readable format and the compact (base64) format are accepted, so
    /// files written by earlier versions keep working and migrate on next write.
    pub fn decode(&mut self, notation: &str) -> Result<LinoValue, CodecError> {
        if notation.trim().is_empty() {
            return Ok(LinoValue::Null);
        }

        if is_compact_notation(notation) {
            crate::debug::trace("codec.decode", || "compact notation detected".to_string());
            return self.decode_compact(notation);
        }

        crate::debug::trace("codec.decode", || "readable notation detected".to_string());
        readable::decode(notation)
    }

    /// Decode the compact (base64) Links Notation format.
    ///
    /// # Arguments
    ///
    /// * `notation` - String in compact Links Notation format
    ///
    /// # Returns
    ///
    /// The reconstructed value, or an error
    pub fn decode_compact(&mut self, notation: &str) -> Result<LinoValue, CodecError> {
        self.reset_decode_state();

        let links = parse_lino_to_links(notation)
            .map_err(|e| CodecError::ParseError(format!("{:?}", e)))?;

        if links.is_empty() {
            return Ok(LinoValue::Null);
        }

        // Store all links for forward reference resolution
        if links.len() > 1 {
            self.all_links = links.clone();
        }

        // Decode the first link
        self.decode_link(&links[0])
    }

    /// Decode a Link into a LinoValue.
    fn decode_link(&mut self, link: &LiNo<String>) -> Result<LinoValue, CodecError> {
        match link {
            LiNo::Ref(id) => {
                // Check if this is a reference to a previously decoded object
                if let Some(value) = self.decode_memo.get(id) {
                    return Ok(value.clone());
                }

                // Check if it's a forward reference
                if id.starts_with("obj_") && !self.all_links.is_empty() {
                    // Look for this ID in remaining links
                    for other_link in self.all_links.clone() {
                        if let LiNo::Link {
                            id: Some(link_id), ..
                        } = &other_link
                        {
                            if link_id == id {
                                return self.decode_link(&other_link);
                            }
                        }
                    }
                    // Not found - return empty array as fallback
                    let result = LinoValue::Array(vec![]);
                    self.decode_memo.insert(id.clone(), result.clone());
                    return Ok(result);
                }

                // Handle single-element type markers (parser returns Ref for single values like "(null)")
                match id.as_str() {
                    type_ids::NULL => return Ok(LinoValue::Null),
                    type_ids::ARRAY => return Ok(LinoValue::Array(vec![])),
                    type_ids::OBJECT => return Ok(LinoValue::Object(vec![])),
                    type_ids::STR => return Ok(LinoValue::String(String::new())),
                    _ => {}
                }

                // Just a plain string reference
                Ok(LinoValue::String(id.clone()))
            }

            LiNo::Link { id, values } => {
                // Check for self-reference ID (already in memo)
                let self_ref_id = id.as_ref().filter(|i| i.starts_with("obj_"));
                if let Some(ref_id) = self_ref_id {
                    if let Some(value) = self.decode_memo.get(ref_id) {
                        return Ok(value.clone());
                    }
                }

                if values.is_empty() {
                    return Ok(LinoValue::Null);
                }

                // Get the type marker from the first value
                let type_marker = match &values[0] {
                    LiNo::Ref(t) => t.as_str(),
                    LiNo::Link { .. } => return Ok(LinoValue::Null),
                };

                match type_marker {
                    type_ids::NULL => Ok(LinoValue::Null),

                    type_ids::BOOL => {
                        if values.len() > 1 {
                            if let LiNo::Ref(val) = &values[1] {
                                return Ok(LinoValue::Bool(val.eq_ignore_ascii_case("true")));
                            }
                        }
                        Ok(LinoValue::Bool(false))
                    }

                    type_ids::INT => {
                        if values.len() > 1 {
                            if let LiNo::Ref(val) = &values[1] {
                                if let Ok(i) = val.parse::<i64>() {
                                    return Ok(LinoValue::Int(i));
                                }
                            }
                        }
                        Ok(LinoValue::Int(0))
                    }

                    type_ids::FLOAT => {
                        if values.len() > 1 {
                            if let LiNo::Ref(val) = &values[1] {
                                return match val.as_str() {
                                    "NaN" => Ok(LinoValue::Float(f64::NAN)),
                                    "Infinity" => Ok(LinoValue::Float(f64::INFINITY)),
                                    "-Infinity" => Ok(LinoValue::Float(f64::NEG_INFINITY)),
                                    s => {
                                        if let Ok(f) = s.parse::<f64>() {
                                            Ok(LinoValue::Float(f))
                                        } else {
                                            Ok(LinoValue::Float(0.0))
                                        }
                                    }
                                };
                            }
                        }
                        Ok(LinoValue::Float(0.0))
                    }

                    type_ids::STR => {
                        if values.len() > 1 {
                            if let LiNo::Ref(b64_str) = &values[1] {
                                if let Ok(bytes) = BASE64.decode(b64_str) {
                                    if let Ok(s) = String::from_utf8(bytes) {
                                        return Ok(LinoValue::String(s));
                                    }
                                }
                                // If decode fails, return raw value
                                return Ok(LinoValue::String(b64_str.clone()));
                            }
                        }
                        Ok(LinoValue::String(String::new()))
                    }

                    type_ids::ARRAY => {
                        // Create result array and register in memo early for circular refs
                        let result_array = LinoValue::Array(vec![]);
                        if let Some(ref_id) = self_ref_id {
                            self.decode_memo.insert(ref_id.clone(), result_array);
                        }

                        // Decode items (skip type marker at index 0)
                        let mut items = Vec::new();
                        for item_link in values.iter().skip(1) {
                            let decoded = self.decode_link(item_link)?;
                            items.push(decoded);
                        }

                        let result = LinoValue::Array(items);

                        // Update memo if needed
                        if let Some(ref_id) = self_ref_id {
                            self.decode_memo.insert(ref_id.clone(), result.clone());
                        }

                        Ok(result)
                    }

                    type_ids::OBJECT => {
                        // Create result object and register in memo early for circular refs
                        let result_object = LinoValue::Object(vec![]);
                        if let Some(ref_id) = self_ref_id {
                            self.decode_memo.insert(ref_id.clone(), result_object);
                        }

                        // Decode key-value pairs (skip type marker at index 0)
                        let mut obj = Vec::new();
                        for pair_link in values.iter().skip(1) {
                            if let LiNo::Link { values: pair, .. } = pair_link {
                                if pair.len() >= 2 {
                                    let key = self.decode_link(&pair[0])?;
                                    let value = self.decode_link(&pair[1])?;

                                    // Key should be a string
                                    if let LinoValue::String(k) = key {
                                        obj.push((k, value));
                                    }
                                }
                            }
                        }

                        let result = LinoValue::Object(obj);

                        // Update memo if needed
                        if let Some(ref_id) = self_ref_id {
                            self.decode_memo.insert(ref_id.clone(), result.clone());
                        }

                        Ok(result)
                    }

                    unknown => Err(CodecError::UnknownType(unknown.to_string())),
                }
            }
        }
    }
}

/// Detect the compact (base64) format.
///
/// Compact output always starts a line with `(` immediately followed by a type
/// marker — optionally preceded by an object id, as in `(obj_0: object …)`.
/// Readable output never does: its first line is either a lone `(` or a scalar.
/// Type markers that open a compact document, across all implementations.
///
/// The languages historically disagreed on three of them -- Python writes
/// `None`/`list`/`dict` where JavaScript and Rust write `null`/`array`/`object`
/// -- so every implementation accepts the union and can read a compact document
/// written by any of the others.
const COMPACT_TYPE_MARKERS: [&str; 10] = [
    type_ids::NULL,
    "None",
    type_ids::BOOL,
    type_ids::INT,
    type_ids::FLOAT,
    type_ids::STR,
    type_ids::ARRAY,
    "list",
    type_ids::OBJECT,
    "dict",
];

fn is_compact_notation(notation: &str) -> bool {
    let Some(first_line) = notation.lines().map(str::trim).find(|l| !l.is_empty()) else {
        return false;
    };

    let Some(rest) = first_line.strip_prefix('(') else {
        return false;
    };

    let mut tokens = rest
        .split(|c: char| c.is_whitespace() || c == '(' || c == ')')
        .filter(|t| !t.is_empty());

    let Some(mut marker) = tokens.next() else {
        return false;
    };

    // Skip the `obj_N:` definition id, if present.
    if let Some(id) = marker.strip_suffix(':') {
        if !id.starts_with("obj_") {
            return false;
        }
        let Some(next) = tokens.next() else {
            return false;
        };
        marker = next;
    }

    COMPACT_TYPE_MARKERS.contains(&marker)
}

// Global codec instance for convenience functions
thread_local! {
    static DEFAULT_CODEC: std::cell::RefCell<ObjectCodec> = std::cell::RefCell::new(ObjectCodec::new());
}

/// Encode a value to the readable, indented Links Notation format.
///
/// This is a convenience function that uses a thread-local codec instance.
///
/// # Arguments
///
/// * `value` - The value to encode
///
/// # Returns
///
/// A string in readable Links Notation format
///
/// # Example
///
/// ```rust
/// use lino_objects_codec::{encode, LinoValue};
///
/// let data = LinoValue::object([
///     ("name", LinoValue::String("Alice".to_string())),
///     ("age", LinoValue::Int(30)),
/// ]);
/// let encoded = encode(&data);
/// // Names and values are written as they are, one per line
/// assert_eq!(encoded, "(\n  name \"Alice\"\n  age 30\n)");
/// ```
pub fn encode(value: &LinoValue) -> String {
    DEFAULT_CODEC.with(|codec| codec.borrow_mut().encode(value))
}

/// Encode a value to the readable format using a custom indentation string.
///
/// # Arguments
///
/// * `value` - The value to encode
/// * `indent` - The indentation string used per nesting level
///
/// # Example
///
/// ```rust
/// use lino_objects_codec::{encode_with_indent, LinoValue};
///
/// let data = LinoValue::object([("age", LinoValue::Int(30))]);
/// assert_eq!(encode_with_indent(&data, "    "), "(\n    age 30\n)");
/// ```
pub fn encode_with_indent(value: &LinoValue, indent: &str) -> String {
    DEFAULT_CODEC.with(|codec| codec.borrow_mut().encode_with_indent(value, indent))
}

/// Encode a value to the compact, single-line Links Notation format.
///
/// Every string is base64-encoded and the whole document is written on one line.
/// [`decode`] reads this form as well, so stored files remain readable by the
/// library after switching to the default readable output.
///
/// # Arguments
///
/// * `value` - The value to encode
///
/// # Returns
///
/// A string in compact Links Notation format
///
/// # Example
///
/// ```rust
/// use lino_objects_codec::{encode_compact, decode, LinoValue};
///
/// let data = LinoValue::object([("name", LinoValue::String("Alice".to_string()))]);
/// let encoded = encode_compact(&data);
/// // String "Alice" is base64-encoded as "QWxpY2U="
/// assert!(encoded.contains("QWxpY2U="));
/// assert_eq!(decode(&encoded).unwrap(), data);
/// ```
pub fn encode_compact(value: &LinoValue) -> String {
    DEFAULT_CODEC.with(|codec| codec.borrow_mut().encode_compact(value))
}

/// Encode a value to the compact, base64 form.
///
/// Alias of [`encode_compact`], named after what the form does to its content.
pub fn encode_obfuscated(value: &LinoValue) -> String {
    DEFAULT_CODEC.with(|codec| codec.borrow_mut().encode_obfuscated(value))
}

/// Decode Links Notation format to a value.
///
/// This is a convenience function that uses a thread-local codec instance.
///
/// # Arguments
///
/// * `notation` - String in Links Notation format
///
/// # Returns
///
/// The reconstructed value, or an error
///
/// # Example
///
/// ```rust
/// use lino_objects_codec::{encode, decode, LinoValue};
///
/// let original = LinoValue::Int(42);
/// let encoded = encode(&original);
/// let decoded = decode(&encoded).unwrap();
/// assert_eq!(decoded, original);
/// ```
pub fn decode(notation: &str) -> Result<LinoValue, CodecError> {
    DEFAULT_CODEC.with(|codec| codec.borrow_mut().decode(notation))
}

/// Formatting utilities for indented Links Notation format.
pub mod format {
    use super::{parse_lino_to_links, LiNo};
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
        let needs_escaping = value.chars().any(|c| {
            c.is_whitespace() || c == '(' || c == ')' || c == '\'' || c == '"' || c == ':'
        }) || value.contains('\n');

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
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_roundtrip_null() {
        let original = LinoValue::Null;
        let encoded = encode(&original);
        let decoded = decode(&encoded).unwrap();
        assert_eq!(decoded, original);
    }

    #[test]
    fn test_roundtrip_bool() {
        for value in [true, false] {
            let original = LinoValue::Bool(value);
            let encoded = encode(&original);
            let decoded = decode(&encoded).unwrap();
            assert_eq!(decoded, original);
        }
    }

    #[test]
    fn test_roundtrip_int() {
        let test_values: Vec<i64> = vec![0, 1, -1, 42, -42, 123456789, -123456789];
        for value in test_values {
            let original = LinoValue::Int(value);
            let encoded = encode(&original);
            let decoded = decode(&encoded).unwrap();
            assert_eq!(decoded.as_int(), Some(value));
        }
    }

    #[test]
    fn test_roundtrip_float() {
        let test_values: Vec<f64> = vec![0.0, 1.0, -1.0, 3.14, -3.14, 0.123456789, -999.999];
        for value in test_values {
            let original = LinoValue::Float(value);
            let encoded = encode(&original);
            let decoded = decode(&encoded).unwrap();
            let decoded_f = decoded.as_float().unwrap();
            assert!((decoded_f - value).abs() < 0.0001);
        }
    }

    #[test]
    fn test_float_special_values() {
        // Test infinity
        let inf = LinoValue::Float(f64::INFINITY);
        let encoded = encode(&inf);
        let decoded = decode(&encoded).unwrap();
        let decoded_f = decoded.as_float().unwrap();
        assert!(decoded_f.is_infinite());
        assert!(decoded_f.is_sign_positive());

        // Test negative infinity
        let neg_inf = LinoValue::Float(f64::NEG_INFINITY);
        let encoded = encode(&neg_inf);
        let decoded = decode(&encoded).unwrap();
        let decoded_f = decoded.as_float().unwrap();
        assert!(decoded_f.is_infinite());
        assert!(decoded_f.is_sign_negative());

        // Test NaN
        let nan = LinoValue::Float(f64::NAN);
        let encoded = encode(&nan);
        let decoded = decode(&encoded).unwrap();
        let decoded_f = decoded.as_float().unwrap();
        assert!(decoded_f.is_nan());
    }

    #[test]
    fn test_roundtrip_string() {
        let test_values = [
            "",
            "hello",
            "hello world",
            "Hello, World!",
            "multi\nline\nstring",
            "tab\tseparated",
            "special chars: @#$%^&*()",
        ];
        for value in test_values {
            let original = LinoValue::String(value.to_string());
            let encoded = encode(&original);
            let decoded = decode(&encoded).unwrap();
            assert_eq!(decoded.as_str(), Some(value));
        }
    }

    #[test]
    fn test_string_with_quotes() {
        let test_values = [
            "string with 'single quotes'",
            "string with \"double quotes\"",
            "string with \"both\" 'quotes'",
        ];
        for value in test_values {
            let original = LinoValue::String(value.to_string());
            let encoded = encode(&original);
            let decoded = decode(&encoded).unwrap();
            assert_eq!(decoded.as_str(), Some(value));
        }
    }

    #[test]
    fn test_unicode_string() {
        let value = "unicode: 你好世界 🌍";
        let original = LinoValue::String(value.to_string());
        let encoded = encode(&original);
        let decoded = decode(&encoded).unwrap();
        assert_eq!(decoded.as_str(), Some(value));
    }

    #[test]
    fn test_roundtrip_empty_array() {
        let original = LinoValue::Array(vec![]);
        let encoded = encode(&original);
        let decoded = decode(&encoded).unwrap();
        assert_eq!(decoded, original);
    }

    #[test]
    fn test_roundtrip_simple_array() {
        let original = LinoValue::Array(vec![
            LinoValue::Int(1),
            LinoValue::Int(2),
            LinoValue::Int(3),
        ]);
        let encoded = encode(&original);
        let decoded = decode(&encoded).unwrap();
        assert_eq!(decoded, original);
    }

    #[test]
    fn test_roundtrip_mixed_array() {
        let original = LinoValue::Array(vec![
            LinoValue::Int(1),
            LinoValue::String("hello".to_string()),
            LinoValue::Bool(true),
            LinoValue::Null,
        ]);
        let encoded = encode(&original);
        let decoded = decode(&encoded).unwrap();
        assert_eq!(decoded, original);
    }

    #[test]
    fn test_nested_arrays() {
        let original = LinoValue::Array(vec![LinoValue::Array(vec![])]);
        let encoded = encode(&original);
        let decoded = decode(&encoded).unwrap();
        assert_eq!(decoded, original);

        let original2 = LinoValue::Array(vec![
            LinoValue::Array(vec![LinoValue::Int(1), LinoValue::Int(2)]),
            LinoValue::Array(vec![LinoValue::Int(3), LinoValue::Int(4)]),
        ]);
        let encoded2 = encode(&original2);
        let decoded2 = decode(&encoded2).unwrap();
        assert_eq!(decoded2, original2);
    }

    #[test]
    fn test_roundtrip_empty_object() {
        let original = LinoValue::Object(vec![]);
        let encoded = encode(&original);
        let decoded = decode(&encoded).unwrap();
        assert_eq!(decoded, original);
    }

    #[test]
    fn test_roundtrip_simple_object() {
        let original = LinoValue::object([("a", LinoValue::Int(1)), ("b", LinoValue::Int(2))]);
        let encoded = encode(&original);
        let decoded = decode(&encoded).unwrap();
        assert_eq!(decoded, original);
    }

    #[test]
    fn test_nested_objects() {
        let original = LinoValue::object([(
            "user",
            LinoValue::object([
                ("name", LinoValue::String("Alice".to_string())),
                (
                    "address",
                    LinoValue::object([
                        ("city", LinoValue::String("NYC".to_string())),
                        ("zip", LinoValue::String("10001".to_string())),
                    ]),
                ),
            ]),
        )]);
        let encoded = encode(&original);
        let decoded = decode(&encoded).unwrap();
        assert_eq!(decoded, original);
    }

    #[test]
    fn test_complex_structure() {
        let original = LinoValue::object([
            ("id", LinoValue::Int(123)),
            ("name", LinoValue::String("Test Object".to_string())),
            ("active", LinoValue::Bool(true)),
            (
                "tags",
                LinoValue::array([
                    LinoValue::String("tag1".to_string()),
                    LinoValue::String("tag2".to_string()),
                    LinoValue::String("tag3".to_string()),
                ]),
            ),
            (
                "metadata",
                LinoValue::object([
                    ("created", LinoValue::String("2025-01-01".to_string())),
                    ("modified", LinoValue::Null),
                    ("count", LinoValue::Int(42)),
                ]),
            ),
            (
                "items",
                LinoValue::array([
                    LinoValue::object([
                        ("id", LinoValue::Int(1)),
                        ("value", LinoValue::String("first".to_string())),
                    ]),
                    LinoValue::object([
                        ("id", LinoValue::Int(2)),
                        ("value", LinoValue::String("second".to_string())),
                    ]),
                ]),
            ),
        ]);
        let encoded = encode(&original);
        let decoded = decode(&encoded).unwrap();
        assert_eq!(decoded, original);
    }

    #[test]
    fn test_list_of_dicts() {
        let original = LinoValue::array([
            LinoValue::object([
                ("name", LinoValue::String("Alice".to_string())),
                ("age", LinoValue::Int(30)),
            ]),
            LinoValue::object([
                ("name", LinoValue::String("Bob".to_string())),
                ("age", LinoValue::Int(25)),
            ]),
        ]);
        let encoded = encode(&original);
        let decoded = decode(&encoded).unwrap();
        assert_eq!(decoded, original);
    }

    #[test]
    fn test_dict_of_lists() {
        let original = LinoValue::object([
            (
                "numbers",
                LinoValue::array([LinoValue::Int(1), LinoValue::Int(2), LinoValue::Int(3)]),
            ),
            (
                "strings",
                LinoValue::array([
                    LinoValue::String("a".to_string()),
                    LinoValue::String("b".to_string()),
                    LinoValue::String("c".to_string()),
                ]),
            ),
        ]);
        let encoded = encode(&original);
        let decoded = decode(&encoded).unwrap();
        assert_eq!(decoded, original);
    }
}

#[cfg(test)]
mod format_tests {
    use super::format::*;
    use std::collections::HashMap;

    #[test]
    fn test_escape_reference_simple_string() {
        assert_eq!(escape_reference("hello"), "hello");
        assert_eq!(escape_reference("world"), "world");
    }

    #[test]
    fn test_escape_reference_string_with_spaces() {
        let result = escape_reference("hello world");
        assert!(result.starts_with('\'') || result.starts_with('"'));
        assert!(result.contains("hello world"));
    }

    #[test]
    fn test_escape_reference_string_with_single_quotes() {
        let result = escape_reference("it's");
        assert_eq!(result, "\"it's\"");
    }

    #[test]
    fn test_escape_reference_string_with_double_quotes() {
        let result = escape_reference("he said \"hello\"");
        assert_eq!(result, "'he said \"hello\"'");
    }

    #[test]
    fn test_unescape_reference_doubled_quotes() {
        assert_eq!(
            unescape_reference("he said \"\"hello\"\""),
            "he said \"hello\""
        );
        assert_eq!(unescape_reference("it''s"), "it's");
    }

    #[test]
    fn test_format_indented_ordered_basic() {
        let pairs = [
            ("uuid", "6dcf4c1b-ff3f-482c-95ab-711ea7d1b019"),
            ("status", "executed"),
            ("command", "echo test"),
            ("exitCode", "0"),
        ];
        let result =
            format_indented_ordered("6dcf4c1b-ff3f-482c-95ab-711ea7d1b019", &pairs, "  ").unwrap();
        let lines: Vec<&str> = result.lines().collect();
        assert_eq!(lines[0], "6dcf4c1b-ff3f-482c-95ab-711ea7d1b019");
        assert_eq!(lines[1], "  uuid \"6dcf4c1b-ff3f-482c-95ab-711ea7d1b019\"");
        assert_eq!(lines[2], "  status \"executed\"");
        assert_eq!(lines[3], "  command \"echo test\"");
        assert_eq!(lines[4], "  exitCode \"0\"");
    }

    #[test]
    fn test_format_indented_value_with_quotes() {
        // Values containing double quotes are wrapped in single quotes (links-notation style)
        let pairs = [("message", "He said \"hello\"")];
        let result = format_indented_ordered("test-id", &pairs, "  ").unwrap();
        let lines: Vec<&str> = result.lines().collect();
        assert_eq!(lines[1], "  message 'He said \"hello\"'");
    }

    #[test]
    fn test_format_indented_requires_id() {
        let mut obj = HashMap::new();
        obj.insert("key".to_string(), "value".to_string());
        let result = format_indented("", &obj, "  ");
        assert!(result.is_err());
    }

    #[test]
    fn test_parse_indented_basic() {
        let text = "6dcf4c1b-ff3f-482c-95ab-711ea7d1b019\n  uuid \"6dcf4c1b-ff3f-482c-95ab-711ea7d1b019\"\n  status \"executed\"\n  exitCode \"0\"";
        let (id, obj) = parse_indented(text).unwrap();
        assert_eq!(id, "6dcf4c1b-ff3f-482c-95ab-711ea7d1b019");
        assert_eq!(
            obj.get("uuid"),
            Some(&"6dcf4c1b-ff3f-482c-95ab-711ea7d1b019".to_string())
        );
        assert_eq!(obj.get("status"), Some(&"executed".to_string()));
        assert_eq!(obj.get("exitCode"), Some(&"0".to_string()));
    }

    #[test]
    fn test_parse_indented_with_quotes() {
        // Links-notation style: use single quotes to wrap value containing double quotes
        let text = "test-id\n  message 'He said \"hello\"'";
        let (id, obj) = parse_indented(text).unwrap();
        assert_eq!(id, "test-id");
        assert_eq!(obj.get("message"), Some(&"He said \"hello\"".to_string()));
    }

    #[test]
    fn test_parse_indented_empty_lines_skipped() {
        let text = "test-id\n\n  key \"value\"\n\n  another \"value2\"";
        let (id, obj) = parse_indented(text).unwrap();
        assert_eq!(id, "test-id");
        assert_eq!(obj.get("key"), Some(&"value".to_string()));
        assert_eq!(obj.get("another"), Some(&"value2".to_string()));
    }

    #[test]
    fn test_parse_indented_requires_text() {
        let result = parse_indented("");
        assert!(result.is_err());
    }

    #[test]
    fn test_roundtrip_format_indented() {
        let pairs = [
            ("uuid", "6dcf4c1b-ff3f-482c-95ab-711ea7d1b019"),
            ("status", "executed"),
            ("command", "echo test"),
            ("exitCode", "0"),
        ];
        let formatted =
            format_indented_ordered("6dcf4c1b-ff3f-482c-95ab-711ea7d1b019", &pairs, "  ").unwrap();
        let (parsed_id, parsed_obj) = parse_indented(&formatted).unwrap();

        assert_eq!(parsed_id, "6dcf4c1b-ff3f-482c-95ab-711ea7d1b019");
        for (key, value) in pairs {
            assert_eq!(parsed_obj.get(key), Some(&value.to_string()));
        }
    }

    #[test]
    fn test_roundtrip_with_quotes() {
        let pairs = [("message", "He said \"hello\"")];
        let formatted = format_indented_ordered("test-id", &pairs, "  ").unwrap();
        let (parsed_id, parsed_obj) = parse_indented(&formatted).unwrap();

        assert_eq!(parsed_id, "test-id");
        assert_eq!(
            parsed_obj.get("message"),
            Some(&"He said \"hello\"".to_string())
        );
    }
}
