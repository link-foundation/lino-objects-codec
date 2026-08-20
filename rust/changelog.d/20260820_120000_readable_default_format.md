---
bump: minor
---

### Added
- `encode_with_indent()` for choosing the indentation string of the readable format.
- `encode_compact()` (alias `encode_obfuscated()`) keeping the previous single-line base64 output under an explicit name.
- `readable` module with the indented encoder/decoder, plus `DEFAULT_INDENT` and `BASE64_MARKER` constants.

### Changed
- `encode()` now produces indented, plain-text Links Notation by default: one `( )` construct for objects and arrays at every level, keys and values written verbatim, strings double-quoted, and numbers/`true`/`false`/`null` bare so types survive a round trip.
- Values are base64-encoded only when they cannot be written as text (control characters), and each such value is marked individually as `(base64 "...")`.
- `decode()` accepts both the readable and the previous compact form, so existing files keep working and migrate to the readable form on the next write.
- Raised the `links-notation` dependency to 0.14, where parentheses open a nested indentation context.
