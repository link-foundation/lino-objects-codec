// Issue #79: the codec must work in a browser bundle, which has neither the
// `process` nor the `Buffer` global. This file removes both before loading the
// library (node --test runs every test file in its own process) and restores
// them once its tests finish.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';

const savedProcess = globalThis.process;
const NodeBuffer = globalThis.Buffer;
const originalConsoleDebug = console.debug;

delete globalThis.process;
delete globalThis.Buffer;

const codec = await import('../src/index.js');
const { base64ToBytes, bytesToBase64, decodeUtf8Base64, encodeUtf8Base64 } =
  await import('../src/base64.js');

after(() => {
  globalThis.process = savedProcess;
  globalThis.Buffer = NodeBuffer;
  console.debug = originalConsoleDebug;
  codec.setDebugEnabled(null);
});

test('the browser-like environment has no process and no Buffer', () => {
  assert.equal(typeof process, 'undefined');
  assert.equal(typeof Buffer, 'undefined');
});

test('formatIndented and parseIndented work without process', () => {
  const text = codec.formatIndented({
    id: 'settings',
    obj: { 'skin.name': 'liquid' },
  });
  assert.equal(text, 'settings:\n  skin.name liquid');
  assert.deepEqual(codec.parseIndented({ text }), {
    id: 'settings',
    obj: { 'skin.name': 'liquid' },
  });
});

test('decode works without process', () => {
  assert.deepEqual(codec.decode({ notation: '(\n  skin.name "liquid"\n)' }), {
    'skin.name': 'liquid',
  });
});

test('isDebugEnabled treats a missing environment as tracing off', () => {
  codec.setDebugEnabled(null);
  assert.equal(codec.isDebugEnabled(), false);
});

test('decode of a legacy (base64 "…") value works without Buffer', () => {
  assert.deepEqual(
    codec.decode({ notation: '(\n  name (base64 "bGlxdWlk")\n)' }),
    { name: 'liquid' }
  );
});

test('compact encoding round-trips Unicode without Buffer', () => {
  const value = {
    name: '✓ à la mode',
    emoji: '世界🌍',
    lines: 'a\nb\r\n',
    empty: '',
  };
  const notation = codec.encodeCompact({ obj: value });
  // The Buffer-free path writes exactly what the Buffer path writes.
  globalThis.Buffer = NodeBuffer;
  let nodeNotation;
  try {
    nodeNotation = codec.encodeCompact({ obj: value });
  } finally {
    delete globalThis.Buffer;
  }
  assert.equal(notation, nodeNotation);
  assert.ok(notation.includes('(str 4pyTIMOgIGxhIG1vZGU=)'));
  assert.deepEqual(codec.decode({ notation }), value);
  assert.deepEqual(codec.decodeCompact({ notation }), value);
});

test('tracing falls back to console.debug without process.stderr', () => {
  const lines = [];
  console.debug = (line) => lines.push(line);
  try {
    codec.setDebugEnabled(true);
    codec.parseIndented({ text: 'settings:\n  skin.name liquid' });
  } finally {
    codec.setDebugEnabled(null);
    console.debug = originalConsoleDebug;
  }
  assert.ok(lines.length > 0);
  assert.ok(lines.every((line) => line.startsWith('[lino-codec] ')));
  assert.ok(lines.some((line) => line.includes('format.parseIndented')));
});

test('the fallback base64 encoder matches Buffer', () => {
  for (let length = 0; length < 64; length += 1) {
    const bytes = Uint8Array.from(
      { length },
      (_, index) => (index * 37 + length) & 255
    );
    assert.equal(
      bytesToBase64(bytes),
      NodeBuffer.from(bytes).toString('base64')
    );
  }
  for (const text of [
    '',
    'a',
    'ab',
    'abc',
    '✓ à la mode',
    '世界🌍',
    '﻿bom',
    '\uD800',
  ]) {
    assert.equal(
      encodeUtf8Base64(text),
      NodeBuffer.from(text, 'utf-8').toString('base64')
    );
  }
});

test('the fallback base64 decoder is as lenient as Buffer', () => {
  const samples = [
    '',
    'bGlxdWlk',
    'bGlxdWlk==',
    'bGl xdWlk',
    'bGl\nxdWlk',
    'b-_/',
    '_w',
    'abc=def',
    'a',
    'ab',
    'abc',
    '!!bGlx',
    'bGlx=',
    '4pyTIMOgIGxhIG1vZGU=',
    '77u/Ym9t',
    '/w==',
    '//79',
    'é bGlx',
    'not base64 at all',
  ];
  // A deterministic pseudo-random sweep over the characters that matter.
  const pool = 'ABCxyz019+/-_= \n!é';
  let seed = 79;
  for (let count = 0; count < 500; count += 1) {
    let sample = '';
    const length = count % 23;
    for (let index = 0; index < length; index += 1) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      sample += pool[seed % pool.length];
    }
    samples.push(sample);
  }
  for (const sample of samples) {
    assert.deepEqual(
      Array.from(base64ToBytes(sample)),
      Array.from(NodeBuffer.from(sample, 'base64')),
      `bytes of ${JSON.stringify(sample)}`
    );
    assert.equal(
      decodeUtf8Base64(sample),
      NodeBuffer.from(sample, 'base64').toString('utf-8'),
      `text of ${JSON.stringify(sample)}`
    );
  }
});
