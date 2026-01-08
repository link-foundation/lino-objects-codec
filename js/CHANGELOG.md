# lino-objects-codec

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
