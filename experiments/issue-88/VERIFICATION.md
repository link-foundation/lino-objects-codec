# Issue 88 verification

PR: https://github.com/link-foundation/lino-objects-codec/pull/89

## Root cause and supported floor

The old distribution metadata requires Python >=3.15. Python 3.11.18 rejects
installation with `No solution found ... does not satisfy Python>=3.15`.
Bypassing metadata would not solve it: importing the old source raises
`NameError: name '_Node' is not defined`, because the self-referential annotation
relies on Python 3.14's deferred annotation evaluation. A release helper also
uses unparenthesized multiple exception types, introduced in Python 3.14.

The runtime parser, links-notation 0.31.5 (and updated 0.31.6), requires >=3.11.
The codec works on 3.11 after quoting the forward reference; parenthesized
exception types make the release helper compatible too. No wire format or
supported API was removed.

## Reproduction and local checks

Use a Python 3.11 development environment with `python/requirements-dev.lock`
installed and `python/` installed in editable mode. Run:

```sh
.venv/bin/python experiments/issue-88/reproduce.py
.venv/bin/ruff check python/src python/tests python/scripts
.venv/bin/ruff format --check python/src python/tests python/scripts
.venv/bin/mypy --config-file python/pyproject.toml python/src
.venv/bin/pytest python/tests/test_python_compatibility.py python/tests/test_basic_types.py python/tests/test_compact_interop.py -o addopts=
.venv/bin/python -m unittest discover -s scripts -p test_dependency_freshness.py -v
node --test scripts/check-trusted-publishing.test.mjs
```

Results: before/after reproducer passes; Ruff and formatting pass; mypy passes
for all five source files; 26 focused Python tests pass; 16 freshness tests
pass; trusted-publishing workflow policy tests pass. `python -m build` on
Python 3.11.18 builds the sdist and universal wheel in isolation; `twine check`
passes for both. Installing the wheel in a separate Python 3.11 environment
and running the same 26 focused tests passes without an editable/source install.

## CI and publication

[Dispatch 43780260916](https://github.com/link-foundation/lino-objects-codec/actions/runs/43780260916)
validates the package at commit 728907e, before attempting OIDC publication.
All seven interpreter/OS legs, lint and the distribution build passed. Later
commits repair only shared freshness tooling and changeset formatting; the
package built by this dispatch matches the final Python source and metadata.

Two unrelated CI prerequisites were repaired rather than disabled:

- Initial dependency run 43779421372, log lines 671–679: stale links-notation,
  scriv and lint-staged patch releases. Update those three dependencies and
  affected locks. links-notation 0.31.6 adds published Python typing; explicit
  scalar-ID casts accommodate those annotations without runtime changes.
- Run 43780236946, lines 711–717: freshness incorrectly rejects moving Python
  minor selectors used for compatibility builds. Validate the selected stable
  series instead, preserving checks on exact old pins. Unit tests cover both
  cases and missing/prerelease-only series.
- JavaScript job 133015766298, lines 307–309: the changeset needed single quotes
  to match the existing Prettier configuration. Format that file.

Logs are saved in ignored `ci-logs/` to avoid committing large build outputs.
The PR description records final current-SHA check results and the OIDC upload
outcome. Publication and trusted-publisher attachment remain unfinished until
an actual successful upload and registry readback are observed.
