# Development log — issue #41 / pull request #42

> Check for all false positives, false negatives, warnings and errors in CI/CD and fix them all
>
> - Issue: https://github.com/link-foundation/lino-objects-codec/issues/41
> - Pull request: https://github.com/link-foundation/lino-objects-codec/pull/42

This folder holds the **evidence collected before any change was made**, plus the analysis
derived from it. Nothing here is generated after the fixes; the logs are the pristine
GitHub Actions output of the runs the issue points at.

## Layout

| Path | Contents |
| --- | --- |
| `ci-logs/` | Full `gh run view --log` output of every run referenced by the issue |
| `meta/` | Run/job/step JSON, issue and pull request metadata, comment dumps |
| `templates/` | The upstream CI/CD best-practices document used as the yardstick |
| `analysis/` | Registry probes and derived analysis |
| `ANALYSIS.md` | Timeline, requirement list, root causes, solution plans |

## Collected runs

| Workflow | Run | Commit | Conclusion | Log |
| --- | --- | --- | --- | --- |
| Python CI/CD | [32345106245](https://github.com/link-foundation/lino-objects-codec/actions/runs/32345106245) | `41e3f4a` | failure | `ci-logs/python-32345106245.log` |
| C# CI/CD | [32345106283](https://github.com/link-foundation/lino-objects-codec/actions/runs/32345106283) | `41e3f4a` | failure | `ci-logs/csharp-32345106283.log` |
| JavaScript CI/CD | [32345106180](https://github.com/link-foundation/lino-objects-codec/actions/runs/32345106180) | `41e3f4a` | success | `ci-logs/js-32345106180.log` |
| Rust CI/CD | [32345106299](https://github.com/link-foundation/lino-objects-codec/actions/runs/32345106299) | `41e3f4a` | success | `ci-logs/rust-32345106299.log` |
| Cross-Language Parity | [32345476295](https://github.com/link-foundation/lino-objects-codec/actions/runs/32345476295) | `cd52cd7` | success | `ci-logs/parity-32345476295.log` |

The two green runs are collected on purpose: the issue asks for **false positives** and
**warnings**, and both live in runs that ended green.

## How the evidence was collected

```bash
gh run view <id> --repo link-foundation/lino-objects-codec --log  > ci-logs/<name>-<id>.log
gh run view <id> --repo link-foundation/lino-objects-codec --json databaseId,name,status,conclusion,createdAt,updatedAt,headSha,jobs \
  > meta/run-<name>-<id>.json
```

Registry state was probed with plain `curl` against the four public registry APIs; the
output is preserved verbatim in `analysis/registry-presence.txt`.
