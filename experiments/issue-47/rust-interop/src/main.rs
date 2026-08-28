//! Rust side of the cross-implementation round trip (issue #47).

use lino_objects_codec::{LinoValue, decode_line, encode_line};
use std::{env, fs, path::Path};

/// The record every implementation writes.
fn record() -> LinoValue {
    LinoValue::object([
        ("phase", LinoValue::String("stream_end".to_string())),
        ("bytes", LinoValue::Int(2827)),
        ("complete", LinoValue::Bool(true)),
        (
            "server",
            LinoValue::object([
                ("host", LinoValue::String("127.0.0.1".to_string())),
                ("port", LinoValue::Int(18878)),
            ]),
        ),
        (
            "models",
            LinoValue::Array(vec![
                LinoValue::String("claude-haiku".to_string()),
                LinoValue::String("claude-opus".to_string()),
            ]),
        ),
    ])
}

fn main() {
    let args: Vec<String> = env::args().collect();
    let (mode, target) = (args[1].as_str(), Path::new(&args[2]));

    match mode {
        "write" => fs::write(target, format!("{}\n", encode_line(&record()))).expect("write"),
        "read" => {
            let mut names: Vec<_> = fs::read_dir(target)
                .expect("read_dir")
                .map(|entry| entry.expect("entry").path())
                .filter(|path| path.extension().is_some_and(|ext| ext == "lino"))
                .collect();
            names.sort();
            for path in names {
                let notation = fs::read_to_string(&path).expect("read");
                let value = decode_line(notation.trim()).expect("decode_line");
                println!(
                    "rust reading {}: {}",
                    path.file_name().expect("name").to_string_lossy(),
                    encode_line(&value)
                );
            }
        }
        _ => panic!("usage: issue-47-interop write <path> | read <dir>"),
    }
}
