---
'lino-objects-codec': patch
---

CI: the changeset check now counts only changesets added by the pull request, so a changeset still pending on main no longer fails unrelated PRs or satisfies a PR that adds none. Dependabot PRs are exempt and get a notice instead of a false failure.
