---
'lino-objects-codec': patch
---

Update `links-notation` from `^0.27.1` to `^0.31.3`, the latest release, so a project that also depends on the current parser installs one copy instead of two. The test suite passes unchanged against 0.31.3. Refresh jscpd and the lockfile for the dependency freshness gate.
