---
'lino-objects-codec': patch
---

Run in browsers without Node.js globals: `parseIndented`, `decode` and every other function no longer throw `process is not defined` when there is no `process`, and base64 (legacy `(base64 "…")` values and the compact format) no longer needs `Buffer`. Without `process`, `LINO_CODEC_DEBUG` counts as unset and trace lines go to `console.debug`.
