### Added

- `encode_line` and `decode_line`: the readable format written on one line, so
  an append-only log holds one record per line. Appending is one write,
  compaction cuts at a newline, and `grep`, `tail -f` and `wc -l` treat a line
  as one event. The output is valid Links Notation, keeps numbers, booleans and
  `None` bare so types survive the round trip, and `decode(encode_line(v))`
  equals `decode(encode(v))`. See
  [issue #43](https://github.com/link-foundation/lino-objects-codec/issues/43).
- `OBJECT_MARKER`, the `o` link id that tells an object from an array on one
  line: `(o: (bytes 2827) (complete true))` is a record, `("a" 1)` is a
  two-element array, `(o:)` is the empty object and `()` the empty array. The
  marker is part of the notation, so the empty key round-trips as `(o: ("" 2))`.
  The single-line spelling of every shared fixture is pinned in
  `fixtures/readable-format/cases.json`, so all four languages write the same
  bytes.
- The `examples/append_only_log.py` example, which writes, counts, greps and
  reads back a log of one record per line.

### Fixed

- `decode` no longer routes a readable single-line document such as `(None 1)`
  to the compact (base64) reader. Only a compact document keeps that path; the
  document `(None)` stays the compact `None` so older documents keep decoding.
