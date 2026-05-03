### Changed

- Document the built-in references format for circular references in the Python
  README. The encoder already produces `(obj_N: dict ...)` / `(obj_N: list ...)`
  self-reference definitions and bare `obj_N` back-references; the README now
  matches and explicitly notes that the legacy `(ref obj_N)` marker is no
  longer recognized. Regression tests lock in the new format. See
  [issue #27](https://github.com/link-foundation/lino-objects-codec/issues/27).
