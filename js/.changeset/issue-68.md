---
'lino-objects-codec': patch
---

Decode large readable documents without whole-document character arrays. Use string slices for quoted values and bounded strict UTF-8 processing for escaped payloads, preserving Unicode and legacy quote behavior. Refresh dependencies required by freshness CI.
