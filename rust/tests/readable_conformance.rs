//! Cross-language conformance tests for the readable format, indented and on a
//! single line.
//!
//! The fixtures in `fixtures/readable-format/cases.json` are shared by the
//! JavaScript, Python, Rust and C# suites. Each case is written by hand from the
//! format specification, so the four implementations check each other instead of
//! agreeing on a shared mistake: every language must encode `value` to exactly
//! `text` and to exactly `line`, and decode both back to exactly `value`.

use lino_objects_codec::{decode, decode_line, encode, encode_line, LinoValue};
use serde_json::Value as Json;

/// The language id this suite answers to in a case's `skip` map.
const LANGUAGE: &str = "rust";

fn fixtures() -> Json {
    let path = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../fixtures/readable-format/cases.json"
    );
    let text =
        std::fs::read_to_string(path).unwrap_or_else(|error| panic!("cannot read {path}: {error}"));
    serde_json::from_str(&text).unwrap_or_else(|error| panic!("cannot parse {path}: {error}"))
}

fn cases() -> Vec<Json> {
    section("cases")
}

/// Documents earlier versions wrote, which are read but never written again.
fn legacy() -> Vec<Json> {
    section("legacy")
}

fn section(key: &str) -> Vec<Json> {
    match fixtures()[key].take() {
        Json::Array(cases) => cases,
        other => panic!("`{key}` must be an array, got {other}"),
    }
}

/// Build a `LinoValue` from the fixtures' tagged encoding.
///
/// A value is a single-key object naming its type, so that a string `"42"` and
/// the number `42` stay distinguishable in JSON.
fn build(value: &Json) -> LinoValue {
    let object = value
        .as_object()
        .unwrap_or_else(|| panic!("a tagged value must be an object, got {value}"));
    let (tag, payload) = object
        .iter()
        .next()
        .unwrap_or_else(|| panic!("a tagged value must have one key, got {value}"));
    assert_eq!(object.len(), 1, "a tagged value must have one key: {value}");
    match tag.as_str() {
        "null" => LinoValue::Null,
        "bool" => LinoValue::Bool(payload.as_bool().expect("bool payload")),
        "int" => LinoValue::Int(payload.as_i64().expect("int payload")),
        "float" => LinoValue::Float(match payload {
            Json::String(text) => match text.as_str() {
                "NaN" => f64::NAN,
                "Infinity" => f64::INFINITY,
                "-Infinity" => f64::NEG_INFINITY,
                other => panic!("unknown float name {other}"),
            },
            other => other.as_f64().expect("float payload"),
        }),
        "str" => LinoValue::String(payload.as_str().expect("str payload").to_string()),
        "array" => LinoValue::Array(
            payload
                .as_array()
                .expect("array payload")
                .iter()
                .map(build)
                .collect(),
        ),
        "object" => LinoValue::Object(
            payload
                .as_array()
                .expect("object payload")
                .iter()
                .map(|pair| {
                    let pair = pair
                        .as_array()
                        .expect("a key/value pair is a two-element array");
                    assert_eq!(pair.len(), 2, "a key/value pair has two elements");
                    (
                        pair[0].as_str().expect("a key is a string").to_string(),
                        build(&pair[1]),
                    )
                })
                .collect(),
        ),
        other => panic!("unknown value tag {other}"),
    }
}

/// Compare two values, treating NaN as equal to itself and object key order as
/// significant -- the library's own `PartialEq` compares objects unordered, but
/// key order is part of the document these fixtures pin down.
fn same(left: &LinoValue, right: &LinoValue) -> bool {
    match (left, right) {
        (LinoValue::Null, LinoValue::Null) => true,
        (LinoValue::Bool(a), LinoValue::Bool(b)) => a == b,
        (LinoValue::Int(a), LinoValue::Int(b)) => a == b,
        (LinoValue::Float(a), LinoValue::Float(b)) => {
            (a.is_nan() && b.is_nan()) || a.to_bits() == b.to_bits()
        }
        (LinoValue::String(a), LinoValue::String(b)) => a == b,
        (LinoValue::Array(a), LinoValue::Array(b)) => {
            a.len() == b.len() && a.iter().zip(b).all(|(x, y)| same(x, y))
        }
        (LinoValue::Object(a), LinoValue::Object(b)) => {
            a.len() == b.len()
                && a.iter()
                    .zip(b)
                    .all(|((ak, av), (bk, bv))| ak == bk && same(av, bv))
        }
        _ => false,
    }
}

fn is_skipped(case: &Json) -> bool {
    case.get("skip")
        .and_then(|skip| skip.get(LANGUAGE))
        .is_some()
}

fn name(case: &Json) -> &str {
    case["name"].as_str().expect("every case has a name")
}

fn text(case: &Json) -> &str {
    case["text"].as_str().expect("every case has a text")
}

fn line(case: &Json) -> &str {
    case["line"].as_str().expect("every case has a line")
}

#[test]
fn every_case_is_either_active_or_skipped_with_a_reason() {
    let cases = cases();
    assert!(!cases.is_empty(), "the fixtures must contain cases");
    for case in &cases {
        if let Some(skip) = case.get("skip") {
            let skip = skip
                .as_object()
                .expect("`skip` maps language ids to reasons");
            for (language, reason) in skip {
                assert!(
                    matches!(language.as_str(), "js" | "python" | "rust" | "csharp"),
                    "unknown language id {language} in case {}",
                    name(case)
                );
                let reason = reason.as_str().unwrap_or("");
                assert!(
                    reason.len() > 20,
                    "case {} skips {language} without explaining why",
                    name(case)
                );
            }
        }
    }
}

#[test]
fn encodes_every_case_to_the_shared_text() {
    let mut failures = Vec::new();
    for case in cases() {
        if is_skipped(&case) {
            continue;
        }
        let encoded = encode(&build(&case["value"]));
        if encoded != text(&case) {
            failures.push(format!(
                "{}: expected {:?}, got {:?}",
                name(&case),
                text(&case),
                encoded
            ));
        }
    }
    assert!(
        failures.is_empty(),
        "encoding mismatches:\n{}",
        failures.join("\n")
    );
}

#[test]
fn decodes_every_shared_text_back_to_the_case_value() {
    let mut failures = Vec::new();
    for case in cases() {
        if is_skipped(&case) {
            continue;
        }
        let expected = build(&case["value"]);
        match decode(text(&case)) {
            Ok(decoded) if same(&decoded, &expected) => {}
            Ok(decoded) => failures.push(format!(
                "{}: expected {:?}, got {:?}",
                name(&case),
                expected,
                decoded
            )),
            Err(error) => failures.push(format!("{}: {error}", name(&case))),
        }
    }
    assert!(
        failures.is_empty(),
        "decoding mismatches:\n{}",
        failures.join("\n")
    );
}

#[test]
fn encodes_every_case_to_the_shared_line() {
    let mut failures = Vec::new();
    for case in cases() {
        if is_skipped(&case) {
            continue;
        }
        let encoded = encode_line(&build(&case["value"]));
        if encoded != line(&case) {
            failures.push(format!(
                "{}: expected {:?}, got {:?}",
                name(&case),
                line(&case),
                encoded
            ));
        }
    }
    assert!(
        failures.is_empty(),
        "single-line encoding mismatches:\n{}",
        failures.join("\n")
    );
}

#[test]
fn decodes_every_shared_line_back_to_the_case_value() {
    let mut failures = Vec::new();
    for case in cases() {
        if is_skipped(&case) {
            continue;
        }
        let expected = build(&case["value"]);
        match decode_line(line(&case)) {
            Ok(decoded) if same(&decoded, &expected) => {}
            Ok(decoded) => failures.push(format!(
                "{}: expected {:?}, got {:?}",
                name(&case),
                expected,
                decoded
            )),
            Err(error) => failures.push(format!("{}: {error}", name(&case))),
        }
    }
    assert!(
        failures.is_empty(),
        "single-line decoding mismatches:\n{}",
        failures.join("\n")
    );
}

/// A log record is one line, so no case may spread over two of them.
#[test]
fn no_shared_line_contains_a_line_break() {
    for case in cases() {
        let line = line(&case);
        assert!(
            !line.contains('\n') && !line.contains('\r'),
            "case {} has a line break in its single-line form: {line:?}",
            name(&case)
        );
    }
}

/// `decode` reads both forms, so a log reader needs no flag saying which one it
/// holds.
#[test]
fn the_plain_decoder_reads_every_shared_line() {
    let mut failures = Vec::new();
    for case in cases() {
        if is_skipped(&case) {
            continue;
        }
        let expected = build(&case["value"]);
        match decode(line(&case)) {
            Ok(decoded) if same(&decoded, &expected) => {}
            Ok(decoded) => failures.push(format!(
                "{}: expected {:?}, got {:?}",
                name(&case),
                expected,
                decoded
            )),
            Err(error) => failures.push(format!("{}: {error}", name(&case))),
        }
    }
    assert!(
        failures.is_empty(),
        "single-line decoding mismatches through `decode`:\n{}",
        failures.join("\n")
    );
}

/// Documents written before this format wrote text as text keep decoding, so
/// upgrading a reader never loses a stored record.
#[test]
fn decodes_every_document_earlier_versions_wrote() {
    let mut failures = Vec::new();
    let legacy = legacy();
    assert!(!legacy.is_empty(), "the fixtures must contain legacy cases");
    for case in legacy {
        let expected = build(&case["value"]);
        match decode(text(&case)) {
            Ok(decoded) if same(&decoded, &expected) => {}
            Ok(decoded) => failures.push(format!(
                "{}: expected {:?}, got {:?}",
                name(&case),
                expected,
                decoded
            )),
            Err(error) => failures.push(format!("{}: {error}", name(&case))),
        }
    }
    assert!(
        failures.is_empty(),
        "legacy decoding mismatches:\n{}",
        failures.join("\n")
    );
}

/// The point of the change: an implementation may not reach for base64 while
/// writing a readable document, whatever the text holds.
#[test]
fn no_shared_document_hides_its_text_in_base64() {
    for case in cases() {
        assert!(
            !text(&case).contains("base64 \"") && !line(&case).contains("base64 \""),
            "case {} still marks a value with base64",
            name(&case)
        );
    }
}
