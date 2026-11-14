# Issue 86 / pull request 87 evidence

Issue: https://github.com/link-foundation/lino-objects-codec/issues/86

PR: https://github.com/link-foundation/lino-objects-codec/pull/87

- [Analysis and all 24 requirement groups](ANALYSIS.md): actual failures, possible solutions, chosen implementation, verification and external blockers.
- [Dependency comparison](DEPENDENCIES.md): every before/latest/after declaration and lock entry, registry resolved on 2026-11-14; [retained versions](EXCEPTIONS.md) explain every exception.
- [Migration review](MIGRATIONS.md): primary changelogs, major API implications, upstream features adopted and obsolete shims removed.
- [Verification](VERIFICATION.md): complete local suites, artifact checks, audits, CI corrections, exact failure evidence and reproduction commands.
- [Plan](PLAN.md): completed work and explicitly unfinished external criteria.
- `meta/`: complete issue/feedback snapshots, three PR comment types, recent merged PR style, SHA/timestamp-matched CI history, source diff review.
- `research/`: raw registry inventories, primary release/migration receipts, project comparison and dependency-update practices.
- `upstream/`: prior-issue searches, report bodies and published URL receipts. Necessary workarounds remain until released fixes exist.
- `ci-logs/`: original main failures, new-platform corrections and npm security evidence, preserved with run/job identifiers.
- `verification/`: selected local test/build/lint/audit logs. Failed intermediate logs are historical investigation evidence, not final success claims.

Reusable research/reproduction scripts live in `experiments/issue-86/`. Downloaded SDKs, caches, generated artifacts and tool installations are excluded. No screenshot is needed: this change updates codecs, dependency tooling and CI, without a visual UI change.

**Unfinished:** the latest npm CLI ships two known advisories, so strict Security remains red; main PyPI publishing needs an account owner to configure Trusted Publishing. Neither is represented as completed by passing application tests or an upstream report.
