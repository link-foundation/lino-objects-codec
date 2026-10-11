# Deep analysis: issue #71, "Check for all false positives, false negatives, warnings and errors in CI/CD and fix them all"

- Issue: <https://github.com/link-foundation/lino-objects-codec/issues/71>
- Pull request: <https://github.com/link-foundation/lino-objects-codec/pull/72>
- Evidence: `dev/log/issues/71/pulls/72/`. Everything except `analysis/*-after.txt` was collected before any change was made.

---

## 1. Timeline of events

All timestamps are UTC. They come from `meta/runs.json`, the PR and issue JSON in `meta/`, and the log lines in `ci-logs/`.

| Time | Event | Evidence |
| --- | --- | --- |
| 2026-10-07T02:02Z | **Python** `main` run on `67eeea5` fails in `Publish to PyPI` with `invalid-publisher: valid token, but no corresponding publisher` | `ci-logs/Python-CI-CD-37559124943.failed.log` |
| 2026-10-09T16:02Z | Dependabot opens PR #67 (`3bc957c`), which bumps **only** the C# `Link.Foundation.Links.Notation` from 0.23.0 to 0.25.1. The npm `^0.23.0`, pip `<0.24.0` and cargo `0.23.0` pins are left alone. | `meta/pr-67.json` |
| 16:02:19Z | PR #67 **C# CI/CD** fails: `No changeset found in this PR`. Dependabot cannot write a changeset, so this check is red on every Dependabot PR (**false positive**). | `ci-logs/C--CI-CD-37956144601.failed.log` |
| 16:02:15Z | PR #67 **Cross-Language Parity** and **Shared CI Scripts** fail: `not ok 9 - the checked-in manifests agree today`. The parity break is real, but the message is a bare `false !== true` and does not say which manifest moved. | `ci-logs/Cross-Language-Parity-37956144558.failed.log`, `ci-logs/Shared-CI-Scripts-37956144479.failed.log` |
| 16:02:17Z | PR #67 **Dependency Freshness** fails because links-notation is behind in three ecosystems | `ci-logs/Dependency-Freshness-37956144485.failed.log` |
| 2026-10-11T12:17Z | PR #67 is merged **red** as `b48872d`. `main` now fails Freshness and Shared CI Scripts. | `ci-logs/Dependency-Freshness-38138700301.log`, `ci-logs/Shared-CI-Scripts-38138700169.log` |
| 13:31Z | PR #70 (issue #69) first push `f14972f`: Parity, Freshness and Shared CI Scripts still red | `ci-logs/*-3814351177*.log` |
| 14:0xZ | PR #70 `c9c266d` aligns every manifest on links-notation 0.25, goes green, and is merged as `03e1e05` | `ci-logs/Cross-Language-Parity-38145303724.log` |
| 14:11:54Z | The `main` push of `03e1e05`: seven workflows succeed, and **Python CI/CD** fails again with `invalid-publisher`. This is run 38145827851, the one named in the issue. | `ci-logs/Python-CI-CD-38145827851.failed.log` |
| 14:1xZ | The green runs of `03e1e05` still carry 48 `ubuntu-latest will migrate to Ubuntu 26 beginning October 19, 2026` notices, 2 CodeQL `build-mode is set to "undefined"` warnings (csharp) and 2 `PyPI has no project named "lino-objects-codec" yet` warnings | `analysis/annotations.txt` |
| 16:18:56Z | Issue #71 filed | `meta/issue-71.json` |
| 16:19:51Z | This PR's first commit `3d0abdb` (task details only) fails **Dependency Freshness**: `serde_json 1.0.152 is behind latest 1.0.154`. serde_json released a new version, so the failure has nothing to do with the commit. | `ci-logs/Dependency-Freshness-38154982948.log` |

What the timeline shows: a check that is red on **every** Dependabot PR (the C# changeset false positive) teaches people to merge red. PR #67 was merged red, and the real parity break it contained went along with it to `main`.

---

## 2. Every requirement

| # | Requirement | Where it is addressed |
| --- | --- | --- |
| **R1** | Find and fix **all** false positives, false negatives, warnings and errors in CI/CD; the Python `main` run 38145827851 is the named failure | §3, §4 |
| **R2** | Compare every workflow and CI/CD script with the four `link-foundation/*-ai-driven-development-pipeline-template` repositories and reuse their best practices | §5 |
| **R3** | When a problem also exists in a template, report it upstream with reproducible examples, workarounds and fix suggestions | §7 |
| **R4** | Follow `link-assistant/hive-mind/docs/CI-CD-BEST-PRACTICES.md` (copy in `templates/`) | §5, by rule number |
| **R5** | Do everything in this single pull request | PR #72 |
| **R6** | Collect the logs and data into `dev/log/issues/71/pulls/72` | `README.md`, this folder |
| **R7** | Deep analysis: timeline, requirements, root causes, solution plans, online research, existing components | this document |
| **R8** | Where data is insufficient, add debug output and a verbose mode that is off by default | §3.1, §6 |
| **R9** | Apply each fix everywhere it applies | Every fix below lists the files it touched in all four languages |

---

## 3. Errors and false negatives (R1)

### 3.1 Python: `Publish to PyPI` fails with `invalid-publisher` (true positive, external fix)

**Symptom** (`ci-logs/Python-CI-CD-38145827851.failed.log`):

```
* `invalid-publisher`: valid token, but no corresponding publisher (Publisher with matching claims was not found)
##[error]Trusted publishing exchange failure:
```

**Root cause.** PyPI has no project named `lino-objects-codec`, and no *pending* trusted publisher is registered for it either. The OIDC token is valid, but PyPI cannot map its claims (`repository: link-foundation/lino-objects-codec`, `workflow: python.yml`) to a publisher. The preflight already printed this warning in the same run: `PyPI has no project named "lino-objects-codec" yet.`

**This is a true positive.** The release really cannot happen, and no commit can fix that. A PyPI account owner has to do one of two things:

1. Register a **pending publisher** at <https://pypi.org/manage/account/publishing/> with owner `link-foundation`, repository `lino-objects-codec`, workflow `python.yml`, and no environment. This is preferred: no long-lived secret.
2. Add a `PYPI_API_TOKEN` repository secret. The workflow already falls back to it.

**Debugging aid (R8).** `python/scripts/pypi_publish_preflight.py` (from issue #68) prints the exact claims and this runbook. `PYPI_PREFLIGHT_VERBOSE` is `0` on the publish path and `1` only in the explainer step that runs after a failure. Its output was enough to find the cause, so no new debug switch was needed here.

### 3.2 Parity break merged to `main` (true positive with an opaque message)

**Root cause.** Dependabot's PR #67 bumped only the NuGet pin (`0.23.0` → `0.25.1`). The npm, pip and cargo manifests pin by range (`^0.23.0`, `<0.24.0`, `0.23.0`), and Dependabot opened no matching PRs for them. The parity gate correctly went red. But the assertion message was `false !== true`, and it runs before the gate's own per-manifest report, so the log did not say *which* manifest moved.

**Fix.** `scripts/check-links-notation-parity.test.mjs` now names the disagreeing pins, for example:

```
links-notation minors disagree: {"rust":"0.25","js":"0.25","python":"0.25","csharp":"0.23"}.
Bump every manifest to the same minor (node scripts/check-links-notation-parity.mjs).
```

This was verified by temporarily setting the csproj back to 0.23.0. The pins themselves were already re-aligned by PR #70.

**Uncertainty.** It is not established why Dependabot left the other three ecosystems out. `.github/dependabot.yml` puts cargo, npm, pip, nuget and github-actions into one `multi-ecosystem-group: all-dependencies`. PR #67 is titled "Bump the "all-dependencies" group with 1 update across multiple ecosystems", and it touches only `csharp/src/Lino.Objects.Codec/Lino.Objects.Codec.csproj`.

Registry lag does not explain it either. links-notation 0.25.1 was published to all four registries between 2026-10-08T23:13Z and 23:14Z, about 17 hours before the PR (npm, PyPI, crates.io and NuGet APIs, queried while writing this). None of the three ranges (`^0.23.0`, `>=0.23.0,<0.24.0`, `0.23.0`) admits 0.25, so an update was due in each.

The answer is most likely in the per-ecosystem Dependabot job logs. Those are visible only to repository admins, under *Insights → Dependency graph → Dependabot*, and are not reachable through `gh`, so they are not in this folder. Whatever the cause, the parity gate is the backstop. It now names the drift, and the Dependabot exemption only waives the changeset rule, never parity or tests. The changeset false positive was reported upstream (§7).

### 3.3 Dependency Freshness fails for reasons no commit can fix (false negative per best practice #17)

**Symptom.** The first run of this very PR (`3d0abdb`, which only adds a task file) failed with `serde_json 1.0.152 is behind latest 1.0.154`. On `main` (`b48872d`), the same gate failed on links-notation, serde_json and proptest.

**Root cause.** The gate failed on *every* event, including `push` and `schedule`, so the world moving (an upstream release) turned `main` red. Best practice #17 says: "A job that fails for a reason no commit can fix is a false negative, and it trains everyone to ignore red."

**Fix** (`8c4ed09`, `cbed6be`, `d25e96c`):

- `FRESHNESS_MODE` is `gate` on `pull_request` and `workflow_dispatch`, and `report` (warnings only) on `push` and `schedule`.
- The parser reads hash-pinned `uses:` lines (`@<sha> # vX.Y.Z`) and the new linter versions, so pinning actions did not silently remove them from the gate.
- serde_json was bumped to 1.0.154.

### 3.4 Release jobs silently skipped on `workflow_dispatch` (false negative)

**Root cause.** `detect-changes` is skipped on `workflow_dispatch`. The implicit `success()` in the `manual-release` `if:` then skipped the manual release on every dispatch, with no error.

**Fix** (`86c9b79`). The C# and Python release jobs use `!cancelled() && … && needs.build.result == 'success'`, which matches the Rust and JS workflows.

### 3.5 Python changelog collected under the old version

**Root cause.** `scriv collect` ran before the version bump, so the fragments were filed under the previous version.

**Fix** (`d4e6b1f`). `python/scripts/version_and_commit.py` runs `scriv collect --version <new_version>` after the bump. A `--skip-changelog` flag was added, and tests cover both paths.

---

## 4. False positives and warnings (R1)

### 4.1 Changeset checks

| Problem | Where | Fix (`b1a818a`) |
| --- | --- | --- |
| Red on every Dependabot PR: Dependabot cannot write a changeset | JS, Python, Rust, C# checks | `PR_AUTHOR` = `dependabot[bot]` is exempt (`BOT_AUTHORS`) in all four, with tests |
| The JS check counted every file in `js/.changeset/`. A changeset pending on `main` failed unrelated PRs (`Multiple changesets found`) and satisfied PRs that added none (false negative). | `js/scripts/validate-changeset.mjs` | Counts only the changesets added by the PR diff, like the other three |

### 4.2 Annotations on green runs

| Annotation (before) | Count | Fix | After |
| --- | --- | --- | --- |
| `The ubuntu-latest label will migrate to Ubuntu 26 beginning October 19, 2026` | 48 | Every runner label is pinned (`ubuntu-24.04`, `macos-15`, `windows-2025`), so the migration is an explicit diff and not a silent change | 0 |
| CodeQL csharp `Cannot build an overlay(-base) database because build-mode is set to "undefined"` | 2 | `build-mode: none` for every language | 0 |
| `PyPI has no project named "lino-objects-codec" yet` | 2 | True positive. See §3.1. | Remains until a maintainer registers the publisher |
| `Due to capacity constraints, jobs targeting macOS arm64 runners may experience longer queue times` | 4 | GitHub platform notice, not actionable | 4 |
| lychee `Summary report available at …` | 1 | Informational, by design | 1 |

The after-state comes from the 10 workflows on `05e59cc`, which all succeeded (`analysis/annotations-after.txt`): **0 warnings, 0 errors**.

### 4.3 Workflow security findings nobody was checking (best practice #14)

zizmor 1.30.1, `--min-confidence low`:

| Audit | Before | Fix |
| --- | --- | --- |
| `unpinned-uses` | 109 | Third-party actions are pinned by commit hash with a `# vX.Y.Z` comment. `actions/*`, `github/*`, `docker/*`, `lycheeverse/*` and `zizmorcore/*` stay on ref-pins (`.github/zizmor.yml`, the same policy as the templates). |
| `artipacked` | 44 | Every `actions/checkout` states `persist-credentials`, and it is `true` only in jobs that push |
| `template-injection` | 36 (13 error, 23 info) | Every `${{ }}` in a `run:` block moved to `env:` |
| `use-trusted-publishing` | 6 | Ignored, with a reason: trusted publishing needs a registry-side registration that no commit can do (§3.1) |
| `dependabot-cooldown` | 5 | Disabled, with a reason: a cooldown contradicts the freshness gate |
| `cache-poisoning` | 2 | The setup-node cache is disabled in the Python release jobs |
| **Total** | **248** (46 suppressed) | **0** (6 ignored, 44 suppressed) |

Before: `analysis/zizmor-before.txt`, `analysis/zizmor-before-by-audit.txt`. After: `analysis/zizmor-after.txt`. The mechanical rewrites were scripted, and the scripts are kept in `experiments/issue-71/`.

The new `.github/workflows/workflows.yml` runs both linters on every PR and push:

- **actionlint** runs from the digest-pinned Docker image. That image bundles shellcheck; a bare binary without shellcheck on `PATH` silently skips shell checks and still exits 0.
- **zizmor** runs with annotations, plus a pedantic high/high pass that covers the `docker://` reference.

The bare actionlint job in `scripts.yml` was removed in favour of `workflows.yml`.

### 4.4 CodeQL did not scan Rust

`security.yml` scanned JS, Python and C#. CodeQL Rust support became generally available, with build-mode `none`, in October 2025 (§8). Rust was added to the matrix.

---

## 5. Comparison with the templates and best practices (R2, R4)

The templates were cloned at their default branches and compared file by file.

| Best practice | This repository before | Templates | Result |
| --- | --- | --- | --- |
| #10 Concurrency: checks cancel, writers queue | Checks use `cancel-in-progress`. Writers use the job-level group `main-writer-${{ github.repository }}` with `queue: max`. | js, python and rust use writer groups but no `queue:`, so with the documented default (`single`) a third pending writer **cancels** the pending one. csharp uses only a workflow-scoped group and no writer group. | Already compliant here. Reported upstream. |
| #14 Lint the workflows themselves | actionlint only, as a bare binary without shellcheck; no zizmor | All four templates have `.github/workflows/workflows.yml` and `.github/zizmor.yml` | `workflows.yml` added |
| #16 Prove you can publish before you build | PyPI preflight existed (issue #68) | — | Kept, explained in §3.1 |
| #17 Tell a broken pipeline from a changed world | Freshness gated on push and schedule; `ubuntu-latest` floating; `bump_type` dispatch input without a default | — | Report mode, pinned labels, input defaults |
| Changeset policy | Dependabot red everywhere | The same in all four templates | Fixed here. Reported upstream. |
| CodeQL | csharp `build-mode` undefined | The csharp template has the same | Fixed here. Reported upstream. |

---

## 6. Debug and verbose switches (R8)

Every switch is off by default:

| Switch | Default | Where |
| --- | --- | --- |
| `PYPI_PREFLIGHT_VERBOSE` / `--verbose` | `0` (`1` only in the post-failure explainer) | `python/scripts/pypi_publish_preflight.py` |
| `REGISTRY_WAIT_VERBOSE` | `0` | Registry readback in csharp, python and rust |
| `FRESHNESS_MODE` / `--mode` | `gate` (`report` on push and schedule) | `scripts/check_dependency_freshness.py` |
| `DEBUG` | unset | `js/scripts/validate-changeset.mjs` prints the stack trace |

Every change-set check also always prints the changed source files and the changesets it counted. For the problems in this issue, the default output was enough to find each root cause. The one exception was the parity assertion, and §3.2 fixes its message.

---

## 7. Upstream reports (R3)

The bodies are in `upstream/`, and the URLs are in `upstream/filed.txt`. Each report contains a reproduction, a workaround and a suggested code change.

| Template | Issue | Problem |
| --- | --- | --- |
| js | [#232](https://github.com/link-foundation/js-ai-driven-development-pipeline-template/issues/232) | The changeset check is red on every Dependabot PR |
| js | [#233](https://github.com/link-foundation/js-ai-driven-development-pipeline-template/issues/233) | The writer group has no `queue: max`, so pending releases are cancelled |
| python | [#104](https://github.com/link-foundation/python-ai-driven-development-pipeline-template/issues/104) | Dependabot changeset false positive |
| python | [#105](https://github.com/link-foundation/python-ai-driven-development-pipeline-template/issues/105) | Writer `queue`, and a stale comment calling `queue` a typo |
| rust | [#198](https://github.com/link-foundation/rust-ai-driven-development-pipeline-template/issues/198) | Dependabot changelog-fragment false positive |
| rust | [#199](https://github.com/link-foundation/rust-ai-driven-development-pipeline-template/issues/199) | Writer `queue` |
| csharp | [#71](https://github.com/link-foundation/csharp-ai-driven-development-pipeline-template/issues/71) | Dependabot changeset false positive |
| csharp | [#72](https://github.com/link-foundation/csharp-ai-driven-development-pipeline-template/issues/72) | Only a workflow-scoped concurrency group: no writer group, no `queue` |
| csharp | [#73](https://github.com/link-foundation/csharp-ai-driven-development-pipeline-template/issues/73) | CodeQL `build-mode` undefined warning |

---

## 8. Online research and existing components

- **GitHub `concurrency.queue`**: the [workflow syntax docs](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#concurrency) define `single` as the default (a new pending run replaces the existing pending one) and `max` as up to 100 pending runs. `queue: max` together with `cancel-in-progress: true` is a validation error.
- **actionlint** 1.7.12 does not know `queue` yet. Support is in the open [rhysd/actionlint#654](https://github.com/rhysd/actionlint/pull/654). Until that is released, `workflows.yml` ignores exactly that one message.
- **zizmor** ([docs.zizmor.sh](https://docs.zizmor.sh/)) and **zizmorcore/zizmor-action** are used as-is, with no custom security linter.
- **CodeQL Rust**: [Rust and C/C++ scanning without builds is generally available](https://github.blog/changelog/2025-10-14-codeql-scanning-rust-and-c-c-without-builds-is-now-generally-available) (2025-10-14), and [CodeQL 2.23.3](https://github.blog/changelog/2025-10-23-codeql-2-23-3-adds-a-new-rust-query-rust-support-and-easier-c-c-scanning).
- **PyPI trusted publishing**: [pending publishers](https://docs.pypi.org/trusted-publishers/creating-a-project-through-oidc/) let a project be created by its first OIDC upload. The `invalid-publisher` error is documented in [pypa/gh-action-pypi-publish](https://github.com/pypa/gh-action-pypi-publish).

---

## 9. Commits in this pull request

| Commit | What |
| --- | --- |
| `d25e96c` | Bump serde_json to 1.0.154 |
| `8c4ed09` | Freshness: gate on PRs and dispatch, report on push and schedule |
| `b1a818a` | Changeset checks: count only PR-added changesets (JS), exempt Dependabot (all four) |
| `86c9b79` | `workflows.yml` (actionlint and zizmor), 248 → 0 zizmor findings, pinned runners, CodeQL `build-mode: none` and Rust, release `if:` fixes |
| `cbed6be` | Freshness parser reads hash pins and linter versions |
| `d4e6b1f` | Python: collect changelog fragments after the bump, under the new version |
| `05e59cc` | Remove the PR placeholder |
| `5f3d572` | Name the actionlint PR that retires the `queue` ignore |
| `ca7cebc` | Parity test names the disagreeing pins |

---

## 10. Remaining limits

1. **PyPI publishing stays red until a maintainer acts** (§3.1). This is a true positive. Hiding it would create a false negative.
2. **Merging red** is what let the parity break reach `main`. Required status checks under branch protection are a repository setting, not something a commit can change. Recommended required checks: Parity, Shared CI Scripts, Workflows, and each language's build and changeset jobs.
3. **Why Dependabot skipped the npm, pip and cargo bumps** for links-notation 0.25 is not established (§3.2). The next step is to read the Dependabot job logs as a repository admin. The parity gate catches the drift either way.
4. **Old Python fragments.** `python/changelog.d/` still holds fragments from earlier issues that were never collected, because PyPI publishing never succeeded. The next successful release collects them under its version (§3.5).
5. The macOS capacity notices and the lychee summary notice are platform and informational output. They stay.
