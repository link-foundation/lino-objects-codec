# Case Study: False-Positive Releases, Missing Per-Language Releases, and Unhelpful Credential Errors

**Issue:** [#29](https://github.com/link-foundation/lino-objects-codec/issues/29)
**Pull Request:** [#30](https://github.com/link-foundation/lino-objects-codec/pull/30)
**Date Investigated:** 2026-05-03
**Branch:** `issue-29-7f70f0d87db9`

## Executive Summary

After [issue #25](../issue-25/README.md) fixed silent skips by switching the registry probe from
local git tags to live HTTP queries, three new classes of failure surfaced:

1. **False-positive npm publish.** `js/scripts/publish-to-npm.mjs` reported
   `✅ Published my-package@0.3.3 to npm` in green, even though the underlying
   `npm run changeset:publish` step printed `error: packages failed to publish` and
   `E404 Not Found - PUT https://registry.npmjs.org/lino-objects-codec`. Two independent bugs
   conspired:

   - The script's hardcoded `PACKAGE_NAME` constant was the template default `'my-package'` rather
     than `lino-objects-codec`, so the existence check (`npm view 'my-package@0.3.3'`) returned
     E404 unconditionally and the script always proceeded to "publish".
   - Inside the retry loop, `await $\`npm run changeset:publish\`` did not throw on changeset's
     internal failure — `changeset publish` exits 0 even when individual packages fail — and there
     was no output-pattern detection to catch `error occurred while publishing` /
     `packages failed to publish`. The code reached the success branch and emitted the green check
     mark.

   Net effect: npm has `lino-objects-codec@0.3.1` as the latest published version, but two GitHub
   releases `v0.3.2` and `v0.3.3` exist as if the upload had succeeded, and the badge in the README
   over-states what is actually installable.

2. **No per-language GitHub releases for JS.** All JS releases are tagged `v<X.Y.Z>` with no
   language prefix, while Rust uses `rust-v<X.Y.Z>` and C# uses `csharp-v<X.Y.Z>`. Python releases
   never made it past the failing PyPI step, so the prefix has never been exercised. Because tags
   collide on the unprefixed form, only one language can ever own `v*.*.*`, and that has been JS by
   default. The README has no badge anchored to per-language tags either.

3. **Unhelpful credential errors.** When `NUGET_API_KEY` is missing the C# `Auto Release` job
   prints a single line and exits 1 — accurate, but the user has no recipe for recovery. Python's
   `pypa/gh-action-pypi-publish@release/v1` on `invalid-publisher` dumps a 30-line stack trace
   pointing to the trusted publisher exchange, but does not say which form to fill in or that the
   project name on PyPI must already exist before trusted publishing works for *new* packages.
   Rust's guard on `CARGO_REGISTRY_TOKEN` is similar to C#'s. None of these point to a runbook.

This case study reconstructs the timeline, captures evidence, files the root causes, and proposes
the fixes implemented in the same PR. The repository case study from issue #25 is the immediate
predecessor — the failures here are the *next layer* of problems, exposed only after silent skips
were removed.

## Verified state (snapshot 2026-05-03)

Live registry probes captured in `registry-presence.txt` and `registry-npm.txt`:

| Language | Registry  | Package id              | Latest published | Local version | HTTP probe          |
|----------|-----------|-------------------------|------------------|---------------|---------------------|
| JS       | npm       | `lino-objects-codec`    | **0.3.1**        | 0.3.3         | `0.3.1` 200, `0.3.2` 404, `0.3.3` 404 |
| Rust     | crates.io | `lino-objects-codec`    | 0.2.0            | 0.2.0         | 200                 |
| Python   | PyPI      | `lino-objects-codec`    | *not found*      | 0.2.0         | 404                 |
| C#       | NuGet     | `Lino.Objects.Codec`    | *not found*      | 0.2.0         | 404                 |

GitHub releases (`gh release list`):

```
0.3.3            v0.3.3          2026-05-03   <- false positive (no npm)
0.3.2            v0.3.2          2026-05-03   <- false positive (no npm)
C# 0.2.0         csharp-v0.2.0   2026-01-08
Rust 0.2.0       rust-v0.2.0     2026-01-08
0.3.1            v0.3.1          2026-01-08   <- last real npm release
0.3.0            v0.3.0          2026-01-08
0.1.1            v0.1.1          2025-12-21
```

## Timeline of events

| When (UTC)       | Event                                                                                                                         | Run id        |
|------------------|-------------------------------------------------------------------------------------------------------------------------------|---------------|
| 2026-01-08 18:50 | Last verifiable npm publish: `lino-objects-codec@0.3.1` lands on the registry, GitHub release `v0.3.1` is created.            | -             |
| 2026-01-08 19:22 | Rust `0.2.0` and C# `0.2.0` releases tagged with language prefixes. Both registries confirmed (`rust-v0.2.0`, `csharp-v0.2.0`). | -             |
| 2026-05-03 12:40 | Issue #25 work merged. Python and C# `Auto Release` jobs now correctly fail when their credentials are missing.               | 25279435247, 25279435356 |
| 2026-05-03 12:42 | Same push: JS `Auto Release` advertises `✅ Published 0.3.2 to npm` while `changeset publish` actually emitted E404.            | -             |
| 2026-05-03 13:38 | Next push to `main`. JS run again reports `✅ Published my-package@0.3.3 to npm` despite changeset E404.                       | 25280681547   |
| 2026-05-03 13:38 | Python run fails with `Trusted publishing exchange failure: invalid-publisher`. C# run fails with `NUGET_API_KEY is not set`. | 25280681545   |

Captured run JSON: `run-25280681547-js-falsepositive.json`, `run-25280681545-python-failure.json`,
`run-25279435356-csharp-failure.json`.

Captured raw logs: `run-*-js.log`, `run-*-python.log`, `run-*-csharp.log`.

### Smoking gun in the JS log

`run-25280681547-js.log` line 4178:

```
🦋  error an error occurred while publishing lino-objects-codec: E404 Not Found - PUT https://registry.npmjs.org/lino-objects-codec - Not found
...
🦋  error packages failed to publish:
...
✅ Published my-package@0.3.3 to npm
```

The script logs success two lines after the changeset emitted the explicit failure markers.

## Issue requirements (extracted)

1. Per-language READMEs in `js/`, `rust/`, `python/`, `csharp/` with badges for the latest package
   version on each registry.
2. Update root `README.md` with badges for **all** language versions, each linking to the
   relevant package registry.
3. Per-language GitHub releases with language-prefixed tags
   (`js-v*`, `rust-v*`, `python-v*`, `csharp-v*`) and per-language badges in the description.
4. Detect and prevent false-positive publish reports (`v0.3.3` was reported as published but
   never reached npm).
5. Provide explicit, actionable error messages on missing or expired credentials
   (`NPM_TOKEN`, `NUGET_API_KEY`, `PYPI_API_TOKEN`, `CARGO_REGISTRY_TOKEN`) so a human can
   recover without spelunking through GitHub Actions logs.
6. Apply best practices from the language templates
   (`{js,rust,python,csharp}-ai-driven-development-pipeline-template`); compare full file trees;
   and report any equivalent issues in those templates.
7. Do not change application code or tests — CI/CD only.
8. Capture all logs and analysis under `./docs/case-studies/issue-29/`.

## Root causes

### RC-1 — Hardcoded `PACKAGE_NAME = 'my-package'` in `js/scripts/publish-to-npm.mjs`

The repository copied a script from the `js-ai-driven-development-pipeline-template` repository in
December 2025 but did not change the placeholder constant. The template script's
`TODO: Update this to match your package name in package.json` was never actioned.

```javascript
// js/scripts/publish-to-npm.mjs (current bug)
const PACKAGE_NAME = 'my-package'; // <-- never changed from template default
...
const checkResult = await $`npm view "${PACKAGE_NAME}@${currentVersion}" version`.run({...});
```

Identical bug in `js/scripts/format-release-notes.mjs:27` and
`js/scripts/create-manual-changeset.mjs:19`.

The newer template (`/tmp/templates/js-template/scripts/publish-to-npm.mjs`) has been refactored to
read the package name dynamically from `package.json` via a `package-info.mjs` helper. The fix is
to port the helper and remove the hardcoded constant.

### RC-2 — `await $\`npm run changeset:publish\`` does not detect logical failure

`@changesets/cli`'s `publish` command exits 0 even when underlying `npm publish` calls fail (it
collects per-package failures and prints `packages failed to publish:` to stderr but does not set a
non-zero exit code). `command-stream`'s `$\`...\`` only throws on non-zero exit codes, so the
catch block in `publish-to-npm.mjs` is never entered.

Reference: `link-assistant/agent` PR #116 documents the identical bug and a multi-layer detection
fix (string scan of stdout/stderr + `npm view` round-trip after publish to confirm the version is
on the registry). The js-template release script has already absorbed that fix; the repository's
copy has not.

### RC-3 — JS workflow tags releases without language prefix

`js/scripts/create-github-release.mjs:53` hardcodes `const tag = \`v${version}\`;`. The newer
js-template version exposes a `--tag-prefix` flag that defaults to `'v'` and accepts `'js-v'`. The
JS workflow never passes the flag, so the JS release tag collides with the unprefixed namespace
that other languages avoid.

### RC-4 — Credential failure messages are accurate but unhelpful

Each per-language workflow stops with an `::error::` line on missing credentials, but the message
is one sentence with a pointer to the case study folder. Users hit by the failure see a red X next
to *Auto Release* but do not see:

- which secret/variable the workflow expects;
- where to set or rotate it (Settings → Secrets and Variables → Actions);
- what to do if the secret looks present but the publish still fails (e.g., `invalid-publisher`
  on PyPI requires the publisher to be configured *on PyPI*, not in the GitHub repo);
- a link to the upstream documentation for trusted publishing / OIDC.

### RC-5 — Tag-prefix `--tag-prefix` flag plumbing in JS scripts

The `create-github-release.mjs` and `format-github-release.mjs` JS scripts accept a fixed `v`
prefix; passing `--tag-prefix js-v` is a no-op until the flag is parsed and consumed. Without
plumbing this through the JS workflow, requirement #3 cannot be met.

## Solution plan

### Fix-1 (RC-1, RC-2): port the multi-layer publish failure detection

Adopt the template implementation of `publish-to-npm.mjs` adapted to this repo's path layout:

- Read `name` and `version` dynamically from `js/package.json` (no hardcoded constant).
- Add a `FAILURE_PATTERNS` array (`'packages failed to publish'`,
  `'error occurred while publishing'`, `'npm error code E'`, `'npm error 404'`,
  `'npm error 401'`, `'npm error 403'`, `'Access token expired'`, `'ENEEDAUTH'`).
- Run `changeset:publish` with `.run({ capture: true })` and scan combined stdout/stderr.
- Confirm the version is actually present on the registry with a follow-up `npm view`.
- Surface a clear `::error::` directive on each failure layer with a runbook hint.

Apply the same package-name fix to `format-release-notes.mjs` and `create-manual-changeset.mjs`.

### Fix-2 (RC-3, RC-5): plumb `--tag-prefix js-v` through the JS workflow

- Extend `js/scripts/create-github-release.mjs` to accept `--tag-prefix` (default `v`) the same
  way the template does.
- Extend `js/scripts/format-github-release.mjs` to use the same prefix when fetching the release.
- Update `.github/workflows/js.yml` to pass `--tag-prefix "js-v"` for both `release` and
  `instant-release` jobs.

### Fix-3 (RC-4): expand credential error messages

Each workflow's credential-presence guard now prints:

- the exact secret name expected;
- the exact path in GitHub UI to set/rotate it;
- the upstream documentation link (trusted publishing for PyPI, OIDC for npm, registry tokens);
- a pointer to a "credential rotation" runbook (this case study).

For the npm publish path, a missing `id-token: write` permission produces a different but related
failure; the script will surface a dedicated message for that case too.

### Fix-4 (Issue requirements 1, 2): badges

- Root `README.md` gets a badges block at the top showing all four languages with shields.io
  badges linked to npm/PyPI/crates.io/NuGet.
- Each language folder gets its own README.md whose first lines are the badge for *that* language
  plus a link to the root README.

### Fix-5 (Issue requirement 8): write up the analysis

This document, plus the captured run JSON, raw logs, and registry probes, lives under
`docs/case-studies/issue-29/`.

## Solution components considered

| Need                                       | Considered                                              | Decision                                                                                                              |
|--------------------------------------------|---------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------|
| Detect changeset publish failure           | `changesets-action`, manual `npm view` round-trip       | Reuse template's multi-layer detection (PR #116). Avoids extra dependency; pattern matches changeset's UI conventions.|
| Avoid hardcoded package names              | Direct `package.json` read, `read-pkg`, `pkg-up`         | Direct `JSON.parse(readFileSync('./package.json'))`. No new dependency, mirrors template approach.                     |
| Per-language tags                          | Custom prefix flag, `release-please-action`              | Custom flag matches existing template conventions for Rust/C# already in the repo.                                    |
| Credential UX                              | `actions/cache` for tokens, `gh secret list` self-check  | Reject — runtime cannot read repo secrets. Best we can do is print exact secret names + UI paths + runbook URL.        |

## Templates: corresponding issues

The same template repos (`{js,rust,python,csharp}-ai-driven-development-pipeline-template`) are
checked: the **JS template** still ships a `publish-to-npm.mjs` whose stronger version (with
`FAILURE_PATTERNS`) is in PR #116-style refactor territory and already includes the dynamic
package name reader. The previous, simpler form (with the hardcoded `'my-package'` placeholder) is
present in older copies of these scripts that downstream repositories like ours imported. The
mitigation in the template is the `package-info.mjs`/`js-paths.mjs` extraction; downstream repos
that copied the older form must port the fix manually. A follow-up issue can be filed against the
template to ship a notice or migration script that flags the older constant pattern.

The Rust, Python, and C# templates already use prefixed tags and matching error guards; no
template-side fix is required for those.

## Files in this folder

| File                                            | Purpose                                                       |
|-------------------------------------------------|---------------------------------------------------------------|
| `README.md`                                     | This case study.                                              |
| `registry-presence.txt`                         | Live HTTP status snapshot for all four registries.            |
| `registry-npm.txt`                              | `npm view lino-objects-codec` output (existing/missing tags). |
| `run-25280681547-js-falsepositive.json`         | JS `Auto Release` run that mis-reported success.              |
| `run-25280681547-js.log`                        | Full log proving E404 + green check coexist.                  |
| `run-25280681545-python-failure.json`           | Python `Auto Release` run with `invalid-publisher`.           |
| `run-25280681545-python.log`                    | Full log of the trusted publishing exchange failure.          |
| `run-25279435356-csharp-failure.json`           | C# `Auto Release` run with missing `NUGET_API_KEY`.           |
| `run-25279435356-csharp.log`                    | Full log of the credential guard.                             |
