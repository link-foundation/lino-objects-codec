### Changed

- Declare the licence with the PEP 639 SPDX expression (`license = "Unlicense"`
  plus `license-files`) and ship `python/LICENSE` in the distribution. This
  removes the setuptools deprecation warning that every build emitted and makes
  the wheel metadata state `License-Expression: Unlicense`. See
  [issue #41](https://github.com/link-foundation/lino-objects-codec/issues/41).

### Fixed

- The changelog check can now fail. It previously printed a warning and exited
  0, so a pull request could change `python/src` with no release note and still
  show a green check, and it counted leftover fragments from earlier unreleased
  pull requests. The requirement is now decided from the pull-request diff.

- Python is tested on macOS and Windows as well as Linux, and gains the
  `detect-changes` job the JavaScript and Rust pipelines already had, so a
  documentation-only pull request no longer runs the full matrix.
