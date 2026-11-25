---
'Lino.Objects.Codec': patch
---

`Format.FormatIndented` and `Format.FormatIndentedOrdered` output now reads back unchanged with the plain links-notation `Parser`: empty keys and values are written as the reference literal `~1{}` instead of an empty quote pair that swallowed the following lines, keys starting with `#` or `~<digits>{` are quoted, and values containing both quote characters use a spelling the Parser cannot misread.
