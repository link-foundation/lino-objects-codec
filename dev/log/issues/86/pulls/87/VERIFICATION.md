# Verification and reproducible commands

Source changes are committed through `df9435e51cf0ac027eeda14fe3abe380ddee3982`. The evidence-only follow-up is checked again through PR CI. All local compilers ran sequentially within the 2.92 GiB container limit; Rust used one job, disabled incremental compilation and reduced debug information. No unbounded memory/stack probe was run.

## Local build, test and lint evidence

Use Node 26.13.1 with the root `node_modules/.bin` on PATH (npm 12.2.2), Python 3.15.2 in `python/.venv`, Rust 1.100.0, and .NET SDK 11.0.100. Root release tools install with `npm ci --ignore-scripts`; JavaScript installs with `npm ci --prefix js`. Python resolves with `uv pip compile python/pyproject.toml --extra dev --universal --generate-hashes --upgrade -o python/requirements-dev.lock`, installs hashes, then installs the local package with `--no-deps --no-build-isolation`. NuGet restores use `--locked-mode`.

| Area | Commands / coverage | Result | Evidence in `verification/` |
| --- | --- | --- | --- |
| JavaScript codec | From `js/`: `npm test`, `npm run check` | 596 pass; strict ESLint, Prettier and duplication check pass (3.62% aggregate duplication) | `js-test-final.log`, `js-check-final.log` |
| Release and shared scripts | `node --test scripts/*.test.mjs js/scripts/*.test.mjs rust/scripts/*.test.mjs csharp/scripts/*.test.mjs` | 122 pass, including real command execution, lenv/CLI configuration precedence, all detectors and package-relative manifest regression | `script-tests-final.log` |
| Python | From `python/`: `python -m pytest`, `ruff check .`, `ruff format --check .`, `mypy --strict .` | 536 pass, 91% coverage; strict mypy checks 54 files | `python-tests-final.log`, `python-mypy-strict.log`, `pre-commit-final.log` |
| Python hooks | `python/.venv/bin/pre-commit run --config python/.pre-commit-config.yaml --all-files` from root | All ten hooks pass, including actual strict test annotations | `pre-commit-final.log` |
| Python artifacts | `python -m build --no-isolation python`; `twine check python/dist/*` | Wheel and sdist build; both pass twine | `python-build-final.log`, `python-twine-final.log` |
| Rust | From `rust/`: `cargo test --all-features`, `cargo test --no-default-features`, `cargo clippy --all-targets --all-features -- -D warnings`, `cargo fmt --check`, `cargo build --release --all-features` | 119 unit/integration tests plus 9 doctests pass with all features; no-default suite, strict Clippy, formatting and release build pass | `rust-tests-final.log`, `rust-no-default.log`, `rust-clippy-final.log`, `rust-fmt.log`, `rust-build.log` |
| Rust consumers | Test/build every experiment manifest, all using the shared pinned toolchain | All five experiment crates compile and pass; no local crate/lock omitted | `rust-experiments.log` |
| .NET | From `csharp/`: locked restore; `dotnet test --configuration Release --coverage --coverage-output-format cobertura`; `dotnet build --configuration Release --no-restore`; `dotnet format --verify-no-changes --no-restore`; pack and run examples/interop | 541 pass, zero skipped; build has 0 warnings/0 errors; format, NuGet pack, example and interop consumers pass | `dotnet-tests-final.log`, `dotnet-build-final.log`, `dotnet-format-final.log`, `dotnet-pack.log`, `dotnet-examples.log` |
| Dependency collector | `python -m unittest discover -s scripts -p test_dependency_freshness.py`; `python scripts/check_dependency_freshness.py` | 14 unit tests; 234 direct declarations current | `freshness-tests-final.log`, `freshness-final.log` |
| Workflow checks | actionlint 1.7.12 with the existing narrow `unexpected key "queue" for "concurrency" section` ignore; zizmor 1.32.0 regular and high/high pedantic policies | No new findings; the known schema gap is reported upstream | `actionlint-final.log`, `zizmor-final.log`, `zizmor-pedantic-final.log` |
| Research tools | Ruff check/format with Python project rules; regenerate comparison from saved snapshots | Three Python tools pass; 733 comparison rows / 91 retained resolution explanations generated | `research-scripts-ruff.log`, `DEPENDENCIES.md`, `EXCEPTIONS.md` |

The outdated npm-11 selector's dedicated test was removed with that obsolete selector; original codec coverage remains. No test is skipped to satisfy a major update. The package-relative manifest regression was demonstrated failing before its implementation and passing afterward (`remote-version-before.log`, `remote-version-after.log`).

## Security results: one unresolved blocker

| Tree | Result | Evidence |
| --- | --- | --- |
| JavaScript application npm lock | 0 known vulnerabilities | `npm-js-audit-final.json` |
| Root release-tool npm lock, including bundled npm CLI | **FAIL: 21 propagated moderate package findings from two advisories in npm 12.2.2's bundled glob/minimatch** | `npm-root-audit-final.json`, `npm-lock-audit-investigation.json`, `../ci-logs/security-43608925924.log` lines 477–579 |
| Full Python environment | 0 known vulnerabilities in dependencies. The unpublished local codec has no PyPI advisory record and is reported as skipped by pip-audit | `python-audit-final.log` |
| All six Cargo locks | 0 known vulnerabilities / warnings | `rust-all-locks-audit-final.log` |
| .NET solution, example and interop, including transitives | No package has vulnerability entries; JSON is checked instead of trusting dotnet's exit code | `nuget-vulnerable-*.json`, `nuget-audit-final.log` |

No downgrade, audit suppression, dropped platform or untested npm fork is used. Consumer overrides cannot repair npm's vendored copies. The audit exits nonzero and now examines the JS tree even after a root failure. The requirement for no unresolved advisory is **not met**. Follow https://github.com/npm/cli/issues/10299#issuecomment-6879318834 for the required upstream bundle refresh.

## CI investigation and correction

`meta/runs-history.json` records timestamps, SHA and conclusions; `runs-latest-five.json` is the requested recent-run snapshot. The original comment's e491642 shared checks succeeded, so they are not treated as still failing. Actual main release failures at 19dc52d are preserved separately.

- Main JavaScript run 43602368001: package manifest lookup fails at `main-js-43602368001.log:13128`; fixed by the before/after automated regression.
- Main Python run 43602367955: `invalid-publisher` at `main-python-43602367955.log:5030`, with an existing preflight/runbook around line 4836. Requires PyPI account configuration and remains unfinished.
- First dependency commit 0ad69b8: parity run 43607090521 failed (log lines 538–545); complete the JS native string migration and retain the parity gate. Python Windows job 132484609687 rejected missing colorama hashes (job log around line 420); regenerate a universal hash lock. Both are verified passing at 89c72a5 and df9435e. The full Python run log was retrieved as far as available; GitHub reported one unavailable job log (132484609636); the failed Windows job's complete log is preserved separately.
- Security run 43607982453 at 89c72a5: npm advisories at full log lines 10797–10891. C# CodeQL also logged failing buildless restores around lines 8425–8478 despite its successful conclusion. Reproduce the restore error, then perform a real locked build with `bash experiments/issue-86/codeql-restore.sh /absolute/path/to/dotnet` (log `codeql-restore-before-after.log`). Manual C# CodeQL builds avoid incomplete references and spurious package guesses from XML test strings; upstream report: https://github.com/github/codeql/issues/23133.
- At df9435e (runs created 2026-11-14 15:12:30 UTC), JavaScript, Python, Rust, C#, dependency freshness, workflow lint, shared scripts, parity and link checks all pass. Security run 43608925924 remains failed **only because of the known npm bundle**. Its C# scan traces three successful locked builds (`security-43608925924.log:7265`, 7276, 7287), and its JS audit reports zero vulnerabilities at line 577. All other security jobs pass.

The final PR check page is authoritative for the evidence-only follow-up's SHA: https://github.com/link-foundation/lino-objects-codec/pull/87/checks. Its result is also recorded in a PR conversation update after all checks finish; no pending background process is treated as verified. The default branch's PyPI publisher and the npm security blocker prevent an honest completion claim. The PR is left unmerged.
