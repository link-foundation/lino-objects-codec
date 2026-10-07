#![cfg(feature = "serde_json")]

use lino_objects_codec::json::{JsonOptions, from_json_with_options, json_to_lino, lino_to_json};
use lino_objects_codec::{LinoValue, decode, encode, encode_compact, encode_line};
use proptest::prelude::*;
use serde_json::Value;

fn assert_roundtrip(json: &Value) {
    let expected = serde_json::to_string(&json).unwrap();
    let value = LinoValue::from(json);
    assert_eq!(
        serde_json::to_string(&Value::try_from(&value).unwrap()).unwrap(),
        expected
    );
    for text in [encode(&value), encode_line(&value), encode_compact(&value)] {
        let result = Value::try_from(decode(&text).unwrap()).unwrap();
        assert_eq!(serde_json::to_string(&result).unwrap(), expected, "{text}");
    }
    assert_eq!(
        serde_json::to_string(&lino_to_json(&json_to_lino(json)).unwrap()).unwrap(),
        expected
    );
}

#[test]
fn key_order_number_text_and_empty_values_survive() {
    let value: Value = serde_json::from_str(r#"{"z":1.2300e+45,"a":18446744073709551616,"negative":-0.0,"null":null,"array":[],"object":{},"text":"","false":false}"#).unwrap();
    assert_roundtrip(&value);
    for number in [
        "-0",
        "1.0000",
        "1e400",
        "-999999999999999999999999999999999999",
        "0.0000000000000000000000000000001",
    ] {
        assert_roundtrip(&serde_json::from_str(number).unwrap());
    }
}

#[test]
fn stripping_is_explicit_and_recursive() {
    let value: Value = serde_json::from_str(
        r#"{"null":null,"array":[null,{},[],false,0,""],"nested":{"empty":{}},"object":{}}"#,
    )
    .unwrap();
    assert_roundtrip(&value);
    let stripped = from_json_with_options(value, JsonOptions { strip_empty: true });
    assert_eq!(
        Value::try_from(stripped).unwrap().to_string(),
        r#"{"array":[false,0,""]}"#
    );
    assert_eq!(
        from_json_with_options(serde_json::json!([]), JsonOptions { strip_empty: true }),
        LinoValue::Null
    );
}

#[test]
fn conversion_rejects_non_json_floats_and_duplicate_keys() {
    for number in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY] {
        assert!(Value::try_from(LinoValue::Float(number)).is_err());
    }
    assert!(Value::try_from(LinoValue::object([("a", 1), ("a", 2)])).is_err());
    assert_eq!(
        Value::try_from(LinoValue::Int(42)).unwrap(),
        serde_json::json!(42)
    );
}

fn arbitrary_json() -> impl Strategy<Value = Value> {
    let scalar = prop_oneof![
        Just(Value::Null),
        any::<bool>().prop_map(Value::Bool),
        any::<i64>().prop_map(|v| serde_json::from_str::<Value>(&v.to_string()).unwrap()),
        (any::<i64>(), 0u16..500)
            .prop_map(|(n, e)| serde_json::from_str::<Value>(&format!("{n}.000e+{e}")).unwrap()),
        prop::collection::vec(any::<char>(), 0..48)
            .prop_map(|v| Value::String(v.into_iter().collect())),
    ];
    scalar.prop_recursive(4, 64, 8, |inner| {
        prop_oneof![
            prop::collection::vec(inner.clone(), 0..8).prop_map(Value::Array),
            prop::collection::vec((".{0,12}", inner), 0..8)
                .prop_map(|pairs| Value::Object(pairs.into_iter().collect())),
        ]
    })
}

proptest! {
    #![proptest_config(ProptestConfig { cases: 512, .. ProptestConfig::default() })]
    #[test]
    fn arbitrary_json_roundtrips(json in arbitrary_json()) { assert_roundtrip(&json); }
}
