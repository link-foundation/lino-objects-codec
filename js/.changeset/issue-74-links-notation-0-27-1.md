---
'lino-objects-codec': patch
---

Update `links-notation` from `^0.25.2` to `^0.27.1`, the latest release (0.26.0 included), so a project that also depends on the current parser installs one copy instead of two (issue #74). The test suite passes unchanged against 0.25.2, 0.26.0 and 0.27.1. Refresh ESLint, eslint-plugin-prettier and jscpd for the dependency freshness gate.
