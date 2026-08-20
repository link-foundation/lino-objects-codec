# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.1] - 2026-08-20

### Changed

- CI/CD hardening from
  [issue #41](https://github.com/link-foundation/lino-objects-codec/issues/41):
  every action moves to a Node 24 major, each job gets a `timeout-minutes` and
  its own concurrency group, release jobs queue instead of racing so a
  `cargo publish` can no longer be cancelled mid-flight, and pull requests are
  now validated against a fresh merge with the base branch rather than a stale
  merge preview. No change to the crate's code or public API.

### Fixed

- The change-detection script compared repository-root paths
  (`rust/examples/demo.rs`) against package-relative prefixes (`examples/`), so
  the documented exclusions never applied and `toml-changed` fired on any
  `.toml` in the repository, including `python/pyproject.toml`.

## [0.4.0] - 2026-08-20

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

## [0.3.0] - 2026-08-20

### Added
- `encode_with_indent()` for choosing the indentation string of the readable format.
- `encode_compact()` (alias `encode_obfuscated()`) keeping the previous single-line base64 output under an explicit name.
- `readable` module with the indented encoder/decoder, plus `DEFAULT_INDENT` and `BASE64_MARKER` constants.

### Changed
- `encode()` now produces indented, plain-text Links Notation by default: one `( )` construct for objects and arrays at every level, keys and values written verbatim, strings double-quoted, and numbers/`true`/`false`/`null` bare so types survive a round trip.
- Values are base64-encoded only when they cannot be written as text (control characters), and each such value is marked individually as `(base64 "...")`.
- `decode()` accepts both the readable and the previous compact form, so existing files keep working and migrate to the readable form on the next write.
- Raised the `links-notation` dependency to 0.14, where parentheses open a nested indentation context.

## [0.2.1] - 2026-05-03

Add CI/CD improvements based on template best practices:

- Add detect-code-changes.mjs for smart change detection
- Add check-version-modification.mjs to prevent manual Cargo.toml version changes
- Add check-changelog-fragment.mjs for PR-diff-based changelog fragment checking
- Add check-file-size.mjs for Rust file line limit checking
- Add git-config.mjs for CI git configuration
- Update workflow with detect-changes job, version check, file size check,
  and improved concurrency configuration

Harden the Rust release workflow so ambiguous crates.io responses fail instead of triggering a duplicate publish, and test the release-decision logic.

## [0.1.0] - 2024-12-17

### Added
- Initial release of lino-objects-codec for Rust
- `LinoValue` enum for representing all serializable types
- `encode()` and `decode()` convenience functions
- `ObjectCodec` struct for direct usage
- Support for all basic types: null, bool, int, float, string
- Support for special float values: NaN, Infinity, -Infinity
- Support for collections: array, object
- Circular reference detection and handling
- UTF-8 string support via base64 encoding
- Comprehensive error handling with `CodecError`
- Example usage in `examples/basic_usage.rs`
- Full documentation with doc tests
