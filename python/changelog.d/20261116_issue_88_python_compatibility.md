### Fixed

- Lower the Python requirement to 3.11, the minimum supported by links-notation, so released interpreters can build and install the package. Align classifiers, lint/type targets, the development lockfile and CI coverage; build distributions on Python 3.11.

### Changed

- Refresh links-notation to 0.31.6 and scriv to 1.8.2 for the dependency freshness check; account for the parser's newly published optional-ID type annotations without changing decoding behavior.
