# Changelog

<!-- scriv-insert-here -->

<a id='changelog-0.3.3'></a>
# ## [0.3.3] - 2026-11-19

## Added

- Scriv for changelog management (Python equivalent of Changesets)
- Fragment-based changelog workflow to prevent merge conflicts
- CI check for changelog fragments in pull requests
- Automated fragment collection in release workflow
- Documentation for changelog workflow in CONTRIBUTING.md and README.md

- Opt-in tracing via the `LINO_CODEC_DEBUG` environment variable (`1`, `true`,
  `yes`, `on`) or `set_debug_enabled` from code, matching the JavaScript, Rust
  and C# implementations. See
  [issue #39](https://github.com/link-foundation/lino-objects-codec/issues/39).

- `encode_line` and `decode_line`: the readable format written on one line, so
  an append-only log holds one record per line. Appending is one write,
  compaction cuts at a newline, and `grep`, `tail -f` and `wc -l` treat a line
  as one event. The output is valid Links Notation, keeps numbers, booleans and
  `None` bare so types survive the round trip, and `decode(encode_line(v))`
  equals `decode(encode(v))`. See
  [issue #43](https://github.com/link-foundation/lino-objects-codec/issues/43).
- `OBJECT_MARKER`, the `o` link id that tells an object from an array on one
  line: `(o: (bytes 2827) (complete true))` is a record, `("a" 1)` is a
  two-element array, `(o:)` is the empty object and `()` the empty array. The
  marker is part of the notation, so the empty key round-trips as `(o: ("" 2))`.
  The single-line spelling of every shared fixture is pinned in
  `fixtures/readable-format/cases.json`, so all four languages write the same
  bytes.
- The `examples/append_only_log.py` example, which writes, counts, greps and
  reads back a log of one record per line.

- `ESCAPED_MARKER`, the `escaped` link id that marks a percent-escaped value.

- Public single-line and verbatim value formatting helpers.

## Changed

- Document the built-in references format for circular references in the Python
  README. The encoder already produces `(obj_N: dict ...)` / `(obj_N: list ...)`
  self-reference definitions and bare `obj_N` back-references; the README now
  matches and explicitly notes that the legacy `(ref obj_N)` marker is no
  longer recognized. Regression tests lock in the new format. See
  [issue #27](https://github.com/link-foundation/lino-objects-codec/issues/27).

- The readable indented Links Notation is now the default `encode`/`decode`
  output, matching the Rust implementation. Byte identical output across all
  four languages is locked in by the shared fixtures in
  `fixtures/readable-format/cases.json`. Object identity and circular references
  remain available through `encode_compact`.

- Declare the licence with the PEP 639 SPDX expression (`license = "Unlicense"`
  plus `license-files`) and ship `python/LICENSE` in the distribution. This
  removes the setuptools deprecation warning that every build emitted and makes
  the wheel metadata state `License-Expression: Unlicense`. See
  [issue #41](https://github.com/link-foundation/lino-objects-codec/issues/41).

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
  three of them — `"""say "hi""""` — instead of by doubling the quote, which
  desynchronises the notation's own parser.

- Updated `links-notation` from `>=0.11.0,<0.12.0` to `>=0.16.1,<0.17.0`. All four implementations now pin `links-notation` 0.16.1, so the conformance suites run against one grammar instead of four (issue #47).

- Raised the `dev` extra floors to the majors CI actually runs: `pytest` `>=7.0` -> `>=9.1`, `pytest-cov` `>=4.0` -> `>=7.1`, `mypy` `>=1.0` -> `>=2.3`, `ruff` `>=0.1.0` -> `>=0.16.5`, `scriv` `>=1.7.0` -> `>=1.8`, and the build requirement `setuptools` `>=77.0` -> `>=84.0`. A fresh `pip install -e ".[dev]"` no longer resolves to releases that lint and type-check by rules from several majors ago (issue #47).

- Update links-notation to 0.23.0 and refresh development dependency floors.

- CI: Dependabot pull requests are exempt from the changelog fragment check (decided from the PR author, not the branch name), so grouped dependency updates no longer fail it and get merged red.

- Refresh parser and development dependencies required by freshness CI.

- Update `links-notation` from `>=0.25.2,<0.26.0` to `>=0.27.1,<0.28.0`, the latest release (0.26.0 included), so a project that also depends on the current parser can install both (issue #74). The test suite passes unchanged against 0.25.2, 0.26.0 and 0.27.1. Refresh the setuptools and Ruff floors for the dependency freshness gate.

- Refresh the pytest, Ruff and mypy development dependency floors to pass the dependency freshness gate.

- Update `links-notation` from `>=0.27.1,<0.28.0` to `>=0.31.3,<0.32.0`, the latest release, so a project that also depends on the current parser can install both. The test suite passes unchanged against 0.31.3. Refresh the Ruff and scriv floors for the dependency freshness gate.

- Update `links-notation` from `>=0.31.3,<0.32.0` to `>=0.31.4,<0.32.0`, the latest release. The test suite passes unchanged against 0.31.4. Refresh the Ruff floor for the dependency freshness gate.

- Require Python 3.15, update Links Notation to 0.31.5 and raise every build/development dependency floor to the current release.
- Lock development/build dependencies with hashes, update pre-commit hooks, and adopt Python 3.15 annotation and exception syntax supported by current Ruff.

- Refresh links-notation to 0.31.6 and scriv to 1.8.2 for the dependency freshness check; account for the parser's newly published optional-ID type annotations without changing decoding behavior.

## Fixed

- Cross-language compact interop: booleans are written lowercase (`(bool true)`)
  and decoded case-insensitively, so a compact document written by any language
  decodes correctly in every other.

- The changelog check can now fail. It previously printed a warning and exited
  0, so a pull request could change `python/src` with no release note and still
  show a green check, and it counted leftover fragments from earlier unreleased
  pull requests. The requirement is now decided from the pull-request diff.

- Python is tested on macOS and Windows as well as Linux, and gains the
  `detect-changes` job the JavaScript and Rust pipelines already had, so a
  documentation-only pull request no longer runs the full matrix.

- `decode` no longer routes a readable single-line document such as `(None 1)`
  to the compact (base64) reader. Only a compact document keeps that path; the
  document `(None)` stays the compact `None` so older documents keep decoding.

- A key holding a control character stays a key. It used to be written as
  `(base64 "…")` in key position and read back as a list element, so
  `{"a\nb": "a\nb"}` decoded to `["a\nb", "a\nb"]`.
- `(base64 "…")` is still decoded, so every document written by an earlier
  version keeps reading; the shared fixtures pin this in a `legacy` section.

- Disambiguate a one-null array from a compact null document.

- Release: a manual release now collects changelog fragments after the version bump, so the CHANGELOG section is titled with the new version instead of `patch`/`minor`/`major`. When fragments exist, no second generic entry is written.
- Release: the manual-release job now actually runs on `workflow_dispatch`. Before, the skipped change-detection job made it skip silently.

- Read large quoted values using string slices and decode escaped payloads with bounded strict UTF-8 buffers, preserving Unicode and legacy quotes.

- Preserve multiline strings and blank or whitespace-only continuation lines when parsing `format_indented` output. Add shared regression fixtures for all four implementations and opt-in parsing traces.

- Lower the Python requirement to 3.11, the minimum supported by links-notation, so released interpreters can build and install the package. Align classifiers, lint/type targets, the development lockfile and CI coverage; build distributions on Python 3.11.

## [0.3.1] - 2026-10-11

### Fixed

- Avoid per-character lists for large quoted values and bound escaped-value UTF-8 buffers.

### Changed

- Update links-notation to 0.25.2 and Ruff to 0.17.0.

## [0.3.0] - 2026-10-07

### Added

- Public single-line and verbatim value formatting helpers.

### Changed

- Update links-notation to 0.23.0 and refresh development dependency floors.

### Fixed

- Preserve a singleton null array in single-line notation.
