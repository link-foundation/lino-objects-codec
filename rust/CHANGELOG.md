# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
