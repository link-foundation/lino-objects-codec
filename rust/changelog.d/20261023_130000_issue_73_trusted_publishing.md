---
bump: patch
---

### Changed

- Releases now publish to crates.io through trusted publishing (OIDC, `rust-lang/crates-io-auth-action`) first, falling back to the `CARGO_REGISTRY_TOKEN` / `CARGO_TOKEN` secret only when no trusted publisher is registered. The publish step names which credential it used and, on failure, points to the crate's Trusted Publishing settings (issue #73).
