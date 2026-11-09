---
'lino-objects-codec': patch
---

Keep unsafe integer Numbers as Numbers in the readable formats: `encode` and `encodeLine` now write a finite integer Number beyond `Number.MAX_SAFE_INTEGER` with an exponent (`1e18` as `1e+18`, `-9007199254740992` as `-9.007199254740992e+15`), so `decode`/`decodeLine` read it back as the same Number instead of the digit string. Safe integers, numeric-looking strings and keys, and bigint values are written as before.
