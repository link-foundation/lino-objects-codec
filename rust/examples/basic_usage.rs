//! Basic usage example for the lino-objects-codec library.

use lino_objects_codec::{decode, encode, encode_compact, LinoValue};

fn main() {
    println!("=== Links Notation Objects Codec - Rust Example ===\n");

    // Example 1: Basic types
    println!("1. Basic Types:");

    // Null
    let null_val = LinoValue::Null;
    let encoded = encode(&null_val);
    println!(
        "   Null: {} -> decoded: {:?}",
        encoded,
        decode(&encoded).unwrap()
    );

    // Booleans
    let true_val = LinoValue::Bool(true);
    let encoded = encode(&true_val);
    println!(
        "   true: {} -> decoded: {:?}",
        encoded,
        decode(&encoded).unwrap()
    );

    // Integers
    let int_val = LinoValue::Int(42);
    let encoded = encode(&int_val);
    println!(
        "   42: {} -> decoded: {:?}",
        encoded,
        decode(&encoded).unwrap()
    );

    // Floats
    let float_val = LinoValue::Float(3.14159);
    let encoded = encode(&float_val);
    println!(
        "   3.14159: {} -> decoded: {:?}",
        encoded,
        decode(&encoded).unwrap()
    );

    // Special floats
    let inf_val = LinoValue::Float(f64::INFINITY);
    let encoded = encode(&inf_val);
    println!(
        "   Infinity: {} -> decoded: {:?}",
        encoded,
        decode(&encoded).unwrap()
    );

    let nan_val = LinoValue::Float(f64::NAN);
    let encoded = encode(&nan_val);
    let decoded = decode(&encoded).unwrap();
    println!(
        "   NaN: {} -> decoded is_nan: {}",
        encoded,
        decoded.as_float().unwrap().is_nan()
    );

    // Strings
    let str_val = LinoValue::String("Hello, World!".to_string());
    let encoded = encode(&str_val);
    println!(
        "   'Hello, World!': {} -> decoded: {:?}",
        encoded,
        decode(&encoded).unwrap()
    );

    // Unicode strings
    let unicode_val = LinoValue::String("你好世界 🌍".to_string());
    let encoded = encode(&unicode_val);
    println!(
        "   Unicode: {} -> decoded: {:?}",
        encoded,
        decode(&encoded).unwrap()
    );

    println!();

    // Example 2: Collections
    println!("2. Collections:");

    // Array
    let array_val = LinoValue::array([LinoValue::Int(1), LinoValue::Int(2), LinoValue::Int(3)]);
    let encoded = encode(&array_val);
    let decoded = decode(&encoded).unwrap();
    println!("   Array [1, 2, 3]:\n{}", encoded);
    println!("   Decoded: {:?}", decoded);

    // Object
    let obj_val = LinoValue::object([
        ("name", LinoValue::String("Alice".to_string())),
        ("age", LinoValue::Int(30)),
        ("active", LinoValue::Bool(true)),
    ]);
    let encoded = encode(&obj_val);
    let decoded = decode(&encoded).unwrap();
    println!("   Object {{name, age, active}}:\n{}", encoded);
    println!("   Decoded: {:?}", decoded);

    println!();

    // Example 3: Nested structures
    println!("3. Nested Structure:");

    let complex = LinoValue::object([
        ("id", LinoValue::Int(123)),
        ("name", LinoValue::String("Test Object".to_string())),
        (
            "tags",
            LinoValue::array([
                LinoValue::String("tag1".to_string()),
                LinoValue::String("tag2".to_string()),
            ]),
        ),
        (
            "metadata",
            LinoValue::object([
                ("version", LinoValue::Int(1)),
                ("created", LinoValue::String("2025-01-01".to_string())),
            ]),
        ),
    ]);

    let encoded = encode(&complex);
    let decoded = decode(&encoded).unwrap();

    println!("   Encoded:\n{}", encoded);
    println!("   Decoded name: {:?}", decoded.get("name"));
    println!("   Decoded tags: {:?}", decoded.get("tags"));
    println!(
        "   Decoded metadata.version: {:?}",
        decoded.get("metadata").and_then(|m| m.get("version"))
    );

    println!();

    // Example 4: Mixed type array
    println!("4. Mixed Type Array:");

    let mixed = LinoValue::array([
        LinoValue::Int(1),
        LinoValue::String("hello".to_string()),
        LinoValue::Bool(true),
        LinoValue::Null,
        LinoValue::Float(2.5),
    ]);

    let encoded = encode(&mixed);
    let decoded = decode(&encoded).unwrap();

    println!("   Encoded:\n{}", encoded);
    println!("   Decoded: {:?}", decoded);

    println!();

    // Example 5: Roundtrip verification
    println!("5. Roundtrip Verification:");

    let data = LinoValue::object([
        (
            "users",
            LinoValue::array([
                LinoValue::object([
                    ("id", LinoValue::Int(1)),
                    ("name", LinoValue::String("Alice".to_string())),
                ]),
                LinoValue::object([
                    ("id", LinoValue::Int(2)),
                    ("name", LinoValue::String("Bob".to_string())),
                ]),
            ]),
        ),
        ("count", LinoValue::Int(2)),
    ]);

    let encoded = encode(&data);
    let decoded = decode(&encoded).unwrap();

    println!("   Original == Decoded: {}", data == decoded);

    println!();

    // Example 6: The compact (base64) form is still available under its own name
    println!("6. Compact Form:");

    let compact = encode_compact(&data);
    println!("   Compact: {}", compact);
    println!(
        "   Compact decodes back to the same value: {}",
        decode(&compact).unwrap() == data
    );

    println!("\n=== Example completed successfully! ===");
}
