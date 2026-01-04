---
"lino-objects-codec": minor
---

Add indented Links Notation format support for human-readable object display.

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
