# Development log for issue #71 and pull request #72

> Check for all false positives, false negatives, warnings and errors in CI/CD and fix them all

- Issue: https://github.com/link-foundation/lino-objects-codec/issues/71
- Pull request: https://github.com/link-foundation/lino-objects-codec/pull/72

This folder holds the evidence collected **before** any change was made, the analysis based on it, and the reports filed upstream. The logs are the unmodified GitHub Actions output.

## Layout

| Path | Contents |
| --- | --- |
| `ci-logs/` | `gh run view --log` (and `--log-failed`, as `*.failed.log`) of every run in the timeline |
| `meta/` | Run list, issue #71, PR #67 and PR #72 metadata |
| `templates/` | The hive-mind `CI-CD-BEST-PRACTICES.md` used as the yardstick (copied 2026-10-11) |
| `analysis/` | Annotations before and after, zizmor and actionlint before and after, extracted errors |
| `upstream/` | Bodies of the issues filed in the four template repositories, plus `filed.txt` with their URLs |
| `ANALYSIS.md` | Timeline, requirement list, root causes, fixes, research, upstream reports |

## Collected runs

| Workflow | Run | Commit | Event | Conclusion |
| --- | --- | --- | --- | --- |
| Python CI/CD | [37559124943](https://github.com/link-foundation/lino-objects-codec/actions/runs/37559124943) | `67eeea5` | push | failure |
| C# CI/CD | [37956144601](https://github.com/link-foundation/lino-objects-codec/actions/runs/37956144601) | `3bc957c` (Dependabot PR #67) | pull_request | failure |
| Cross-Language Parity | [37956144558](https://github.com/link-foundation/lino-objects-codec/actions/runs/37956144558) | `3bc957c` | pull_request | failure |
| Dependency Freshness | [37956144485](https://github.com/link-foundation/lino-objects-codec/actions/runs/37956144485) | `3bc957c` | pull_request | failure |
| Shared CI Scripts | [37956144479](https://github.com/link-foundation/lino-objects-codec/actions/runs/37956144479) | `3bc957c` | pull_request | failure |
| Dependency Freshness | [38138700301](https://github.com/link-foundation/lino-objects-codec/actions/runs/38138700301) | `b48872d` (PR #67 merged) | push | failure |
| Shared CI Scripts | [38138700169](https://github.com/link-foundation/lino-objects-codec/actions/runs/38138700169) | `b48872d` | push | failure |
| Parity, Freshness, Shared CI Scripts | 38143511775, 38143511774, 38143511771 | `f14972f` (PR #70 branch) | pull_request | failure |
| Cross-Language Parity | [38145303724](https://github.com/link-foundation/lino-objects-codec/actions/runs/38145303724) | `c9c266d` | pull_request | success |
| All eight `main` workflows in the issue table | 38145827832 … 38145827909 | `03e1e05` (PR #70 merged) | push | Python failure, rest success |
| Dependency Freshness | [38154982948](https://github.com/link-foundation/lino-objects-codec/actions/runs/38154982948) | `3d0abdb` (this PR, first commit) | pull_request | failure |
| Security, Shared CI Scripts, Parity | 38154982941, 38154982936, 38154982923 | `3d0abdb` | pull_request | success |

Green runs are collected on purpose: the issue asks about **warnings** and **false negatives**, and those show up in runs that pass.

## How the evidence was collected

```bash
gh run list --repo link-foundation/lino-objects-codec --limit 100 --json databaseId,workflowName,headSha,event,conclusion,createdAt,headBranch > meta/runs.json
gh run view <id> --repo link-foundation/lino-objects-codec --log        > ci-logs/<Workflow>-<id>.log
gh run view <id> --repo link-foundation/lino-objects-codec --log-failed > ci-logs/<Workflow>-<id>.failed.log
# annotations: per job, through the check-runs API
gh api repos/link-foundation/lino-objects-codec/check-runs/<job-id>/annotations
# workflow linters, from the repository root
actionlint -ignore 'unexpected key "queue" for "concurrency" section'
zizmor --config .github/zizmor.yml --min-confidence low .github/workflows
```

`analysis/actionlint-before.txt` and `analysis/actionlint-after.txt` are empty because actionlint reported nothing on either side. The findings came from zizmor and from the logs.
