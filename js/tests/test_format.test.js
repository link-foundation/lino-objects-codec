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
  formatIndented,
  parseIndented,
} from '../src/index.js';

// Tests for escapeReference
test('escapeReference - simple string', () => {
  assert.equal(escapeReference({ value: 'hello' }), 'hello');
  assert.equal(escapeReference({ value: 'world' }), 'world');
});

test('escapeReference - numbers', () => {
  assert.equal(escapeReference({ value: 42 }), '42');
  assert.equal(escapeReference({ value: 3.14 }), '3.14');
  assert.equal(escapeReference({ value: -17 }), '-17');
});

test('escapeReference - booleans', () => {
  assert.equal(escapeReference({ value: true }), 'true');
  assert.equal(escapeReference({ value: false }), 'false');
});

test('escapeReference - string with spaces', () => {
  const result = escapeReference({ value: 'hello world' });
  assert.ok(result.startsWith("'") || result.startsWith('"'));
  assert.ok(result.includes('hello world'));
});

test('escapeReference - string with single quotes', () => {
  const result = escapeReference({ value: "it's" });
  assert.ok(result.startsWith('"'));
  assert.equal(result, '"it\'s"');
});

test('escapeReference - string with double quotes', () => {
  const result = escapeReference({ value: 'he said "hello"' });
  assert.ok(result.startsWith("'"));
  assert.equal(result, '\'he said "hello"\'');
});

test('escapeReference - string with both quotes', () => {
  const result = escapeReference({ value: `"it's" he said` });
  // Should use the quote type with fewer escapes needed
  assert.ok(result.startsWith("'") || result.startsWith('"'));
});

test('escapeReference - string with parentheses', () => {
  const result = escapeReference({ value: 'func(arg)' });
  assert.ok(result.startsWith("'") || result.startsWith('"'));
});

test('escapeReference - string with colon', () => {
  const result = escapeReference({ value: 'key:value' });
  assert.ok(result.startsWith("'") || result.startsWith('"'));
});

test('escapeReference - string with newline', () => {
  const result = escapeReference({ value: 'line1\nline2' });
  assert.ok(result.startsWith("'") || result.startsWith('"'));
});

// Tests for unescapeReference
test('unescapeReference - simple string', () => {
  assert.equal(unescapeReference({ str: 'hello' }), 'hello');
});

test('unescapeReference - doubled double quotes', () => {
  assert.equal(
    unescapeReference({ str: 'he said ""hello""' }),
    'he said "hello"'
  );
});

test('unescapeReference - doubled single quotes', () => {
  assert.equal(unescapeReference({ str: "it''s" }), "it's");
});

test('unescapeReference - null/undefined', () => {
  assert.equal(unescapeReference({ str: null }), null);
  assert.equal(unescapeReference({ str: undefined }), undefined);
});

// Tests for jsonToLino
test('jsonToLino - null', () => {
  assert.equal(jsonToLino({ json: null }), 'null');
});

test('jsonToLino - undefined', () => {
  assert.equal(jsonToLino({ json: undefined }), 'null');
});

test('jsonToLino - number', () => {
  assert.equal(jsonToLino({ json: 42 }), '42');
  assert.equal(jsonToLino({ json: 3.14 }), '3.14');
  assert.equal(jsonToLino({ json: -17 }), '-17');
});

test('jsonToLino - boolean', () => {
  assert.equal(jsonToLino({ json: true }), 'true');
  assert.equal(jsonToLino({ json: false }), 'false');
});

test('jsonToLino - simple string', () => {
  assert.equal(jsonToLino({ json: 'hello' }), 'hello');
});

test('jsonToLino - string with spaces', () => {
  const result = jsonToLino({ json: 'hello world' });
  assert.ok(result.startsWith("'") || result.startsWith('"'));
});

test('jsonToLino - empty array', () => {
  assert.equal(jsonToLino({ json: [] }), '()');
});

test('jsonToLino - array of numbers', () => {
  assert.equal(jsonToLino({ json: [1, 2, 3] }), '(1 2 3)');
});

test('jsonToLino - array of strings', () => {
  assert.equal(jsonToLino({ json: ['a', 'b', 'c'] }), '(a b c)');
});

test('jsonToLino - nested array', () => {
  assert.equal(
    jsonToLino({
      json: [
        [1, 2],
        [3, 4],
      ],
    }),
    '((1 2) (3 4))'
  );
});

test('jsonToLino - empty object', () => {
  assert.equal(jsonToLino({ json: {} }), '()');
});

test('jsonToLino - simple object', () => {
  const result = jsonToLino({ json: { name: 'Alice', age: 30 } });
  assert.ok(result.includes('(name Alice)'));
  assert.ok(result.includes('(age 30)'));
});

test('jsonToLino - object with nested object', () => {
  const result = jsonToLino({ json: { user: { name: 'Bob' } } });
  assert.ok(result.includes('(user ((name Bob)))'));
});

test('jsonToLino - object with array', () => {
  const result = jsonToLino({ json: { items: [1, 2, 3] } });
  assert.ok(result.includes('(items (1 2 3))'));
});

// Tests for linoToJson
test('linoToJson - null input', () => {
  assert.equal(linoToJson({ lino: null }), null);
  assert.equal(linoToJson({ lino: '' }), null);
});

test('linoToJson - primitives', () => {
  assert.equal(linoToJson({ lino: '42' }), 42);
  assert.equal(linoToJson({ lino: 'true' }), true);
  assert.equal(linoToJson({ lino: 'false' }), false);
  assert.equal(linoToJson({ lino: 'null' }), null);
});

test('linoToJson - simple string', () => {
  assert.equal(linoToJson({ lino: 'hello' }), 'hello');
});

test('linoToJson - empty link', () => {
  assert.deepEqual(linoToJson({ lino: '()' }), []);
});

test('linoToJson - array of numbers', () => {
  assert.deepEqual(linoToJson({ lino: '(1 2 3)' }), [1, 2, 3]);
});

test('linoToJson - simple object', () => {
  const result = linoToJson({ lino: '((name Alice) (age 30))' });
  assert.deepEqual(result, { name: 'Alice', age: 30 });
});

test('linoToJson - nested object', () => {
  const result = linoToJson({ lino: '((user ((name Bob))))' });
  assert.deepEqual(result, { user: { name: 'Bob' } });
});

test('linoToJson - object with array value', () => {
  const result = linoToJson({ lino: '((items (1 2 3)))' });
  assert.deepEqual(result, { items: [1, 2, 3] });
});

// Roundtrip tests
test('roundtrip - simple object', () => {
  const original = { name: 'Alice', age: 30 };
  const lino = jsonToLino({ json: original });
  const result = linoToJson({ lino });
  assert.deepEqual(result, original);
});

test('roundtrip - nested object', () => {
  const original = { user: { name: 'Bob', active: true } };
  const lino = jsonToLino({ json: original });
  const result = linoToJson({ lino });
  assert.deepEqual(result, original);
});

test('roundtrip - object with array', () => {
  const original = { items: [1, 2, 3] };
  const lino = jsonToLino({ json: original });
  const result = linoToJson({ lino });
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
  const lino = jsonToLino({ json: original });
  const result = linoToJson({ lino });
  assert.deepEqual(result, original);
});

// Tests for formatAsLino
test('formatAsLino - empty array', () => {
  assert.equal(formatAsLino({ values: [] }), '()');
  assert.equal(formatAsLino({ values: null }), '()');
});

test('formatAsLino - array of values', () => {
  const result = formatAsLino({ values: ['a', 'b', 'c'] });
  assert.ok(result.includes('  a'));
  assert.ok(result.includes('  b'));
  assert.ok(result.includes('  c'));
  assert.ok(result.startsWith('('));
  assert.ok(result.endsWith(')'));
});

// Tests for formatIndented
test('formatIndented - basic object', () => {
  const result = formatIndented({
    id: '6dcf4c1b-ff3f-482c-95ab-711ea7d1b019',
    obj: {
      uuid: '6dcf4c1b-ff3f-482c-95ab-711ea7d1b019',
      status: 'executed',
      command: 'echo test',
      exitCode: '0',
    },
  });
  const lines = result.split('\n');
  assert.equal(lines[0], '6dcf4c1b-ff3f-482c-95ab-711ea7d1b019');
  assert.equal(lines[1], '  uuid "6dcf4c1b-ff3f-482c-95ab-711ea7d1b019"');
  assert.equal(lines[2], '  status "executed"');
  assert.equal(lines[3], '  command "echo test"');
  assert.equal(lines[4], '  exitCode "0"');
});

test('formatIndented - custom indentation', () => {
  const result = formatIndented({
    id: 'test-id',
    obj: { key: 'value' },
    indent: '    ', // 4 spaces
  });
  const lines = result.split('\n');
  assert.equal(lines[0], 'test-id');
  assert.equal(lines[1], '    key "value"');
});

test('formatIndented - value with double quotes', () => {
  // Values containing double quotes are wrapped in single quotes (links-notation style)
  const result = formatIndented({
    id: 'test-id',
    obj: { message: 'He said "hello"' },
  });
  const lines = result.split('\n');
  assert.equal(lines[0], 'test-id');
  assert.equal(lines[1], `  message 'He said "hello"'`);
});

test('formatIndented - key with space', () => {
  const result = formatIndented({
    id: 'test-id',
    obj: { 'key with space': 'value' },
  });
  const lines = result.split('\n');
  assert.equal(lines[0], 'test-id');
  assert.ok(
    lines[1].includes("'key with space'") ||
      lines[1].includes('"key with space"')
  );
});

test('formatIndented - null value', () => {
  const result = formatIndented({
    id: 'test-id',
    obj: { key: null },
  });
  const lines = result.split('\n');
  assert.equal(lines[0], 'test-id');
  assert.equal(lines[1], '  key "null"');
});

test('formatIndented - requires id', () => {
  assert.throws(() => formatIndented({ obj: { key: 'value' } }), {
    message: 'id is required for formatIndented',
  });
});

test('formatIndented - requires plain object', () => {
  assert.throws(() => formatIndented({ id: 'test', obj: [1, 2, 3] }), {
    message: 'obj must be a plain object for formatIndented',
  });
});

// Tests for parseIndented
test('parseIndented - basic object', () => {
  const text = `6dcf4c1b-ff3f-482c-95ab-711ea7d1b019
  uuid "6dcf4c1b-ff3f-482c-95ab-711ea7d1b019"
  status "executed"
  command "echo test"
  exitCode "0"`;

  const result = parseIndented({ text });
  assert.equal(result.id, '6dcf4c1b-ff3f-482c-95ab-711ea7d1b019');
  assert.equal(result.obj.uuid, '6dcf4c1b-ff3f-482c-95ab-711ea7d1b019');
  assert.equal(result.obj.status, 'executed');
  assert.equal(result.obj.command, 'echo test');
  assert.equal(result.obj.exitCode, '0');
});

test('parseIndented - value with quotes', () => {
  // Links-notation style: use single quotes to wrap value containing double quotes
  const text = `test-id
  message 'He said "hello"'`;

  const result = parseIndented({ text });
  assert.equal(result.id, 'test-id');
  assert.equal(result.obj.message, 'He said "hello"');
});

test('parseIndented - empty lines are skipped', () => {
  const text = `test-id

  key "value"

  another "value2"`;

  const result = parseIndented({ text });
  assert.equal(result.id, 'test-id');
  assert.equal(result.obj.key, 'value');
  assert.equal(result.obj.another, 'value2');
});

test('parseIndented - requires text', () => {
  assert.throws(() => parseIndented({}), {
    message: 'text is required for parseIndented',
  });
});

// Roundtrip tests for formatIndented/parseIndented
test('formatIndented/parseIndented roundtrip - basic', () => {
  const original = {
    id: '6dcf4c1b-ff3f-482c-95ab-711ea7d1b019',
    obj: {
      uuid: '6dcf4c1b-ff3f-482c-95ab-711ea7d1b019',
      status: 'executed',
      command: 'echo test',
      exitCode: '0',
    },
  };

  const formatted = formatIndented(original);
  const parsed = parseIndented({ text: formatted });

  assert.equal(parsed.id, original.id);
  assert.deepEqual(parsed.obj, original.obj);
});

test('formatIndented/parseIndented roundtrip - with quotes', () => {
  const original = {
    id: 'test-id',
    obj: { message: 'He said "hello"' },
  };

  const formatted = formatIndented(original);
  const parsed = parseIndented({ text: formatted });

  assert.equal(parsed.id, original.id);
  assert.deepEqual(parsed.obj, original.obj);
});
