import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { Parser } from 'links-notation';
import {
  escapeReference,
  formatIndented,
  parseIndented,
} from '../src/index.js';

const parser = new Parser();

function readFixture(name) {
  return JSON.parse(
    readFileSync(
      new URL(`../../fixtures/indented-format/${name}`, import.meta.url),
      'utf8'
    )
  );
}

const parserSafeCases = readFixture('parser-safe.json');
const stringCases = readFixture('strings.json');

/**
 * Read links the way any links-notation reader sees them: a reference is its
 * text, and a link is the list of its values. Header ids are kept as the first
 * item so nested sections stay visible.
 */
function plain(link) {
  if (link.values.length === 0) {
    return link.id;
  }
  const values = link.values.map(plain);
  return link.id === null ? values : [link.id, ...values];
}

function plainParse(text) {
  return parser.parse(text).map(plain);
}

/** An object whose every string, in key and value position, is `value`. */
function sample(value) {
  return {
    [value]: value,
    k: value,
    arr: [value, value],
    nested: { [value]: value },
    z: value,
  };
}

for (const { name, value } of [...parserSafeCases, ...stringCases]) {
  test(`links-notation Parser reads sectioned formatIndented output: ${name}`, () => {
    const obj = sample(value);
    const text = formatIndented({ id: 'root', obj });
    assert.deepEqual(parseIndented({ text }), { id: 'root', obj });
    assert.deepEqual(plainParse(text), [
      [
        'root',
        [value, value],
        ['k', value],
        ['arr', 'root_arr'],
        ['nested', 'root_nested'],
        ['z', value],
      ],
      ['root_arr', value, value],
      ['root_nested', [value, value]],
    ]);
  });

  test(`links-notation Parser reads nested formatIndented output: ${name}`, () => {
    const obj = sample(value);
    const text = formatIndented({ id: 'root', obj, nested: true });
    assert.deepEqual(parseIndented({ text, nested: true }), {
      id: 'root',
      obj,
    });
    assert.deepEqual(plainParse(text), [
      [
        'root',
        [value, value],
        ['k', value],
        ['arr', value, value],
        ['nested', [value, value]],
        ['z', value],
      ],
    ]);
  });
}

test('issue #94 reproduction: empty strings and # values survive the Parser', () => {
  const obj = {
    tasks: { 'q-1': { args: ['--model', '', '#x'] } },
    a: '',
    b: '',
  };
  const text = formatIndented({ id: 'hive_mind_state', obj });
  assert.deepEqual(parseIndented({ text }).obj, obj);
  assert.deepEqual(plainParse(text), [
    [
      'hive_mind_state',
      ['tasks', 'hive_mind_state_tasks'],
      ['a', ''],
      ['b', ''],
    ],
    ['hive_mind_state_tasks', ['q-1', 'hive_mind_state_tasks_q-1']],
    ['hive_mind_state_tasks_q-1', ['args', 'hive_mind_state_tasks_q-1_args']],
    ['hive_mind_state_tasks_q-1_args', '--model', '', '#x'],
  ]);
});

test('nested mode keeps children under their parent without generated ids', () => {
  const obj = {
    intake: { state: 'draining' },
    tasks: { 'q-1': { args: ['--model', '', '#x'] } },
  };
  const text = formatIndented({ id: 'hive_mind_state', obj, nested: true });
  assert.equal(
    text,
    [
      'hive_mind_state:',
      '  intake:',
      '    state draining',
      '  tasks:',
      '    q-1:',
      '      args:',
      '        --model',
      '        ~1{}',
      "        '#x'",
    ].join('\n')
  );
  assert.deepEqual(parseIndented({ text, nested: true }), {
    id: 'hive_mind_state',
    obj,
  });
  assert.deepEqual(plainParse(text), [
    [
      'hive_mind_state',
      ['intake', ['state', 'draining']],
      ['tasks', ['q-1', ['args', '--model', '', '#x']]],
    ],
  ]);
});

test('nested mode keeps types, empty containers and containers inside arrays', () => {
  const obj = {
    number: 42,
    float: -1.5,
    yes: true,
    nothing: null,
    numericText: '42',
    boolText: 'true',
    nullText: 'null',
    emptyArray: [],
    emptyObject: {},
    matrix: [[1, 'two'], [], [[]], { k: 'v' }, {}],
    '-': { dash: '-' },
    'key with spaces': { 'inner:key': "it's" },
    multiline: 'first\n\n  second:\nthird',
    after: 'end',
  };
  const text = formatIndented({ id: 'doc', obj, nested: true });
  assert.deepEqual(parseIndented({ text, nested: true }), { id: 'doc', obj });
  assert.match(text, /^ {2}'-':$/m);
  assert.match(text, /^ {4}-:$/m);
  assert.doesNotThrow(() => parser.parse(text));
});

test('nested mode honours a custom indent', () => {
  const obj = { a: { b: [1, { c: 'd' }] } };
  const text = formatIndented({ id: 'doc', obj, nested: true, indent: '\t' });
  assert.equal(text, 'doc:\n\ta:\n\t\tb:\n\t\t\t1\n\t\t\t-:\n\t\t\t\tc d');
  assert.deepEqual(parseIndented({ text, nested: true }).obj, obj);
});

test('nested mode rejects circular references', () => {
  const obj = { a: {} };
  obj.a.self = obj;
  assert.throws(
    () => formatIndented({ id: 'doc', obj, nested: true }),
    /circular references/
  );
});

test('nested mode allows the same object in two places', () => {
  const shared = { x: 1 };
  const obj = { a: shared, b: [shared] };
  const text = formatIndented({ id: 'doc', obj, nested: true });
  assert.deepEqual(parseIndented({ text, nested: true }).obj, {
    a: { x: 1 },
    b: [{ x: 1 }],
  });
});

test('nested parse keeps __proto__ as an own key', () => {
  const text = "doc:\n  __proto__:\n    polluted yes\n  'a' 1";
  const { obj } = parseIndented({ text, nested: true });
  assert.deepEqual(Object.keys(obj), ['__proto__', 'a']);
  assert.equal(obj.__proto__.polluted, 'yes');
  assert.equal({}.polluted, undefined);
});

test('nested parse rejects malformed documents', () => {
  const invalid = [
    ['  a 1', /before a definition header/],
    ['doc:\n  a 1\nother:\n  b 2', /more than one top-level definition/],
    ['doc:\n  a 1\n    b 2', /Unexpected indentation/],
    ['doc:\n    a 1\n  b 2', /Inconsistent indentation/],
    ['doc:\n  a 1\n  item', /Cannot mix array items and object pairs/],
    ['doc:\n  a b c', /Invalid indented value line/],
    ['doc:\n  a: b', /Invalid definition header/],
    ['doc:\n  a ~1{6}', /./],
  ];
  for (const [text, error] of invalid) {
    assert.throws(() => parseIndented({ text, nested: true }), error, text);
  }
});

test('both parsers still read legacy empty quote pairs', () => {
  assert.deepEqual(parseIndented({ text: "doc:\n  a ''" }).obj, { a: '' });
  assert.deepEqual(parseIndented({ text: "doc:\n  a ''", nested: true }).obj, {
    a: '',
  });
});

test('escapeReference writes references the Parser reads back unchanged', () => {
  assert.equal(escapeReference({ value: '' }), '~1{}');
  assert.equal(escapeReference({ value: '#x' }), "'#x'");
  assert.equal(escapeReference({ value: 'issue#1' }), 'issue#1');
  assert.equal(escapeReference({ value: '~1{61}' }), "'~1{61}'");
  assert.equal(escapeReference({ value: '\'"' }), '`\'"`');
  assert.equal(escapeReference({ value: '\'"`' }), '"\'""`"');
  assert.equal(escapeReference({ value: '\'`"' }), '~1{276022}');
  for (const { value } of parserSafeCases) {
    const reference = escapeReference({ value });
    assert.deepEqual(plainParse(`(k ${reference})`), [['k', value]], reference);
  }
});
