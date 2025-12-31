# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2024-12-31

### Added

- Initial C# implementation of lino-objects-codec
- `ObjectCodec` class with `Encode()` and `Decode()` methods
- Support for basic types: `null`, `bool`, `int`, `long`, `float`, `double`, `string`
- Support for collections: `List<object?>`, `Dictionary<string, object?>`
- Circular reference support with preserved object identity
- Base64 encoding for strings (full UTF-8 support)
- Special float values: `NaN`, `Infinity`, `-Infinity`
- Thread-safe static `Codec` class for easy access
- Comprehensive test suite (69 tests)
- Usage examples
