//! Finite large-document and Unicode regressions for issue #68.
use lino_objects_codec::{LinoValue, decode, decode_line, encode, encode_line};

#[test]
fn large_history_keeps_every_record_and_quote_run() {
    let record = LinoValue::object([
        ("🍫日本語", LinoValue::String("evidence ".repeat(8192))),
        ("quote", LinoValue::String("both \"and' ending\"".into())),
        ("escape", LinoValue::String("\r%🍫".into())),
    ]);
    let history = LinoValue::Array(vec![record; 64]);
    assert_eq!(decode(&encode(&history)).unwrap(), history);
    assert_eq!(decode_line(&encode_line(&history)).unwrap(), history);
    assert_eq!(
        decode(&format!("{}42", " ".repeat(4 * 1024 * 1024))).unwrap(),
        LinoValue::Int(42)
    );
    for quote in ['"', '\'', '`'] {
        assert_eq!(
            decode(&format!(
                "{quote}legacy {quote}{quote}🍫{quote}{quote} end{quote}"
            ))
            .unwrap(),
            LinoValue::String(format!("legacy {quote}🍫{quote} end"))
        );
        assert_eq!(
            decode(&format!(
                "{quote}{quote}{quote}🍫{quote}{quote}{quote}{quote}"
            ))
            .unwrap(),
            LinoValue::String(format!("🍫{quote}"))
        );
        assert!(decode(&format!("{quote}{quote}{quote}🍫{quote}{quote}")).is_err());
    }
}

#[test]
fn escaped_unicode_and_invalid_utf8_remain_exact() {
    for offset in [65533, 65534, 65535, 65536] {
        let prefix = "a".repeat(offset);
        for unicode in ["🍫", "%F0%9F%8D%AB"] {
            assert_eq!(
                decode(&format!("(escaped \"{prefix}{unicode}%0D\")")).unwrap(),
                LinoValue::String(format!("{prefix}🍫\r"))
            );
        }
    }
    for payload in ["%F0%9F", "%FF", "%C0%AF", "%ED%A0%80", "%80", "%0", "%GG"] {
        assert!(decode(&format!("(escaped \"{payload}\")")).is_err());
        assert_eq!(
            decode("(escaped \"%F0%9F%8D%AB\")").unwrap(),
            LinoValue::String("🍫".into())
        );
    }
    assert_eq!(
        decode("(escaped \"%EF%BB%BFtext%EF%BB%BF\")").unwrap(),
        LinoValue::String("\u{FEFF}text\u{FEFF}".into())
    );
}
