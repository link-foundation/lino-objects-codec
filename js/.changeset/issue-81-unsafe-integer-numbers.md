---
'lino-objects-codec': patch
---

Keep unsafe integer Numbers as Numbers in the readable formats: `encode` and `encodeLine` now write a finite integer Number beyond `Number.MAX_SAFE_INTEGER` with an exponent (`1e18` as `1e+18`, `-9007199254740992` as `-9.007199254740992e+15`), so `decode`/`decodeLine` read it back as the same Number instead of the digit string. Safe integers, numeric-looking strings and keys, and bigint values are written as before.

Update `links-notation` from `^0.27.1` to `^0.31.3`, the latest release, so a project that also depends on the current parser installs one copy instead of two. The test suite passes unchanged against 0.31.3. Refresh jscpd and the lockfile for the dependency freshness gate.
