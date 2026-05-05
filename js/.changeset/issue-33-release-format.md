---
'lino-objects-codec': patch
---

Fix the npm publish false positive (`##[error]` annotations in green runs) by retrying the registry verification with exponential backoff and pre-checking the registry before re-running `changeset publish`. Standardize GitHub Release titles to `[JavaScript] X.Y.Z` and tag prefix to `js_v`. Fix the shields.io badge URL so it embeds bare SemVer instead of leaving the `js-v` language prefix in the badge and npm links.
