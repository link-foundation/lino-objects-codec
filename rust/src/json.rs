//! Lossless `serde_json::Value` conversions (requires the `serde_json` feature).
//!
//! Maps retain insertion order. Numbers retain the text exposed by
//! `serde_json::Number`, using `(json-number "…")` in readable notation and
//! `(json_number …)` in compact notation. Neither passes through `f64`.
//! Existing integer/float values still convert to JSON; non-finite floats and
//! duplicate object keys return errors rather than silently losing information.

use crate::{CodecError, LinoValue, decode, encode};
use serde_json::{Map, Value};

/// Options for JSON conversion. Preservation is the default.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct JsonOptions {
    /// Recursively remove nulls and containers left empty after stripping.
    /// Empty strings, false and zero remain. An empty root becomes null.
    pub strip_empty: bool,
}

impl From<Value> for LinoValue {
    fn from(value: Value) -> Self {
        match value {
            Value::Null => Self::Null,
            Value::Bool(b) => Self::Bool(b),
            Value::Number(n) => Self::JsonNumber(n),
            Value::String(s) => Self::String(s),
            Value::Array(items) => Self::Array(items.into_iter().map(Self::from).collect()),
            Value::Object(pairs) => {
                Self::Object(pairs.into_iter().map(|(k, v)| (k, Self::from(v))).collect())
            }
        }
    }
}

impl From<&Value> for LinoValue {
    fn from(value: &Value) -> Self {
        Self::from(value.clone())
    }
}

impl TryFrom<LinoValue> for Value {
    type Error = CodecError;

    fn try_from(value: LinoValue) -> Result<Self, Self::Error> {
        match value {
            LinoValue::Null => Ok(Self::Null),
            LinoValue::Bool(b) => Ok(Self::Bool(b)),
            LinoValue::Int(i) => Ok(Self::Number(i.into())),
            LinoValue::Float(f) => serde_json::Number::from_f64(f)
                .map(Self::Number)
                .ok_or_else(|| {
                    CodecError::DecodeError("JSON cannot represent a non-finite float".into())
                }),
            LinoValue::JsonNumber(n) => Ok(Self::Number(n)),
            LinoValue::String(s) => Ok(Self::String(s)),
            LinoValue::Array(items) => items
                .into_iter()
                .map(Self::try_from)
                .collect::<Result<Vec<_>, _>>()
                .map(Self::Array),
            LinoValue::Object(pairs) => {
                let mut map = Map::new();
                for (key, value) in pairs {
                    if map.contains_key(&key) {
                        return Err(CodecError::DecodeError(format!(
                            "duplicate JSON object key: {key:?}"
                        )));
                    }
                    map.insert(key, Self::try_from(value)?);
                }
                Ok(Self::Object(map))
            }
        }
    }
}

impl TryFrom<&LinoValue> for Value {
    type Error = CodecError;
    fn try_from(value: &LinoValue) -> Result<Self, Self::Error> {
        Self::try_from(value.clone())
    }
}

/// Recursively strip nulls and empty containers. Return `None` for an empty root.
pub fn strip_empty(value: Value) -> Option<Value> {
    match value {
        Value::Null => None,
        Value::Array(items) => {
            let items: Vec<_> = items.into_iter().filter_map(strip_empty).collect();
            (!items.is_empty()).then_some(Value::Array(items))
        }
        Value::Object(pairs) => {
            let pairs: Map<_, _> = pairs
                .into_iter()
                .filter_map(|(k, v)| strip_empty(v).map(|v| (k, v)))
                .collect();
            (!pairs.is_empty()).then_some(Value::Object(pairs))
        }
        value => Some(value),
    }
}

/// Convert JSON with an explicit empty-value policy.
pub fn from_json_with_options(value: Value, options: JsonOptions) -> LinoValue {
    LinoValue::from(if options.strip_empty {
        strip_empty(value).unwrap_or(Value::Null)
    } else {
        value
    })
}

/// Encode JSON in readable notation, preserving all values.
pub fn json_to_lino(value: &Value) -> String {
    encode(&LinoValue::from(value))
}

/// Encode JSON with an explicit empty-value policy.
pub fn json_to_lino_with_options(value: Value, options: JsonOptions) -> String {
    encode(&from_json_with_options(value, options))
}

/// Decode readable, single-line or compact notation into JSON.
pub fn lino_to_json(text: &str) -> Result<Value, CodecError> {
    Value::try_from(decode(text)?)
}

pub(crate) fn decode_compact_number(
    values: &[links_notation::LiNo<String>],
) -> Result<LinoValue, CodecError> {
    let [_, links_notation::LiNo::Ref(payload)] = values else {
        return Err(CodecError::DecodeError(
            "json_number expects one numeric payload".into(),
        ));
    };
    payload
        .parse::<serde_json::Number>()
        .map(LinoValue::JsonNumber)
        .map_err(|e| CodecError::DecodeError(format!("invalid JSON number: {e}")))
}
