"""Regression coverage for distributions rejecting released Python versions (#88)."""

from importlib.metadata import metadata

from packaging.specifiers import SpecifierSet


def test_distribution_supports_python_311_and_newer() -> None:
    package = metadata("lino-objects-codec")
    supported = SpecifierSet(package["Requires-Python"])
    assert "3.10" not in supported
    for version in ("3.11", "3.12", "3.13", "3.14", "3.15"):
        assert version in supported
        assert f"Programming Language :: Python :: {version}" in package.get_all("Classifier")
