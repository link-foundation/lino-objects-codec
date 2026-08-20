//! Experiment for issue #37: does `( )` open a nested indentation context?
//!
//! Run with links-notation 0.13 and 0.14 to compare:
//!   cargo run                                  # 0.14 (as pinned in Cargo.toml)
//!   cargo add links-notation@0.13.0 && cargo run
//!
//! 0.13 ignores indentation inside `( )` and flattens every line into one list,
//! so record boundaries and nested objects cannot be recovered. 0.14 keeps them.

use links_notation::parse_lino_to_links;

const DOCUMENT: &str = "(\n  server (\n    host \"127.0.0.1\"\n    port 18878\n  )\n)";

fn main() {
    println!("input:\n{DOCUMENT}\n");
    match parse_lino_to_links(DOCUMENT) {
        Ok(links) => {
            for link in &links {
                println!("parsed: {link:?}");
            }
        }
        Err(e) => println!("parse error: {e:?}"),
    }
}
