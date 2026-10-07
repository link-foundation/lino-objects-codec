# Requirements and implementation analysis: issues #59, #60, #64 and #65

Research date: 2026-10-07. All issue bodies and comments, PR #66's conversation,
inline comments and reviews, recent dependency PRs #58/#61/#62/#63, and the earlier
dependency migration PR #48 were reviewed. #64 has a title and no body/comments;
its scope is therefore interpreted as every maintained dependency ecosystem,
including development/build tooling, workflow actions and experiment crates.

## Complete requirement map

| Source | Requirement | Possible approaches and selected plan | Verification |
| --- | --- | --- | --- |
| #65, requirement 1 | Read all three sub-issues and their comments; implement all requests. | Trace both the codec and the consumer code identified in #59; map all manifests/workflows, rather than relying on the issue's September version table. | This matrix and PR closing references. |
| #65, requirement 2 | Complete the work in one PR; no deferred implementation. | Update prepared PR #66 on its existing branch, preserving commit history. | Final PR diff covers all four languages, tests, docs and CI. |
| #65, requirements 3–4 | Close #65, #59, #60 and #64, with a separate closing keyword for each. | Include the required `Fixes #59`, `Fixes #60`, `Fixes #64` block verbatim and `Fixes #65`. | PR description. |
| #65, requirement 5 | Explicitly identify any already-resolved/non-reproducible request and retain its closing reference. | Rust's 0.22.0 bump was already merged in #61 and C#'s in #63, but current releases and JS/Python parity still required changes. No whole sub-issue was already resolved. | Before manifests and initial failure logs. |
| #59 | Public escaping/quoting helpers. | Expose existing quote/unescape operations in Rust and provide public formatters backed by the existing readable string encoder in every language. Avoid copying the consumer's record-and-strip workaround. | New helper tests exercise public exports. |
| #59 | Single-line and verbatim value modes. | Reuse the existing per-character percent escaping and native quote-delimiter selection. A backslash dialect would require a separate reader and can corrupt literal `\\n`; the selected representation is decoded by the codec itself. | Quotes, real newlines, CRLF, tabs, controls, percent signs, backslashes and Unicode round-trip. Single-line output has no CR/LF. |
| #59 | Optional `serde_json` feature with `From<Value>`/`TryFrom` conversions. | Add an optional feature and owned/borrowed conversions; also expose `json_to_lino`/`lino_to_json`. A JSON string embedded in LiNo would be easy but hide the tree from readers. | Feature-enabled and feature-disabled CI, direct conversion tests, runnable example. |
| #59 | Lossless object key order. | Enable `serde_json/preserve_order` and retain ordered pairs in `LinoValue`. Sorting or unordered maps would lose information. Reject duplicate LiNo keys when converting to JSON. | Compare serialized JSON, not just map equality. |
| #59 | Preserve number textual form. | Enable `serde_json/arbitrary_precision`; add a feature-gated `JsonNumber` variant and explicit number markers in every Rust wire format. Passing through `i64`/`f64` loses large integers, decimal zeros and exponents. | Signed zero, long decimals, huge integers, exponent overflow and property-generated numbers across readable, line and compact forms. |
| #59 | Preserve empty values by default; strip by option. | Add explicit `JsonOptions { strip_empty: true }` and `strip_empty`. Match the consumer's policy: remove nulls and recursively empty arrays/objects, retain `""`, false and zero. An entirely stripped root becomes null; `strip_empty` itself returns `None`. | Default identity and recursive stripping tests. |
| #59 | Property test arbitrary JSON → LiNo → JSON identity; quote/newline values stay on one line and parse unchanged. | Use `proptest` with 512 cases, bounded depth/size and shrinking. Compare serialized JSON after all three representations. Add fixed regressions for generated failures. | Property and helper tests; shared `[null]` conformance regression in all languages. |
| #60, R1 | Update listed dependencies to latest releases and adapt breaking APIs; list adaptations in PR. | Registry research found **0.23.0**, newer than the issue's 0.22.0 target. Pin one parser minor across four ecosystems and refresh experiment crates. | Existing conformance suites and cross-language interop experiment. |
| #60, R2 | Run `cargo update`; dry-run must show no pending update. | Refresh the shipping lockfile and experiment locks; gate lock freshness separately from direct release freshness. | `cargo update --dry-run` and a CI lockfile job. |
| #60, R3 | CI fails if a direct dependency is stale, except a manifest-line comment links an open blocker issue. Include JS freshness checks. | `cargo-outdated` plus `npm outdated` covers Rust/npm but not Python/NuGet or open-issue validation. Select a standard-library registry checker across all four ecosystems, with open-issue exceptions, plus `npm outdated` and Cargo dry-run for resolved versions. | Mocked policy tests cover stale major/minor updates, open vs closed blockers, manifest-line locality, and every ecosystem. Scheduled/PR/main workflow runs real checks. |
| #60, R4 | Publish a release to crates.io and npm where applicable. | Supply Rust changelog and JS Changesets release triggers. Python and C#'s auto-release jobs use manifest versions, so bump those packages to 0.3.0 and include notes/fragments. Existing main-branch CI publishes and verifies registry visibility after merge. Publishing the unmerged PR separately would bypass the repository release process. | Release fragments and local packaging/preflight; registry publication happens after merge and is not claimed as complete before then. |
| #60, test | Latest dependency shared by consumers creates no duplicate parser versions. | Use a fresh example crate depending on the local release candidate and `links-notation` 0.23.0. | `cargo tree -d` and metadata show one parser version. |
| #64 | Update all dependencies and verify CI/CD after Dependabot bumps. | Update direct floors and locked transitives, preserve strict audit checks, use reproducible npm installs, run all four local suites and CI helper tests, then inspect fresh GitHub checks. | Tests, lint, format, packaging, examples, security audits and PR CI. |
| User instructions | Check the entire codebase, research reusable components, reproduce bugs before fixes, preserve logs, prepare releases, keep history, use the prepared branch/PR, finish with clean tree and ready PR. | Search all manifests/implementations, add shared fixtures, keep local logs in `ci-logs/`, document evidence here, commit useful steps and push only the prepared branch. | Final diff, branch/status checks and PR #66. |

## Primary-source research and existing components

- [`serde_json::Value`](https://docs.rs/serde_json/latest/serde_json/enum.Value.html)
  documents ordered maps via `preserve_order`; its
  [feature manifest](https://docs.rs/crate/serde_json/latest/source/Cargo.toml.orig)
  and [number implementation](https://docs.rs/serde_json/latest/src/serde_json/number.rs.html)
  document arbitrary-precision number storage. These existing components avoid
  introducing a bespoke decimal implementation or another map dependency.
  The guarantee starts with the supplied `Value`: the bridge preserves the
  numeric text `Number` exposes. It cannot recover lexical spelling that the
  caller's JSON parser has already normalized, duplicate JSON keys discarded
  during parsing, or original document whitespace.
- [`proptest`](https://proptest-rs.github.io/proptest/proptest/index.html)
  supplies bounded recursive strategies and shrinking. It reduced a real
  round-trip failure to `[null]`; a fixed shared fixture now protects all four
  implementations independently of random generation.
- [`cargo-outdated`](https://github.com/kbknapp/cargo-outdated) supports direct
  dependency checks and nonzero status on updates. It is a reasonable Rust-only
  alternative. The chosen registry checker also covers Python, NuGet, build/dev
  dependencies, actions and pinned CI tools, and validates blocker issues.
- [`npm outdated`](https://docs.npmjs.com/cli/v11/commands/npm-outdated/)
  distinguishes currently installed, wanted and latest versions. It complements
  the cross-registry manifest check with an installed-version check.
- Upstream [`links-notation`](https://github.com/link-foundation/links-notation)
  already supplies the grammar/parser; its
  [releases](https://github.com/link-foundation/links-notation/releases)
  and the npm, sparse Cargo, PyPI and NuGet registry APIs confirmed 0.23.0.
  No replacement parser is needed. The readable codec's quoting is reused.
- Consumer [`links_format.rs`](https://github.com/link-assistant/formal-ai/blob/main/rust/src/links_format.rs)
  and [`json_lino.rs`](https://github.com/link-assistant/formal-ai/blob/main/rust/src/json_lino.rs)
  were inspected through authenticated GitHub API reads. The former explains
  the extra allocation needed to extract a private formatter's output; the
  latter defines recursive null/empty-container stripping. The library exposes
  those general capabilities. Consumer-specific cache projections and its
  separate seed-parser dialect remain consumer concerns.

## Reproductions and breaking changes

The initial PR head was `f8549d3` (2026-10-07 01:09:47 UTC). The failing runs
started at 01:10:00 UTC and checked that exact SHA, so these were current failures:

- `ci-logs/parity-37555723116.log:199` and
  `ci-logs/shared-scripts-37555723025.log:414`: `the checked-in manifests agree
  today` failed. Rust/C# asked for 0.22, JS for 0.20, and Python's floor was 0.16.
- `ci-logs/rust-before.log:128`: upstream 0.22's `parse_lino_to_links` wraps a
  scalar in an anonymous `LiNo::Link`, rather than returning `LiNo::Ref` directly.
  The test now checks the wrapper and the exact reference content. Exported
  parser functions and `LiNo` fields remain available in 0.23; no codec API
  replacement is needed.
- `ci-logs/value-helpers-before.log`: the requested public helper imports failed
  to compile before implementation.
- `ci-logs/null-array-before.log`: `decode(encode_line([null]))` returned null,
  because `(null)` is also a legacy compact document. New output uses
  `(a: null)` for that one ambiguous array; `(null)` continues to decode as
  compact null. Shared fixtures require identical output in every language.
- The initial npm audit reported a high-severity `brace-expansion` and critical
  `shell-quote` vulnerability, plus a moderate `@humanfs/node` vulnerability.
  Refreshing locked transitive dependencies addresses these without weakening
  the security gate.

The optional Rust JSON number markers are a feature-specific extension. Other
languages share value escaping and the existing scalar/container formats;
they do not promise arbitrary-precision `serde_json::Number` interoperability.
The `json-number` object key is quoted in every implementation to prevent a
consumer's ordinary key from being confused with this marker.


## Dependency tooling and release preparation

The new jscpd 5.4.0 reports 5.4% duplication against the unchanged pre-PR tree;
`experiments/issue-65/duplication-baseline.py` reproduces that result with the
installed checker. Its stricter detection surfaced repeated dynamic tool loading,
release CLI options and output writers. Those release commands now share tested
helpers; the existing 4% limit stays in place. Changeset description validation
also uses one error path for a missing delimiter or an empty body.

The source parity gate previously treated C#'s `.csproj` dependency manifest as
library code, so a dependency-only PR could fail without changing any `.cs`
file. A reproducing shared-script test protects the correction; C# source edits
still require matching edits in all languages. Dependabot now uses one weekly
[multi-ecosystem group](https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/secure-your-dependencies/configuring-multi-ecosystem-updates),
including maintained experiment crates, so parser versions can move together.
Dependency PRs must still include the normal release fragments.

The completed initial security run confirms the same npm vulnerabilities at
`ci-logs/security-37555723019.log:4920–4937`. The refreshed npm audit has zero
vulnerabilities. The freshness gate handles CodeQL bundle releases separately
from its action version and has a mocked regression for bundle/prerelease tags.

Final review also reproduced an exception-scope bug: a blocker comment on a dev
dependency excused an uncommented runtime declaration of the same package.
`ci-logs/blocker-scope-before.log` records the failing test. Blocker matching now
consumes each individual declaration, including duplicate requirements, renamed
Cargo dependencies, Python inline arrays, NuGet references and repeated actions.
The regression covers all four applicable declaration formats; exceptions cannot
spread to another line.

Rust and JavaScript retain their manifest versions because their workflows
forbid manual bumps and consume the included minor-release fragments. Python
and C# explicitly bump to 0.3.0 because their auto-release jobs publish an
unpublished manifest version, rather than consuming fragments automatically.
All publication is performed by the existing main-branch release workflows
after merge. No package is claimed as published from this unmerged branch.


## Local verification

- Rust: 125 all-feature tests (including a 512-case bounded JSON property test)
  and 121 tests without the JSON feature; fmt, Clippy with warnings as errors,
  packaging verification, three examples and 22 release-script tests pass.
- JavaScript: 513 tests, ESLint, Prettier, package dry-run and release validation
  pass. jscpd is 3.88%, below the unchanged 4% limit; npm outdated is empty.
- Python: 501 tests with 90% coverage, Ruff, mypy, wheel/sdist build and Twine
  validation pass.
- C#: 522 tests, coverage collection, dotnet format, build with warnings as errors,
  NuGet packing, example and 27 release-script tests pass.
- Shared scripts: 35 Node tests and 9 dependency policy tests pass. actionlint
  validates every workflow. All 134 direct dependency declarations are current.
- Existing cross-language experiment: all 16 writer/reader combinations agree.
  The new consumer probe runs successfully; cargo tree -d reports no duplicate
  dependencies. Cargo dry-run locks zero packages and npm audit reports zero
  vulnerabilities.

The local logs are retained under ignored `ci-logs/`. The property regression
seed, executable experiments and shared fixtures are committed for reproduction.
