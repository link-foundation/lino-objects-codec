# lino-objects-codec

## 0.7.0

### Minor Changes

- 1154c50: `encode` and `encodeLine` never reach for base64. A single control character
  used to turn a whole string into base64, so a log message holding one newline
  hid its own text: the message, the stack trace and every word a reader would
  grep for. Both readable forms now write the text as it is and escape only what
  the form itself cannot carry — the newline on a single line, the carriage return
  everywhere, and the remaining control characters — in a value marked
  `(escaped "line one%0Aline two")` whose payload is percent-escaped, so even the
  escaped part stays readable. base64 is reachable only through `encodeCompact()`
  / `encodeObfuscated()`, which say so by name.

  A string containing the quote delimiter is written between a run of at least
  three of them — `"""say "hi""""` — instead of by doubling the quote, which
  desynchronises the notation's own parser. The exported `ESCAPED_MARKER` names
  the new `escaped` link id.

  Fixes a key holding a control character, which used to be written as
  `(base64 "…")` in key position and read back as an array element, so
  `{"a\nb": "a\nb"}` decoded to `["a\nb", "a\nb"]`. `(base64 "…")` is still
  decoded, so every document written up to 0.6.0 keeps reading; the shared
  fixtures pin this in a `legacy` section.

  See [issue #45](https://github.com/link-foundation/lino-objects-codec/issues/45).

## 0.6.0

### Minor Changes

- 5029620: Add `encodeLine` and `decodeLine`: the readable format written on one line, so
  an append-only log holds one record per line. Appending is one write, compaction
  cuts at a newline, and `grep`, `tail -f` and `wc -l` treat a line as one event.
  The output is valid Links Notation, keeps numbers, booleans and `null` bare so
  types survive the round trip, and `decode(encodeLine(v))` equals
  `decode(encode(v))`.

  The exported `OBJECT_MARKER` (`o`) tells an object from an array on one line:
  `(o: (bytes 2827) (complete true))` is a record, `("a" 1)` is a two-element
  array, `(o:)` is the empty object and `()` the empty array. Because the marker
  is part of the notation, the empty key round-trips as `(o: ("" 2))`. The
  single-line spelling of every shared fixture is pinned in
  `fixtures/readable-format/cases.json`, so all four languages write the same
  bytes.

  Also fixes `decode`, which used to route a readable single-line document such as
  `(null 1)` to the compact (base64) reader; the document `(null)` stays the
  compact null so older documents keep decoding. See
  [issue #43](https://github.com/link-foundation/lino-objects-codec/issues/43).

## 0.5.1

### Patch Changes

- 51f7ed4: Refactor `ObjectCodec._encodeValue` and `ObjectCodec._decodeLink` into small
  dispatch methods so the JavaScript sources lint clean: the three ESLint
  `complexity`/`max-statements` warnings the pipeline had been printing on every
  run are gone. Behaviour and the public API are unchanged and the full 244-test
  suite is untouched. Part of the CI/CD clean-up in
  [issue #41](https://github.com/link-foundation/lino-objects-codec/issues/41),
  which also fixes the seven `npm audit` advisories in the dev dependency tree.

  The same change also fixes the JavaScript change-detection script, which
  compared repository-root paths (`js/examples/demo.mjs`) against
  package-relative prefixes (`examples/`), so an examples-only pull request was
  reported as a code change and `package-changed` could never be true.

## 0.5.0

### Minor Changes

- 84f6f96: Make the readable indented Links Notation the default `encode`/`decode` output,
  matching the Rust implementation, and add opt-in tracing via the
  `LINO_CODEC_DEBUG` environment variable (or `setDebugEnabled` from code). Byte
  identical output across all four languages is now locked in by the shared
  fixtures in `fixtures/readable-format/cases.json`. Also fixes cross-language
  compact interop: booleans are written lowercase (`(bool true)`) and decoded
  case-insensitively so documents written by any language decode in every other.
  See [issue #39](https://github.com/link-foundation/lino-objects-codec/issues/39).

## 0.4.0

### Minor Changes

- a9ad369: Add recursive readable indented object formatting and parsing for untyped repository data.

## 0.3.6

### Patch Changes

- d0fe09b: Fix the npm publish false positive (`##[error]` annotations in green runs) by retrying the registry verification with exponential backoff and pre-checking the registry before re-running `changeset publish`. Standardize GitHub Release titles to `[JavaScript] X.Y.Z` and tag prefix to `js_v`. Fix the shields.io badge URL so it embeds bare SemVer instead of leaving the `js-v` language prefix in the badge and npm links.

## 0.3.5

### Patch Changes

- c78eb96: Harden npm trusted-publishing setup so CI fails when npm cannot be upgraded to an OIDC-capable version, and surface access/trusted-publisher guidance for npm publish 404 failures.

## 0.3.4

### Patch Changes

- b2fc507: Detect npm publish failures that previously slipped through. The
  `@changesets/cli`-based publish flow used to exit 0 even when individual
  packages failed to publish, and the scripts hardcoded the package name,
  so v0.3.3 was reported as "✅ published" while npm 404'd. The publish
  script now reads the package name and version dynamically from
  `package.json`, scans changeset output for known failure markers,
  re-queries the npm registry to verify the version actually landed, and
  prints a credential-recovery runbook on auth failures. GitHub releases
  also now use the `js-v` tag prefix so they no longer collide with
  releases from the other languages in this repo.

## 0.3.3

### Patch Changes

- 1c69cfb: Document the built-in references format for circular references and add
  regression tests that lock it in. The encoder already emits cycles as bare
  `obj_N` links inside an `(obj_N: type ...)` self-reference definition, but the
  README still showed the legacy `(ref obj_N)` marker. README, regression tests,
  and the format-invariant assertions are now consistent. See issue #27.

## 0.3.2

### Patch Changes

- 240826f: Add registry-version, CI, and license badges to the JavaScript README so the
  package's published state on npm is visible at a glance. No code changes.

## 0.3.1

### Patch Changes

- a46090a: Add CI/CD improvements based on template best practices:
  - Add detect-code-changes.mjs for smart change detection
  - Add check-version.mjs to prevent manual package.json version changes
  - Add check-changesets.mjs to check for pending changesets
  - Add merge-changesets.mjs to merge multiple changesets on release
  - Update workflow with detect-changes job, conditional changeset checks,
    and improved concurrency configuration

## 0.3.0

### Minor Changes

- bfa0a4e: Add indented Links Notation format support for human-readable object display.

  New functions:
  - `formatIndented({ id, obj, indent })` - Format an object with identifier in indented style
  - `parseIndented({ text })` - Parse indented format back to { id, obj }

  The indented format displays objects as:

  ```
  <identifier>
    <key> "<value>"
    <key> "<value>"
    ...
  ```

  Also adds:
  - `escapeReference()` for escaping values with special characters
  - `unescapeReference()` for reversing escape sequences

## 0.1.1

### Patch Changes

- 7f6aba3: Add complete CI/CD workflows and release automation for both JavaScript and Python packages
