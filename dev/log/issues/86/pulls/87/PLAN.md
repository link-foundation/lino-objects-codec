# Issue 86 / PR 87 work plan

Objective: implement and verify every requirement in issue 86 in this single PR; preserve existing behavior and forward-moving history. Never merge this PR as part of the solver session.

## Requirements and verification checklist

- [x] Read the complete issue and comments, PR conversation, inline comments and reviews. No required sub-issues are named. Preserve snapshots under `meta/`.
- [x] Investigate merged Dependabot PR 83 and default-branch failures using timestamp/SHA-matched logs. Reproduce/fix the JavaScript manifest lookup; retain both merged updates. Document the external Python publisher failure separately.
- [x] Inventory every manifest, lockfile, workflow tool, runtime and hook; resolve latest stable versions from authoritative registries and record before/latest/after tables, including transitives and justified exceptions.
- [x] Update JavaScript first, including npm lockfile, major migrations and runtime/tool pins.
- [x] Update Python second, including build/dev floors, hooks, runtime, and universal hash-locked resolution verified on Windows and Linux.
- [x] Update Rust third, including all six experiment/library manifests and all lockfiles, edition/toolchain and build tools.
- [x] Update .NET fourth, including all five listed projects/configurations, SDK/framework and test/coverage tools.
- [x] Update every GitHub Action, workflow binary/container pin, and pre-commit revision. Check shell/HTML/Jinja files for fetched dependencies; no unrelated infrastructure manifests invented.
- [x] Keep repeated live pins consistent repository-wide. Historical research and regression fixture version strings remain evidence, not install pins. Latest parser patch differs by registry, explicitly documented.
- [x] Read changelogs/migration guides for major changes, adopt replacement upstream APIs where applicable, and remove superseded shims.
- [x] Search upstream issues for dependency bugs/missing features/duplicated general logic; file seven reports/updates with reproducible findings and retain necessary workarounds.
- [x] Extend Dependabot to cover every actual ecosystem/directory, including SDK and pre-commit.
- [x] Add release fragments using existing release automation; do not manually bump package versions prohibited by CI.
- [x] Run full build/test/lint for each ecosystem sequentially within 2.92 GiB; resolve new diagnostics without relaxing checks. Audit both npm locks, full Python environment, six Cargo locks and .NET entry points.
- [ ] **Blocked:** no unresolved advisories / green Security. Latest official npm bundles vulnerable glob/minimatch (two advisories, 21 propagated moderate findings); consumer overrides cannot repair the bundle. Await a fixed official release; retain the strict failure.
- [ ] **Blocked:** default-branch PyPI publishing / completely green main. A PyPI owner must configure the Trusted Publisher described in `ANALYSIS.md`; this workspace has no PyPI account authority. Main cannot use branch fixes until an owner merges the PR.
- [x] Commit atomic source steps, push only `issue-86-35430a936d8f`, update PR title/body with reproduction and verification plus `Fixes #86`.
- [x] Fetch latest main (023932f), confirm it is already incorporated; inspect `gh pr diff`, source diff and lock metadata for regressions and removed features.
- [x] Verify all ten source-commit workflows at df9435e; preserve/diagnose nonpassing logs. Nine workflows pass; Security fails only on the documented npm advisories. C# manual CodeQL builds succeed.
- [ ] Final evidence commit: recheck exact-HEAD CI until every run finishes, record the result in a PR conversation comment, mark PR 87 ready for review, and confirm a clean working tree. The authoritative final receipt is linked from PR 87; this checklist does not claim blocked criteria are complete.

## Approach

1. Capture source material, inspect existing freshness/parity/release implementations, and establish failures.
2. Build registry-backed inventory and research migration choices/components before editing.
3. Draft changes in requested ecosystem order, with targeted reproductions for discovered bugs and release fragments.
4. Validate full suites and audits with logs, then push and inspect CI for the exact latest SHA.
5. Update analysis/requirement evidence and PR description; complete self-review and ready the PR.

## Resource policy

Keep logs in this folder (large raw logs are ignored unless explicitly preserved). No parallel compilers. Rust uses `CARGO_BUILD_JOBS=1`, reduced debug information when needed. Stress probes must have finite inputs and explicit resource limits. Prefer registry queries and existing tools over installing heavy update tooling.
