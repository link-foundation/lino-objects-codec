# Issue #45 experiments

## `quote-probe`

Determines the delimiter rule `links-notation` 0.14.0 actually implements for a
quoted value, which is what the readable encoder has to write against. Run it
with `cargo run` inside `quote-probe`.

Its output is the evidence behind `quote()` in the four readable encoders:

- a run of **one** delimiter uses the doubled-delimiter escape, and a value that
  holds the delimiter desynchronises the parser for the rest of the document;
- a run of **two** delimiters is the empty value, whatever follows it;
- a run of **three or more** delimiters carries its content literally, ends at
  the first run of at least that length, and the *last* N delimiters of that run
  are the closing ones -- so a value ending with the delimiter still reads back
  unchanged, while a value *starting* with it would lengthen the opening run and
  has to use the other delimiter instead.

## Which parser reads the n-quote form

The four packages pin different `links-notation` releases, and the quoting rule
changed between them, so the same document is read differently:

| package | version | reads `"""say "hi""""` as | reads `"say ""hi"""` as |
| --- | --- | --- | --- |
| `links-notation` (Rust) | 0.14.0 | `say "hi"` | `say ` -- desynchronises |
| `Link.Foundation.Links.Notation` (C#) | 0.13.0 | `"say ` then `hi""""` | `say "hi"` |
| `links-notation` (npm) | 0.11.2 | `"""say` then `hi` then `"""` | `say ""hi""` |
| `links-notation` (PyPI) | 0.11.2 | `""say "hi"""` | `say ""hi""` |

Every row was measured, not assumed: the Rust one by `quote-probe`, the other
three by parsing those four documents with each package directly.

The readable format is read by this repository's own tokenizer in every
language, so a value reads back unchanged everywhere regardless. The n-quote
form is chosen because it is what the newest notation release implements, which
is the rule the issue asks the encoder to write against; the Rust suite is the
one that can prove it, in `rust/tests/plain_text_values.rs`.
