# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
