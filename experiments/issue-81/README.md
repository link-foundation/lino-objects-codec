# Issue 81: unsafe integer Numbers became strings

Issue: https://github.com/link-foundation/lino-objects-codec/issues/81

PR: https://github.com/link-foundation/lino-objects-codec/pull/82

## Reproduce

Install JavaScript dependencies with `cd js && npm ci`, then from the
repository root:

```sh
node experiments/issue-81/reproduce.mjs
```

Before the fix both forms printed `FAIL`: `encode`/`encodeLine` wrote `1e18` as
`1000000000000000000` and `-9007199254740992` as `-9007199254740992`, and
`decode`/`decodeLine` read those back as the strings `'1000000000000000000'`
and `'-9007199254740992'`. After the fix both forms print `ok` and the script
exits with status 0.

## Root cause

- `formatNumber` in `js/src/readable.js` returned `String(value)`. For an
  integer Number from `2 ** 53` up to `1e21` that is a plain digit string.
- `refToValue` deliberately reads bare digits that do not fit a safe integer
  as a string, so a `bigint` (written as its digits) or a long identifier keeps
  every digit instead of being rounded to the nearest double.
- The writer and the reader therefore disagreed for unsafe integer Numbers:
  the value was a Number, but its spelling was one the reader keeps as text.

## Fix

`formatNumber` writes an integer Number that is not a safe integer with
`value.toExponential()`. Without an argument `toExponential` keeps exactly the
digits needed to identify the double, so the reader's float branch
(`Number(value)`) gives back the same Number:

| Number                               | Before                | After                    |
| ------------------------------------ | --------------------- | ------------------------ |
| `9007199254740991` (max safe)        | `9007199254740991`    | `9007199254740991`       |
| `9007199254740992`                   | `9007199254740992`    | `9.007199254740992e+15`  |
| `-9007199254740992`                  | `-9007199254740992`   | `-9.007199254740992e+15` |
| `1e18`                               | `1000000000000000000` | `1e+18`                  |
| `1000000000000000100` (`1e18 + 128`) | `1000000000000000100` | `1.0000000000000001e+18` |
| `1e21` and above                     | `1e+21`               | `1e+21` (unchanged)      |

Unchanged: safe integers keep their plain digits; strings that look like
numbers stay quoted (`"1e+18"`, `"1000000000000000000"`) and so stay strings;
object keys stay strings; a `bigint` is still written as its digits and an
unsafe one still reads back as its exact digit string; the reader is untouched,
so documents written by earlier versions decode exactly as before. The compact
format already stored the value as a typed Number.

The Python, Rust and C# readable writers are not affected: they always keep a
decimal point or an exponent on a float (`repr`, `{:?}`, `ToString("R")` plus
`.0`), so a float never looks like an integer to their readers.

## Regression test

`js/tests/test_unsafe_integer_numbers.test.js` covers both readable forms for
positive and negative unsafe integer Numbers, `1e18`, `1000000000000000100`,
the safe boundary values, matching strings and keys, nested arrays and objects,
and bigint. Against the previous `formatNumber`, 24 of its 49 tests fail.
