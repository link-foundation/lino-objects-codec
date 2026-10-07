import unittest
from unittest.mock import patch
import shutil
from pathlib import Path
from tempfile import TemporaryDirectory

from check_dependency_freshness import Dependency, ROOT, blocker_on_line, check, declarations, latest, manifest_blocker


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
        self.assertEqual(blocker_on_line(f'requires = ["blocked>=1.0.0"] # {url}', "blocked"), url)
        self.assertEqual(blocker_on_line(f'<PackageReference Include="blocked" Version="1.0.0" /> <!-- {url} -->', "blocked"), url)
        used = set()
        inline = f'requires = ["blocked>=1.0.0", "other>=1.0.0"] # {url}'
        self.assertEqual(manifest_blocker(inline, "blocked", "blocked>=1.0.0", used), url)
        self.assertEqual(manifest_blocker(inline, "other", "other>=1.0.0", used), url)
        self.assertIsNone(manifest_blocker(f'blocked = "1.0.1" # {url}', "blocked", "1.0", set()))

    def test_every_ecosystem_build_and_dev_dependencies_are_read(self):
        deps = declarations(ROOT)
        self.assertEqual({d.ecosystem for d in deps}, {"cargo", "npm", "pypi", "nuget", "github-actions", "github-tools"})
        self.assertTrue(any(d.name == "proptest" for d in deps))
        self.assertTrue(any(d.name == "setuptools" for d in deps))
        self.assertTrue(any(d.name == "xunit.v3" for d in deps))
        self.assertTrue(any(d.name == "eslint" for d in deps))

    def test_blockers_do_not_spread_to_other_declarations_of_the_same_package(self):
        url = "https://github.com/owner/repo/issues/123"
        with TemporaryDirectory() as directory:
            root = Path(directory)
            for relative in ["rust/Cargo.toml", "js/package.json", "python/pyproject.toml", ".github/workflows/scripts.yml", ".github/workflows/security.yml"]:
                target = root / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(ROOT / relative, target)
            (root / "rust/Cargo.toml").write_text(f'[dependencies]\nblocked = "1.0.0"\nrenamed = {{ package = "renamed-crate", version = "1.0.0" }} # {url}\n[dev-dependencies]\nblocked = "1.0.0" # {url}\n')
            (root / "python/pyproject.toml").write_text(f'[build-system]\nrequires = ["blocked>=1.0.0"]\n[project]\ndependencies = [\n"blocked>=1.0.0", # {url}\n]\n')
            (root / ".github/workflows/repeated.yml").write_text(f'uses: actions/checkout@v6\nuses: actions/checkout@v6 # {url}\n')
            project = root / "csharp/tests/Repeated.csproj"
            project.parent.mkdir(parents=True)
            project.write_text(f'<Project><ItemGroup>\n<PackageReference Include="blocked" Version="1.0.0" />\n<PackageReference Include="blocked" Version="1.0.0" /> <!-- {url} -->\n</ItemGroup></Project>')
            deps = declarations(root)
            self.assertEqual(next(d for d in deps if d.name == "renamed-crate").blocker, url)
            for ecosystem, name in [("cargo", "blocked"), ("pypi", "blocked"), ("nuget", "blocked"), ("github-actions", "actions/checkout")]:
                selected = [d for d in deps if d.ecosystem == ecosystem and d.name == name and d.manifest.endswith(("Cargo.toml", "pyproject.toml", "Repeated.csproj", "repeated.yml"))]
                self.assertEqual([d.blocker for d in selected], [None, url], ecosystem)

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
