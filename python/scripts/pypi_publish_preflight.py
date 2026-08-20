#!/usr/bin/env python3
"""Explain, before the upload runs, why a PyPI trusted publish is about to fail.

Issue #41. The release job for 0.2.0 died inside
``pypa/gh-action-pypi-publish`` with::

    Trusted publishing exchange failure:
    invalid-publisher: valid token, but no corresponding publisher
    (Publisher with matching claims was not found)
      * sub: repo:link-foundation/lino-objects-codec:ref:refs/heads/main
      * workflow_ref: .../.github/workflows/python.yml@refs/heads/main
      * environment: MISSING

The token was valid; PyPI simply had no publisher record to match it against.
``https://pypi.org/pypi/lino-objects-codec/json`` answers 404, so the project
has never been published, and PyPI requires a *pending* publisher to be
registered before the very first upload of a project that does not exist yet
(https://docs.pypi.org/trusted-publishers/creating-a-project-through-oidc/).

That is a one-time action in PyPI's account settings, so no code change can fix
it. What code can fix is the diagnosis: the raw OIDC error names none of the
four claims an operator has to copy into the PyPI form, and does not say that
the missing piece lives outside the repository at all.

This preflight prints exactly those four claims and the steps to register them.

It is deliberately **advisory**: it never fails the build. A correctly
registered pending publisher is invisible from the outside — the project is
still absent from PyPI until the first upload succeeds — so treating "project
not found" as an error would reject the one configuration that is about to
work, trading an opaque failure for a false negative.

Verbose mode (``--verbose`` or ``PYPI_PREFLIGHT_VERBOSE=1``) additionally dumps
the resolved OIDC claims so the next mismatch names itself. It is off by
default.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from collections.abc import Callable

PYPI_JSON_URL = "https://pypi.org/pypi/{name}/json"
USER_AGENT = "lino-objects-codec-ci (+https://github.com/link-foundation/lino-objects-codec)"


def _default_fetch(url: str, timeout: float = 15.0) -> int:
    """Return the HTTP status for ``url``, or 0 when the request never lands."""
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return int(response.status)
    except urllib.error.HTTPError as error:
        return int(error.code)
    except OSError:
        return 0


def project_exists(name: str, fetch: Callable[[str], int] = _default_fetch) -> bool | None:
    """Is ``name`` a project that already exists on PyPI?

    Returns ``None`` when the question could not be answered — a network
    failure must not be reported as "the project is missing".
    """
    status = fetch(PYPI_JSON_URL.format(name=name))
    if status == 200:
        return True
    if status == 404:
        return False
    return None


def resolve_claims(env: dict[str, str]) -> dict[str, str]:
    """Reconstruct the OIDC claims PyPI will be asked to match.

    These mirror what GitHub puts in the token and what the PyPI publisher form
    asks for, so the two can be compared field by field.
    """
    repository = env.get("GITHUB_REPOSITORY", "")
    owner, _, name = repository.partition("/")
    workflow_ref = env.get("GITHUB_WORKFLOW_REF", "")
    # `owner/repo/.github/workflows/python.yml@refs/heads/main` -> `python.yml`
    workflow_file = ""
    if workflow_ref:
        workflow_file = workflow_ref.split("@")[0].rsplit("/", 1)[-1]
    return {
        "owner": owner,
        "repository": name,
        "workflow": workflow_file,
        # PyPI matches an empty environment only against a publisher that was
        # registered without one. The run that failed reported `MISSING`.
        "environment": env.get("PYPI_PUBLISH_ENVIRONMENT", ""),
        "ref": env.get("GITHUB_REF", ""),
    }


def build_runbook(package: str, claims: dict[str, str], has_token: bool) -> str:
    """The operator-facing instructions for registering a pending publisher."""
    environment = claims["environment"] or "(leave blank)"
    lines = [
        f'PyPI has no project named "{package}" yet.',
        "",
        "PyPI cannot attach a trusted publisher to a project that does not exist,",
        "so the first upload needs a *pending* publisher registered beforehand.",
        "Without one the upload fails with:",
        "  invalid-publisher: valid token, but no corresponding publisher",
        "",
        "How to fix (one-time, outside this repository):",
        "  1. Sign in to PyPI and open",
        "     https://pypi.org/manage/account/publishing/",
        '  2. Under "Add a new pending publisher", choose GitHub and enter:',
        f"       PyPI Project Name: {package}",
        f"       Owner:             {claims['owner']}",
        f"       Repository name:   {claims['repository']}",
        f"       Workflow name:     {claims['workflow']}",
        f"       Environment name:  {environment}",
        "  3. Re-run this workflow.",
        "",
        "All five values must match exactly; a publisher registered *with* an",
        "environment will not match a workflow that declares none, and vice versa.",
        "",
        "Alternative for a one-off first release: set the PYPI_API_TOKEN secret",
        "(https://pypi.org/manage/account/token/) and this workflow will upload",
        "with the token instead of OIDC.",
    ]
    if has_token:
        lines += [
            "",
            "PYPI_API_TOKEN is configured, so this run will publish with the token",
            "and the missing publisher will not block it.",
        ]
    lines += [
        "",
        "Background: https://docs.pypi.org/trusted-publishers/creating-a-project-through-oidc/",
        "            dev/log/issues/41/pulls/42/ANALYSIS.md",
    ]
    return "\n".join(lines)


def _set_output(name: str, value: str) -> None:
    output_file = os.environ.get("GITHUB_OUTPUT")
    if output_file:
        with open(output_file, "a", encoding="utf-8") as handle:
            handle.write(f"{name}={value}\n")


def main(
    argv: list[str] | None = None,
    env: dict[str, str] | None = None,
    fetch: Callable[[str], int] = _default_fetch,
    out: Callable[[str], None] = print,
) -> int:
    """Always returns 0: this step reports, it does not gate."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--package", required=True, help="PyPI project name")
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="print the resolved OIDC claims (default off)",
    )
    args = parser.parse_args(argv)

    env = dict(os.environ if env is None else env)
    verbose = args.verbose or env.get("PYPI_PREFLIGHT_VERBOSE", "") not in ("", "0", "false")

    claims = resolve_claims(env)
    has_token = bool(env.get("PYPI_API_TOKEN"))

    if verbose:
        out("PyPI preflight: resolved OIDC claims")
        out(json.dumps(claims, indent=2, sort_keys=True))
        out(f"PyPI preflight: PYPI_API_TOKEN configured: {has_token}")
        out(f"PyPI preflight: probing {PYPI_JSON_URL.format(name=args.package)}")

    exists = project_exists(args.package, fetch)
    _set_output("project_exists", "unknown" if exists is None else str(exists).lower())

    if exists is None:
        out(
            "::warning title=PyPI preflight inconclusive::"
            f"Could not reach PyPI to check whether {args.package} exists; continuing."
        )
        return 0

    if exists:
        out(f"PyPI preflight: project {args.package} exists; trusted publishing can match it.")
        return 0

    runbook = build_runbook(args.package, claims, has_token)
    out(f"::warning title=PyPI project does not exist yet::{runbook.splitlines()[0]}")
    out(runbook)
    return 0


if __name__ == "__main__":
    sys.exit(main())
