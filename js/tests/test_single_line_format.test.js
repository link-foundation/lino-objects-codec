/**
 * Tests for the readable, single-line format produced by `encodeLine()`
 * (issue #43).
 *
 * An append-only log wants one record per line: appending is one write,
 * compaction cuts at a newline, and `grep`, `tail -f` and `wc -l` all treat a
 * line as an event. `encode()` spreads a record over many lines and
 * `encodeCompact()` hides it in base64, so neither serves that reader.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Parser } from 'links-notation';
import { encode, encodeLine, decode, decodeLine } from '../src/index.js';

/** A record of the shape an append-only log actually holds. */
const LOG_RECORD = {
  bytes: 2827,
  complete: true,
  server: { host: '127.0.0.1', port: 18878 },
  models: ['claude-haiku', 'claude-opus'],
};

const LOG_RECORD_LINE =
  '(o: (bytes 2827) (complete true) (server (o: (host "127.0.0.1")' +
  ' (port 18878))) (models ("claude-haiku" "claude-opus")))';

test('a record is written on one line', () => {
  const line = encodeLine({ obj: LOG_RECORD });
  assert.ok(!/[\n\r]/.test(line), line);
  assert.equal(line, LOG_RECORD_LINE);
});

test('a line is valid links notation', () => {
  new Parser().parse(encodeLine({ obj: LOG_RECORD }));
});

test('the hand-rolled dialect is the one the parser rejects', () => {
  assert.throws(() =>
    new Parser().parse('((:"bytes" 2827) (:"complete" true))')
  );
});

test('both forms of the same value decode alike', () => {
  const values = [
    LOG_RECORD,
    [],
    {},
    [{}, []],
    { empty: [] },
    42,
    null,
    'text',
  ];
  for (const value of values) {
    assert.deepEqual(
      decode({ notation: encodeLine({ obj: value }) }),
      decode({ notation: encode({ obj: value }) })
    );
    assert.deepEqual(
      decodeLine({ notation: encodeLine({ obj: value }) }),
      value
    );
  }
});

test('a string keeps its own characters on one line', () => {
  const value = { text: 'quote " backslash \\ ünïcödé' };
  const line = encodeLine({ obj: value });
  assert.equal(line, `(o: (text 'quote " backslash \\ ünïcödé'))`);
  assert.deepEqual(decodeLine({ notation: line }), value);
});

test('a string holding a newline still fits on one line', () => {
  const value = { readable: 'still visible', multiline: 'line1\nline2' };
  const line = encodeLine({ obj: value });
  assert.equal(
    line,
    '(o: (readable "still visible") (multiline (escaped "line1%0Aline2")))'
  );
  // The escape covers the newline, not the string: the words around it stay
  // greppable, and so does the rest of the record.
  assert.ok(line.includes('line1') && line.includes('line2'), line);
  assert.ok(!/[\n\r]/.test(line), line);
  assert.deepEqual(decodeLine({ notation: line }), value);
});

test('a one-pair object is not a two-element array', () => {
  assert.equal(encodeLine({ obj: { a: 1 } }), '(o: (a 1))');
  assert.equal(encodeLine({ obj: ['a', 1] }), '("a" 1)');
  assert.deepEqual(decodeLine({ notation: '(o: (a 1))' }), { a: 1 });
  assert.deepEqual(decodeLine({ notation: '("a" 1)' }), ['a', 1]);
});

test('the empty key survives the round trip', () => {
  const value = { '': 2 };
  assert.equal(encodeLine({ obj: value }), `(o: ("" 2))`);
  assert.deepEqual(decodeLine({ notation: encodeLine({ obj: value }) }), value);
});

test('a marked object holding something that is not a pair is rejected', () => {
  assert.throws(() => decodeLine({ notation: '(o: 1 2)' }), /pairs/);
});

test('several lines are not one record', () => {
  assert.throws(() => decodeLine({ notation: '(o: (a 1))\n(o: (b 2))' }));
});

test('a trailing newline is not a second record', () => {
  assert.deepEqual(decodeLine({ notation: '(o: (a 1))\n' }), { a: 1 });
});

test('a line starting with null is still read as a line', () => {
  assert.deepEqual(decode({ notation: '(null 1)' }), [null, 1]);
  assert.deepEqual(decode({ notation: '(o: (a null))' }), { a: null });
  // The one document both forms claim: `(null)` is the compact null, and stays
  // read that way, so documents written before this format keep decoding.
  assert.equal(decode({ notation: '(null)' }), null);
});

test('a long run of line breaks is rejected without a slowdown', () => {
  // CodeQL alert js/polynomial-redos: trimming the framing newlines with
  // `/[\n\r]+$/` backtracked once per newline, so a record followed by a long
  // run of them cost quadratic time. The scan that replaced it is linear, and
  // the input is still refused for holding more than one line.
  const notation = `${LOG_RECORD_LINE}${'\n'.repeat(200000)}x`;
  const started = process.hrtime.bigint();
  assert.throws(() => decodeLine({ notation }), SyntaxError);
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
  assert.ok(elapsedMs < 2000, `took ${elapsedMs}ms`);
});
