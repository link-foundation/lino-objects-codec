//! Real text stays real text in both readable forms.
//!
//! Before issue #45 a single control character turned the whole string into
//! base64: one newline in a log message hid the message, the stack trace and
//! every word a reader would grep for. The readable forms now write the text as
//! it is, and escape only the characters the form itself cannot carry.

use lino_objects_codec::{decode, decode_line, encode, encode_line, LinoValue};

fn message(text: &str) -> LinoValue {
    LinoValue::object([("message", LinoValue::String(text.to_string()))])
}

/// The reason for the issue: a log line holding a newline must stay greppable.
#[test]
fn a_multi_line_string_keeps_its_text_in_the_indented_form() {
    let value = message("line one\nline two");
    let encoded = encode(&value);

    assert_eq!(encoded, "(\n  message \"line one\nline two\"\n)");
    assert!(!encoded.contains("base64"), "{encoded}");
    assert!(encoded.contains("line one"), "{encoded}");
    assert!(encoded.contains("line two"), "{encoded}");
    assert_eq!(decode(&encoded).unwrap(), value);
}

/// On one line the record ends at the newline, so the newline -- and nothing
/// else -- is escaped: the rest of the message stays as written.
#[test]
fn only_the_newline_is_escaped_in_the_single_line_form() {
    let value = message("line one\nline two");
    let line = encode_line(&value);

    assert_eq!(line, r#"(o: (message (escaped "line one%0Aline two")))"#);
    assert!(!line.contains('\n'), "{line}");
    assert!(!line.contains("base64"), "{line}");
    assert_eq!(decode_line(&line).unwrap(), value);
}

/// A tab is text a reader can see, so both forms keep it as it is.
#[test]
fn a_tab_is_written_as_a_tab_in_both_forms() {
    let value = message("a\tb");

    assert_eq!(encode(&value), "(\n  message \"a\tb\"\n)");
    assert_eq!(encode_line(&value), "(o: (message \"a\tb\"))");
    assert_eq!(decode(&encode(&value)).unwrap(), value);
    assert_eq!(decode_line(&encode_line(&value)).unwrap(), value);
}

/// A carriage return is the one whitespace character a text file rewrites on its
/// own -- CRLF normalisation would change the value -- so it is escaped.
#[test]
fn a_carriage_return_is_escaped_so_crlf_normalisation_cannot_rewrite_it() {
    let value = message("first\r\nsecond");
    let encoded = encode(&value);

    assert_eq!(encoded, "(\n  message (escaped \"first%0D\nsecond\")\n)");
    assert_eq!(decode(&encoded).unwrap(), value);
}

/// The doubled-quote form desynchronises the notation's own parser, so a value
/// holding both quote kinds is written with a run of delimiters instead.
#[test]
fn a_value_holding_both_quote_kinds_uses_the_n_quote_form() {
    let value = message("both \"kinds\" of 'quotes'");
    let encoded = encode(&value);

    assert!(
        encoded.contains("\"\"\"both \"kinds\" of 'quotes'\"\"\""),
        "{encoded}"
    );
    assert!(!encoded.contains("\"\"kinds\"\""), "{encoded}");
    assert_eq!(decode(&encoded).unwrap(), value);
}

/// A value that occurs twice is written twice: a shared reference would make a
/// log line depend on another line, which a line-based reader cannot resolve.
#[test]
fn a_repeated_value_is_written_out_every_time() {
    let repeated = LinoValue::String("same".to_string());
    let value = LinoValue::object([
        ("first", repeated.clone()),
        ("second", repeated.clone()),
        ("third", repeated),
    ]);

    let encoded = encode(&value);
    assert_eq!(encoded.matches("\"same\"").count(), 3, "{encoded}");
    assert_eq!(decode(&encoded).unwrap(), value);

    let line = encode_line(&value);
    assert_eq!(line.matches("\"same\"").count(), 3, "{line}");
    assert_eq!(decode_line(&line).unwrap(), value);
}

/// A key is escaped like any other text, and stays a key rather than turning the
/// object it belongs to into an array.
#[test]
fn a_key_holding_a_control_character_stays_a_key() {
    let value = LinoValue::object([("a\u{0}b", LinoValue::Int(1))]);

    assert_eq!(decode(&encode(&value)).unwrap(), value);
    assert_eq!(decode_line(&encode_line(&value)).unwrap(), value);
}

/// Documents written by earlier versions keep decoding.
#[test]
fn the_previous_base64_marker_still_decodes() {
    assert_eq!(
        decode("(\n  message (base64 \"bGluZTEKbGluZTI=\")\n)").unwrap(),
        message("line1\nline2")
    );
}

/// Every value the readable forms write must read back unchanged, whatever
/// quotes, newlines and control characters it holds.
#[test]
fn every_kind_of_text_roundtrips_through_both_forms() {
    let texts = [
        "",
        "plain",
        "with spaces",
        "it's",
        "he said \"hello\"",
        "both \"kinds\" of 'quotes'",
        "\"leading quote",
        "trailing quote\"",
        "a\"\"b",
        "a\"\"\"b'c",
        "'\"",
        "\"'",
        "line one\nline two",
        "trailing newline\n",
        "\ttab",
        "carriage\rreturn",
        "null\u{0}byte",
        "escape\u{1b}[0m",
        "next\u{85}line",
        "unicode: 你好世界 🌍",
        "percent %0A not an escape",
        "(parens) and: colons",
        "base64",
        "escaped",
        "o:",
    ];

    for text in texts {
        for value in [
            LinoValue::String(text.to_string()),
            message(text),
            LinoValue::object([(text, LinoValue::String(text.to_string()))]),
            LinoValue::array([LinoValue::String(text.to_string())]),
        ] {
            let encoded = encode(&value);
            assert_eq!(
                decode(&encoded).unwrap(),
                value,
                "indented roundtrip failed for {text:?}: {encoded:?}"
            );

            let line = encode_line(&value);
            assert!(!line.contains('\n'), "{text:?} broke the line: {line:?}");
            assert_eq!(
                decode_line(&line).unwrap(),
                value,
                "single-line roundtrip failed for {text:?}: {line:?}"
            );
        }
    }
}
