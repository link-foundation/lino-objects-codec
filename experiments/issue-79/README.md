# Issue 79: `process` and `Buffer` in a browser

Issue: https://github.com/link-foundation/lino-objects-codec/issues/79

PR: https://github.com/link-foundation/lino-objects-codec/pull/80

## Reproduce

Install JavaScript dependencies with `cd js && npm ci`, then from the
repository root:

```sh
node experiments/issue-79/reproduce.mjs
```

The script deletes `globalThis.process` and `globalThis.Buffer`, as a browser
bundle has neither, and then loads the codec. Before the fix, `parseIndented`,
`decode` and the `(base64 "…")` decode failed with
`ReferenceError: process is not defined` (the base64 decode would next fail
with `Buffer is not defined`). After the fix, every case prints `ok`.

`browser.html` runs the same cases in a real browser without a bundler. Serve
the repository root, for example `python3 -m http.server 8079`, and open
http://localhost:8079/experiments/issue-79/browser.html. In Chromium (via
Playwright) the page reported `typeof process: undefined, typeof Buffer:
undefined` and `ok` for all six cases after the fix.

## Root cause

- `js/src/debug.js` read `process.env.LINO_CODEC_DEBUG` without checking that
  `process` exists. Every parse calls `trace()`, which calls
  `isDebugEnabled()`, so every parse threw unless `setDebugEnabled()` had been
  called first. `trace()` also wrote to `process.stderr` directly.
- `js/src/readable.js` (legacy `(base64 "…")` values) and `js/src/codec.js`
  (the compact format) used `Buffer.from(…, 'base64')`.

## Fix

- `debug.js` looks up `globalThis.process` safely: a missing environment means
  tracing is off, and trace lines go to `console.debug` when there is no
  `process.stderr`.
- `js/src/base64.js` encodes and decodes UTF-8 base64 with `Buffer` when it
  exists and otherwise with `TextEncoder`/`TextDecoder` and a small
  pure-JavaScript base64 codec. The fallback decoder copies Buffer's lenient
  rules (both alphabets, skips other characters, stops at `=`, keeps a BOM), so
  the same document decodes to the same string in both environments. `atob`
  was not used because it throws on input that Buffer accepts.
- `js/tests/test_browser_globals.test.js` deletes both globals before loading
  the library, covers the reported cases, and checks the fallback base64 codec
  byte-for-byte against Buffer on fixed and generated inputs.
