# CI repair continuation (2026-11-14)

Objective: complete issue #86 and PR #87, including the npm lock audit and separate CodeQL findings check. Preserve security findings and enforce every new advisory; apply the user's explicit external-action fallback narrowly.

- [x] Read the complete issue, all issue comments, PR conversation, inline comments and reviews; no required sub-issues are specified. Existing requirement inventory, registry tables and migration research remain applicable.
- [x] Fetch default branch and verify main (023932f) is incorporated.
- [x] Preserve exact-SHA (235d954) failed Security log and all five CodeQL check annotations. CodeQL workflow jobs succeeded while the separate findings check failed. Inventory all ten open code-scanning alerts, including equivalent C#/Python and private-data logging defects.
- [x] Reproduce and repair every reported pattern, search equivalent release implementations, and add bounded regression tests. Replace duplicated JS release extraction with RegExp.escape and use URL parsing, argument-safe commands and linear identifier trimming.
- [x] Recheck official npm registry latest and glob/minimatch major changelogs. There is still no supported fixed npm bundle. Audit both real lockfiles: PR mode reports only the two exact known bundle advisories; main mode fails with explicit human action. Tests reject other events, changed versions, nonbundled/application copies, new advisories and registry/process/report errors.
- [x] Preserve the zero-unresolved-advisories acceptance criterion as unfinished, update the existing upstream report and document both npm and PyPI manual actions. All original registry tables and retained-version reasons remain available.
- [ ] Push atomic commits only to issue-86-35430a936d8f; wait for all exact-HEAD CI checks, including the separate CodeQL findings check.
- [ ] Review final diff, confirm clean status/latest-main ancestry, update PR title/body and mark PR ready. Record final CI results in the PR conversation without claiming unresolved external criteria are complete.
