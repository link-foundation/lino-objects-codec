import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatValueSingleLine,
  formatValueVerbatim,
  decode,
  decodeLine,
} from '../src/index.js';

test('public value helpers preserve quotes, newlines, controls and Unicode', () => {
  for (const value of [
    '',
    `both "quotes" and 'quotes'`,
    'line\n\nnext\r\n',
    '\\n %0A\t\0',
    '世界🌍',
  ]) {
    const line = formatValueSingleLine(value);
    assert.ok(!/[\r\n]/.test(line));
    assert.equal(decodeLine({ notation: line }), value);
    assert.equal(decode({ notation: formatValueVerbatim(value) }), value);
  }
});
