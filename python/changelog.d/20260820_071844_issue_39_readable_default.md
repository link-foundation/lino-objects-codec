### Added

- Opt-in tracing via the `LINO_CODEC_DEBUG` environment variable (`1`, `true`,
  `yes`, `on`) or `set_debug_enabled` from code, matching the JavaScript, Rust
  and C# implementations. See
  [issue #39](https://github.com/link-foundation/lino-objects-codec/issues/39).

### Changed

- The readable indented Links Notation is now the default `encode`/`decode`
  output, matching the Rust implementation. Byte identical output across all
  four languages is locked in by the shared fixtures in
  `fixtures/readable-format/cases.json`. Object identity and circular references
  remain available through `encode_compact`.

### Fixed

- Cross-language compact interop: booleans are written lowercase (`(bool true)`)
  and decoded case-insensitively, so a compact document written by any language
  decodes correctly in every other.
