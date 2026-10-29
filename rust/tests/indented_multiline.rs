use lino_objects_codec::format::{format_indented, format_indented_ordered, parse_indented};
use std::collections::HashMap;

#[test]
fn shared_indented_strings_roundtrip() {
    let cases: serde_json::Value =
        serde_json::from_str(include_str!("../../fixtures/indented-format/strings.json")).unwrap();
    for case in cases.as_array().unwrap() {
        let name = case["name"].as_str().unwrap();
        let value = case["value"].as_str().unwrap();
        let original = HashMap::from([
            ("t".to_string(), value.to_string()),
            ("after".to_string(), "unchanged".to_string()),
        ]);
        let ordered =
            format_indented_ordered("doc", &[("t", value), ("after", "unchanged")], "  ").unwrap();
        for text in [ordered, format_indented("doc", &original, "  ").unwrap()] {
            assert_eq!(
                parse_indented(&text).unwrap(),
                ("doc".into(), original.clone()),
                "{name}"
            );
            let body = text.split_once('\n').unwrap().1;
            let standard = format!("\n\ndoc:\n{body}\n\n");
            assert_eq!(
                parse_indented(&standard).unwrap(),
                ("doc".into(), original.clone()),
                "{name}"
            );
        }
    }
}
