---
bump: patch
---

### Changed

- CI/CD hardening from
  [issue #41](https://github.com/link-foundation/lino-objects-codec/issues/41):
  every action moves to a Node 24 major, each job gets a `timeout-minutes` and
  its own concurrency group, release jobs queue instead of racing so a
  `cargo publish` can no longer be cancelled mid-flight, and pull requests are
  now validated against a fresh merge with the base branch rather than a stale
  merge preview. No change to the crate's code or public API.
