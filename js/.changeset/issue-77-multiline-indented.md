---
'lino-objects-codec': patch
---

Preserve multiline strings in `parseIndented`, including blank lines, indentation, quotes and CRLFs. Quote literal backticks and empty references so values survive `formatIndented`/`parseIndented` unchanged.
