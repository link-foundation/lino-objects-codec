---
bump: patch
---

Add CI/CD improvements based on template best practices:

- Add detect-code-changes.mjs for smart change detection
- Add check-version-modification.mjs to prevent manual Cargo.toml version changes
- Add check-changelog-fragment.mjs for PR-diff-based changelog fragment checking
- Add check-file-size.mjs for Rust file line limit checking
- Add git-config.mjs for CI git configuration
- Update workflow with detect-changes job, version check, file size check,
  and improved concurrency configuration
