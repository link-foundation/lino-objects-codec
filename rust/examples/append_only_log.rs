//! Writing an append-only log with one record per line (issue #43).
//!
//! `encode_line` keeps a record on one line, so appending is one write, a
//! compactor can cut the file at any newline, and `grep`, `tail -f` and `wc -l`
//! all treat one line as one event. `decode_line` reads a line back exactly.

use lino_objects_codec::{decode_line, encode_line, LinoValue};
use std::fmt::Write as _;

fn record(phase: &str, bytes: i64, complete: bool) -> LinoValue {
    LinoValue::object([
        ("phase", LinoValue::String(phase.to_string())),
        ("bytes", LinoValue::Int(bytes)),
        ("complete", LinoValue::Bool(complete)),
    ])
}

fn main() {
    println!("=== Append-only log, one record per line ===\n");

    // Appending: each record becomes exactly one line of the file.
    let mut log = String::new();
    for entry in [
        record("stream_start", 0, false),
        record("stream_chunk", 1024, false),
        record("stream_end", 2827, true),
    ] {
        writeln!(log, "{}", encode_line(&entry)).expect("writing to a string cannot fail");
    }
    print!("{log}");

    // Counting: one line is one event, so `wc -l` answers how many there were.
    println!("\nrecords: {}", log.lines().count());

    // Reading: a line reader hands over one record at a time.
    let last = log.lines().next_back().expect("the log holds records");
    let decoded = decode_line(last).expect("a line written by encode_line reads back");
    println!("last record: {decoded:?}");
    assert_eq!(decoded, record("stream_end", 2827, true));

    // Filtering: the text stays readable, so plain string tools still work.
    let finished = log
        .lines()
        .filter(|line| line.contains("(complete true)"))
        .count();
    println!("finished records: {finished}");
}
