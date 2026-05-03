---
'lino-objects-codec': patch
---

Document the built-in references format for circular references and add
regression tests that lock it in. The encoder already emits cycles as bare
`obj_N` links inside an `(obj_N: type ...)` self-reference definition, but the
README still showed the legacy `(ref obj_N)` marker. README, regression tests,
and the format-invariant assertions are now consistent. See issue #27.
