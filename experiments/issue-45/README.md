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
