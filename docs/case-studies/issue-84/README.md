# Issue #84: the Links Notation 0.31 migration never reached crates.io

[Issue #84](https://github.com/link-foundation/lino-objects-codec/issues/84)
reports that crates.io's newest `lino-objects-codec` is 0.9.3. Its published
dependency is `links-notation ^0.27.1`, while `main` already requires 0.31.x
(merged in [PR #82](https://github.com/link-foundation/lino-objects-codec/pull/82)
for issue #81). Downstream crates such as
[lino-i18n#44](https://github.com/link-foundation/lino-i18n/pull/44) therefore
have to carry a second, older parser. The work is in
[PR #85](https://github.com/link-foundation/lino-objects-codec/pull/85).

## Evidence (collected 2026-11-14)

| Fact                                                     | Source                                                                                     |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Newest crates.io version is 0.9.3 (2026-10-29)           | `GET https://crates.io/api/v1/crates/lino-objects-codec/versions`                          |
| 0.9.3 requires `links-notation ^0.27.1`                  | `GET .../lino-objects-codec/0.9.3/dependencies`; `experiments/issue-84/verify-0.9.3-*.log` |
| `main` has `version = "0.9.3"`, `links-notation 0.31.3`  | `rust/Cargo.toml` at `229548c`                                                             |
| `rust/changelog.d/20261109_..._0_31_3.md` was unreleased | Present on `main`; the auto-release job deletes fragments when it releases them            |
| Latest `links-notation` on crates.io is now 0.31.4       | Published 2026-11-14 (`rust_0.31.4` release in link-foundation/links-notation)             |

## Root cause

The push that merged PR #82 started
[Rust CI/CD run 42662099641](https://github.com/link-foundation/lino-objects-codec/actions/runs/42662099641)
on `332cabc`. Its jobs ended like this:

| Job                         | Result    |
| --------------------------- | --------- |
| Lint and Format Check       | success   |
| Test (Rust on ubuntu-24.04) | success   |
| Test (Rust on windows-2025) | success   |
| Test (Rust on macos-15)     | cancelled |
| Build Package               | skipped   |
| Auto Release                | skipped   |

The macOS job has no steps. Its check-run annotations say:

> The job was not acquired by Runner of type hosted even after multiple attempts
>
> Due to capacity constraints, jobs targeting macOS arm64 runners may experience
> longer queue times.

`build` requires `needs.test.result == 'success'`, and `auto-release` requires
`needs.build.result == 'success'`. An infrastructure cancellation in one test
leg therefore skipped the release. Nothing failed in the code. Release state
lives in the changelog fragment on `main` (`get-bump-type.mjs` sees it on every
run), so the release was only waiting for the next green push touching
`rust/**`. No such push came: the next commit on `main` (`229548c`, the JS
0.9.6 release) did not touch `rust/`. The red run gave no hint that a crates.io
release was owed.

Re-uploading 0.9.3 is impossible: crates.io versions are immutable. The fix is
a new version, which the pipeline makes from the changelog fragments.

## What this pull request changes

1. **Triggers the release.** The PR touches `rust/**`, so merging it runs Auto
   Release on `main`. The pipeline collects both patch fragments (issue #81 and
   issue #84), bumps `rust/Cargo.toml` from 0.9.3 to **0.9.4**, publishes,
   tags `rust_v0.9.4` and creates the GitHub release. The version is not edited
   by hand: `check-version-modification.mjs` rejects manual version changes in
   pull requests by design. The fragment is the release trigger.
2. **Uses the latest parser.** `links-notation` 0.31.4 came out on 2026-11-14,
   after the issue was filed. The dependency freshness gate fails every pull
   request with an outdated direct dependency, so all four packages were moved
   to the newest releases, the same way as in #81: Rust 0.31.4 (plus the four
   experiment consumers and lockfiles), JS `^0.31.4`, Python
   `>=0.31.4,<0.32.0`. C# stays on 0.31.1, the latest on NuGet. The tool pins
   the gate flags were refreshed too (ESLint, Prettier, Ruff,
   `Microsoft.NET.Test.Sdk`, `peter-evans/create-pull-request` v8.1.3).
3. **Post-publish check of the registry metadata**
   (`rust/scripts/verify-published-crate.mjs`, run by both release jobs after
   the GitHub release):
   - reads `GET /api/v1/crates/<name>/<version>/dependencies` and compares every
     dependency (normal, dev, build) with `Cargo.toml`: same requirement
     (`0.31.4` in the manifest is `^0.31.4` on the registry), same `optional`
     flag, nothing missing, nothing extra;
   - builds a fresh consumer crate with `lino-objects-codec = "=<version>"` from
     crates.io. The consumer round-trips an object through `encode`/`decode`,
     and `cargo tree` must resolve every normal dependency to a version that
     satisfies the manifest requirement. This is the issue's reproduction run
     against the real artifact.
   - The pure parts (manifest parsing, requirement normalization, comparison,
     caret matching, `cargo tree` parsing) are unit-tested in
     `rust/scripts/crates-release-helpers.test.mjs`, which the Lint job runs.
4. **Release Pending Check.** When a push to `main` leaves changelog
   fragments unreleased because Test or Build Package did not succeed, a new job
   fails with an explicit error. The error lists the fragments and gives the two
   ways to finish: "Re-run failed jobs" for infrastructure failures, or
   `gh workflow run rust.yml --ref main -f release_mode=instant -f bump_type=patch`.

## Verification

- Round-trip and conformance tests: `cargo test --all-features` passes against
  `links-notation` 0.31.4, including the shared `fixtures/`
  (`readable_conformance.rs`, `compact_interop.rs`, `indented_multiline.rs`,
  `documented_examples.rs` and the proptest JSON bridge). JS (`npm test`),
  Python (`pytest`, 536 passed) and C# (`dotnet test`) also pass against the
  new pins.
- The new script against the live registry:
  - `verify-published-crate.mjs --manifest <0.9.3 Cargo.toml> --consumer`
    passes. The consumer resolves `links-notation v0.27.1` and round-trips, so
    the check accepts a correct release.
  - `verify-published-crate.mjs --version 0.9.3 --consumer` with the current
    manifest fails with
    `links-notation (normal): crates.io has ^0.27.1, expected ^0.31.4`. That is
    exactly the defect in this issue.
  - Reproduce with `bash experiments/issue-84/reproduce.sh [version]`.
- `actionlint` 1.7.12 (Docker image with shellcheck) and `zizmor` 1.32.0
  (regular and pedantic passes) report nothing for the changed workflow.

## After merge

The publication itself can only happen on `main`, after this PR is merged.
Check the Auto Release job of the merge run. Its last step prints the
dependencies crates.io serves for 0.9.4 and the `links-notation` version the
consumer resolved. If the macOS runner is unavailable again, the Release
Pending Check job says how to finish the release.
