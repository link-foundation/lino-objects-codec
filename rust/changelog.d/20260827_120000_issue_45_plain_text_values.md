---
bump: minor
---

### Changed

- `encode` and `encode_line` never reach for base64. A single control character
  used to turn a whole string into base64, so a log message holding one newline
  hid its own text: the message, the stack trace and every word a reader would
  grep for. Both readable forms now write the text as it is and escape only what
  the form itself cannot carry — the newline on a single line, the carriage
  return everywhere, and the remaining control characters — in a value marked
  `(escaped "line one%0Aline two")` whose payload is percent-escaped, so even the
  escaped part stays readable. base64 is reachable only through
  `encode_compact()` / `encode_obfuscated()`, which say so by name. See
  [issue #45](https://github.com/link-foundation/lino-objects-codec/issues/45).
- A string containing the quote delimiter is written between a run of at least
  three of them — `"""say "hi""""` — instead of by doubling the quote. The
  doubled form desynchronises `links-notation`'s own parser; the run form reads
  back unchanged, which `tests/plain_text_values.rs` checks with
  `parse_lino_to_links`.

### Added

- `readable::ESCAPED_MARKER`, the `escaped` link id that marks a
  percent-escaped value.

### Fixed

- A key holding a control character stays a key. It used to be written as
  `(base64 "…")` in key position and read back as an array element, so
  `{"a\nb": "a\nb"}` decoded to `["a\nb", "a\nb"]`.
- `(base64 "…")` is still decoded, so every document written up to 0.5.0 keeps
  reading; the shared fixtures pin this in a `legacy` section.
