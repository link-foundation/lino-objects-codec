/**
 * Tests for encoding/decoding basic JavaScript types.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encode, decode } from '../src/index.js';

// Tests for null type serialization
test('encode null', () => {
  const result = encode({ obj: null });
  assert.ok(result);
  assert.equal(typeof result, 'string');
});

test('decode null', () => {
  const encoded = encode({ obj: null });
  const result = decode({ notation: encoded });
  assert.equal(result, null);
});

test('roundtrip null', () => {
  const original = null;
  const encoded = encode({ obj: original });
  const decoded = decode({ notation: encoded });
  assert.equal(decoded, original);
});

// Tests for undefined type serialization
test('encode undefined', () => {
  const result = encode({ obj: undefined });
  assert.ok(result);
  assert.equal(typeof result, 'string');
});

test('decode undefined', () => {
  const encoded = encode({ obj: undefined });
  const result = decode({ notation: encoded });
  assert.equal(result, undefined);
});

test('roundtrip undefined', () => {
  const original = undefined;
  const encoded = encode({ obj: original });
  const decoded = decode({ notation: encoded });
  assert.equal(decoded, original);
});

// Tests for boolean type serialization
test('encode true', () => {
  const result = encode({ obj: true });
  assert.ok(result);
  assert.equal(typeof result, 'string');
});

test('encode false', () => {
  const result = encode({ obj: false });
  assert.ok(result);
  assert.equal(typeof result, 'string');
});

test('decode true', () => {
  const encoded = encode({ obj: true });
  const result = decode({ notation: encoded });
  assert.equal(result, true);
});

test('decode false', () => {
  const encoded = encode({ obj: false });
  const result = decode({ notation: encoded });
  assert.equal(result, false);
});

test('roundtrip bool', () => {
  for (const value of [true, false]) {
    const encoded = encode({ obj: value });
    const decoded = decode({ notation: encoded });
    assert.equal(decoded, value);
    assert.equal(typeof decoded, typeof value);
  }
});

// Tests for integer type serialization
test('encode zero', () => {
  const result = encode({ obj: 0 });
  assert.ok(result);
  assert.equal(typeof result, 'string');
});

test('encode positive int', () => {
  const result = encode({ obj: 42 });
  assert.ok(result);
  assert.equal(typeof result, 'string');
});

test('encode negative int', () => {
  const result = encode({ obj: -42 });
  assert.ok(result);
  assert.equal(typeof result, 'string');
});

test('decode int', () => {
  for (const value of [0, 42, -42, 999999]) {
    const encoded = encode({ obj: value });
    const result = decode({ notation: encoded });
    assert.equal(result, value);
    assert.equal(typeof result, 'number');
  }
});

test('roundtrip int', () => {
  const testValues = [0, 1, -1, 42, -42, 123456789, -123456789];
  for (const value of testValues) {
    const encoded = encode({ obj: value });
    const decoded = decode({ notation: encoded });
    assert.equal(decoded, value);
    assert.equal(typeof decoded, 'number');
  }
});

// Tests for float type serialization
test('encode float', () => {
  const result = encode({ obj: 3.14 });
  assert.ok(result);
  assert.equal(typeof result, 'string');
});

test('decode float', () => {
  const encoded = encode({ obj: 3.14 });
  const result = decode({ notation: encoded });
  assert.equal(Math.abs(result - 3.14) < 0.0001, true);
  assert.equal(typeof result, 'number');
});

test('roundtrip float', () => {
  const testValues = [0.0, 1.0, -1.0, 3.14, -3.14, 0.123456789, -999.999];
  for (const value of testValues) {
    const encoded = encode({ obj: value });
    const decoded = decode({ notation: encoded });
    assert.equal(Math.abs(decoded - value) < 0.0001, true);
    assert.equal(typeof decoded, 'number');
  }
});

test('float special values', () => {
  // Test infinity
  const infEncoded = encode({ obj: Infinity });
  assert.equal(decode({ notation: infEncoded }), Infinity);

  // Test negative infinity
  const negInfEncoded = encode({ obj: -Infinity });
  assert.equal(decode({ notation: negInfEncoded }), -Infinity);

  // Test NaN (special case: NaN !== NaN, so we check with isNaN)
  const nanEncoded = encode({ obj: NaN });
  assert.ok(Number.isNaN(decode({ notation: nanEncoded })));
});

// Tests for string type serialization
test('encode empty string', () => {
  const result = encode({ obj: '' });
  assert.ok(result);
  assert.equal(typeof result, 'string');
});

test('encode simple string', () => {
  const result = encode({ obj: 'hello' });
  assert.ok(result);
  assert.equal(typeof result, 'string');
});

test('decode string', () => {
  const encoded = encode({ obj: 'hello world' });
  const result = decode({ notation: encoded });
  assert.equal(result, 'hello world');
  assert.equal(typeof result, 'string');
});

test('roundtrip string', () => {
  const testValues = [
    '',
    'hello',
    'hello world',
    'Hello, World!',
    'multi\nline\nstring',
    'tab\tseparated',
    'unicode: 你好世界 🌍',
    'special chars: @#$%^&*()',
  ];
  for (const value of testValues) {
    const encoded = encode({ obj: value });
    const decoded = decode({ notation: encoded });
    assert.equal(decoded, value);
    assert.equal(typeof decoded, 'string');
  }
});

test('string with quotes', () => {
  const testValues = [
    "string with 'single quotes'",
    'string with "double quotes"',
    `string with "both" 'quotes'`,
  ];
  for (const value of testValues) {
    const encoded = encode({ obj: value });
    const decoded = decode({ notation: encoded });
    assert.equal(decoded, value);
  }
});
