/**
 * Real text stays real text in both readable forms.
 *
 * Before issue #45 a single control character turned the whole string into
 * base64: one newline in a log message hid the message, the stack trace and
 * every word a reader would grep for. The readable forms now write the text as
 * it is, and escape only the characters the form itself cannot carry.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encode, encodeLine, decode, decodeLine } from '../src/index.js';

/**
 * A record of the shape a log line actually holds.
 * @param {string} text - The message
 * @returns {object} The record
 */
function message(text) {
  return { message: text };
}

/**
 * How many times a piece of text occurs in another.
 * @param {string} haystack - The text to search
 * @param {string} needle - The text to count
 * @returns {number} The number of occurrences
 */
function occurrences(haystack, needle) {
  return haystack.split(needle).length - 1;
}

// The reason for the issue: a log line holding a newline must stay greppable.
test('a multi-line string keeps its text in the indented form', () => {
  const value = message('line one\nline two');
  const encoded = encode({ obj: value });

  assert.equal(encoded, '(\n  message "line one\nline two"\n)');
  assert.ok(!encoded.includes('base64'), encoded);
  assert.ok(encoded.includes('line one'), encoded);
  assert.ok(encoded.includes('line two'), encoded);
  assert.deepEqual(decode({ notation: encoded }), value);
});

// On one line the record ends at the newline, so the newline -- and nothing
// else -- is escaped: the rest of the message stays as written.
test('only the newline is escaped in the single-line form', () => {
  const value = message('line one\nline two');
  const line = encodeLine({ obj: value });

  assert.equal(line, '(o: (message (escaped "line one%0Aline two")))');
  assert.ok(!line.includes('\n'), line);
  assert.ok(!line.includes('base64'), line);
  assert.deepEqual(decodeLine({ notation: line }), value);
});

// A tab is text a reader can see, so both forms keep it as it is.
test('a tab is written as a tab in both forms', () => {
  const value = message('a\tb');

  assert.equal(encode({ obj: value }), '(\n  message "a\tb"\n)');
  assert.equal(encodeLine({ obj: value }), '(o: (message "a\tb"))');
  assert.deepEqual(decode({ notation: encode({ obj: value }) }), value);
  assert.deepEqual(decodeLine({ notation: encodeLine({ obj: value }) }), value);
});

// A carriage return is the one whitespace character a text file rewrites on its
// own -- CRLF normalisation would change the value -- so it is escaped.
test('a carriage return is escaped so CRLF normalisation cannot rewrite it', () => {
  const value = message('first\r\nsecond');
  const encoded = encode({ obj: value });

  assert.equal(encoded, '(\n  message (escaped "first%0D\nsecond")\n)');
  assert.deepEqual(decode({ notation: encoded }), value);
});

// The doubled-quote form desynchronises the notation's own parser, so a value
// holding both quote kinds is written with a run of delimiters instead.
test('a value holding both quote kinds uses the n-quote form', () => {
  const value = message('both "kinds" of \'quotes\'');
  const encoded = encode({ obj: value });

  assert.ok(encoded.includes('"""both "kinds" of \'quotes\'"""'), encoded);
  assert.ok(!encoded.includes('""kinds""'), encoded);
  assert.deepEqual(decode({ notation: encoded }), value);
});

// A value that occurs twice is written twice: a shared reference would make a
// log line depend on another line, which a line-based reader cannot resolve.
test('a repeated value is written out every time', () => {
  const value = { first: 'same', second: 'same', third: 'same' };

  const encoded = encode({ obj: value });
  assert.equal(occurrences(encoded, '"same"'), 3, encoded);
  assert.deepEqual(decode({ notation: encoded }), value);

  const line = encodeLine({ obj: value });
  assert.equal(occurrences(line, '"same"'), 3, line);
  assert.deepEqual(decodeLine({ notation: line }), value);
});

// A key is escaped like any other text, and stays a key rather than turning the
// object it belongs to into an array.
test('a key holding a control character stays a key', () => {
  const value = { 'a\u0000b': 1 };

  assert.deepEqual(decode({ notation: encode({ obj: value }) }), value);
  assert.deepEqual(decodeLine({ notation: encodeLine({ obj: value }) }), value);
});

// Documents written by earlier versions keep decoding.
test('the previous base64 marker still decodes', () => {
  assert.deepEqual(
    decode({ notation: '(\n  message (base64 "bGluZTEKbGluZTI=")\n)' }),
    message('line1\nline2')
  );
});

// Every value the readable forms write must read back unchanged, whatever
// quotes, newlines and control characters it holds.
test('every kind of text roundtrips through both forms', () => {
  const texts = [
    '',
    'plain',
    'with spaces',
    "it's",
    'he said "hello"',
    'both "kinds" of \'quotes\'',
    '"leading quote',
    'trailing quote"',
    'a""b',
    'a"""b\'c',
    '\'"',
    '"\'',
    'line one\nline two',
    'trailing newline\n',
    '\ttab',
    'carriage\rreturn',
    'null\u0000byte',
    'escape\u001b[0m',
    'next\u0085line',
    'unicode: 你好世界 🌍',
    'percent %0A not an escape',
    '(parens) and: colons',
    'base64',
    'escaped',
    'o:',
  ];

  for (const text of texts) {
    for (const value of [text, message(text), { [text]: text }, [text]]) {
      const encoded = encode({ obj: value });
      assert.deepEqual(
        decode({ notation: encoded }),
        value,
        `indented roundtrip failed for ${JSON.stringify(text)}: ${JSON.stringify(encoded)}`
      );

      const line = encodeLine({ obj: value });
      assert.ok(
        !line.includes('\n'),
        `${JSON.stringify(text)} broke the line: ${JSON.stringify(line)}`
      );
      assert.deepEqual(
        decodeLine({ notation: line }),
        value,
        `single-line roundtrip failed for ${JSON.stringify(text)}: ${JSON.stringify(line)}`
      );
    }
  }
});
