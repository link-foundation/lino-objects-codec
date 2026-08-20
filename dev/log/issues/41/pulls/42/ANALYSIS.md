# Deep analysis — issue #41 "Check for all false positives, false negatives, warnings and errors in CI/CD and fix them all"

- Issue: <https://github.com/link-foundation/lino-objects-codec/issues/41>
- Pull request: <https://github.com/link-foundation/lino-objects-codec/pull/42>
- Evidence: `dev/log/issues/41/pulls/42/` (collected before any change was made)

---

## 1. Timeline of events

All timestamps are UTC, taken from the run/step JSON in `meta/` and the log lines in `ci-logs/`.

| Time | Event | Evidence |
| --- | --- | --- |
| 2026-08-20T07:40:32Z | PR #40 (issue #39, cross-language parity gate) merged to `main` as `41e3f4a` | `meta/runs.json` |
| 07:40:42Z | Push of `41e3f4a` triggers the four language workflows | `meta/run-*.json` |
| 07:41:49Z | **Python** `Auto Release / Publish to PyPI` fails: `invalid-publisher: valid token, but no corresponding publisher` | `ci-logs/python-32345106245.log` |
| 07:42:59Z | **C#** `dotnet nuget push` succeeds — `Created https://www.nuget.org/api/v2/package/ 673ms` / `Your package was pushed.` | `ci-logs/csharp-32345106283.log` |
| 07:43:00Z–07:44:00Z | **C#** `Verify package on NuGet` polls the flat-container API 6× at 10 s intervals; every attempt returns `404`; the step calls `::error` and exits 1 | `ci-logs/csharp-32345106283.log` |
| 07:43:1xZ | **JavaScript** and **Rust** runs finish green — but with warnings (see §4) | `ci-logs/js-*.log`, `ci-logs/rust-*.log` |
| 07:44:40Z | Issue #41 filed | `meta/issue-41.json` |
| 07:45:21Z | Parity workflow on the PR branch succeeds | `ci-logs/parity-32345476295.log` |
| 07:47:27Z | Manual probe of `https://api.nuget.org/v3-flatcontainer/lino.objects.codec/index.json` → still `BlobNotFound` (~4½ min after push) | `analysis/registry-presence.txt` |
| 07:49:23Z | Same probe → **HTTP 200**, body `{"versions":["0.2.0"]}` (~6½ min after push) | `analysis/registry-presence.txt` |

The last two rows are the proof: the package the C# job declared missing **was published successfully**.
The job was red because it stopped looking too early.

---

## 2. Every requirement in the issue

The issue body is short, so each sentence is a requirement. They are numbered here and
referenced by number for the rest of this document.

| # | Requirement (verbatim intent) | Where it is addressed |
| --- | --- | --- |
| **R1** | Find and fix **all** false positives, false negatives, warnings and errors in CI/CD | §3 (errors / false negatives), §4 (warnings), §5 (false positives) |
| **R2** | Use all the best practices from the CI/CD templates; check the full file tree to compare every GitHub workflow and CI/CD script | §6 |
| **R3** | If the same issue exists in a template, report it upstream in the templates too | §7 |
| **R4** | Follow the CI/CD best practices in `link-assistant/hive-mind/docs/CI-CD-BEST-PRACTICES.md` | §6, cross-referenced by rule number |
| **R5** | Plan and execute everything in this single pull request until every requirement is fully addressed | §8 (execution plan), PR #42 |

The four templates used as the yardstick for R2:

- `link-foundation/js-ai-driven-development-pipeline-template`
- `link-foundation/python-ai-driven-development-pipeline-template`
- `link-foundation/rust-ai-driven-development-pipeline-template`
- `link-foundation/csharp-ai-driven-development-pipeline-template`

---

## 3. Errors and false negatives (R1)

### 3.1 C# — `Verify package on NuGet` is a **false negative** (confirmed)

**Symptom.** `C# CI/CD / Auto Release` red, with:

```
::error title=NuGet verification failed::Lino.Objects.Codec@0.2.0 is not on NuGet after publish.
```

**What actually happened.** The push succeeded. Six polls over 60 s all returned 404. The
package became visible at ~6½ minutes.

**Root cause.** `.github/workflows/csharp.yml` verifies with a hard-coded
`for i in 1 2 3 4 5 6; do … sleep 10; done` — a **60-second budget** — against
`https://api.nuget.org/v3-flatcontainer/{id}/{version}/{id}.nuspec`. NuGet's flat-container
(package base address) resource is a CDN-fronted static blob store that is populated by an
asynchronous indexing pipeline *after* the gallery accepts the upload. The push API returning
`201 Created` says nothing about flat-container visibility. NuGet's own gallery issue tracker
documents `BlobNotFound` responses for packages that are already listed on nuget.org
(NuGet/NuGetGallery#9105, #5887), and the **C# pipeline template in this very organisation**
encodes the expectation explicitly in `scripts/wait-for-nuget.mjs`:

> "NuGet's flat-container API can take up to 15 minutes to reflect a newly pushed package (see issue #13)"

So the repository is using a 60-second timeout for an operation the org's own template says
can take 15 minutes. **The verification budget is 15× too small.** This is not flakiness —
it is a deterministic failure whenever indexing takes longer than a minute, which is the
common case for a brand-new package version.

**Second defect in the same file.** The `manual-release` job pushes to NuGet but has **no
verification step at all**. So the two release paths disagree: the automatic one is
over-strict (fails on a successful publish), the manual one is under-strict (would stay green
on a genuinely failed publish). That asymmetry is itself a latent false *positive* (§5.2).

**Fix.** Port the template's `scripts/wait-for-nuget.mjs` (bounded ~15-minute poll with
exponential backoff, structured output, verbose mode) plus its unit test, call it from
**both** the auto-release and manual-release jobs, and distinguish "not indexed yet" from
"push failed" in the error text.

### 3.2 Python — `Publish to PyPI` is a **real error** (external configuration)

**Symptom.**

```
::error::Trusted publishing exchange failure:
invalid-publisher: valid token, but no corresponding publisher (Publisher with matching claims was not found)
  * sub: repo:link-foundation/lino-objects-codec:ref:refs/heads/main
  * workflow_ref: link-foundation/lino-objects-codec/.github/workflows/python.yml@refs/heads/main
  * environment: MISSING
```

**Root cause.** `https://pypi.org/pypi/lino-objects-codec/json` returns **404** — the project
has never been published. For a project that does not yet exist, PyPI requires a
[**pending publisher**](https://docs.pypi.org/trusted-publishers/creating-a-project-through-oidc/)
to be registered under the publishing account *before* the first upload; a normal
(project-scoped) trusted publisher cannot be created because there is no project to scope it
to. No pending publisher exists for `lino-objects-codec`, therefore the OIDC token PyPI
receives is valid and correctly signed but matches no publisher record, which is exactly the
`invalid-publisher` class of failure documented in
[PyPI's troubleshooting guide](https://docs.pypi.org/trusted-publishers/troubleshooting/).

The `environment: MISSING` claim is a contributing risk rather than the cause here: because
the workflow declares no `environment:`, PyPI can only match a publisher configured *without*
an environment. If the pending publisher is later created *with* an environment name, this
same error returns. The workflow and the PyPI configuration must agree on all four claims
(owner, repository, workflow filename, environment).

**This cannot be fixed from inside the repository** — it needs a one-time action in the PyPI
account settings. What *can* and must be fixed in code is the diagnosis: today the job dies
with a raw OIDC error and no indication that the operator has to go configure something.

**Fix.**
1. A **preflight** step that probes PyPI for the project and, when absent, prints an explicit
   runbook: "this project does not exist on PyPI; create a pending publisher with
   owner=…, repository=…, workflow=python.yml, environment=(leave blank)".
2. A `PYPI_API_TOKEN` fallback so the first publish can be done with a token when trusted
   publishing is not yet wired up, matching what the Python template does.
3. Turn the raw OIDC failure into an annotated, actionable error instead of a stack trace.

### 3.3 Python — post-publish verification window is 25 seconds

```
for i in 1 2 3 4 5; do … sleep 5; done
```

Same class of defect as §3.1, one order of magnitude worse. PyPI's JSON API is fast but not
instantaneous, and the `pip install` smoke test the template runs needs the file to reach the
CDN. The Python template uses `DEFAULT_INSTALL_ATTEMPTS = 6` with
`DEFAULT_INSTALL_DELAY_SECONDS = 20.0` (120 s) for exactly this reason. Even though this step
did not fire in the collected run (the publish failed first), it is a false negative waiting
to happen and must be fixed in the same pass.

### 3.4 Rust — no post-publish verification at all

`rust.yml` runs `cargo publish` and tolerates `already (uploaded|exists)`, then stops. There
is no crates.io readback. JS, Python and C# all verify; Rust does not. This is the mirror
image of §3.1: instead of a false negative it is a blind spot (§5.2).

---

## 4. Warnings (R1)

Every warning below was extracted from the collected logs. All four language runs are affected.

### 4.1 Node 20 deprecation — **all five workflows**

```
Node.js 20 actions are deprecated. Please update the following actions to use Node.js 24
```

| Action | Pinned here | Current |
| --- | --- | --- |
| `actions/checkout` | v4 | v7 |
| `actions/setup-node` | v4 | v7 |
| `actions/setup-python` | v5 | v7 |
| `actions/setup-dotnet` | v4 | v6 |
| `actions/upload-artifact` | v4 | v7 |
| `actions/download-artifact` | v4 | v8 |
| `actions/cache` | v4 | v6 |
| `codecov/codecov-action` | v4 | v7 |

GitHub announced the Node 20 runtime deprecation on 2025-09-19. These are warnings today and
hard failures once the runtime is removed — a scheduled outage of the entire release pipeline.
The templates are already on the v6/v7 generation.

### 4.2 Codecov — token missing on a protected branch

```
['warning'] Branch `main` is protected but no token was provided
```

Appears in the Python and C# runs. Coverage uploads from protected branches are rejected
without `CODECOV_TOKEN`, so coverage silently stops being recorded — a **silent** false
positive (the job is green, the data never arrives).

### 4.3 NuGet — package has no readme

```
warn : Readme missing. Go to https://aka.ms/nuget-include-readme
```

`csharp/src/Lino.Objects.Codec/Lino.Objects.Codec.csproj` has no `<PackageReadmeFile>`. The
template csproj packs the repository README.

### 4.4 setuptools — deprecated license declaration + missing licence file

```
SetuptoolsDeprecationWarning: `project.license` as a TOML table is deprecated
  !! …will be removed in a future version of setuptools (by 2027-Feb-18)
SetuptoolsWarning: File '/…/python/LICENSE' cannot be found
```

`python/pyproject.toml` uses `license = {file = "LICENSE"}` and points at `python/LICENSE`,
which **does not exist** (the licence lives at the repository root). Two defects in one line:
a deprecated form and a broken path. PEP 639 replaces it with an SPDX string plus
`license-files`.

### 4.5 ESLint — complexity warnings in the JavaScript codec

```
js/src/…  219:3   warning  Method '_encodeValue' has a complexity of 23. Maximum allowed is 15
js/src/…  344:3   warning  Method '_decodeLink'  has a complexity of 55. Maximum allowed is 15
js/src/…  344:14  warning  Method '_decodeLink'  has too many statements (95). Maximum allowed is 60
```

**Constraint.** `scripts/check-language-parity.mjs` (added by PR #40 for issue #39) fails the
build if any language's `src/` changes without all four changing. Refactoring `js/src/` alone
is therefore not possible; either the refactor is mirrored in Python, Rust and C#, or the PR
opts out with `[skip-parity]`. Since the refactor is cosmetic and cross-language behavioural
parity is the more valuable invariant, the right call is to leave the codec bodies alone in
this PR and record the debt, rather than risk four simultaneous hand-refactors of the most
delicate code in the repository inside a CI-hygiene PR.

### 4.6 npm — unknown user config

```
npm warn Unknown user config "always-auth"
```

Emitted by `actions/setup-node` whenever `registry-url` is set; npm 9 removed `always-auth`.
Fixed by upgrading `setup-node` (§4.1).

### 4.7 npm audit — 7 vulnerabilities

```
7 vulnerabilities (2 moderate, 5 high)
```

`ajv <6.14.0`, `brace-expansion <=1.1.17`, `flatted <=3.4.1`, `js-yaml`, `minimatch <=3.1.3`,
`picomatch <=2.3.1`, `yaml 2.0.0–2.8.2` — all transitive dev dependencies, all with
`fix available via npm audit fix`. Nothing in the pipeline fails or even reports on this
today, because there is no security workflow (§6.6).

---

## 5. False positives (R1)

A false positive here means **CI is green while something is actually wrong**.

### 5.1 Coverage is not being uploaded

§4.2 — green job, no data. The step should fail, or at minimum annotate, when the upload is
rejected.

### 5.2 Publish steps that cannot fail

- `manual-release` in `csharp.yml` pushes to NuGet and never verifies (§3.1).
- `rust.yml` publishes to crates.io and never verifies (§3.4).

In both cases a partial or rejected publish leaves a green checkmark and a version number that
does not exist in the registry — the most damaging kind of false positive, because downstream
consumers only discover it at install time.

### 5.3 No security or link checking at all

The repository has no CodeQL, no dependency review, no `npm audit` gate, and no link checker,
while all four templates ship `security.yml` and `links.yml`. Every run is green partly
because nothing is being checked. §4.7's seven vulnerabilities are the concrete proof.

### 5.4 `always()` instead of `!cancelled()`

`js.yml` and `rust.yml` gate summary/aggregate jobs with `always()`. `always()` runs the job
even when the workflow was **cancelled**, which can turn a cancellation into a reported
success. `!cancelled()` is the correct guard (best practice #12).

---

## 6. Best-practice gap analysis (R2, R4)

Rule numbers refer to `templates/CI-CD-BEST-PRACTICES.md`.

| Rule | Requirement | This repository | Gap |
| --- | --- | --- | --- |
| #1 | Least-privilege top-level `permissions` | only `parity.yml` has it | ✗ four workflows |
| #3 | Every job has `timeout-minutes` | only `parity.yml` has it | ✗ four workflows |
| #7 | Simulate a fresh merge with the base branch | absent | ✗ all |
| #10 | Writer jobs: repo-scoped concurrency group, `cancel-in-progress: false`, `queue: max` | workflow-level `cancel-in-progress: true` on workflows that contain release jobs | ✗ — a release can be cancelled mid-publish |
| #12 | `!cancelled()` rather than `always()` | `always()` in js/rust | ✗ |
| — | Post-publish registry verification, generous budget | 60 s (C#), 25 s (Python), none (Rust) | ✗ |
| — | Change detection job | present in js/rust, absent in python/csharp | ✗ |
| — | OS matrix for tests | js/rust/csharp use 3 OSes; Python is ubuntu-only, single version | ✗ |
| — | `security.yml` (CodeQL, dependency-review, audit) | absent | ✗ |
| — | `links.yml` (lychee) | absent | ✗ |
| — | Current action major versions | Node 20 generation | ✗ |

`cancel-in-progress: true` at **workflow level** (rule #10) deserves emphasis: it applies to
the release job as much as to the test jobs. Two pushes to `main` in quick succession can
cancel a run that has already executed `dotnet nuget push` / `cargo publish` but not yet
recorded the outcome — producing exactly the "published but CI says otherwise" state this
issue is about. The fix is the template's split: readers cancel, writers queue.

---

## 7. Existing components and upstream reports (R3)

### Reusable components already available in the organisation

Nothing needs to be invented; the templates already solve every problem found:

| Problem | Existing component |
| --- | --- |
| NuGet indexing lag (§3.1) | `csharp-…-template/scripts/wait-for-nuget.mjs` + `.test.mjs` (15-minute bounded poll) |
| Post-publish smoke test (C#) | `csharp-…-template/scripts/smoke-test-nuget-package.mjs` + `.test.mjs` |
| Post-publish smoke test (Python) | `python-…-template/scripts/smoke_test_published_package.py` |
| Robust npm publish + verification | `js/scripts/publish-to-npm.mjs` — **already in this repository**, and the model the other three languages should follow |
| Security scanning | `js-…-template/.github/workflows/security.yml` (CodeQL `[javascript-typescript, actions]`, `dependency-review-action@v5` `fail-on-severity: high`, `npm audit --audit-level=high`) |
| Link checking | `js-…-template/.github/workflows/links.yml` (`lychee-action@v2`, `--exclude-path docs/case-studies`, plus `scripts/check-web-archive.mjs`) |

Third-party options considered and rejected: `nick-fields/retry` (adds a dependency for a
loop we already have), `pypa/gh-action-pypi-publish`'s own retry (does not cover the
readback), `dotnet nuget verify` (verifies signatures, not registry presence).

### Defects that also exist in the templates → upstream reports (R3)

| Defect | Template(s) affected | Action |
| --- | --- | --- |
| Node 20 actions | verified current in the templates — **not** an upstream defect | none |
| No crates.io post-publish verification | Rust template has the same blind spot as §3.4 | report upstream |
| Publish verification budget hard-coded inline instead of using the shared script | Python template's PyPI readback is shorter than its own install smoke test | report upstream |

---

## 8. Execution plan (R5)

Ordered so that each step is independently useful and independently committable.

1. **Evidence** — commit `dev/log/issues/41/pulls/42/` (done: `cde9620`).
2. **C# false negative** — add `scripts/wait-for-nuget.mjs` + unit test; call it from both
   `auto-release` and `manual-release`; verbose mode off by default.
3. **Python real error** — PyPI preflight + runbook + `PYPI_API_TOKEN` fallback; widen the
   readback window.
4. **Rust blind spot** — add a crates.io readback with the same budget discipline.
5. **Action versions** — bump every action to its current major across all five workflows.
6. **Codecov** — pass `CODECOV_TOKEN`, bump to v7.
7. **Manifest warnings** — `<PackageReadmeFile>` for C#; PEP 639 licence for Python.
8. **`npm audit fix`** in `js/`.
9. **Workflow hardening** — top-level `permissions`, `timeout-minutes` on every job,
   reader/writer concurrency split, `!cancelled()`, fresh-merge simulation, `detect-changes`
   for Python and C#, Python OS/version matrix.
10. **New workflows** — `security.yml`, `links.yml`.
11. **Upstream reports** — file the issues listed in §7.
12. **Release trigger** — bump versions / add changesets so the fixed pipeline actually
    publishes.

### Verbose / debug mode (default off)

Where the evidence was insufficient to see *why* a step failed, the fix adds tracing rather
than a guess:

- `wait-for-nuget.mjs` — `--verbose` / `NUGET_WAIT_VERBOSE=1` prints every poll's URL, status,
  elapsed time and response headers.
- Python publish preflight — `PYPI_PREFLIGHT_VERBOSE=1` prints the resolved OIDC claims and the
  PyPI project probe result, so the next `invalid-publisher` failure names the mismatched claim.
- Rust readback — `CRATES_WAIT_VERBOSE=1`.

All three default to off, so normal runs stay quiet.
