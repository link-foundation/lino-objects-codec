//! A consumer can use the parser directly without resolving a second version.
use lino_objects_codec::format::format_value_single_line;

fn main() {
    let text = "a \"quoted\" value\nnext line";
    let formatted = format_value_single_line(text);
    assert!(!formatted.contains('\n'));
    let links = links_notation::parse_lino_to_links(&formatted).unwrap();
    assert!(!links.is_empty());
    assert_eq!(lino_objects_codec::decode(&formatted).unwrap().as_str(), Some(text));
    println!("Consumer uses links-notation 0.23.0 and the public value formatter.");
}
