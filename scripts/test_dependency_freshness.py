import unittest
from unittest.mock import patch

from check_dependency_freshness import Dependency, ROOT, blocker_on_line, check, declarations, latest


class DependencyFreshnessTests(unittest.TestCase):
    def test_outside_semver_range_is_stale(self):
        dependency = Dependency("cargo", "links-notation", "0.16.1", "Cargo.toml")
        self.assertIn("latest 0.23.0", check(dependency, lambda *_: "0.23.0", lambda *_: "closed"))

    def test_only_an_open_issue_is_an_exception(self):
        dependency = Dependency("cargo", "blocked", "1.0.0", "Cargo.toml", "https://github.com/owner/repo/issues/123")
        self.assertIsNone(check(dependency, lambda *_: "2.0.0", lambda *_: "open"))
        self.assertIsNotNone(check(dependency, lambda *_: "2.0.0", lambda *_: "closed"))

    def test_current_and_unbounded_dependencies_pass(self):
        for version in ["1.0.0", None]:
            self.assertIsNone(check(Dependency("pypi", "wheel", version, "pyproject.toml"), lambda *_: "1.0.0", lambda *_: "closed"))

    def test_blocker_must_be_on_the_manifest_line(self):
        url = "https://github.com/owner/repo/issues/123"
        self.assertEqual(blocker_on_line(f'blocked = "1.0.0" # {url}', "blocked"), url)
        self.assertIsNone(blocker_on_line(f'# {url}\nblocked = "1.0.0"', "blocked"))
        self.assertIsNone(blocker_on_line(f'# blocked {url}\nblocked = "1.0.0"', "blocked"))
        self.assertIsNone(blocker_on_line(f'other = "1.0.0" # blocked {url}', "blocked"))
        self.assertIsNone(blocker_on_line(f'blocked = {{ git = "{url}" }}', "blocked"))
        self.assertEqual(blocker_on_line(f'"blocked>=1.0.0", # {url}', "blocked"), url)
        self.assertEqual(blocker_on_line(f'<PackageReference Include="blocked" Version="1.0.0" /> <!-- {url} -->', "blocked"), url)

    def test_every_ecosystem_build_and_dev_dependencies_are_read(self):
        deps = declarations(ROOT)
        self.assertEqual({d.ecosystem for d in deps}, {"cargo", "npm", "pypi", "nuget", "github-actions", "github-tools"})
        self.assertTrue(any(d.name == "proptest" for d in deps))
        self.assertTrue(any(d.name == "setuptools" for d in deps))
        self.assertTrue(any(d.name == "xunit.v3" for d in deps))
        self.assertTrue(any(d.name == "eslint" for d in deps))

    def test_moving_major_action_tag_tracks_patches(self):
        self.assertIsNone(check(Dependency("github-actions", "actions/checkout", "7", "workflow.yml"), lambda *_: "7.1.0", lambda *_: "closed"))
        self.assertIsNotNone(check(Dependency("github-actions", "actions/checkout", "6", "workflow.yml"), lambda *_: "7.1.0", lambda *_: "closed"))

    def test_two_component_version_has_an_implicit_zero_patch(self):
        self.assertIsNone(check(Dependency("pypi", "scriv", "1.8", "pyproject.toml"), lambda *_: "1.8.0", lambda *_: "closed"))

    def test_action_bundle_and_prerelease_tags_are_not_action_versions(self):
        latest.cache_clear()
        with patch("check_dependency_freshness.get_json", side_effect=[
            {"tag_name": "codeql-bundle-v2.30.0"},
            [
                {"tag_name": "codeql-bundle-v2.30.0"},
                {"tag_name": "v5.0.0", "prerelease": True},
                {"tag_name": "v4.35.1"},
            ],
        ]):
            self.assertEqual(latest("github-actions", "github/codeql-action"), "4.35.1")
        latest.cache_clear()


if __name__ == "__main__":
    unittest.main()
