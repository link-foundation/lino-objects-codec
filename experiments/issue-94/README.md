# Issue #94 investigation

Scripts used while fixing `formatIndented` output that the plain
links-notation `Parser` (0.31.8) misread. Run them from the repository root
after `npm ci` in `js/`.

- `reproduce.mjs` reproduces the report. A value `''` at the end of a line opens
  a quote that swallows the following lines, and a leading `#` starts a comment
  (links-notation#443, links-notation#444).
- `probe-empty.mjs` compares spellings of the empty string. Only the reference
  literal `~1{}` from the links-notation lossless reference-literal standard reads
  back as `""` in every binding, so the codec uses it rather than a custom
  marker such as `~b64_`.
- `probe-nested.mjs` / `nested.mjs` check how the Parser reads candidate nested
  layouts. `key:` headers with indented children work, but an anonymous `:`
  header is a syntax error, which is why array items that are containers use a
  bare `-:` header.
- `property.mjs <maxLength>` formats every string up to `maxLength` characters
  built from 18 tricky characters (quotes, backtick, `#`, `~`, `{`, `}`, `:`,
  parentheses, spaces, newline, ...) in both modes and checks both
  `parseIndented` and the plain Parser. This sweep found that doubling quotes is
  unsafe when the text starts or ends with that quote (`'"` became `'''"'`).
  `property-4.log` shows 111,151 strings × 2 modes with 0 failures.
