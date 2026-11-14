---
bump: patch
---

### Changed

- Publish the Links Notation 0.31 migration under a new crate version (issue #84). crates.io still served 0.9.3, which requires `links-notation ^0.27.1`, because the release run for the migration skipped publishing when GitHub could not acquire a macOS runner. This release requires `links-notation ^0.31.4`, the latest release; the round-trip and conformance suites pass unchanged against it.
- Releases now read the published dependency metadata back from crates.io and fail when it differs from `Cargo.toml`. They also build a fresh consumer crate against the registry artifact, round-trip a value through it and check that it resolves the same `links-notation` minor version as the source.
- When a push to `main` leaves changelog fragments unreleased because the tests or build did not finish, CI now fails with an error that says how to finish the release.
