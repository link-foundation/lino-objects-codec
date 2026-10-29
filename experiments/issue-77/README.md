# Issue 77: multiline strings in the indented display format

Issue: https://github.com/link-foundation/lino-objects-codec/issues/77

PR: https://github.com/link-foundation/lino-objects-codec/pull/78

## Reproduce

Install JavaScript dependencies with `cd js && npm ci`, then from the repository root:

```sh
node experiments/issue-77/reproduce.mjs
LINO_CODEC_DEBUG=1 node experiments/issue-77/reproduce.mjs
```

Before the fix, all six samples fail: five multiline values throw, and a
backtick-delimited literal loses its backticks. After the fix, all six pass.
The reported example retains its original readable representation:

```text
doc:
  t 'line1
line2'
```

The finite Python probe compares the wrapper with links-notation directly:

```sh
python/.venv/bin/python experiments/issue-77/probe.py
```

Before the fix, the wrapper deletes blank and whitespace-only lines inside
values; the underlying parser preserves them. The probe also records existing
Python null handling, which is independent of this issue.

## Root cause and fix

JavaScript split the input at every physical newline, skipped empty lines,
trimmed each remaining line, and only then tokenized its quoted references.
`line1\nline2` therefore reached the tokenizer as an unterminated quote on one
line. The new scanner splits only at newlines outside quoted references. It
preserves quotation, blank lines, indentation, and carriage returns inside
values, and handles doubled delimiters consistently with the existing tokenizer.
The formatter also quotes backticks and empty references so they remain literal
text in this format.

Python, Rust and C# passed their input through links-notation, which already
understands quoted continuations, but first deleted every blank physical line.
Rust additionally used `str::lines()`, which removed carriage returns in CRLF
values. These wrappers now normalize only the initial header and pass the body
through unchanged. All four parsers have opt-in traces under `LINO_CODEC_DEBUG`;
they report counts without logging string contents.

## Regression evidence

Tests were written and run against the original sources before each fix:

| Implementation | Before                                                                                         | Automated regression                                              |
| -------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| JavaScript     | 20 of 23 new tests failed; the reported value raised `Unterminated quoted reference: t 'line1` | `js/tests/test_indented_multiline.test.js`                        |
| Python         | 5 of 18 new cases lost blank/whitespace lines                                                  | `python/tests/test_indented_multiline.py`                         |
| Rust           | Shared-fixture test failed on `line1\n\nline2`, producing `line1\nline2`                       | `rust/tests/indented_multiline.rs`                                |
| C#             | Shared-fixture test failed on the same blank continuation                                      | `csharp/tests/Lino.Objects.Codec.Tests/IndentedMultilineTests.cs` |

All four suites consume `fixtures/indented-format/strings.json`. Its 18 cases
cover ordinary strings, newlines, blank lines, whitespace, definition-looking
content, quote styles, CRLFs, lone carriage returns, literal escape text,
Unicode, controls, and empty strings. Rust and C# check both ordered and map
formatters. JavaScript also checks nested objects/arrays, keys, identifiers,
legacy headers, CRLF document separators, malformed input, and all 2,380 strings
of length zero through three from a 13-character alphabet. The combinations
have a ten-second test limit and use finite, small inputs.

A catalog-shaped executable example is in `js/examples/multiline_catalog.js`.
Patch release fragments are provided for each package; the release workflows
manage the package versions.

Full-suite and CI results are recorded in the PR description. Local logs are
kept under the ignored `ci-logs/` directory, including before/after regressions.
