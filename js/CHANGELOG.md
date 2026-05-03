# lino-objects-codec

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
