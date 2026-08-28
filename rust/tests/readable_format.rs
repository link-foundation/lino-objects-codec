//! Tests for the readable, indented format produced by `encode()` (issue #37).

use links_notation::{LiNo, parse_lino_to_links};
use lino_objects_codec::{LinoValue, decode, encode, encode_compact, encode_obfuscated};

/// The document from the issue, as a `LinoValue`.
fn router_state() -> LinoValue {
    LinoValue::object([
        ("type", LinoValue::String("RouterState".to_string())),
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
        (
            "value",
            LinoValue::array([
                LinoValue::object([
                    ("id", LinoValue::String("7cf7abf6".to_string())),
                    ("label", LinoValue::String("bootstrap-admin".to_string())),
                    ("ttl_hours", LinoValue::Int(24)),
                    ("revoked", LinoValue::Bool(false)),
                ]),
                LinoValue::object([
                    ("id", LinoValue::String("94b36f7e".to_string())),
                    ("label", LinoValue::String("wrapper-run".to_string())),
                    ("ttl_hours", LinoValue::Int(720)),
                    ("revoked", LinoValue::Bool(false)),
                ]),
            ]),
        ),
    ])
}

#[test]
fn encode_writes_keys_and_values_verbatim() {
    let encoded = encode(&router_state());

    for expected in [
        "type \"RouterState\"",
        "host \"127.0.0.1\"",
        "port 18878",
        "\"claude-haiku\"",
        "label \"bootstrap-admin\"",
        "revoked false",
    ] {
        assert!(
            encoded.contains(expected),
            "missing {expected} in:\n{encoded}"
        );
    }

    // Nothing is base64-encoded any more.
    assert!(!encoded.contains("Um91dGVyU3RhdGU="), "{encoded}");
}

#[test]
fn encode_spans_multiple_indented_lines() {
    let encoded = encode(&router_state());
    let lines: Vec<&str> = encoded.lines().collect();

    assert!(
        lines.len() > 10,
        "expected an indented document:\n{encoded}"
    );
    assert_eq!(lines[0], "(");
    assert_eq!(lines[1], "  type \"RouterState\"");
    assert_eq!(*lines.last().unwrap(), ")");
    // Nested values are indented deeper than their key.
    assert!(encoded.contains("\n    host \"127.0.0.1\""), "{encoded}");
}

#[test]
fn encode_matches_the_documented_shape() {
    let value = LinoValue::object([
        ("type", LinoValue::String("RouterState".to_string())),
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
    ]);

    let expected = "(\n  \
        type \"RouterState\"\n  \
        server (\n    \
            host \"127.0.0.1\"\n    \
            port 18878\n  \
        )\n  \
        models (\n    \
            \"claude-haiku\"\n    \
            \"claude-opus\"\n  \
        )\n\
        )";

    assert_eq!(encode(&value), expected);
}

#[test]
fn readable_output_is_valid_links_notation() {
    let encoded = encode(&router_state());
    let links = parse_lino_to_links(&encoded)
        .unwrap_or_else(|e| panic!("links-notation rejected the output: {e:?}\n{encoded}"));
    assert_eq!(
        links.len(),
        1,
        "expected a single document link:\n{encoded}"
    );

    // Parentheses open a nested indentation context (links-notation >= 0.14):
    // `server` holds one link of two pairs, not four loose references.
    let LiNo::Link { values, .. } = &links[0] else {
        panic!("expected a link:\n{encoded}");
    };
    let server = values
        .iter()
        .find_map(|v| match v {
            LiNo::Link { values: pair, .. }
                if matches!(pair.first(), Some(LiNo::Ref(k)) if k == "server") =>
            {
                pair.get(1)
            }
            _ => None,
        })
        .expect("server pair");

    let LiNo::Link { values: fields, .. } = server else {
        panic!("server should be a link:\n{encoded}");
    };
    assert_eq!(fields.len(), 2, "server fields were flattened: {fields:?}");
    assert!(fields.iter().all(LiNo::is_link), "{fields:?}");
}

#[test]
fn nested_structures_roundtrip() {
    let value = router_state();
    assert_eq!(decode(&encode(&value)).unwrap(), value);
}

#[test]
fn object_used_as_array_element_keeps_its_boundary() {
    let value = LinoValue::array([
        LinoValue::object([
            ("id", LinoValue::String("1".to_string())),
            ("label", LinoValue::String("one".to_string())),
        ]),
        LinoValue::object([
            ("id", LinoValue::String("2".to_string())),
            ("label", LinoValue::String("two".to_string())),
        ]),
    ]);

    let decoded = decode(&encode(&value)).unwrap();
    assert_eq!(decoded, value);

    let items = decoded.as_array().expect("array");
    assert_eq!(items.len(), 2, "record boundaries were lost: {items:?}");
    assert_eq!(items[0].get("label").unwrap().as_str(), Some("one"));
}

#[test]
fn numbers_and_booleans_keep_their_types() {
    let value = LinoValue::object([
        ("int", LinoValue::Int(-7)),
        ("float", LinoValue::Float(3.5)),
        ("whole_float", LinoValue::Float(2.0)),
        ("yes", LinoValue::Bool(true)),
        ("no", LinoValue::Bool(false)),
        ("nothing", LinoValue::Null),
        ("numeric_string", LinoValue::String("18878".to_string())),
        ("boolean_string", LinoValue::String("true".to_string())),
    ]);

    let decoded = decode(&encode(&value)).unwrap();

    assert!(matches!(decoded.get("int"), Some(LinoValue::Int(-7))));
    assert!(matches!(decoded.get("float"), Some(LinoValue::Float(_))));
    assert!(matches!(
        decoded.get("whole_float"),
        Some(LinoValue::Float(_))
    ));
    assert!(matches!(decoded.get("yes"), Some(LinoValue::Bool(true))));
    assert!(matches!(decoded.get("no"), Some(LinoValue::Bool(false))));
    assert!(matches!(decoded.get("nothing"), Some(LinoValue::Null)));
    assert_eq!(
        decoded.get("numeric_string").and_then(LinoValue::as_str),
        Some("18878")
    );
    assert_eq!(
        decoded.get("boolean_string").and_then(LinoValue::as_str),
        Some("true")
    );
}

#[test]
fn special_floats_roundtrip() {
    let value = LinoValue::object([
        ("nan", LinoValue::Float(f64::NAN)),
        ("inf", LinoValue::Float(f64::INFINITY)),
        ("neg_inf", LinoValue::Float(f64::NEG_INFINITY)),
    ]);

    let decoded = decode(&encode(&value)).unwrap();
    assert!(decoded.get("nan").unwrap().as_float().unwrap().is_nan());
    assert_eq!(decoded.get("inf").unwrap().as_float(), Some(f64::INFINITY));
    assert_eq!(
        decoded.get("neg_inf").unwrap().as_float(),
        Some(f64::NEG_INFINITY)
    );
}

#[test]
fn quotes_and_unicode_roundtrip_as_text() {
    let values = [
        "plain",
        "",
        "with spaces",
        "it's",
        "he said \"hello\"",
        "both \"kinds\" of 'quotes'",
        "unicode: 你好世界 🌍",
        "parens (and) colons: yes",
    ];

    for text in values {
        let value = LinoValue::object([("message", LinoValue::String(text.to_string()))]);
        let encoded = encode(&value);
        assert!(!encoded.contains("base64"), "{text} was encoded: {encoded}");
        assert_eq!(
            decode(&encoded).unwrap(),
            value,
            "roundtrip failed for {text:?}: {encoded}"
        );
    }
}

#[test]
fn values_that_cannot_be_written_as_text_are_marked_individually() {
    let value = LinoValue::object([
        ("readable", LinoValue::String("still visible".to_string())),
        ("multiline", LinoValue::String("line1\nline2".to_string())),
        ("tabbed", LinoValue::String("a\tb".to_string())),
        ("returned", LinoValue::String("line1\rline2".to_string())),
    ]);

    let encoded = encode(&value);

    // An indented document holds line breaks and tabs of its own, so only the
    // carriage return -- which a line ending would rewrite -- is escaped, and
    // only that one value is marked.
    assert!(encoded.contains("readable \"still visible\""), "{encoded}");
    assert!(encoded.contains("multiline \"line1\nline2\""), "{encoded}");
    assert!(encoded.contains("tabbed \"a\tb\""), "{encoded}");
    assert!(
        encoded.contains("returned (escaped \"line1%0Dline2\")"),
        "{encoded}"
    );
    assert!(!encoded.contains("base64"), "{encoded}");
    assert_eq!(decode(&encoded).unwrap(), value);
}

#[test]
fn base64_key_is_not_mistaken_for_a_marker() {
    let value = LinoValue::object([("base64", LinoValue::String("plain text".to_string()))]);
    assert_eq!(decode(&encode(&value)).unwrap(), value);
}

#[test]
fn empty_containers_keep_their_type() {
    let value = LinoValue::object([
        ("empty_array", LinoValue::Array(vec![])),
        ("empty_object", LinoValue::Object(vec![])),
    ]);
    assert_eq!(decode(&encode(&value)).unwrap(), value);
}

#[test]
fn scalars_at_the_root_roundtrip() {
    for value in [
        LinoValue::Null,
        LinoValue::Bool(true),
        LinoValue::Int(42),
        LinoValue::Float(0.5),
        LinoValue::String("root".to_string()),
        LinoValue::String("multi\nline".to_string()),
    ] {
        assert_eq!(decode(&encode(&value)).unwrap(), value, "{value:?}");
    }
}

#[test]
fn files_written_in_the_previous_base64_form_still_decode() {
    // A real stored document, as quoted in issue #37.
    let stored = "(object ((str dHlwZQ==) (str Um91dGVyU3RhdGU=)) ((str c3VidHlwZQ==) (str VG9rZW5TdG9yZQ==)))";

    let decoded = decode(stored).unwrap();
    assert_eq!(
        decoded,
        LinoValue::object([
            ("type", LinoValue::String("RouterState".to_string())),
            ("subtype", LinoValue::String("TokenStore".to_string())),
        ])
    );
}

#[test]
fn compact_form_is_still_available_and_still_decodes() {
    let value = router_state();

    let compact = encode_compact(&value);
    assert_eq!(
        compact.lines().count(),
        1,
        "compact output must be one line"
    );
    assert!(compact.contains("Um91dGVyU3RhdGU="), "{compact}");
    assert_eq!(decode(&compact).unwrap(), value);

    // The obfuscated alias is the same encoder under an explicit name.
    assert_eq!(encode_obfuscated(&value), compact);
}

#[test]
fn compact_scalars_and_containers_still_decode() {
    for value in [
        LinoValue::Null,
        LinoValue::Bool(false),
        LinoValue::Int(-1),
        LinoValue::Float(f64::INFINITY),
        LinoValue::String("hello".to_string()),
        LinoValue::Array(vec![]),
        LinoValue::Object(vec![]),
        LinoValue::array([LinoValue::Int(1), LinoValue::String("two".to_string())]),
    ] {
        let compact = encode_compact(&value);
        assert_eq!(decode(&compact).unwrap(), value, "compact: {compact}");
    }
}

#[test]
fn hand_written_documents_are_accepted() {
    let text = "(\n  name \"Alice\"\n  age 30\n  tags (\n    \"a\"\n    \"b\"\n  )\n)";
    let decoded = decode(text).unwrap();

    assert_eq!(
        decoded.get("name").and_then(LinoValue::as_str),
        Some("Alice")
    );
    assert_eq!(decoded.get("age").and_then(LinoValue::as_int), Some(30));
    assert_eq!(
        decoded
            .get("tags")
            .and_then(LinoValue::as_array)
            .unwrap()
            .len(),
        2
    );
}
