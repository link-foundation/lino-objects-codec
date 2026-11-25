//! The indented format must read back unchanged with the plain links-notation
//! Parser (issue #94).

use links_notation::{LiNo, parse_lino_to_links};
use lino_objects_codec::format::{escape_reference, format_indented_ordered, parse_indented};

fn cases(name: &str) -> Vec<(String, String)> {
    let path = format!(
        "{}/../fixtures/indented-format/{name}",
        env!("CARGO_MANIFEST_DIR")
    );
    let text = std::fs::read_to_string(path).unwrap();
    let cases: serde_json::Value = serde_json::from_str(&text).unwrap();
    cases
        .as_array()
        .unwrap()
        .iter()
        .map(|case| {
            (
                case["name"].as_str().unwrap().to_string(),
                case["value"].as_str().unwrap().to_string(),
            )
        })
        .collect()
}

fn reference(link: &LiNo<String>) -> String {
    match link {
        LiNo::Ref(id) => id.clone(),
        LiNo::Link { id, values } => {
            assert!(values.is_empty(), "expected a reference, got {link:?}");
            id.clone().unwrap_or_default()
        }
    }
}

/// Read `key value` pairs the way any links-notation reader sees them.
fn plain_pairs(text: &str) -> Vec<(String, String)> {
    let (header, body) = text.split_once('\n').unwrap();
    let links = parse_lino_to_links(&format!("{header}:\n{body}")).unwrap();
    assert_eq!(links.len(), 1);
    let LiNo::Link { values, .. } = &links[0] else {
        panic!("expected a link");
    };
    values
        .iter()
        .map(|child| match child {
            LiNo::Link { values, .. } if values.len() == 2 => {
                (reference(&values[0]), reference(&values[1]))
            }
            other => panic!("expected a pair, got {other:?}"),
        })
        .collect()
}

#[test]
fn parser_reads_format_indented_output() {
    let mut all = cases("parser-safe.json");
    all.extend(cases("strings.json"));
    for (name, value) in all {
        let pairs = [
            ("k", value.as_str()),
            (value.as_str(), value.as_str()),
            ("z", value.as_str()),
        ];
        let text = format_indented_ordered("root", &pairs, "  ").unwrap();
        let expected: Vec<(String, String)> = pairs
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect();
        assert_eq!(plain_pairs(&text), expected, "{name}: {text}");
        let (id, obj) = parse_indented(&text).unwrap();
        assert_eq!(id, "root", "{name}");
        assert_eq!(obj, expected.into_iter().collect(), "{name}: {text}");
    }
}

#[test]
fn issue_94_empty_values_do_not_swallow_following_lines() {
    let pairs = [("a", ""), ("b", ""), ("#k", "#v"), ("c", "end")];
    let text = format_indented_ordered("doc", &pairs, "  ").unwrap();
    assert_eq!(text, "doc\n  a ~1{}\n  b ~1{}\n  '#k' \"#v\"\n  c \"end\"");
    let (_, obj) = parse_indented(&text).unwrap();
    assert_eq!(obj.len(), 4);
    assert_eq!(obj["a"], "");
    assert_eq!(obj["b"], "");
    assert_eq!(obj["#k"], "#v");
}

#[test]
fn parse_indented_still_reads_legacy_empty_quotes() {
    let (_, obj) = parse_indented("doc\n  a \"\"").unwrap();
    assert_eq!(obj["a"], "");
}

#[test]
fn escape_reference_is_parser_safe() {
    assert_eq!(escape_reference(""), "~1{}");
    assert_eq!(escape_reference("#x"), "'#x'");
    assert_eq!(escape_reference("issue#1"), "issue#1");
    assert_eq!(escape_reference("~1{61}"), "'~1{61}'");
    assert_eq!(escape_reference("'\""), "`'\"`");
    assert_eq!(escape_reference("'\"`"), "\"'\"\"`\"");
    assert_eq!(escape_reference("'`\""), "~1{276022}");
    for (name, value) in cases("parser-safe.json") {
        let escaped = escape_reference(&value);
        let links = parse_lino_to_links(&format!("(k {escaped})")).unwrap();
        let LiNo::Link { values, .. } = &links[0] else {
            panic!("{name}: expected a link");
        };
        assert_eq!(values.len(), 2, "{name}: {escaped}");
        assert_eq!(reference(&values[1]), value, "{name}: {escaped}");
    }
}
