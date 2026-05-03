# Case Study: Silent Publication Failures and Missing Package Visibility

**Issue:** [#25](https://github.com/link-foundation/lino-objects-codec/issues/25)
**Pull Request:** [#26](https://github.com/link-foundation/lino-objects-codec/pull/26)
**Date Investigated:** 2026-05-03
**Branch:** `issue-25-76b0e5ea19d6`

## Executive Summary

The repository advertises four language packages (Python, JavaScript, Rust, C#) but only the npm
package was actually published to its registry. The Rust and C# CI/CD pipelines reported a green
"Auto Release" job while silently skipping the publish step because their secret-presence guards
exit `0` when the registry token is missing. The Python pipeline did fail (PyPI publish step), but
because the Rust/C# git-tag gate considers the local tag the source of truth, subsequent pushes
permanently skip republishing — even though the packages do not exist on the registry.

In addition, neither the root `README.md` nor any of the per-language READMEs carry a
registry-version badge, so a reader has no fast way to see which languages are published, at which
version, or whether publication is broken.

## Verified Package State (snapshot 2026-05-03)

| Language | Registry  | Package id              | Latest published | Local version | Evidence                                |
|----------|-----------|-------------------------|------------------|---------------|-----------------------------------------|
| JS       | npm       | `lino-objects-codec`    | 0.3.1            | 0.3.1         | `registry-npm.json` (HTTP 200)          |
| Python   | PyPI      | `lino-objects-codec`    | *not found*      | 0.2.0         | `registry-pypi-not-found.txt` (HTTP 404)|
| Rust     | crates.io | `lino-objects-codec`    | *not found*      | 0.2.0         | `registry-crates-not-found.txt` (HTTP 404)|
| C#       | NuGet     | `Lino.Objects.Codec`    | *not found*      | 0.2.0         | `registry-nuget-not-found.txt` (HTTP 404)|

Local `git tag` listing on the same date:

```
csharp-v0.2.0
rust-v0.2.0
v0.1.1
v0.3.0
v0.3.1
```

GitHub releases on the same date:

```
C# 0.2.0      csharp-v0.2.0  2026-01-08
Rust 0.2.0    rust-v0.2.0    2026-01-08
0.3.1         v0.3.1         2026-01-08   (JS)
0.3.0         v0.3.0         2026-01-08   (JS)
0.1.1         v0.1.1         2025-12-21   (legacy)
```

There is **no Python release and no Python tag** at all — the very first PyPI publish failed and
nothing since has retried.

## Timeline of Events

The release pipelines were introduced together in early January 2026. The relevant CI runs are
captured as JSON in this directory.

| When (UTC)         | Event                                                                                      | Run id        |
|--------------------|--------------------------------------------------------------------------------------------|---------------|
| 2026-01-08 03:29   | First post-pipeline push to `main` triggers Python, Rust, C# auto-release in parallel.     | -             |
| 2026-01-08 03:29   | **Python Auto Release fails** at `Publish to PyPI` step. No tag created, no release made.  | 20804476989   |
| 2026-01-08 03:29   | **Rust Auto Release fails** at `Create GitHub Release`, but `Publish to crates.io` step is reported `success`. | 20804477002   |
| 2026-01-08 03:29   | **C# Auto Release fails** at `Create GitHub Release`, but `Publish to NuGet` step is reported `success`.       | 20804477007   |
| 2026-01-08 18:48   | Push to `main` retriggers Rust auto-release. `Create GitHub Release` fails again (run 20828012412). | 20828012412 |
| 2026-01-08 18:52   | Issue [#22](https://github.com/link-foundation/lino-objects-codec/issues/22) is filed for the GitHub-release failure. |  -            |
| 2026-01-08 19:20   | PR [#23](https://github.com/link-foundation/lino-objects-codec/pull/23) merges fix for `yargs` reserved-word issue. Rust 0.2.0 and C# 0.2.0 GitHub releases are created — but their packages were never actually pushed to crates.io / NuGet. | -          |
| 2026-05-03         | Issue [#25](https://github.com/link-foundation/lino-objects-codec/issues/25) requests visible publish-status badges and per-language READMEs.                                  | -          |

The four `run-*.json` files in this folder hold the raw step outcomes that prove the analysis above
(GitHub log retention had already GC'd the textual logs by the time of investigation, so the JSON
step list is the highest-fidelity evidence still available).

## Root Cause Analysis

### Cause 1 — Silent skip on missing token (Rust and C#)

`.github/workflows/rust.yml` (lines 325-335) and `.github/workflows/csharp.yml` (lines 228-241) wrap
their publish step in:

```bash
if [ -z "$CARGO_REGISTRY_TOKEN" ]; then
  echo "::warning::... not set, skipping publish to crates.io"
else
  cargo publish
fi
```

If the secret is missing (or not exposed to the job — typical for org-level secrets that need to be
mapped explicitly) the script prints a warning and exits `0`. The job is then green even though
nothing was published. Because the same workflow goes on to create a Git tag and a GitHub release,
the next run sees "tag exists" and never retries the publish — failure is permanently masked.

### Cause 2 — Git-tag gate confuses "released" with "published" (all three)

Each non-JS auto-release job decides whether to publish by checking the local Git tag:

```yaml
if git rev-parse "rust-v$CURRENT_VERSION" >/dev/null 2>&1; then
  echo "should_release=false"
fi
```

(Equivalent code in `python.yml` line 213-220 and `csharp.yml` line 213-219.)

That gate conflates two unrelated states:
- *We have already created a git tag for this version.*
- *The package binary for this version exists on the public registry.*

After Issue #22 was fixed and 0.2.0 tags were created, the registries still had no package, but the
workflow now refuses to retry. The only way out today is a manual version bump.

### Cause 3 — `pypa/gh-action-pypi-publish` first-publish requirements (Python)

For the Python failure on 2026-01-08 the PyPI step actually exited non-zero (correct behaviour). The
likeliest cause — the project does not exist yet on PyPI and there is no Trusted Publisher
configured for the repo — is consistent with the registry state today (HTTP 404 for the project
JSON). The cure is the same as for Rust/C#: do not rely on a single first-time publish; use a
publish step that can be re-run idempotently, **and** make sure the secret/trusted-publisher path is
configured.

### Cause 4 — No public visibility of publish status

Neither the root `README.md` nor any per-language `README.md` carries a registry-version badge. A
reader cannot tell which packages are actually on the registry, what version, or that three of four
languages are silently broken. The CI badges currently in the README report the *workflow* status,
not the *registry* status, so they were green on 2026-01-08 even while crates.io/NuGet/PyPI received
nothing.

## Requirements From the Issue

The issue asked for the following deliverables. All are addressed in PR #26:

1. All packages should be published to their respective registries (PyPI / npm / crates.io / NuGet).
2. When publication fails, provide clear visible feedback as a badge for each package.
3. Per-language READMEs with badges for the latest package version.
4. Root `README.md` should contain badges of all packages with direct links to the registries.
5. GitHub releases should be separate per language, with prefixed tags (`python-v…`, `rust-v…`,
   `csharp-v…`, plus the JS default `v…`).
6. Apply best practices from the four AI-driven-development pipeline templates and report any
   shared issue back to the templates.
7. Compile data and analysis to `docs/case-studies/issue-25/` (this folder).
8. If the same defect exists in a template, file an issue there too.

## Proposed Solution Plan

### Step A — Make the publish step honest (Rust & C#)

Replace the silent-skip wrappers with code that fails the job when the secret is missing **and** is
idempotent on re-runs:

- Rust: switch to `cargo publish --token "$CARGO_REGISTRY_TOKEN"` and fail when the token is unset.
  The Rust pipeline template's `scripts/publish-crate.rs` already handles the
  `already uploaded` / `already exists` cases by mapping them to a deliberate exit code so the
  workflow can keep going.
- C#: keep `dotnet nuget push --skip-duplicate` (already used) but fail when `NUGET_API_KEY` is
  unset.

### Step B — Replace the git-tag gate with a registry probe

Decide whether to publish by querying the registry directly:

- crates.io: `curl -fsS https://crates.io/api/v1/crates/<name>/<ver>` (HTTP 200 = already published).
- NuGet:    `curl -fsS https://api.nuget.org/v3-flatcontainer/<id-lc>/<ver>/<id-lc>.nuspec`.
- PyPI:     `curl -fsS https://pypi.org/pypi/<name>/<ver>/json`.

This makes the pipeline self-healing: if a publish silently fails, the next push will retry. (This
is the exact pattern used by `rust-ai-driven-development-pipeline-template/scripts/check-release-needed.rs`.)

### Step C — Per-language registry-version badges

Add to the root `README.md`:

```markdown
[![npm](https://img.shields.io/npm/v/lino-objects-codec?label=npm)](https://www.npmjs.com/package/lino-objects-codec)
[![PyPI](https://img.shields.io/pypi/v/lino-objects-codec?label=PyPI)](https://pypi.org/project/lino-objects-codec/)
[![crates.io](https://img.shields.io/crates/v/lino-objects-codec?label=crates.io)](https://crates.io/crates/lino-objects-codec)
[![NuGet](https://img.shields.io/nuget/v/Lino.Objects.Codec?label=NuGet)](https://www.nuget.org/packages/Lino.Objects.Codec)
```

shields.io renders these badges from the live registry, so a 404 visibly appears as `not found`.
That gives the issue's requested "clear visible feedback" without writing any custom CI status logic.

Add the same badge for each language's README (only the relevant one).

### Step D — Configure repository secrets / trusted publisher

Out-of-band but essential:
- Ensure `CARGO_REGISTRY_TOKEN` (or `CARGO_TOKEN`) is set as a repository secret.
- Ensure `NUGET_API_KEY` is set.
- Configure PyPI Trusted Publisher for the repo + workflow + environment, **or** add a
  `TWINE_PASSWORD`/`PYPI_API_TOKEN` and pass it via `password:` to the action.

### Step E — Per-language tag prefixes (already partially in place)

`python.yml` already passes `--tag-prefix python-v` to `create_github_release.py`, `rust.yml`
passes `rust-v`, `csharp.yml` passes `csharp-v`, and `js.yml` continues to use the default `v`.
This step is mostly verifying that nothing else still creates an unprefixed tag and that the
documentation reflects the per-language tagging convention.

### Step F — Re-publish 0.2.0 (one-time)

Because tags were already minted, the Step B fix needs to find that the registry is missing the
package and republish. If the workflow's first re-run with the fixed gate still fails (e.g.,
because the secret hasn't been added yet) the case-study will be updated and the maintainer
prompted via PR comment.

## Component / Library Reuse

Where possible the fix uses existing tools rather than new bespoke scripts:

- `pypa/gh-action-pypi-publish@release/v1` (already used) — supports both Trusted Publishers and
  `password:` token authentication.
- `dotnet nuget push --skip-duplicate` (already used) — idempotent.
- `cargo publish` natively returns `crates.io: status 422 already exists` which the Rust pipeline
  template's `publish-crate.rs` script maps to a non-fatal outcome.
- shields.io badges — no code at all, just URLs.
- `actions/checkout@v4`, `actions/setup-*@v…` — unchanged.

## Upstream Reports

The same publish-token-silent-skip pattern exists in two of the upstream templates and should be
reported there:

- `link-foundation/rust-ai-driven-development-pipeline-template` — has both the silent skip and a
  registry-probe script (`check-release-needed.rs`) that *is* used for "should we release" but not
  for the publish-or-skip decision. Reporting the inconsistency.
- `link-foundation/csharp-ai-driven-development-pipeline-template` — silent-skip wrapper for
  `NUGET_API_KEY`.
- The Python template uses `pypa/gh-action-pypi-publish` which fails loudly on missing
  authentication, so no upstream report is needed for that one.

The template-issue creation, where appropriate, is done as part of finalising PR #26.

## Lessons Learned

1. **A green CI badge is not proof of publication.** Always pair workflow badges with registry
   badges when publishing artefacts.
2. **`exit 0` is dangerous when guarding side-effects.** "Skip and warn" patterns hide failures
   forever in pipelines that key off their own previous output (git tags here).
3. **Decide based on the artefact, not its proxy.** The truth source for "did we publish" lives on
   the registry; querying it is a one-liner and is naturally idempotent.
4. **Make first-publish part of CI verification.** A first publish is unique because the registry
   project does not yet exist; ensure that scenario is exercised — once.

## References

- Issue #25 — All packages should be published, with visible badges
- Issue #22 / PR #23 — Earlier yargs reserved-word fix that explains the 18:48 failure
- `docs/case-studies/issue-22/README.md` — Format and prior-art for this case study
- shields.io endpoints used: `img.shields.io/npm/v`, `/pypi/v`, `/crates/v`, `/nuget/v`
- `rust-ai-driven-development-pipeline-template/scripts/publish-crate.rs` — model for idempotent
  publish handling
- `rust-ai-driven-development-pipeline-template/scripts/check-release-needed.rs` — registry probe
  pattern
