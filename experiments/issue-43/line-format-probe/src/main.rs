use links_notation::parse_lino;

fn main() {
    let candidates = [
        // What the downstream project invented (expected: rejected).
        "((:\"bytes\" 2827) (:\"complete\" true))",
        // Bare groups: arrays.
        "()",
        "(1 2)",
        "(\"key\" \"value\")",
        "((1 2) (3))",
        // Object marker written as a link id, which the notation already has.
        "(o:)",
        "(o: (a 1))",
        "(o: (a 1) (b 2))",
        "(o: (\"two words\" 1) (\"\" 2) (\"base64\" 3))",
        "(o: (a (o: (b (o: (c (1)))))))",
        "((o: (id \"1\")) (o: (id \"2\")))",
        "(o: (multiline (base64 \"bGluZTEKbGluZTI=\")))",
        "(o: (s 'he said \"hello\"') (t \"both \"\"kinds\"\" of 'quotes'\"))",
        // Spellings we do not emit, recorded for completeness.
        "(o : (a 1))",
        "(a: 1 2)",
        "(a:)",
    ];

    for candidate in candidates {
        match parse_lino(candidate) {
            Ok(parsed) => println!("OK   {candidate}\n     {parsed:?}"),
            Err(error) => println!("ERR  {candidate}\n     {error}"),
        }
    }
}
