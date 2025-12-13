/**
 * Tests for formatting utilities (escapeReference, jsonToLino, linoToJson).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  escapeReference,
  unescapeReference,
  jsonToLino,
  linoToJson,
  formatAsLino,
} from '../src/index.js';

// Tests for escapeReference
test('escapeReference - simple string', () => {
  assert.equal(escapeReference('hello'), 'hello');
  assert.equal(escapeReference('world'), 'world');
});

test('escapeReference - numbers', () => {
  assert.equal(escapeReference(42), '42');
  assert.equal(escapeReference(3.14), '3.14');
  assert.equal(escapeReference(-17), '-17');
});

test('escapeReference - booleans', () => {
  assert.equal(escapeReference(true), 'true');
  assert.equal(escapeReference(false), 'false');
});

test('escapeReference - string with spaces', () => {
  const result = escapeReference('hello world');
  assert.ok(result.startsWith("'") || result.startsWith('"'));
  assert.ok(result.includes('hello world'));
});

test('escapeReference - string with single quotes', () => {
  const result = escapeReference("it's");
  assert.ok(result.startsWith('"'));
  assert.equal(result, '"it\'s"');
});

test('escapeReference - string with double quotes', () => {
  const result = escapeReference('he said "hello"');
  assert.ok(result.startsWith("'"));
  assert.equal(result, "'he said \"hello\"'");
});

test('escapeReference - string with both quotes', () => {
  const result = escapeReference(`"it's" he said`);
  // Should use the quote type with fewer escapes needed
  assert.ok(result.startsWith("'") || result.startsWith('"'));
});

test('escapeReference - string with parentheses', () => {
  const result = escapeReference('func(arg)');
  assert.ok(result.startsWith("'") || result.startsWith('"'));
});

test('escapeReference - string with colon', () => {
  const result = escapeReference('key:value');
  assert.ok(result.startsWith("'") || result.startsWith('"'));
});

test('escapeReference - string with newline', () => {
  const result = escapeReference('line1\nline2');
  assert.ok(result.startsWith("'") || result.startsWith('"'));
});

// Tests for unescapeReference
test('unescapeReference - simple string', () => {
  assert.equal(unescapeReference('hello'), 'hello');
});

test('unescapeReference - doubled double quotes', () => {
  assert.equal(unescapeReference('he said ""hello""'), 'he said "hello"');
});

test('unescapeReference - doubled single quotes', () => {
  assert.equal(unescapeReference("it''s"), "it's");
});

test('unescapeReference - null/undefined', () => {
  assert.equal(unescapeReference(null), null);
  assert.equal(unescapeReference(undefined), undefined);
});

// Tests for jsonToLino
test('jsonToLino - null', () => {
  assert.equal(jsonToLino(null), 'null');
});

test('jsonToLino - undefined', () => {
  assert.equal(jsonToLino(undefined), 'null');
});

test('jsonToLino - number', () => {
  assert.equal(jsonToLino(42), '42');
  assert.equal(jsonToLino(3.14), '3.14');
  assert.equal(jsonToLino(-17), '-17');
});

test('jsonToLino - boolean', () => {
  assert.equal(jsonToLino(true), 'true');
  assert.equal(jsonToLino(false), 'false');
});

test('jsonToLino - simple string', () => {
  assert.equal(jsonToLino('hello'), 'hello');
});

test('jsonToLino - string with spaces', () => {
  const result = jsonToLino('hello world');
  assert.ok(result.startsWith("'") || result.startsWith('"'));
});

test('jsonToLino - empty array', () => {
  assert.equal(jsonToLino([]), '()');
});

test('jsonToLino - array of numbers', () => {
  assert.equal(jsonToLino([1, 2, 3]), '(1 2 3)');
});

test('jsonToLino - array of strings', () => {
  assert.equal(jsonToLino(['a', 'b', 'c']), '(a b c)');
});

test('jsonToLino - nested array', () => {
  assert.equal(jsonToLino([[1, 2], [3, 4]]), '((1 2) (3 4))');
});

test('jsonToLino - empty object', () => {
  assert.equal(jsonToLino({}), '()');
});

test('jsonToLino - simple object', () => {
  const result = jsonToLino({ name: 'Alice', age: 30 });
  assert.ok(result.includes('(name Alice)'));
  assert.ok(result.includes('(age 30)'));
});

test('jsonToLino - object with nested object', () => {
  const result = jsonToLino({ user: { name: 'Bob' } });
  assert.ok(result.includes('(user ((name Bob)))'));
});

test('jsonToLino - object with array', () => {
  const result = jsonToLino({ items: [1, 2, 3] });
  assert.ok(result.includes('(items (1 2 3))'));
});

// Tests for linoToJson
test('linoToJson - null input', () => {
  assert.equal(linoToJson(null), null);
  assert.equal(linoToJson(''), null);
});

test('linoToJson - primitives', () => {
  assert.equal(linoToJson('42'), 42);
  assert.equal(linoToJson('true'), true);
  assert.equal(linoToJson('false'), false);
  assert.equal(linoToJson('null'), null);
});

test('linoToJson - simple string', () => {
  assert.equal(linoToJson('hello'), 'hello');
});

test('linoToJson - empty link', () => {
  assert.deepEqual(linoToJson('()'), []);
});

test('linoToJson - array of numbers', () => {
  assert.deepEqual(linoToJson('(1 2 3)'), [1, 2, 3]);
});

test('linoToJson - simple object', () => {
  const result = linoToJson('((name Alice) (age 30))');
  assert.deepEqual(result, { name: 'Alice', age: 30 });
});

test('linoToJson - nested object', () => {
  const result = linoToJson('((user ((name Bob))))');
  assert.deepEqual(result, { user: { name: 'Bob' } });
});

test('linoToJson - object with array value', () => {
  const result = linoToJson('((items (1 2 3)))');
  assert.deepEqual(result, { items: [1, 2, 3] });
});

// Roundtrip tests
test('roundtrip - simple object', () => {
  const original = { name: 'Alice', age: 30 };
  const lino = jsonToLino(original);
  const result = linoToJson(lino);
  assert.deepEqual(result, original);
});

test('roundtrip - nested object', () => {
  const original = { user: { name: 'Bob', active: true } };
  const lino = jsonToLino(original);
  const result = linoToJson(lino);
  assert.deepEqual(result, original);
});

test('roundtrip - object with array', () => {
  const original = { items: [1, 2, 3] };
  const lino = jsonToLino(original);
  const result = linoToJson(lino);
  assert.deepEqual(result, original);
});

test('roundtrip - complex object', () => {
  const original = {
    name: 'Test',
    count: 42,
    active: true,
    tags: ['a', 'b', 'c'],
    nested: { x: 1, y: 2 },
  };
  const lino = jsonToLino(original);
  const result = linoToJson(lino);
  assert.deepEqual(result, original);
});

// Tests for formatAsLino
test('formatAsLino - empty array', () => {
  assert.equal(formatAsLino([]), '()');
  assert.equal(formatAsLino(null), '()');
});

test('formatAsLino - array of values', () => {
  const result = formatAsLino(['a', 'b', 'c']);
  assert.ok(result.includes('  a'));
  assert.ok(result.includes('  b'));
  assert.ok(result.includes('  c'));
  assert.ok(result.startsWith('('));
  assert.ok(result.endsWith(')'));
});
