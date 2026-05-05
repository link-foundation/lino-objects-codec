# Issue 33 Case Study: CI/CD False-Positive npm Publish and Release Format

Issue: https://github.com/link-foundation/lino-objects-codec/issues/33

PR: https://github.com/link-foundation/lino-objects-codec/pull/34

## Preserved Evidence

The JavaScript release run flagged in the issue was downloaded before any changes were made:

| Language   | Run         | Job                                  | Created              | Conclusion | Evidence                                                |
| ---------- | ----------- | ------------------------------------ | -------------------- | ---------- | ------------------------------------------------------- |
| JavaScript | 25288053638 | Release (job 74135563079)            | 2026-05-03T19:06:37Z | success    | `run-25288053638-js.log`, `run-25288053638-meta.json`   |

## Issue Requirements

The issue listed five concrete CI/CD problems to fix:

1. The JavaScript release run printed visible `##[error]` annotations even though it ended green — a false-positive publish on workflow run `25288053638` / job `74135563079`.
2. The GitHub Release for JavaScript 0.3.5 used title `js-v0.3.5` and tag `js-v0.3.5` — the issue requested `[JavaScript]` prefix in the title and `js_v` prefix in the tag.
3. The Rust release `rust-v0.2.1` had no shields.io badge and the title `Rust 0.2.1` was missing the `[Rust]` prefix.
4. Audit Python and C# pipelines for the same class of bugs and apply the same fixes.
5. Compare with the four AI-driven-development pipeline templates and file upstream issues for shared bugs.

## Findings

### 1. JavaScript false-positive publish (run 25288053638)

The `Publish to npm` step in run `25288053638` ended green at `run-25288053638-js.log:4346`, but the same step printed a GitHub Actions `##[error]` annotation at `run-25288053638-js.log:4321` and triggered an outer retry at `run-25288053638-js.log:4322`. That is exactly the visual contradiction the issue asks to fix.

The sequence of events in the log is:

- `run-25288053638-js.log:4283` — `Publish attempt 1 of 3...`
- `run-25288053638-js.log:4292-4295` — Changesets reports `🦋 success packages published successfully: lino-objects-codec@0.3.5` and creates the local tag `v0.3.5`.
- `run-25288053638-js.log:4311` — wrapper prints `Verifying package was published to npm...` and runs `npm view ... version` after the existing 2-second sleep.
- `run-25288053638-js.log:4313-4320` — npm registry view returns `E404 No match found for version 0.3.5`. This is registry CDN propagation lag, not a publish failure.
- `run-25288053638-js.log:4321` — wrapper prints `##[error]lino-objects-codec@0.3.5 is not on npm after publish.` even though the publish itself succeeded.
- `run-25288053638-js.log:4322` — wrapper triggers the outer retry (`waiting 10s before retry`).
- `run-25288053638-js.log:4323` — `Publish attempt 2 of 3...` re-runs `npm run changeset:publish`.
- `run-25288053638-js.log:4330-4331` — Changesets answers `lino-objects-codec is not being published because version 0.3.5 is already published on npm`. This proves the first attempt had actually succeeded.
- `run-25288053638-js.log:4343-4346` — second verification finds `0.3.5` and the wrapper prints `✅ Published lino-objects-codec@0.3.5 to npm`.

Root cause: `js/scripts/publish-to-npm.mjs` had a single `sleep(2000)` followed by one `npm view` check. The npm registry CDN sometimes has more than two seconds of propagation lag for OIDC/trusted-publisher publishes, so the verification fails, the outer retry re-runs `changeset publish`, and the `##[error]` annotation is preserved in the run summary even after the retry succeeds.

### 2. JavaScript GitHub Release title and tag

The release object created by the same run is captured at `run-25288053638-js.log:4356`. Its key fields are `tag_name: js-v0.3.5`, `name: js-v0.3.5`, and `html_url: .../releases/tag/js-v0.3.5`. The release notes block is printed at `run-25288053638-js.log:4370` and contains:

```
[![npm version](https://img.shields.io/badge/npm-js-v0.3.5-blue.svg)](https://www.npmjs.com/package/lino-objects-codec/v/js-v0.3.5)
```

That is two bugs:

- The release `name` was set to the tag (`js-v0.3.5`) instead of a human-readable title. The release-creation script wrote `name: tag` directly.
- The badge formatter stripped only a leading `v` (`replace(/^v/, '')`), so the language prefix `js-` survived. The shields.io URL therefore embeds `js-v0.3.5` as the version, which is invalid; the npm `/v/js-v0.3.5` link is also broken.

### 3. Rust GitHub Release title and badge

The Rust release `rust-v0.2.1` has `tag_name: rust-v0.2.1`, `name: Rust 0.2.1` (no `[Rust]` prefix), and the body has no shields.io badge at all. The previous Rust release-creation script set `name: \`Rust ${version}\`` and never appended a badge.

### 4. Python and C#

Audit results:

- Python and C# release-creation scripts had no `[Language]` prefix in titles, no shields.io badges, and used `python-v` / `csharp-v` tag prefixes instead of `python_v` / `csharp_v` requested by the issue.
- C# `csharp/scripts/create-github-release.mjs` did not check the `gh api` exit code at all. This is the same false-positive pattern that issue 31 fixed in the Rust script. A 422 `already_exists` from the GitHub Releases API would have been silently ignored.
- C# workflow `csharp.yml` had no NuGet-side propagation verification step between `dotnet nuget push` and `Create GitHub Release`. C# is the only language whose publish step had no registry verification at all.

### 5. Tag prefix convention

The four workflows used `js-v`, `rust-v`, `python-v`, `csharp-v`. The issue asked for `js_v`, `rust_v`, `python_v`, `csharp_v`. The underscore-style prefix is also more compatible with the shields.io segment encoding rules (a literal `-` becomes `--` after encoding, so language-prefix collisions are easier to avoid with `_`).

## Solutions

### Shared release-format helper

Each language gained a small helper module that defines the same four operations:

- `normalizeReleaseVersionForBadge` strips any `lang-`, `lang_`, or bare `v` prefix and returns a clean SemVer that is safe to drop into a badge URL or a `pkg/v/X.Y.Z` link. Pre-release and build metadata (`-beta.1`, `+build.7`) survive.
- `encodeShieldsStaticBadgeSegment` URL-encodes the value and applies the shields.io static-badge escape rules (`-` → `--`, `_` → `__`).
- `build<Registry>VersionBadge(packageName, releaseVersion)` returns the full Markdown badge for npm, crates.io, NuGet, or PyPI.
- `buildReleaseTitle(language, releaseVersion)` returns `[Language] X.Y.Z`. `buildReleaseTag(prefix, version)` joins `lang_v` with the bare semver and is idempotent.

Files:

- `js/scripts/release-format-helpers.mjs` and `js/tests/test_release_format_helpers.test.js` (11 tests).
- `rust/scripts/release-format-helpers.mjs` and `rust/scripts/release-format-helpers.test.mjs` (4 tests).
- `csharp/scripts/release-format-helpers.mjs` and `csharp/scripts/release-format-helpers.test.mjs` (5 tests).
- `python/scripts/create_github_release.py` (helpers inline) and `python/tests/test_create_github_release_helpers.py` (4 tests).

### npm publish verification with retry

`js/scripts/publish-to-npm.mjs` now has `verifyPublishedWithRetry(packageName, currentVersion)` which runs `npm view` up to five times with exponential backoff (3s, 6s, 12s, 24s, 30s capped). The outer attempt loop also pre-checks the registry before re-running `changeset publish`, so a propagation lag never re-runs publish. This addresses the root cause of the run-25288053638 false positive.

### Release-creation scripts

All four `create-github-release` scripts now:

- Default `--tag-prefix` to `lang_v`, default `--language` to the language name, and accept optional `--package-name` / `--crate-name`.
- Use the helper functions to build the title `[Language] X.Y.Z`, the tag `lang_v0.3.5`, and the registry badge.
- Append the badge to the release body if the body does not already contain `img.shields.io`.
- Inspect the `gh api` (or `gh release create`) exit code, treat `already_exists` as idempotent, and otherwise fail the workflow.

The C# script previously had no exit-code check at all; this was the same kind of false-positive risk that issue 31 fixed in Rust. It now inspects the `gh release create` exit code, walks `.csproj` files to discover `<PackageId>` / `<AssemblyName>`, and appends a NuGet badge.

### NuGet verification step in `csharp.yml`

A new `Verify package on NuGet` step was added between `dotnet nuget push` and `Create GitHub Release`. It polls `https://api.nuget.org/v3-flatcontainer/<id>/<ver>/<id>.nuspec` up to six times with 10s gaps, fails the workflow on persistent non-200, and only then proceeds to release creation. This brings C# in line with the registry-verification pattern that the other three languages already had.

### Workflow updates

- `.github/workflows/js.yml` — `--tag-prefix "js-v"` replaced with `--tag-prefix "js_v" --language "JavaScript"`.
- `.github/workflows/rust.yml` — `--tag-prefix "rust-v"` replaced with `--tag-prefix "rust_v" --language "Rust"`.
- `.github/workflows/python.yml` — `--tag-prefix "python-v"` replaced with `--tag-prefix "python_v" --language "Python"`.
- `.github/workflows/csharp.yml` — `--tag-prefix "csharp-v"` replaced with `--tag-prefix "csharp_v" --language "C#"`, and the new NuGet verification step added.

### `format-release-notes.mjs`

`js/scripts/format-release-notes.mjs` previously did `version.replace(/^v/, '')` and embedded the result into a hand-written badge URL — that produced the broken `npm-js-v0.3.5-blue.svg` badge in the 0.3.5 release. It now calls `normalizeReleaseVersionForBadge` and `buildNpmVersionBadge` from the shared helper.

## Template Comparison

The four `*-ai-driven-development-pipeline-template` repositories share most of the release-related code with this repository.

- `js-ai-driven-development-pipeline-template`: the badge formatter is already correct (the template has `scripts/format-release-notes-helpers.mjs` with `normalizeReleaseVersionForBadge`). However, `scripts/create-github-release.mjs:82-83` still sets `tag_name: tag, name: tag`, so multi-language consumers using `--tag-prefix "js-v"` get a release title like `js-v0.3.5`. That is the bug observed in run `25288053638`.
- `rust-ai-driven-development-pipeline-template`: `scripts/create-github-release.rs:166-173` builds the release name as `format!("{}{}", tag_prefix, version)`, so multi-language consumers get titles like `rust-v0.2.1`. The crates.io badge is already appended (line 153), so badges are not the gap here — only the `[Rust]` prefix is.
- `python-ai-driven-development-pipeline-template`: `scripts/create_github_release.py:78-93` builds `tag = f"v{version}"` and passes `--title tag`. There is no `--tag-prefix` or `--language` argument, so multi-language consumers cannot produce `[Python] 1.2.3` titles or `python_v1.2.3` tags. There is no PyPI badge appended in this script (only `format_release_notes.py` adds one).
- `csharp-ai-driven-development-pipeline-template`: `scripts/create-github-release.mjs:67-68` sets `tag_name: tag, name: \`v${version}\``. The script does catch `already exists` errors (better than the local C# script before this PR), but it has no `--tag-prefix` / `--language` / `--package-id` arguments, no NuGet badge, and the workflow has no NuGet propagation verification step.

The upstream template-issue cross-links are listed under "Upstream Follow-Up" below.

## Verification

Test counts after the changes:

- JavaScript: `npm test` — 160 pass (includes the 11 new release-format helper tests).
- Rust: `node --test rust/scripts/*.test.mjs` — 12 pass (includes the 4 new helper tests).
- C#: `node --test csharp/scripts/*.test.mjs` — 5 pass (all from this PR).
- Python: `pytest tests/test_create_github_release_helpers.py` — 4 pass.

Targeted reproduction-style assertions (from the new tests):

- `normalizeReleaseVersionForBadge('js-v0.3.5') === '0.3.5'` — fixes the embedded `js-v` in the 0.3.5 badge.
- `buildNpmVersionBadge('lino-objects-codec', 'js-v0.3.5')` does not contain `js-v` and links to `/v/0.3.5` — fixes the broken `/v/js-v0.3.5` link.
- `buildReleaseTitle('JavaScript', 'js-v0.3.5') === '[JavaScript] 0.3.5'` — fixes the `name: tag` bug.
- `buildReleaseTag('js_v', '0.3.5') === 'js_v0.3.5'` — confirms the new tag prefix convention.

## Remaining Operator Configuration

The same registry trust settings called out in issue 31 still apply; this PR is purely about workflow honesty and release format. No registry credentials or trusted-publisher configuration is changed.

## Upstream Follow-Up

Issues filed in the four template repositories tracking the shared bugs:

- `js-ai-driven-development-pipeline-template` — release name set to tag value: https://github.com/link-foundation/js-ai-driven-development-pipeline-template/issues/52
- `rust-ai-driven-development-pipeline-template` — release name carries `tag_prefix`, missing `[Rust]` prefix: https://github.com/link-foundation/rust-ai-driven-development-pipeline-template/issues/44
- `python-ai-driven-development-pipeline-template` — release title is bare `v${version}`, no `--language` / `--tag-prefix` arguments, no PyPI badge: https://github.com/link-foundation/python-ai-driven-development-pipeline-template/issues/6
- `csharp-ai-driven-development-pipeline-template` — release name set to `v${version}`, no NuGet badge, workflow has no NuGet propagation verification: https://github.com/link-foundation/csharp-ai-driven-development-pipeline-template/issues/5
