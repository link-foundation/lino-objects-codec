# Case Study — Issue #39: "Apply it to all languages and docs"

- **Issue:** [#39](https://github.com/link-foundation/lino-objects-codec/issues/39)
  (bug), opened 2026-08-20T06:09:11Z by @konard
- **Pull request:** [#40](https://github.com/link-foundation/lino-objects-codec/pull/40)
  on branch `issue-39-e53c893293ed`
- **Predecessor:** [#37](https://github.com/link-foundation/lino-objects-codec/issues/37)
  → [PR #38](https://github.com/link-foundation/lino-objects-codec/pull/38)
  (readable format, **Rust only**)
- **Raw data:** [`./data`](./data) (issue/PR JSON, PR #38 diff, CI run logs, the
  preserved `links-notation` parser-bug note)

This document reconstructs the sequence of events, enumerates every requirement in
the issue, gives the root cause of each problem, and records the solution applied
(or recommended) for each — including a full comparison against the four CI/CD
pipeline templates and a survey of the existing components reused.

---

## 1. Timeline / sequence of events

| When (UTC) | Event |
|---|---|
| 2026-08-20 03:03 | Issue **#37** filed: `encode()` base64-encodes every string on one line, so `.lino` files are not human-readable; the readable formatter already exists but is not the default. |
| 2026-08-20 05:47 | **PR #38** merged: `feat(rust): make readable indented Links Notation the default encoding`. Touches **only** `rust/` (plus a shared `README.md` and Rust experiments). Ships as Rust `v0.3.0`. |
| 2026-08-20 06:09 | Issue **#39** filed: PR #38 applied the change to Rust only — apply it to **all languages and docs**, make CI fail when languages drift, reuse template best practices, produce a case study, and report any related upstream issues. |
| 2026-08-20 06:10 | **PR #40** opened `[WIP]` for branch `issue-39-e53c893293ed`. |
| 2026-08-20 06:xx | Investigation: data downloaded into `docs/case-studies/issue-39/data/`; readable format ported to JS, Python and C#; shared conformance fixtures created; a cross-language compact-format boolean interop defect found and fixed; language-parity CI gate added; docs updated; release fragments added; a latent Rust changelog-check bug found and fixed. |

**Why PR #38 was Rust-only.** Issue #37 was scoped to the symptom the author hit
in Rust (`encode()` output), and PR #38 fixed it there. The four language
implementations live in one monorepo but each has its own CI workflow gated by a
`paths:` filter (`rust/**`, `js/**`, …). Nothing in the pipeline required the
other three languages to move together, so a single-language change was normal and
CI-green. Issue #39 is the direct consequence: bring the other three languages up
to parity **and remove the structural reason the drift was possible.**

---

## 2. Requirements (verbatim decomposition)

The issue body contains seven distinct requirements:

1. **Apply the readable format to all languages and docs.** PR #38 changed only
   Rust; JavaScript, Python and C# must default to the same readable indented
   Links Notation, and the documentation must match.
2. **Make single-language changes fail CI.** "any changes in code for single
   language without change in all of them will fail the CI/CD on pull requests. So
   all languages are always updated at the same time."
3. **Reuse best practices from the four CI/CD templates** (`js`, `rust`, `python`,
   `csharp` `-ai-driven-development-pipeline-template`); compare the full file tree
   of GitHub workflow / CI scripts; **if the same issue exists in a template,
   report it there too.**
4. **Download the issue data and write a deep case study** under
   `./docs/case-studies/issue-{id}`: timeline, requirement list, root causes,
   solution plans, and a survey of existing components — plus online research.
5. **If data is insufficient for a root cause, add debug output / verbose mode** so
   the next iteration can find it.
6. **Report issues to any related repository** with reproducible examples,
   workarounds and fix suggestions; **fully apply fixes everywhere** a problem
   appears (not just one spot).
7. **Do it all in this single PR**, iterating until every requirement is done.

---

## 3. Root cause and solution per requirement

### R1 — Readable format in all languages + docs

- **Root cause.** The readable formatter (`readable.rs`) and the "readable is the
  default" wiring existed only in Rust after PR #38. JavaScript, Python and C# had
  no `readable.*` module and still defaulted `encode()` to the compact,
  base64-per-string single-line form.
- **Solution.** Ported the readable format to the other three languages as the
  default of `encode`/`decode` (`js/src/readable.js`,
  `python/src/link_notation_objects_codec/readable.py`,
  `csharp/src/Lino.Objects.Codec/Readable.cs`). The default now emits one `( )`
  construct for objects and arrays at every level; `key value` lines form objects,
  bare-value lines form arrays; strings are quoted, numbers / `true` / `false` /
  `null` are bare, `NaN`/`Infinity`/`-Infinity` are written literally, empty array
  is `()`, empty object is `(`+newline+`)`, and only values containing control
  characters are marked individually as `(base64 "…")`.
  - **Cross-language guarantee.** A shared, language-agnostic fixture set —
    [`fixtures/readable-format/cases.json`](../../../fixtures/readable-format/cases.json)
    (39 cases, tagged value encoding, per-language `skip` map) — is executed by a
    conformance harness in every language (`readable_conformance.rs`,
    `test_readable_conformance.*`, `ReadableConformanceTests.cs`). It asserts each
    case **encodes to byte-identical text** and **decodes back** in all four
    implementations. This is what makes "applied to all languages" machine-checked
    rather than a claim.
  - **Docs.** All five READMEs (root + four languages) were updated: the misleading
    "UTF-8 support using base64 encoding" claim removed; an Output Formats table,
    the `(base64 "…")` marker, readable-vs-compact "How It Works", the
    cycle/identity rule, and a Debugging section added.

### R2 — Single-language changes must fail CI

- **Root cause.** Each language's workflow uses a `paths:` filter, so a PR that
  touches only `rust/**` runs only the Rust workflow. **No** job observed the whole
  tree, so nothing could notice that the other three languages had not moved. That
  is exactly how PR #38 stayed green while changing one language.
- **Solution.** Added a dedicated **parity gate** that has *no* `paths:` filter and
  therefore always runs:
  - [`scripts/check-language-parity.mjs`](../../../scripts/check-language-parity.mjs)
    computes which languages changed (by matching the PR diff against each
    language's `src/` prefix) and fails unless the count is 0 or all 4.
  - [`.github/workflows/parity.yml`](../../../.github/workflows/parity.yml) runs the
    helper's own unit tests
    ([`check-language-parity.test.mjs`](../../../scripts/check-language-parity.test.mjs))
    and then the gate, on every PR.
  - An intentional single-language change opts out with `[skip-parity]` in the PR
    title or body — an explicit, reviewable escape hatch rather than a silent one.

### R3 — Reuse best practices from the templates

- **Findings.** See §4 for the full file-tree comparison. Concrete outcomes:
  - Adopted the templates' workflow hygiene into the new parity workflow:
    top-level least-privilege `permissions: contents: read`, `timeout-minutes`, and
    a `concurrency` group.
  - Documented (with ready-to-use YAML) the templates' `security.yml`
    (CodeQL + dependency-review) and `links.yml` (link checker) as recommended
    follow-ups; they are intentionally **not** merged here because they require
    repository code-scanning settings that cannot be verified from the PR and would
    risk first-run CI failures — which would contradict this issue's own "so we
    don't have more CI/CD errors in the future" goal.
  - **No spurious template issue was filed.** The one CI bug found (see R6, the
    Rust changelog check) is specific to *this* repository's monorepo adaptation of
    a template script; the templates are single-language repos where the same code
    is correct, so there is nothing to report upstream for it.

### R4 — Case study

- This document, plus [`./data`](./data). Online research is summarized in §5.

### R5 — Debug output / verbose mode

- **Root cause of the gap.** The codec had no tracing, so a cross-language
  discrepancy could only be chased by hand.
- **Solution.** Added opt-in tracing to all four languages, off by default, enabled
  by the `LINO_CODEC_DEBUG` environment variable (`1`, `true`, `yes`, `on`) or from
  code (`set_debug_enabled` / `setDebugEnabled` / `CodecDebug.SetEnabled` /
  `debug::set_debug_enabled`). Trace lines go to stderr prefixed `[lino-codec]`.
  This is what made the R6 boolean-interop defect quick to localize.

### R6 — Report/fix related issues everywhere they appear

Two distinct defects were found; both were fixed in **all** affected languages.

1. **Compact-format boolean interop (found during this work, fixed in-repo).**
   - **Failure.** JS/Rust wrote `(bool true)`; Python/C# wrote `(bool True)`. Each
     decoder accepted only its own spelling, so a compact document written by one
     language decoded to the wrong boolean in another (e.g. Python reading
     `(bool true)` returned `False`).
   - **Fix.** All encoders now write lowercase `true`/`false`; all decoders compare
     case-insensitively. Regression tests added in every language
     (`*compact_interop*`).
2. **`links-notation` parser bug (upstream, already fixed upstream).**
   - A nested `(id: …)` definition is mis-parsed by the Python `links-notation`
     parser (reproduced on **0.11.2**, the version Python pins). Details, minimal
     reproduction, workaround and status are preserved in
     [`data/links-notation-parser-bug.md`](./data/links-notation-parser-bug.md).
   - **Why no upstream issue was filed:** the bug is **already fixed in
     `links-notation` 0.14.0**, and this repository already works around it (the
     compact encoder emits sibling `obj_N` definitions instead of nesting them, and
     the readable default never uses `(id: …)` at all). The recommended follow-up —
     bumping the Python/JS pins to 0.14.0 — is a separate dependency upgrade, noted
     but deliberately kept out of this format-focused PR.

### R7 — Single PR

- All work landed on `issue-39-e53c893293ed` / PR #40 as atomic commits.

---

## 4. Template file-tree comparison (R3)

The four templates are **single-language** repos; this project is a **monorepo**
that consolidates each language's CI + release into one workflow
(`.github/workflows/{js,rust,python,csharp}.yml`) plus the new `parity.yml`.

| Template workflow | Present in every template | In this repo? | Decision |
|---|---|---|---|
| `links.yml` (link checker) | yes | no | Documented as a recommended follow-up (risk of failing on pre-existing links). |
| `security.yml` (CodeQL + dependency-review) | yes | no | Documented as a recommended follow-up; needs repo code-scanning settings. |
| `release.yml` | yes | folded into each language workflow | No change — this repo's layout differs by design. |
| `docs.yml` | python, csharp | no | Out of scope. |

**Hygiene adopted now** (from the templates' `security.yml`): least-privilege
top-level `permissions`, `timeout-minutes`, and `concurrency` groups on the parity
workflow.

**Recommended `security.yml` (adapted for the monorepo).** A CodeQL matrix over
`javascript-typescript`, `python`, `csharp` and `actions` plus
`dependency-review-action` on PRs, with `permissions: contents: read` at the top
and `security-events: write` only on the CodeQL job. It is not merged here because
enabling code scanning is a repository-settings action that must accompany the
workflow; merging the workflow alone can produce red CI on the first run.

---

## 5. Online research and existing components reused (R4)

Rather than build machinery from scratch, the solution reuses established
components; the online research below confirmed the idiomatic choice in each
language:

- **Release automation.** [Changesets](https://github.com/changesets/changesets)
  for JS and C#; [scriv](https://scriv.readthedocs.io/) fragments for Python; the
  repo's own `changelog.d` fragment convention for Rust. This PR adds one release
  fragment per language so the merge produces coordinated version bumps without any
  hand-edited version string (hand-edits are actively blocked by
  `rust/scripts/check-version-modification.mjs`).
- **JSON handling in the conformance harness.** `serde_json` (Rust),
  `System.Text.Json` (C#), and the built-in `json` (Python) / `JSON` (JS) — no new
  parser was written; the fixtures are ordinary JSON with a small tagged encoding
  so key order and number types survive.
- **Base64.** Each language's standard/base library (`base64` crate, `Convert`
  in .NET, `base64` in Python, `Buffer`/`btoa` in JS) for the `(base64 "…")` marker.
- **Security scanning.** [CodeQL](https://codeql.github.com/) and
  [dependency-review-action](https://github.com/actions/dependency-review-action),
  exactly as the templates use them.
- **The Links Notation parser** itself — [`links-notation`](https://github.com/link-foundation/links-notation)
  — underpins the compact format; the readable format is a plain indented tree and
  does not depend on the parser's `(id: …)` self-reference feature.

---

## 6. Verification summary

At the time of writing, all four language suites are green with the changes:

- **Python:** `ruff check` / `ruff format --check` clean, `mypy` clean, 162 tests.
- **JavaScript:** `npm run check` clean, 244 tests.
- **Rust:** `cargo fmt --check` / `clippy` clean, 78 tests + 7 doctests, example
  runs; the parity and changelog scripts have their own passing unit tests.
- **C#:** `dotnet format --verify-no-changes` clean, `build /warnaserror` clean,
  171 tests.
- **Cross-language:** the 39 shared readable-format fixtures pass unchanged in all
  four languages; the parity gate reports this branch as balanced.
