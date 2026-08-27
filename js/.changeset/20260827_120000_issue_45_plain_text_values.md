---
'lino-objects-codec': minor
---

`encode` and `encodeLine` never reach for base64. A single control character
used to turn a whole string into base64, so a log message holding one newline
hid its own text: the message, the stack trace and every word a reader would
grep for. Both readable forms now write the text as it is and escape only what
the form itself cannot carry — the newline on a single line, the carriage return
everywhere, and the remaining control characters — in a value marked
`(escaped "line one%0Aline two")` whose payload is percent-escaped, so even the
escaped part stays readable. base64 is reachable only through `encodeCompact()`
/ `encodeObfuscated()`, which say so by name.

A string containing the quote delimiter is written between a run of at least
three of them — `"""say "hi""""` — instead of by doubling the quote, which
desynchronises the notation's own parser. The exported `ESCAPED_MARKER` names
the new `escaped` link id.

Fixes a key holding a control character, which used to be written as
`(base64 "…")` in key position and read back as an array element, so
`{"a\nb": "a\nb"}` decoded to `["a\nb", "a\nb"]`. `(base64 "…")` is still
decoded, so every document written up to 0.6.0 keeps reading; the shared
fixtures pin this in a `legacy` section.

See [issue #45](https://github.com/link-foundation/lino-objects-codec/issues/45).
