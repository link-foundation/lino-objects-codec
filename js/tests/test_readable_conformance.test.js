/**
 * Cross-language conformance tests for the readable format.
 *
 * The cases live in `fixtures/readable-format/cases.json` at the repository root
 * and are shared by the JavaScript, Python, Rust and C# suites: every
 * implementation has to encode the same value to exactly the same text, which is
 * what keeps the four outputs byte-identical.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { encode, decode } from '../src/index.js';

const LANGUAGE = 'js';
const LANGUAGES = new Set(['js', 'python', 'rust', 'csharp']);

const FIXTURES = join(
  dirname(dirname(dirname(fileURLToPath(import.meta.url)))),
  'fixtures',
  'readable-format',
  'cases.json'
);

const SPECIAL_FLOATS = new Map([
  ['NaN', NaN],
  ['Infinity', Infinity],
  ['-Infinity', -Infinity],
]);

const { cases } = JSON.parse(readFileSync(FIXTURES, 'utf-8'));

/**
 * Turn a fixture value specification into a JavaScript value.
 * @param {object} spec - The specification, a single-key object naming the type
 * @returns {*} The value
 */
function build(spec) {
  if ('null' in spec) {
    return null;
  }
  if ('bool' in spec) {
    return spec.bool;
  }
  if ('int' in spec) {
    return spec.int;
  }
  if ('float' in spec) {
    return typeof spec.float === 'string'
      ? SPECIAL_FLOATS.get(spec.float)
      : spec.float;
  }
  if ('str' in spec) {
    return spec.str;
  }
  if ('array' in spec) {
    return spec.array.map(build);
  }
  if ('object' in spec) {
    return Object.fromEntries(
      spec.object.map(([key, value]) => [key, build(value)])
    );
  }
  throw new Error(`unknown value specification: ${JSON.stringify(spec)}`);
}

/**
 * Deep equality where NaN equals NaN and key order matters.
 * @param {*} left - First value
 * @param {*} right - Second value
 * @returns {boolean} True when the two values are the same document
 */
function same(left, right) {
  if (typeof left === 'number' && typeof right === 'number') {
    return Object.is(left, right) || left === right;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((item, index) => same(item, right[index]))
    );
  }
  if (left === null || right === null || typeof left !== 'object') {
    return left === right;
  }
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key, index) => key === rightKeys[index]) &&
    leftKeys.every((key) => same(left[key], right[key]))
  );
}

test('every case is either active or skipped with a reason', () => {
  for (const testCase of cases) {
    for (const [language, reason] of Object.entries(testCase.skip ?? {})) {
      assert.ok(LANGUAGES.has(language), `${testCase.name}: ${language}`);
      assert.ok(reason, testCase.name);
    }
  }
});

for (const testCase of cases) {
  if (LANGUAGE in (testCase.skip ?? {})) {
    continue;
  }

  test(`encode matches the shared text: ${testCase.name}`, () => {
    assert.equal(encode({ obj: build(testCase.value) }), testCase.text);
  });

  test(`decode matches the shared value: ${testCase.name}`, () => {
    assert.ok(
      same(decode({ notation: testCase.text }), build(testCase.value)),
      `${JSON.stringify(decode({ notation: testCase.text }))} != ${JSON.stringify(build(testCase.value))}`
    );
  });
}
