# lino-objects-codec

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
