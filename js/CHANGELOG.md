# lino-objects-codec

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
