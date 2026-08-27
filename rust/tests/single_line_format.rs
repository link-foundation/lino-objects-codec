//! Tests for the readable, single-line format produced by `encode_line()`
//! (issue #43).
//!
//! An append-only log wants one record per line: appending is one write,
//! compaction cuts at a newline, and `grep`, `tail -f` and `wc -l` all treat a
//! line as an event. `encode()` spreads a record over many lines and
//! `encode_compact()` hides it in base64, so neither serves that reader.

use links_notation::parse_lino;
use lino_objects_codec::{decode, decode_line, encode, encode_line, LinoValue};

/// A record of the shape an append-only log actually holds.
fn log_record() -> LinoValue {
    LinoValue::object([
        ("bytes", LinoValue::Int(2827)),
        ("complete", LinoValue::Bool(true)),
        (
            "server",
            LinoValue::object([
                ("host", LinoValue::String("127.0.0.1".to_string())),
                ("port", LinoValue::Int(18878)),
            ]),
        ),
        (
            "models",
            LinoValue::array([
                LinoValue::String("claude-haiku".to_string()),
                LinoValue::String("claude-opus".to_string()),
            ]),
        ),
    ])
}

#[test]
fn a_record_is_written_on_one_line() {
    let line = encode_line(&log_record());
    assert!(
        !line.contains('\n') && !line.contains('\r'),
        "a record must stay on one line, got {line:?}"
    );
    assert_eq!(
        line,
        r#"(o: (bytes 2827) (complete true) (server (o: (host "127.0.0.1") (port 18878))) (models ("claude-haiku" "claude-opus")))"#
    );
}

#[test]
fn a_line_is_valid_links_notation() {
    let line = encode_line(&log_record());
    parse_lino(&line).unwrap_or_else(|error| {
        panic!("the notation's own parser rejected {line:?}: {error:?}");
    });
}

/// The dialect a downstream project invented for the same need, which the
/// notation's parser rejects -- the reason this format exists.
#[test]
fn the_hand_rolled_dialect_is_the_one_the_parser_rejects() {
    assert!(parse_lino(r#"((:"bytes" 2827) (:"complete" true))"#).is_err());
}

#[test]
fn both_forms_of_the_same_value_decode_alike() {
    for value in [
        log_record(),
        LinoValue::Array(vec![]),
        LinoValue::Object(vec![]),
        LinoValue::array([LinoValue::Object(vec![]), LinoValue::Array(vec![])]),
        LinoValue::object([("empty", LinoValue::Array(vec![]))]),
        LinoValue::Int(42),
        LinoValue::Null,
    ] {
        assert_eq!(
            decode(&encode_line(&value)),
            decode(&encode(&value)),
            "the two forms disagree about {value:?}"
        );
        assert_eq!(decode_line(&encode_line(&value)), Ok(value));
    }
}

#[test]
fn a_string_keeps_its_own_characters_on_one_line() {
    let value = LinoValue::object([(
        "text",
        LinoValue::String("quote \" backslash \\ ünïcödé".to_string()),
    )]);
    let line = encode_line(&value);
    assert_eq!(line, r#"(o: (text 'quote " backslash \ ünïcödé'))"#);
    assert_eq!(decode_line(&line), Ok(value));
}

/// A newline inside a string would end the record, so such a string is the one
/// thing written encoded -- individually, so the rest of the record stays
/// readable.
#[test]
fn a_string_holding_a_newline_still_fits_on_one_line() {
    let value = LinoValue::object([
        ("readable", LinoValue::String("still visible".to_string())),
        ("multiline", LinoValue::String("line1\nline2".to_string())),
    ]);
    let line = encode_line(&value);
    assert_eq!(
        line,
        r#"(o: (readable "still visible") (multiline (base64 "bGluZTEKbGluZTI=")))"#
    );
    assert!(
        !line.contains('\n'),
        "a record must stay on one line: {line:?}"
    );
    assert_eq!(decode_line(&line), Ok(value));
}

/// The one ambiguity a flat layout has: is `(a 1)` a one-pair object or a
/// two-element array? On one line an object says so with the `o:` marker, so
/// both values keep their own spelling.
#[test]
fn a_one_pair_object_is_not_a_two_element_array() {
    let object = LinoValue::object([("a", LinoValue::Int(1))]);
    let array = LinoValue::array([LinoValue::String("a".to_string()), LinoValue::Int(1)]);

    assert_eq!(encode_line(&object), "(o: (a 1))");
    assert_eq!(encode_line(&array), r#"("a" 1)"#);
    assert_eq!(decode_line("(o: (a 1))"), Ok(object));
    assert_eq!(decode_line(r#"("a" 1)"#), Ok(array));
}

/// Because the marker answers it, the empty key round-trips instead of being
/// rejected: `("" 2)` is a pair like any other inside a marked object.
#[test]
fn the_empty_key_survives_the_round_trip() {
    let value = LinoValue::object([("", LinoValue::Int(2))]);
    assert_eq!(encode_line(&value), r#"(o: ("" 2))"#);
    assert_eq!(decode_line(&encode_line(&value)), Ok(value));
}

#[test]
fn a_marked_object_holding_something_that_is_not_a_pair_is_rejected() {
    let error = decode_line("(o: 1 2)").expect_err("a marked object holds pairs only");
    assert!(
        error.to_string().contains("pairs"),
        "the error must say what a marked object holds, got {error}"
    );
}

/// Reading a log means handing over one record at a time, so a decoder that
/// silently accepted two lines would merge two records into one value.
#[test]
fn several_lines_are_not_one_record() {
    assert!(decode_line("(o: (a 1))\n(o: (b 2))").is_err());
}

/// A trailing newline is what a line reader may keep, so it is trimmed rather
/// than refused.
#[test]
fn a_trailing_newline_is_not_a_second_record() {
    assert_eq!(
        decode_line("(o: (a 1))\n"),
        Ok(LinoValue::object([("a", LinoValue::Int(1))]))
    );
}

/// A line whose first value is null is a readable line, not the compact null:
/// `decode` must not route it to the base64 reader.
#[test]
fn a_line_starting_with_null_is_still_read_as_a_line() {
    assert_eq!(
        decode("(null 1)"),
        Ok(LinoValue::array([LinoValue::Null, LinoValue::Int(1)]))
    );
    assert_eq!(
        decode("(o: (a null))"),
        Ok(LinoValue::object([("a", LinoValue::Null)]))
    );
    // The one document both forms claim: `(null)` is the compact null, and stays
    // read that way, so documents written before this format keep decoding.
    assert_eq!(decode("(null)"), Ok(LinoValue::Null));
}

/// The JavaScript sibling trimmed the framing newlines with a regular
/// expression that backtracked once per newline (CodeQL js/polynomial-redos).
/// Every language strips them with a linear scan instead, and still refuses
/// input holding more than one line.
#[test]
fn a_long_run_of_line_breaks_is_rejected_without_a_slowdown() {
    let notation = format!("{}{}x", encode_line(&log_record()), "\n".repeat(200_000));
    let started = std::time::Instant::now();
    assert!(decode_line(&notation).is_err());
    assert!(started.elapsed() < std::time::Duration::from_secs(2));
}
