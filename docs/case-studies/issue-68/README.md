# Large readable documents: requirements, research and plan

The scope is [parent issue #69](https://github.com/link-foundation/lino-objects-codec/issues/69),
including [issue #68](https://github.com/link-foundation/lino-objects-codec/issues/68)
and its [consumer validation comment](https://github.com/link-foundation/lino-objects-codec/issues/68#issuecomment-6109163325).
All work belongs to [PR #70](https://github.com/link-foundation/lino-objects-codec/pull/70).

## Complete requirement mapping

| Requirement                                                                   | Alternatives and implementation plan                                                                                                                                                                                                            | Verification                                                                                                                                                             |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Read every listed issue and all comments                                      | Read #69, #68, and all three PR comment/review endpoints. #68 is the only sub-issue; none was already resolved.                                                                                                                                 | Both issue bodies and the consumer workaround were reviewed. PR had no comments/reviews at investigation time.                                                           |
| Solve the entire scope in one PR, with no deferred issue                      | Use prepared branch and existing #70; keep commits forward-moving.                                                                                                                                                                              | Final diff and closing references.                                                                                                                                       |
| Close parent and every sub-issue with one keyword each                        | Include `Fixes #69` and `Fixes #68` on separate lines in the description.                                                                                                                                                                       | PR description check.                                                                                                                                                    |
| Decode valid large readable documents without whole-document character arrays | Direct string indexing/slices rather than bigger heaps or splitting/dropping history. Remove JS `Array.from(text)`, Rust `Vec<char>` and C# `ToCharArray`. Python already indexes its string directly.                                          | Generated 1,764-record document exceeding the reported 144,497,741 UTF-8 bytes; C# allocation regression.                                                                |
| Preserve exact JSON data and encoded/decoded text                             | Keep the current codec grammar and writer output. Compare every generated record against its original, including JSON text, and compare re-encoded notation SHA-256.                                                                            | Full history regression plus existing shared fixtures and compact interoperability suites.                                                                               |
| Keep complete Unicode runs, including supplementary characters and keys       | ASCII boundaries permit JS/C# UTF-16 slices. Rust advances reference/whitespace scans by UTF-8 code-point width and slices at ASCII quotes.                                                                                                     | Unicode keys, values, Unicode whitespace, quote delimiters and UTF-8 boundaries in all four languages.                                                                   |
| Preserve quoting, n-quote closing-run behavior and legacy doubled delimiters  | Native quote search and slices; collapse legacy doubled delimiters after finding the closing quote. Avoid character ropes/lists. A lazy lexer is another possible approach, but changing row/lookahead parsing is unnecessary for this failure. | All three delimiters, empty values, excess closing delimiters, malformed quotes and existing fixtures.                                                                   |
| Bound escaped-payload Unicode/UTF-8 processing for giant values               | Fixed 64 KiB byte buffers with fresh strict incremental decoders in JS, Python and C#. Rust already writes UTF-8 bytes straight into the buffer that becomes the output `String`, without a second full payload array.                          | Limited-heap JS escaped value; literal and percent-encoded supplementary characters crossing chunk boundaries; strict malformed UTF-8 rejection and recovery.            |
| Preserve escaped markers and malformed-input checks                           | Retain marker dispatch, percent syntax, UTF-8 errors, BOM and lone-surrogate behavior of each existing implementation. Fresh decoder state prevents one failed value affecting the next.                                                        | Escaped controls, literal percent, truncated/non-hex escapes, invalid/overlong/surrogate UTF-8, interrupted sequences and subsequent valid decode.                       |
| Add a realistic regression without marketplace requests                       | Generate deterministic saved-history records offline. Test long single values in isolated child processes too. An archived consumer receipt corroborates the real failure but does not provide the original private payload.                    | Reusable finite probes under `experiments/issue-68`; JS child heaps of 768/128 MiB. No network needed by regressions.                                                    |
| Keep all saved history and perform actual decode                              | Restore and inspect all 1,764 records; no sampling of readable/JSON/compact validation, dropped records or decoder bypass.                                                                                                                      | Per-record deep equality, JSON comparison and legacy compact round trips. The external binary/blob conversion belongs to the consumer and has no API in this repository. |
| Apply repeated defects throughout the codebase                                | Search all shipping code, not only the reported JS location. Improve all four quote readers and the three escaped decoders with temporary full byte copies. Leave Rust's necessary output byte buffer.                                          | Repository-wide search and four-language suites.                                                                                                                         |
| Prepare releases and meet repository checks                                   | JS patch and Rust minor fragments; Python/C# unpublished patch versions and notes. Rust's raised compiler floor warrants a minor release. Refresh dependencies required by freshness/parity gates without weakening them.                       | Local checks, packaging and fresh PR CI.                                                                                                                                 |

## Root cause and baseline

The caller already owns a string. JS copied it into an array of individual code
points, then made further slice/join copies. Each array element needs substantially
more space than its source character. This can hit V8 backing-store or heap limits
well before the string limit. The single-delimiter reader also concatenated one
character at a time, retaining ropes. The escaped reader retained a character
array, a general JS number array, and a second typed byte array.

Rust copied the full input into four-byte `char` entries; C# copied its full UTF-16
input. Python avoided that tokenizer copy but retained one list entry per quoted
character. C#/Python escaped readers also retained full temporary byte buffers.

Before the fix, the generated JS history failed in a 768 MiB child, and the long
quoted and escaped probes failed in separate 128 MiB children. These are finite
processes with core dumps disabled locally, under the container's 2.92 GiB limit.
Node 22.23.3 also exhausts a 768 MiB heap on an unmodified decoder given a
144,497,778-byte whitespace-padded valid value. A smaller 33,555,493-byte padded
value succeeds before and after the fix: peak RSS falls from 630,296 KiB to
122,360 KiB. Size alone is therefore not a universal failure threshold.
The consumer's exact `RangeError: Invalid array length` at its default heap was
not reproduced locally; both failures originate in avoidable input
materialization. Baseline logs are preserved locally in ignored `ci-logs/`.

## Primary-source research and reusable components

- [Consumer patch](https://github.com/konard/lazada-search/blob/c7149901c1877c12cc6a08c4e65ed0a42dd58224/scripts/patch-lino-large-documents.mjs)
  and [focused tests](https://github.com/konard/lazada-search/blob/c7149901c1877c12cc6a08c4e65ed0a42dd58224/tests/lino-large-documents.test.js):
  independently demonstrate direct scanning, quote search and bounded UTF-8.
  Adopt the strategy in the library, without its source-digest installer.
- [Node `TextDecoder`](https://nodejs.org/api/util.html#class-utiltextdecoder)
  and the [Encoding Standard](https://encoding.spec.whatwg.org/#dom-textdecoder-decode):
  streaming calls retain incomplete sequences; a final call must flush them;
  fatal mode rejects invalid bytes. Each payload needs independent state.
- [Node `StringDecoder`](https://nodejs.org/api/string_decoder.html): handles
  split sequences but substitutes invalid input, so it cannot replace strict
  escaped-value decoding without changing behavior.
- [Rust string iteration](https://doc.rust-lang.org/std/str/struct.CharIndices.html):
  distinguishes byte offsets from scalar values. Direct UTF-8 slicing must
  advance whole code points outside ASCII delimiter searches.
- [Python incremental codecs](https://docs.python.org/3/library/codecs.html#incremental-encoding-and-decoding)
  and [.NET `Decoder`](https://learn.microsoft.com/en-us/dotnet/api/system.text.decoder.convert?view=net-10.0):
  built-in components provide the equivalent strict stateful conversion.
- [links-notation](https://github.com/link-foundation/links-notation): already
  used for compact notation and conformance. Replacing the readable parser would
  need separate grammar/compatibility work (row inference, `o:` and escaped
  markers), and an upstream upgrade alone does not remove this codec's arrays.
- [stream-json](https://github.com/uhop/stream-json): provides incremental JSON
  pipelines but does not read this notation. It would help a future consumer
  streaming JSON API, not this synchronous decoder repair.

No new runtime dependency is necessary. This remains an in-memory synchronous
decoder: input, tokens, parse tree and returned values still require storage.
The fix removes avoidable character materialization and bounds temporary escape
bytes; it does not promise arbitrary-size streaming or unlimited nesting.

## Initial CI blockers

All initial failures were from commit `f14972fd15c62088d7439ca267485997f5f87109`,
created before implementation, on 2026-10-11 at 13:31 UTC:

- Shared scripts run `38143511771`: log lines 247–261 fail the checked-in manifest
  agreement assertion. C# had parser 0.25.1, others 0.23.0.
- Parity run `38143511775`: lines 499–513 fail the same parser agreement test.
- Freshness run `38143511774`: lines 349–352 show npm outdated; lines 567–582
  enumerate stale parser/tool/testing dependencies across all ecosystems.

Refresh those declarations and their shipping/experiment lockfiles, rerun local
checks, then inspect runs whose SHA matches the pushed fix. Preserve and analyze
any new non-passing run before changing code.

## Execution plan

1. Complete requirement and dependency research; record alternatives here.
2. Add minimal reproductions before repairing the affected readers.
3. Apply direct scanning/slices and incremental escapes across all implementations.
4. Run focused probes, then all language tests, lint, formatting and packaging.
5. Commit working atomic changes, refresh dependencies, and prepare release triggers.
6. Update #70, review its entire diff, verify current main is included, push only
   the prepared branch, inspect fresh CI, and mark the PR ready when checks pass.

## Local validation results

The deterministic Node 22 regression restores **all 1,764 records** from
**149,255,115 UTF-8 bytes**, compares every JSON/compact round trip, and re-encodes
the same SHA-256:
`680153090ce26c73e7e9ecea69815f3aa2f58aff0913795c12fed4dabfcf01f7`.
The child heap is capped at 768 MiB; observed peak RSS was 824,788 KiB. The
16 MiB quoted and 8 MiB escaped probes each pass with 128 MiB heap caps. Heap
caps are not total-process memory limits.

| Implementation             | Complete local tests                                                         | Other checks                                                                                  |
| -------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| JavaScript (Node 22.23.3)  | 516 passing                                                                  | ESLint, Prettier, duplication check, npm packaging/audit                                      |
| Rust                       | 127 all-feature and 123 default-feature tests passing, including doctests    | Clippy with warnings denied, rustfmt, package assembly; one build job and debug info disabled |
| Python                     | 514 passing; 91% coverage                                                    | Ruff lint/format, mypy, wheel/sdist and Twine checks                                          |
| C#                         | 540 passing                                                                  | Release build with warnings denied, format verification, NuGet packaging                      |
| Shared and release tooling | 35 shared Node, 59 language-script Node and 9 dependency-check tests passing | Parser parity, dependency freshness, file-size gates                                          |

The existing cross-language harness also passes all 16 writer/reader pairings
with byte-identical re-encodings. To repeat the primary finite regression:

```sh
node --expose-gc --max-old-space-size=768 experiments/issue-68/large-document.mjs document
node --max-old-space-size=128 experiments/issue-68/large-document.mjs quoted
node --max-old-space-size=128 experiments/issue-68/large-document.mjs escaped
```

The full private consumer archive was not supplied. This synthetic regression
matches its record count and exceeds its notation size, with no network requests.
The linked consumer receipt supplies independent real-archive validation of the
same scanning strategy. Its binary/blob conversion is outside this codec's API.

Python and C# prepare version 0.3.1. JS keeps its manifest version for automated
patch release; Rust keeps its manifest version for automated minor release.
The refreshed Rust parser requires compiler 1.87, while development tests require
1.88. No new runtime libraries or weakened CI gates are introduced.
