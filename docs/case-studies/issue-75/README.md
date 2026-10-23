# Trusted publishing to crates.io and links-notation 0.27.1: requirements, research and evidence

The scope is [parent issue #75](https://github.com/link-foundation/lino-objects-codec/issues/75)
with its two sub-issues:
[#73](https://github.com/link-foundation/lino-objects-codec/issues/73) (crates.io
trusted publishing, including its
[policy comment](https://github.com/link-foundation/lino-objects-codec/issues/73#issuecomment-6150020331))
and [#74](https://github.com/link-foundation/lino-objects-codec/issues/74)
(links-notation in all four packages). All work belongs to
[PR #76](https://github.com/link-foundation/lino-objects-codec/pull/76).

## Complete requirement mapping

| Requirement                                                                 | Implementation                                                                                                                                                                                                                               | Verification                                                                                                                                                        |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #75: one PR, every sub-issue, one closing keyword each                      | Everything is in PR #76; the description has `Fixes #75`, `Fixes #73` and `Fixes #74` on separate lines.                                                                                                                                     | PR description.                                                                                                                                                     |
| #73: `id-token: write` in both release jobs                                 | Added to `auto-release` and `manual-release` in `.github/workflows/rust.yml`, next to `contents: write`. No other job gets it.                                                                                                               | `scripts/check-trusted-publishing.test.mjs`; actionlint; zizmor.                                                                                                    |
| #73: pinned `rust-lang/crates-io-auth-action` before `cargo publish`        | Step `crates_auth`, pinned to the v1.0.6 commit (the latest release; the comment's v1.0.5 would fail the freshness gate), with the publish step's own `if:` so they always run together.                                                     | Policy test asserts the hash pin, the id, the order and the identical `if:`.                                                                                        |
| #73 policy: trusted publishing first, token fallback, keep the secrets      | `continue-on-error: true` on the exchange only; the publish step reads `steps.crates_auth.outputs.token \|\| secrets.CARGO_REGISTRY_TOKEN \|\| secrets.CARGO_TOKEN`. The existing preflight and error handling are fed this same expression. | Policy test, mutation-checked: dropping the fallback, the `continue-on-error`, `id-token` or one auth step each fails it; a stray `continue-on-error` fails it too. |
| #73: rejected-credentials guidance points to the trusted publisher settings | The step logs which credential it used. Missing or rejected credentials print the crate's Trusted Publishing settings URL and the exact claims (owner, repository, `rust.yml`, no environment) first, then token rotation as the fallback.   | Read in the diff; shell lint by actionlint (shellcheck).                                                                                                            |
| #73: `package-registry-manager --migrate` did not recognise the workflow    | The conversion it would have made is done by hand ([package-registry-manager#60](https://github.com/link-foundation/package-registry-manager/issues/60) tracks the tool gap).                                                                | Same as above.                                                                                                                                                      |
| #73: reusable workflows declare the secrets as optional `workflow_call`     | Not applicable: `rust.yml` has no `workflow_call` trigger.                                                                                                                                                                                   | `grep workflow_call .github/workflows/rust.yml` is empty.                                                                                                           |
| #73: zizmor no longer needs the `use-trusted-publishing` exemption          | `rust.yml` removed from the ignore list in `.github/zizmor.yml`; `csharp.yml` and `python.yml` stay.                                                                                                                                         | `zizmor==1.31.1` (online and pedantic passes) reports nothing.                                                                                                      |
| #74: raise links-notation in all four packages                              | 0.27.1 everywhere (see the deviation below): `rust/Cargo.toml`, `js/package.json`, `python/pyproject.toml` (`>=0.27.1,<0.28.0`), the C# `.csproj`, plus the lockfiles and the four Rust experiment consumers.                                | `node scripts/check-links-notation-parity.mjs`; the dependency freshness gate.                                                                                      |
| #74: run the suites; fixtures would reveal a parser change                  | No codec change was needed. All four suites, including the shared `fixtures/`, pass unchanged against 0.25.2, 0.26.0 and 0.27.1.                                                                                                             | `experiments/issue-74/test-against-version.sh`, 12/12 PASS.                                                                                                         |
| #74: one parser copy for consumers (the reproduction)                       | Follows from the raised ranges.                                                                                                                                                                                                              | `experiments/issue-74/dedupe-check.sh`; pip and cargo checks below.                                                                                                 |
| #74: release                                                                | Patch fragments in all four languages (`changelog.d` / `.changeset`): no links-notation type is part of any public API.                                                                                                                      | Per-language fragment checks in CI.                                                                                                                                 |

## Issue #73: crates.io trusted publishing

### Research

- [crates.io trusted publishing docs](https://crates.io/docs/trusted-publishing)
  (source: [`svelte/src/routes/docs/trusted-publishing/+page.svelte`](https://github.com/rust-lang/crates.io/tree/main/svelte/src/routes/docs/trusted-publishing)):
  - the crate must already exist, which it does (0.9.1, owner `konard`);
  - a crate owner adds a GitHub publisher under the crate's Settings → Trusted
    Publishing (repository owner, repository name, workflow filename, optional
    environment);
  - the job needs `id-token: write`;
  - the exchanged token is valid for 30 minutes.
- [`rust-lang/crates-io-auth-action`](https://github.com/rust-lang/crates-io-auth-action):
  this is the official exchange action. It outputs `token`, and its post step
  revokes that token. v1.0.6 (2026-10-21, commit `3268eb4`) is the latest
  release.
- Sibling migrations under the same policy
  ([lino-env#34](https://github.com/link-foundation/lino-env/pull/34),
  [linksql#3](https://github.com/link-foundation/linksql/pull/3),
  [link-cli#116](https://github.com/link-foundation/link-cli/pull/116)) use the
  same step name, `continue-on-error`, and `token || secrets` expression.
  link-cli#116 also added a workflow policy test. `scripts/check-trusted-publishing.test.mjs`
  is the dependency-free equivalent here; `scripts.yml` runs it with the other
  `scripts/*.test.mjs`.
- The issue's plan ends with "deletes the token secrets after the first OIDC
  release". The later policy comment overrides this: "Do not delete the token
  secrets after the first OIDC release"
  ([package-registry-manager#62](https://github.com/link-foundation/package-registry-manager/issues/62)).
  The workflow keeps both secrets as fallbacks.

### Behaviour

| Trusted publisher registered | Token secret set | Result                                                                             |
| ---------------------------- | ---------------- | ---------------------------------------------------------------------------------- |
| yes                          | any              | Publishes with the OIDC token; the action revokes it after the job.                |
| no                           | yes              | The exchange fails (step stays green), a warning names the setup, token publishes. |
| no                           | no               | Fails with "crates.io credentials missing" and both ways to fix it.                |

The first row cannot be exercised from a pull request. The release jobs only
run on `main` or by manual dispatch, and the registration on crates.io is the
crate owner's action (see below).

### Required maintainer step after merge (not doable from a PR)

A crate owner opens <https://crates.io/crates/lino-objects-codec/settings> →
Trusted Publishing → Add → GitHub and enters:

- Repository owner: `link-foundation`
- Repository name: `lino-objects-codec`
- Workflow filename: `rust.yml`
- Environment: leave empty

Alternatively, `package-registry-manager setup --repository . --registry crates-io --migrate --execute`
does the same once package-registry-manager#60 is fixed. Until either is done,
releases keep using the token, as the policy requires, and the publish step
warns on every release.

## Issue #74: links-notation in all four packages

### Why 0.27.1 rather than the 0.26.0 the issue names

The issue asks for 0.26.0, the latest release when it was opened. Since then:

| Release | Date       | Change relevant here                                                                 |
| ------- | ---------- | ------------------------------------------------------------------------------------ |
| 0.26.0  | 2026-10-12 | Adds the C++ binding; no parser change for the four languages here.                  |
| 0.27.0  | 2026-10-16 | Dependency update; Python requires ≥ 3.11 (ours: 3.13), Rust MSRV 1.87 (ours: 1.87). |
| 0.27.1  | 2026-10-19 | JS browser bundling fix.                                                             |

0.26.0 alone would be wrong for two reasons:

- `scripts/check_dependency_freshness.py` fails every PR whose direct dependency
  is behind its latest release.
- A `^0.26.0` range excludes 0.27.x, so a consumer on the current parser would
  get the duplicate copy the issue is about.

0.27.1 meets the issue's goal, one shared parser, for consumers of every
release from 0.27.1 onwards.

### Reproduction and evidence

`experiments/issue-74/dedupe-check.sh` installs the codec next to
`links-notation@0.27.1`, as in the issue's reproduction:

```console
$ experiments/issue-74/dedupe-check.sh 0.27.1 lino-objects-codec@0.9.2   # published, before
+-- links-notation@0.27.1
`-- lino-objects-codec@0.9.2
  `-- links-notation@0.25.2
links-notation copies installed: 2                                        # exit 1
$ experiments/issue-74/dedupe-check.sh 0.27.1                             # packed from this branch
+-- links-notation@0.27.1
`-- lino-objects-codec@0.9.2
  `-- links-notation@0.27.1 deduped
links-notation copies installed: 1                                        # exit 0
```

Python and Rust consumers show the same:

- `pip install --dry-run <main>/python links-notation==0.27.1` fails with
  `ResolutionImpossible`, because main's `<0.26.0` cap conflicts. With this
  branch's `python/` it resolves to `links-notation-0.27.1`.
- `cargo tree -i links-notation` in `experiments/issue-65/consumer`, a crate
  that depends on both, lists a single `links-notation v0.27.1`.

`experiments/issue-74/test-against-version.sh <version>` copies the working
tree to a scratch directory, pins all four packages to exactly that version,
and runs each suite:

| links-notation | Rust | JavaScript | Python | C#   |
| -------------- | ---- | ---------- | ------ | ---- |
| 0.25.2         | PASS | PASS       | PASS   | PASS |
| 0.26.0         | PASS | PASS       | PASS   | PASS |
| 0.27.1         | PASS | PASS       | PASS   | PASS |

Full local checks on 0.27.1:

- Rust: tests, doc tests, clippy `-D warnings`, fmt and the example.
- JavaScript: 516/516 tests, plus lint, format, jscpd and the examples.
- Python: 518 passed, plus ruff, format, mypy and build.
- C#: `/warnaserror` build, 540/540 tests, `dotnet format` and the example.

## CI gate fixes found on the way

None of these is a codec change. Each one would have turned this PR's CI red,
whatever the change:

- **Freshness gate:**
  - `pypa/gh-action-pypi-publish` v1.14.2 → v1.14.3 (2026-10-20);
  - `zizmorcore/zizmor-action` v0.6.4 → v0.8.0 (2026-10-23);
  - zizmor 1.30.1 → 1.31.1;
  - plus the npm, PyPI, NuGet and cargo dev dependencies, bumped with
    links-notation.
- **zizmor `impostor-commit`:** 7 high findings, present on `main` too.
  - `dtolnay/rust-toolchain` was pinned to the `stable` branch commit of
    2026-10-09 (`686976e`). That branch is regenerated on each toolchain
    release (the pinned commit has diverged from the current `stable`), so it
    is no longer reachable from any ref.
  - It is now pinned to the `master` commit of 2026-10-16 (`683b588`). `master`
    is not rewritten, and every call site already passes `toolchain: stable`,
    which the `stable` branch only supplied as a default.

## Checks run locally

- actionlint 1.7.12: clean.
- zizmor 1.31.1 (online, `--min-confidence low`, and the pedantic high pass):
  no findings.
- `python3 scripts/check_dependency_freshness.py`: all 140 direct dependency
  declarations are current.
- `node --test scripts/*.test.mjs` passes 44/44, including the 9 new
  trusted-publishing policy tests.
- `python3 -m unittest discover -s scripts -p 'test_*.py'`: OK.

The logs are kept locally in the ignored `ci-logs/`.
