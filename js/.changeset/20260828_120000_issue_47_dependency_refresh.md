---
'lino-objects-codec': minor
---

Bring every dependency current (issue #47).

- `links-notation` `^0.11.0` → `^0.16.1`, the same version Python, Rust and C# now pin, so all four codecs read and write against one grammar.
- `eslint` 9 → 10, with `@eslint/js` added as an explicit dev dependency: ESLint 10 no longer supplies it transitively, and `eslint.config.js` has always imported it.
- `jscpd` 4 → 5, and `.jscpd.json` repaired. Its `"format": "console"` was read as the list of _file_ formats to scan rather than as a reporter, so the duplication check had never analysed a file; `skipComments` is `"mode": "weak"` in v5.
- `lint-staged` 16 → 17, `@changesets/cli` 2 → 3, `prettier` 3.6.2 → 3.9.6, `eslint-plugin-prettier` 5.5.4 → 5.5.6.

`engines.node` moves from `>=18.0.0` to `>=22.11.0`. Node 18 has been end-of-life for a year and CI has only ever run 22, so the old floor claimed support that nothing tested; 22.11 is also what `@changesets/cli` 3 and `eslint` 10 require.
