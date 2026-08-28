//! The compact format must be readable across languages.
//!
//! Booleans used to be written differently per language: JavaScript and Rust
//! wrote `(bool true)` while Python and C# wrote `(bool True)`, and each decoder
//! only understood its own spelling, so a document written by one language
//! decoded to the wrong value in another. Every language now writes the
//! lowercase form and reads either spelling.

use lino_objects_codec::{LinoValue, decode, encode_compact};

#[test]
fn booleans_are_written_lowercase() {
    assert_eq!(encode_compact(&LinoValue::Bool(true)), "(bool true)");
    assert_eq!(encode_compact(&LinoValue::Bool(false)), "(bool false)");
}

#[test]
fn lowercase_booleans_decode() {
    assert_eq!(decode("(bool true)"), Ok(LinoValue::Bool(true)));
    assert_eq!(decode("(bool false)"), Ok(LinoValue::Bool(false)));
}

#[test]
fn capitalized_booleans_from_older_documents_still_decode() {
    assert_eq!(decode("(bool True)"), Ok(LinoValue::Bool(true)));
    assert_eq!(decode("(bool False)"), Ok(LinoValue::Bool(false)));
}
