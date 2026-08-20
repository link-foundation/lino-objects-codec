"""Tests for the PyPI publish preflight (issue #41)."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest

_SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "pypi_publish_preflight.py"
_spec = importlib.util.spec_from_file_location("pypi_publish_preflight", _SCRIPT)
assert _spec is not None and _spec.loader is not None
preflight = importlib.util.module_from_spec(_spec)
sys.modules["pypi_publish_preflight"] = preflight
_spec.loader.exec_module(preflight)


# The claims GitHub actually sent in the run that failed, run 32345106245.
FAILING_RUN_ENV = {
    "GITHUB_REPOSITORY": "link-foundation/lino-objects-codec",
    "GITHUB_WORKFLOW_REF": (
        "link-foundation/lino-objects-codec/.github/workflows/python.yml@refs/heads/main"
    ),
    "GITHUB_REF": "refs/heads/main",
}


def _fetch(status: int):
    def fetch(url: str) -> int:
        fetch.calls.append(url)
        return status

    fetch.calls = []
    return fetch


def _capture():
    lines: list[str] = []
    return lines, lines.append


def test_missing_project_is_detected():
    assert preflight.project_exists("lino-objects-codec", _fetch(404)) is False


def test_existing_project_is_detected():
    assert preflight.project_exists("requests", _fetch(200)) is True


def test_unreachable_pypi_is_not_reported_as_missing():
    # A network failure must not be turned into "the project does not exist",
    # which would print a runbook for a problem that may not exist.
    assert preflight.project_exists("lino-objects-codec", _fetch(0)) is None
    assert preflight.project_exists("lino-objects-codec", _fetch(503)) is None


def test_probe_targets_the_pypi_json_api():
    fetch = _fetch(404)
    preflight.project_exists("lino-objects-codec", fetch)
    assert fetch.calls == ["https://pypi.org/pypi/lino-objects-codec/json"]


def test_claims_match_the_ones_pypi_rejected():
    claims = preflight.resolve_claims(FAILING_RUN_ENV)
    assert claims["owner"] == "link-foundation"
    assert claims["repository"] == "lino-objects-codec"
    assert claims["workflow"] == "python.yml"
    # The failing run reported `environment: MISSING`; with no environment
    # declared, the publisher on PyPI must also be registered without one.
    assert claims["environment"] == ""


def test_environment_claim_is_reported_when_the_workflow_declares_one():
    env = {**FAILING_RUN_ENV, "PYPI_PUBLISH_ENVIRONMENT": "release"}
    assert preflight.resolve_claims(env)["environment"] == "release"


def test_runbook_names_every_value_the_pypi_form_asks_for():
    claims = preflight.resolve_claims(FAILING_RUN_ENV)
    runbook = preflight.build_runbook("lino-objects-codec", claims, has_token=False)
    for expected in (
        "lino-objects-codec",
        "link-foundation",
        "python.yml",
        "(leave blank)",
        "https://pypi.org/manage/account/publishing/",
        "pending publisher",
    ):
        assert expected in runbook


def test_runbook_says_a_token_will_carry_this_run():
    claims = preflight.resolve_claims(FAILING_RUN_ENV)
    assert "PYPI_API_TOKEN is configured" in preflight.build_runbook(
        "lino-objects-codec", claims, has_token=True
    )
    assert "PYPI_API_TOKEN is configured" not in preflight.build_runbook(
        "lino-objects-codec", claims, has_token=False
    )


def test_preflight_reports_but_never_gates():
    # A pending publisher is invisible from outside PyPI: the project stays
    # absent until the first upload succeeds. Failing here would reject the
    # very configuration that is about to work.
    lines, out = _capture()
    code = preflight.main(
        ["--package", "lino-objects-codec"], env=FAILING_RUN_ENV, fetch=_fetch(404), out=out
    )
    assert code == 0
    assert any("PyPI project does not exist yet" in line for line in lines)


def test_existing_project_produces_no_runbook():
    lines, out = _capture()
    code = preflight.main(
        ["--package", "lino-objects-codec"], env=FAILING_RUN_ENV, fetch=_fetch(200), out=out
    )
    assert code == 0
    assert not any("pending publisher" in line for line in lines)


def test_unreachable_pypi_warns_and_continues():
    lines, out = _capture()
    code = preflight.main(
        ["--package", "lino-objects-codec"], env=FAILING_RUN_ENV, fetch=_fetch(0), out=out
    )
    assert code == 0
    assert any("PyPI preflight inconclusive" in line for line in lines)


def test_verbose_is_off_by_default():
    lines, out = _capture()
    preflight.main(
        ["--package", "lino-objects-codec"], env=FAILING_RUN_ENV, fetch=_fetch(200), out=out
    )
    assert not any("resolved OIDC claims" in line for line in lines)


@pytest.mark.parametrize("switch", ["flag", "env"])
def test_verbose_dumps_the_claims(switch: str):
    lines, out = _capture()
    argv = ["--package", "lino-objects-codec"]
    env = dict(FAILING_RUN_ENV)
    if switch == "flag":
        argv.append("--verbose")
    else:
        env["PYPI_PREFLIGHT_VERBOSE"] = "1"
    preflight.main(argv, env=env, fetch=_fetch(200), out=out)
    body = "\n".join(lines)
    assert "resolved OIDC claims" in body
    assert "link-foundation" in body


def test_verbose_env_var_respects_an_explicit_off():
    lines, out = _capture()
    preflight.main(
        ["--package", "lino-objects-codec"],
        env={**FAILING_RUN_ENV, "PYPI_PREFLIGHT_VERBOSE": "0"},
        fetch=_fetch(200),
        out=out,
    )
    assert not any("resolved OIDC claims" in line for line in lines)
