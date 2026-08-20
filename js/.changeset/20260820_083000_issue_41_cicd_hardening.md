---
'lino-objects-codec': patch
---

Refactor `ObjectCodec._encodeValue` and `ObjectCodec._decodeLink` into small
dispatch methods so the JavaScript sources lint clean: the three ESLint
`complexity`/`max-statements` warnings the pipeline had been printing on every
run are gone. Behaviour and the public API are unchanged and the full 244-test
suite is untouched. Part of the CI/CD clean-up in
[issue #41](https://github.com/link-foundation/lino-objects-codec/issues/41),
which also fixes the seven `npm audit` advisories in the dev dependency tree.
