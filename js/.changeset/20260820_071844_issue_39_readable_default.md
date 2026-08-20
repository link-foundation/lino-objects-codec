---
'lino-objects-codec': minor
---

Make the readable indented Links Notation the default `encode`/`decode` output,
matching the Rust implementation, and add opt-in tracing via the
`LINO_CODEC_DEBUG` environment variable (or `setDebugEnabled` from code). Byte
identical output across all four languages is now locked in by the shared
fixtures in `fixtures/readable-format/cases.json`. Also fixes cross-language
compact interop: booleans are written lowercase (`(bool true)`) and decoded
case-insensitively so documents written by any language decode in every other.
See [issue #39](https://github.com/link-foundation/lino-objects-codec/issues/39).
