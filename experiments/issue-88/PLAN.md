# Issue 88 / PR 89

Objective: implement and verify all requested criteria in PR 89; leave external
publication criteria explicitly unfinished if account access blocks them.

## Requirements and verification

- [ ] Set the oldest supported Python version, matching runtime dependencies.
  `links-notation` 0.31.5 declares >=3.11. Validate installation and tests on 3.11.
- [ ] Align classifiers, Ruff/mypy targets, development lock and CI matrix.
  Exercise supported Python releases and preserve Linux/macOS/Windows coverage.
- [ ] Reproduce old metadata rejecting an available interpreter; verify isolated
  `python -m build`, sdist/wheel metadata, installation and codec round trips.
- [ ] Include a release trigger (version bump/changelog fragment).
- [ ] Publish to PyPI through the pending/trusted publisher and verify attachment.
  Initial evidence: project JSON returns 404; main run 43614618164 fails with
  invalid-publisher (lines 5757 and 5954); no repository secrets; browser redirects
  publisher management to login. No PyPI account credentials/session available.
- [ ] Review final diff, merge latest main if needed, commit/push only prepared
  branch, update PR title/body, verify current-SHA CI, mark ready without merging.

Issue and PR have no comments, inline comments, reviews or required sub-issues as
of 2026-11-16. Read all three PR comment endpoints. No UI changes are needed.
