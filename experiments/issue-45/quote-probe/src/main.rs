//! Determine the delimiter rule links-notation 0.14.0 actually implements for
//! quoted values, so the readable encoder can pick a delimiter that always
//! reads back unchanged.

use links_notation::{parse_lino, LiNo};

/// Extract the second value of the first inner link: `(a <value>) …`.
fn first_value(text: &str) -> Option<String> {
    let parsed = parse_lino(text).ok()?;
    fn walk(node: &LiNo<String>, out: &mut Vec<String>) {
        match node {
            LiNo::Ref(r) => out.push(r.clone()),
            LiNo::Link { values, .. } => {
                for v in values {
                    walk(v, out);
                }
            }
        }
    }
    let mut refs = Vec::new();
    walk(&parsed, &mut refs);
    // refs = ["a", value, …]
    refs.get(1).cloned()
}

fn quoted(value: &str, delim: char, count: usize) -> String {
    let d: String = std::iter::repeat(delim).take(count).collect();
    format!("{d}{value}{d}")
}

fn main() {
    let contents = [
        "plain",
        "say \"hi\"",
        "\"leading",
        "trailing\"",
        "\"both\"",
        "a\"\"b",
        "a\"\"\"b",
        "\"\"",
        "",
        "line1\nline2",
        "a\tb",
        "it's",
        "mixed \" and '",
    ];

    for content in contents {
        for count in 1..=5usize {
            let body = quoted(content, '"', count);
            for (label, doc) in [
                ("alone", format!("(a {body})")),
                ("sibling", format!("(a {body}) (b 1)")),
            ] {
                let got = first_value(&doc);
                let ok = got.as_deref() == Some(content);
                println!(
                    "{:>3} {:<8} content={:<16} doc={:<32} -> {:<20} {}",
                    count,
                    label,
                    format!("{content:?}"),
                    format!("{doc:?}"),
                    format!("{got:?}"),
                    if ok { "ok" } else { "MISMATCH" }
                );
            }
        }
        println!();
    }
}
