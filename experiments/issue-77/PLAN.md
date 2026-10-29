# Issue 77 work plan

Objective: fully implement and verify issue #77 in PR #78 on branch
`issue-77-648feda2cbaf`; keep the PR unmerged.

## Requirements and evidence checklist

- [x] Read the complete issue, issue comments, PR conversation, inline comments,
  and reviews. No comments, images, or required sub-issues were present.
- [x] Confirm the prepared branch and inspect repository contribution and CI rules.
- [x] Reproduce the reported multiline-string failure before changing source.
- [x] Inventory related edge cases: blank/whitespace-only continuation lines,
  indentation, quotes, line endings, scalar types, nested definitions and arrays.
- [x] Preserve any string value through formatIndented/parseIndented; keep the
  existing single-line and legacy syntax working.
- [x] Apply corresponding fixes and regression coverage to all four languages,
  following the repository's cross-language parity policy.
- [x] Keep reusable reproduction/experiments in experiments/issue-77 and a useful
  real-world example under examples/.
- [x] Add disabled-by-default tracing if the existing tracing is insufficient.
- [x] Add the release fragments required by all four release workflows.
- [x] Run focused regression tests, then all local suites and applicable CI checks.
  Save large outputs to logs; build Rust with one job and reduced debug info.
- [ ] Review the complete diff for bugs, regressions, and requirement coverage.
- [ ] Fetch/merge the default branch, preserving history; run local checks before
  atomic commits and push only issue-77-648feda2cbaf.
- [ ] Update PR #78's title/body with reproduction, implementation, tests, and
  `Fixes #77`; remove WIP and mark ready.
- [ ] List CI runs with timestamps/SHA; download any failed logs to ci-logs/,
  inspect actual errors with line numbers, fix them, and verify fresh CI passes.
- [ ] Recheck all comments/reviews, clean working tree, and current-head CI before
  reporting completion with the PR URL.

## Initial root-cause observations

JavaScript splits at physical newlines and trims each child line before
its quote tokenizer runs. Python/Rust/C# remove blank physical lines before
passing text to links-notation. These operations cannot preserve quoted
multiline reference content. Existing primitive parsing, definition references,
legacy headers, and quote-doubling syntax must remain compatible.

## Validation so far

- JavaScript: 539 tests, 13 release-helper tests, lint, format, duplication check,
  existing examples and the multiline catalog example pass.
- Python: 536 tests, Ruff lint/format, mypy and the file-size gate pass.
- Rust: all-feature tests (128 including doctests), no-default-feature tests,
  clippy with warnings denied, fmt, file-size gate and 22 release-helper tests pass.
- C#: 541 tests, build with warnings as errors and format verification pass.
- Shared scripts: 44 Node tests and 12 Python tests pass.
- All four release-fragment validators and both language/parser parity gates pass.
- The dependency freshness check found three outdated Python dev-tool floors;
  these are refreshed to the versions already used for the successful local run.
