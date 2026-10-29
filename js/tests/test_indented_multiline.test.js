import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { formatIndented, parseIndented } from '../src/index.js';

const cases = JSON.parse(
  readFileSync(
    new URL('../../fixtures/indented-format/strings.json', import.meta.url),
    'utf8'
  )
);

for (const { name, value } of cases) {
  test(`indented strings roundtrip: ${name}`, () => {
    const original = { id: 'doc', obj: { t: value, after: 'unchanged' } };
    const text = formatIndented(original);
    assert.deepEqual(parseIndented({ text }), original);
  });
}

test('the reported output stays readable and parses with or without a final newline', () => {
  const original = { id: 'doc', obj: { t: 'line1\nline2' } };
  const text = formatIndented(original);
  assert.equal(text, "doc:\n  t 'line1\nline2'");
  assert.deepEqual(parseIndented({ text }), original);
  assert.deepEqual(parseIndented({ text: `${text}\n` }), original);
});

test('multiline strings in nested definitions, arrays, keys and identifiers', () => {
  const original = {
    id: 'doc\nwith a header:',
    obj: {
      '': 'empty key',
      'key\n\n  continued': '\n\n',
      nested: { t: 'first\n\nnext:\n  false' },
      array: ['line1\nline2', "it's\ntrue", { t: 'x\r\ny' }],
      after: 42,
    },
  };
  const text = formatIndented({ ...original, indent: '\t' });
  assert.deepEqual(parseIndented({ text }), original);
});

test('all quote kinds, doubled quotes and legacy headers allow multiline references', () => {
  for (const quote of ["'", '"', '`']) {
    const text = `\r\ndoc\r\n\r\n  t ${quote}a${quote}${quote}\n\n  b${quote}\r\n\r\n  after true\r\n`;
    assert.deepEqual(parseIndented({ text }), {
      id: 'doc',
      obj: { t: `a${quote}\n\n  b`, after: true },
    });
  }
});

test('unterminated or malformed multiline references still fail', () => {
  for (const text of [
    "doc:\n  t 'line1\n\nline2",
    'doc:\n  t "line1\nline2',
    'doc:\n  t `line1\nline2',
  ]) {
    assert.throws(
      () => parseIndented({ text }),
      /Unterminated quoted reference/
    );
  }
  assert.throws(
    () => parseIndented({ text: "doc:\n  t 'line1\nline2'garbage" }),
    /Invalid quoted reference/
  );
});

test(
  'bounded combinations of string characters roundtrip',
  { timeout: 10000 },
  () => {
    const alphabet = [
      'a',
      '\n',
      '\r',
      '\t',
      ' ',
      "'",
      '"',
      '`',
      ':',
      '(',
      ')',
      '\\',
      '\0',
    ];
    let values = [''];
    for (let length = 0; length <= 3; length += 1) {
      for (const value of values) {
        const original = { id: 'doc', obj: { t: value } };
        assert.deepEqual(
          parseIndented({ text: formatIndented(original) }),
          original
        );
      }
      if (length < 3) {
        values = values.flatMap((prefix) =>
          alphabet.map((char) => prefix + char)
        );
      }
    }
  }
);
