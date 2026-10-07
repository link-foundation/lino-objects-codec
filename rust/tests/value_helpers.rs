use lino_objects_codec::format::{format_value_single_line, format_value_verbatim};
use lino_objects_codec::{LinoValue, decode, decode_line};

#[test]
fn public_helpers_preserve_text_in_both_modes() {
    for text in [
        "",
        "both \"quotes\" and 'quotes'",
        "line\n\nnext\r\n",
        "\\n %0A\t\0",
        "世界🌍",
        "\"'\"\"\"'",
    ] {
        let value = LinoValue::String(text.into());
        let line = format_value_single_line(text);
        assert!(!line.contains(['\r', '\n']));
        assert_eq!(decode_line(&line).unwrap(), value);
        assert_eq!(decode(&format_value_verbatim(text)).unwrap(), value);
        assert!(links_notation::parse_lino(&line).is_ok());
    }
}

#[test]
fn a_single_null_array_is_distinct_from_a_compact_null() {
    let value = LinoValue::array([LinoValue::Null]);
    assert_eq!(
        decode(&lino_objects_codec::encode_line(&value)).unwrap(),
        value
    );
    assert_eq!(decode("(null)").unwrap(), LinoValue::Null);
}
