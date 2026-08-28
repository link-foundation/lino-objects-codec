### Changed

- Raised the `dev` extra floors to the majors CI actually runs: `pytest` `>=7.0` -> `>=9.1`, `pytest-cov` `>=4.0` -> `>=7.1`, `mypy` `>=1.0` -> `>=2.3`, `ruff` `>=0.1.0` -> `>=0.16.5`, `scriv` `>=1.7.0` -> `>=1.8`, and the build requirement `setuptools` `>=77.0` -> `>=84.0`. A fresh `pip install -e ".[dev]"` no longer resolves to releases that lint and type-check by rules from several majors ago (issue #47).
