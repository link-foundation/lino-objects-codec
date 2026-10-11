### Changed

- CI: Dependabot pull requests are exempt from the changelog fragment check (decided from the PR author, not the branch name), so grouped dependency updates no longer fail it and get merged red.

### Fixed

- Release: a manual release now collects changelog fragments after the version bump, so the CHANGELOG section is titled with the new version instead of `patch`/`minor`/`major`. When fragments exist, no second generic entry is written.
- Release: the manual-release job now actually runs on `workflow_dispatch`. Before, the skipped change-detection job made it skip silently.
