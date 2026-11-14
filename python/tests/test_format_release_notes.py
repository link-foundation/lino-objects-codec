"""Regression tests for exact release badge URL matching."""

import importlib.util
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "format_release_notes.py"
spec = importlib.util.spec_from_file_location("format_release_notes", SCRIPT)
assert spec is not None and spec.loader is not None
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


@pytest.mark.parametrize(
    "body",
    [
        "Mention img.shields.io in the changes",
        "https://pypi.org/project/lino-objects-codec/",
        "![PyPI](https://img.shields.io.evil.invalid/badge/a)",
        "![PyPI](https://evil.invalid/img.shields.io/badge/a)",
        "![PyPI](https://img.shields.io@evil.invalid/badge/a)",
        "![PyPI](http://img.shields.io/badge/a)",
        "![PyPI](https://[invalid)",
    ],
)
def test_unrelated_urls_do_not_skip_release_formatting(body: str) -> None:
    result = module.format_release_body(body, "1.2.3", "owner/repo", None, "codec")
    assert "[![PyPI version](https://img.shields.io/pypi/v/codec.svg)]" in result


def test_existing_badge_is_idempotent() -> None:
    body = "[![PyPI](https://img.shields.io/pypi/v/codec.svg)](https://pypi.org/project/codec/)"
    assert module.format_release_body(body, "1.2.3", "owner/repo", None, "codec") == body
