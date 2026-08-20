use links_notation::parse_lino_to_links;

fn show(name: &str, text: &str) {
    println!("=== {} ===\n{}\n---", name, text);
    match parse_lino_to_links(text) {
        Ok(links) => {
            for l in &links {
                println!("{:?}", l);
            }
        }
        Err(e) => println!("ERR: {:?}", e),
    }
    println!();
}

fn main() {
    show("doc", "(\n  type \"RouterState\"\n  server (\n    host \"127.0.0.1\"\n    port 18878\n  )\n  models (\n    \"claude-haiku\"\n    \"claude-opus\"\n  )\n)");
    show("array of objects", "(\n  value (\n    (\n      id \"1\"\n      label \"one\"\n    )\n    (\n      id \"2\"\n      label \"two\"\n    )\n  )\n)");
    show("empty link", "(\n  a ()\n  b ()\n)");
    show("scalar root", "42");
    show("string root", "(\n  \"hello\"\n)");
    show("quotes", "(\n  a \"say \"\"hi\"\"\"\n  b 'it''s'\n)");
    show("newline in quotes", "(\n  a \"line1\nline2\"\n)");
    show("single pair obj", "(\n  a 1\n)");
}
