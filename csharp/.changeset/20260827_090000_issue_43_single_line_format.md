---
'Lino.Objects.Codec': minor
---

Add `Codec.EncodeLine` and `Codec.DecodeLine` (and the matching `ObjectCodec`
methods): the readable format written on one line, so an append-only log holds
one record per line. Appending is one write, compaction cuts at a newline, and
`grep`, `tail -f` and `wc -l` treat a line as one event. The output is valid
Links Notation, keeps numbers, booleans and `null` bare so types survive the
round trip, and `Decode(EncodeLine(v))` equals `Decode(Encode(v))`.

`Readable.ObjectMarker` (`o`) tells an object from an array on one line:
`(o: (bytes 2827) (complete true))` is a record, `("a" 1)` is a two-element
array, `(o:)` is the empty object and `()` the empty array. Because the marker
is part of the notation, the empty key round-trips as `(o: ("" 2))`. The
single-line spelling of every shared fixture is pinned in
`fixtures/readable-format/cases.json`, so all four languages write the same
bytes.

Also fixes `IsCompactNotation`, which used to claim a readable single-line
document such as `(null 1)`; the document `(null)` stays the compact null so
older documents keep decoding. See
[issue #43](https://github.com/link-foundation/lino-objects-codec/issues/43).
