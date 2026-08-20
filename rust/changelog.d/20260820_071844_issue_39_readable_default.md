---
bump: minor
---

### Added

- Opt-in tracing via the `LINO_CODEC_DEBUG` environment variable (`1`, `true`,
  `yes`, `on`) or `debug::set_debug_enabled` from code, matching the JavaScript,
  Python and C# implementations. See
  [issue #39](https://github.com/link-foundation/lino-objects-codec/issues/39).

### Changed

- The readable indented output is now verified byte-for-byte against the other
  three languages through the shared fixtures in
  `fixtures/readable-format/cases.json`.

### Fixed

- Cross-language compact interop: booleans in the compact form are now decoded
  case-insensitively, so `(bool True)` written by the Python or C#
  implementations decodes correctly in Rust.
