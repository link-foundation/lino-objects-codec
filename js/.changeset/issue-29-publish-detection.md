---
'lino-objects-codec': patch
---

Detect npm publish failures that previously slipped through. The
`@changesets/cli`-based publish flow used to exit 0 even when individual
packages failed to publish, and the scripts hardcoded the package name,
so v0.3.3 was reported as "✅ published" while npm 404'd. The publish
script now reads the package name and version dynamically from
`package.json`, scans changeset output for known failure markers,
re-queries the npm registry to verify the version actually landed, and
prints a credential-recovery runbook on auth failures. GitHub releases
also now use the `js-v` tag prefix so they no longer collide with
releases from the other languages in this repo.
