---
'lino-objects-codec': minor
---

Make `formatIndented` output readable by the plain links-notation `Parser`: the empty string is written as the reference literal `~1{}`, references starting with `#` or `~<digits>{` are quoted, and doubled quotes are never placed where the `Parser` reads a wider delimiter. Add `nested: true` to `formatIndented` and `parseIndented`, which keeps nested objects and arrays under their parent instead of writing separate sections with generated ids.
