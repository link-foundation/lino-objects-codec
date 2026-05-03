# Issue 31 Case Study: CI/CD Release Failures

Issue: https://github.com/link-foundation/lino-objects-codec/issues/31

PR: https://github.com/link-foundation/lino-objects-codec/pull/32

## Preserved Evidence

The failing and suspicious runs were downloaded before changes were made:

| Language   | Run         | Created              | Conclusion | Evidence                                                    |
| ---------- | ----------- | -------------------- | ---------- | ----------------------------------------------------------- |
| Rust       | 25286485825 | 2026-05-03T17:55:55Z | success    | `run-25286485825-rust.json`, `run-25286485825-rust.log`     |
| JavaScript | 25286485840 | 2026-05-03T17:55:55Z | failure    | `run-25286485840-js.json`, `run-25286485840-js.log`         |
| Python     | 25286485829 | 2026-05-03T17:55:55Z | failure    | `run-25286485829-python.json`, `run-25286485829-python.log` |

Copies of the raw logs were also saved under `ci-logs/` at the repository root during the investigation.

## Findings

### Rust

The Rust workflow had two false-success paths.

First, the release probe treated every non-200 crates.io response as "not published". In run `25286485825`, crates.io returned HTTP 403 for `lino-objects-codec@0.2.0` at `run-25286485825-rust.log:2853`. The workflow then tried to publish a version that already existed, and `cargo publish` reported `crate lino-objects-codec@0.2.0 already exists` at `run-25286485825-rust.log:2935`. That was converted to a warning at `run-25286485825-rust.log:2936`.

Second, GitHub release creation did not inspect the `gh api` exit code. The log shows `Validation Failed (HTTP 422)` and `already_exists` at `run-25286485825-rust.log:2951`, followed immediately by a success message at `run-25286485825-rust.log:2952`.

The Rust workflow also referenced `steps.bump_type.outputs.has_fragments`, but `rust/scripts/get-bump-type.mjs` never emitted that output. That made automatic releases unable to distinguish "new changelog fragments need a bump" from "current version should be republished because it is missing from crates.io".

### JavaScript

The JavaScript release failed because npm setup silently continued after npm failed to upgrade. In run `25286485840`, npm started at `10.9.7` (`run-25286485840-js.log:4091`), `npm install -g` failed with `Cannot find module 'promise-retry'` (`run-25286485840-js.log:4092-4093`), and setup still printed `Updated npm version: 10.9.7` (`run-25286485840-js.log:4108`).

The publish step then failed with npm E404/access symptoms and Changesets' `packages failed to publish` marker (`run-25286485840-js.log:4187`, `run-25286485840-js.log:4226`). The existing publish wrapper correctly exhausted retries and failed the workflow at `run-25286485840-js.log:4396`, but its operator guidance did not cover E404 PUT responses that usually mean package access or trusted-publisher configuration needs attention.

npm's trusted publishing documentation currently requires npm CLI 11.5.1 or later and Node.js 22.14.0 or later:

https://docs.npmjs.com/trusted-publishers

### Python

The PyPI publish failure was a trusted-publisher configuration problem. The `pypa/gh-action-pypi-publish` action already emitted the useful root cause: `invalid-publisher` at `run-25286485829-python.log:1714`, plus PyPI's troubleshooting URL at `run-25286485829-python.log:1734`.

The workflow then ran a separate diagnostic step starting at `run-25286485829-python.log:1737`. That duplicated the action's own troubleshooting output and created a second red step, which is exactly what issue 31 asked to remove.

PyPI documents `invalid-publisher` as an OIDC claim mismatch or missing trusted-publisher configuration:

https://docs.pypi.org/trusted-publishers/troubleshooting/

## Template Comparison

The Rust template already has the right shape: `get-bump-type` emits `has_fragments`, and `check-release-needed` makes the release decision from registry state plus changelog-fragment state.

The Python template does not add a separate diagnostic-only step after `pypa/gh-action-pypi-publish`; it relies on the publishing action's own error output.

The JavaScript template has the same npm setup class of issue. The current template documents the `promise-retry` runner image failure, but its fallback can still install npm 11.4.2 and its success logic accepts any npm 11.x. I filed the upstream template issue here:

https://github.com/link-foundation/js-ai-driven-development-pipeline-template/issues/48

## Changes Made

- Added `rust/scripts/check-release-needed.mjs` and `rust/scripts/crates-release-helpers.mjs`.
- Added `rust/scripts/crates-release-helpers.test.mjs` and `experiments/issue-31/test-rust-release-helpers.mjs`.
- Made `rust/scripts/get-bump-type.mjs` emit `fragment_count` and `has_fragments`.
- Updated the Rust release workflow to fail on ambiguous crates.io probe responses and to skip the version bump only when the current Cargo.toml version is missing and no changelog fragments exist.
- Made `rust/scripts/create-github-release.mjs` check `gh api` output and treat an already-existing release as idempotent instead of printing a false success.
- Hardened `js/scripts/setup-npm.mjs` so it enforces Node.js >= 22.14.0 and npm >= 11.5.1, dynamically selects a supported npm 11 tarball fallback, and exits if the final npm version is still too old.
- Extended npm publish analysis so E404 PUT failures print trusted-publisher and package-access guidance.
- Removed the separate Python PyPI diagnostic steps.

## Remaining Operator Configuration

The code can make the workflows honest, but registry settings still need to match the repository:

- npm: configure the `lino-objects-codec` package trusted publisher for this repository and `.github/workflows/js.yml`, or fix package access if the package is not owned by the publishing account.
- PyPI: configure the project trusted publisher for owner `link-foundation`, repository `lino-objects-codec`, workflow `python.yml`, and the configured environment value.
- crates.io: keep `CARGO_REGISTRY_TOKEN` or `CARGO_TOKEN` valid with publish/update permissions for the crate.
