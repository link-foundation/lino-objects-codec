use lino_objects_codec::{LinoValue, decode_line, encode_line};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let json: serde_json::Value = serde_json::from_str(
        r#"{"z":1.2300e+45,"a":18446744073709551616,"empty":[],"message":"first\nsecond"}"#,
    )?;
    let line = encode_line(&LinoValue::from(json.clone()));
    println!("{line}");
    let restored = serde_json::Value::try_from(decode_line(&line)?)?;
    assert_eq!(restored.to_string(), json.to_string());
    Ok(())
}
