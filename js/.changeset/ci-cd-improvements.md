---
'lino-objects-codec': patch
---

Add CI/CD improvements based on template best practices:

- Add detect-code-changes.mjs for smart change detection
- Add check-version.mjs to prevent manual package.json version changes
- Add check-changesets.mjs to check for pending changesets
- Add merge-changesets.mjs to merge multiple changesets on release
- Update workflow with detect-changes job, conditional changeset checks,
  and improved concurrency configuration
