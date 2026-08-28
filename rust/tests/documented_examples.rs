//! Checks that the snippets shown in `README.md` and the crate docs stay true.

use lino_objects_codec::{LinoValue, decode, encode, encode_compact, encode_line};

#[test]
fn scalars_are_written_as_documented() {
    assert_eq!(encode(&LinoValue::Null), "null");
    assert_eq!(encode(&LinoValue::Bool(true)), "true");
    assert_eq!(encode(&LinoValue::Int(42)), "42");
    assert_eq!(encode(&LinoValue::Float(3.14)), "3.14");
    assert_eq!(encode(&LinoValue::Float(f64::INFINITY)), "Infinity");
    assert_eq!(encode(&LinoValue::Float(f64::NAN)), "NaN");
    assert_eq!(encode(&LinoValue::String("hello".into())), "\"hello\"");
}

#[test]
fn quick_start_object_matches_the_readme() {
    let data = LinoValue::object([
        ("name", LinoValue::String("Alice".to_string())),
        ("age", LinoValue::Int(30)),
        ("active", LinoValue::Bool(true)),
    ]);

    assert_eq!(
        encode(&data),
        "(\n  name \"Alice\"\n  age 30\n  active true\n)"
    );
}

#[test]
fn empty_containers_are_written_as_documented() {
    assert_eq!(encode(&LinoValue::Array(vec![])), "()");
    assert_eq!(encode(&LinoValue::Object(vec![])), "(\n)");
}

#[test]
fn a_newline_stays_a_newline_and_only_a_line_escapes_it() {
    let value = LinoValue::String("line1\nline2".into());
    assert_eq!(encode(&value), "\"line1\nline2\"");
    assert_eq!(encode_line(&value), "(escaped \"line1%0Aline2\")");
}

#[test]
fn both_forms_decode_as_documented() {
    assert_eq!(
        encode_compact(&LinoValue::String("hello".into())),
        "(str aGVsbG8=)"
    );
    assert_eq!(decode("42").unwrap(), LinoValue::Int(42));
    assert_eq!(decode("(int 42)").unwrap(), LinoValue::Int(42));
}
