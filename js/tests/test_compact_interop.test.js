// The compact format must be readable across languages.
//
// Booleans used to be written differently per language: JavaScript and Rust
// wrote `(bool true)` while Python and C# wrote `(bool True)`, and each decoder
// only understood its own spelling, so a document written by one language
// decoded to the wrong value in another. Every language now writes the
// lowercase form and reads either spelling.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeCompact, decodeCompact } from '../src/index.js';

test('booleans are written lowercase', () => {
  assert.strictEqual(encodeCompact({ obj: true }), '(bool true)');
  assert.strictEqual(encodeCompact({ obj: false }), '(bool false)');
});

test('lowercase booleans decode', () => {
  assert.strictEqual(decodeCompact({ notation: '(bool true)' }), true);
  assert.strictEqual(decodeCompact({ notation: '(bool false)' }), false);
});

test('capitalized booleans from older documents still decode', () => {
  assert.strictEqual(decodeCompact({ notation: '(bool True)' }), true);
  assert.strictEqual(decodeCompact({ notation: '(bool False)' }), false);
});
