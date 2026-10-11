import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath, URL } from 'node:url';
import { decode, encode, encodeLine, decodeLine } from '../src/index.js';

const execute = promisify(execFile);

test(
  'large readable documents and single values fit bounded heaps',
  { timeout: 120_000 },
  async (t) => {
    for (const [mode, heap] of [
      ['document', 768],
      ['quoted', 128],
      ['escaped', 128],
    ]) {
      const { stdout } = await execute(
        process.execPath,
        [
          '--expose-gc',
          `--max-old-space-size=${heap}`,
          fileURLToPath(
            new URL(
              '../../experiments/issue-68/large-document.mjs',
              import.meta.url
            )
          ),
          mode,
        ],
        { maxBuffer: 64 * 1024, signal: t.signal }
      );
      assert.equal(JSON.parse(stdout).mode, mode);
      t.diagnostic(stdout.trim());
    }
  }
);

test('Unicode keys, whitespace and every quote form keep complete code points', () => {
  const value = {
    '🍫日本語': ['Tiếng Việt 🍫', `"both'quotes"`, `'both"quotes'`, 'a\r%🍫'],
    'key\r🍫': 'end',
  };
  assert.deepEqual(decode({ notation: encode({ obj: value }) }), value);
  assert.deepEqual(decodeLine({ notation: encodeLine({ obj: value }) }), value);
  assert.deepEqual(decode({ notation: '(o:\u2003(🍫日本語 "😀"))' }), {
    '🍫日本語': '😀',
  });
  for (const quote of ['"', "'", '`']) {
    assert.equal(
      decode({
        notation: `${quote}legacy ${quote}${quote}🍫${quote}${quote} end${quote}`,
      }),
      `legacy ${quote}🍫${quote} end`
    );
    assert.equal(
      decode({ notation: `${quote.repeat(3)}🍫${quote.repeat(4)}` }),
      `🍫${quote}`
    );
    assert.throws(
      () => decode({ notation: `${quote.repeat(3)}🍫${quote.repeat(2)}` }),
      SyntaxError
    );
  }
  assert.throws(() => decode({ notation: '😀 "unfinished' }), /character 2$/);
  assert.throws(() => decode({ notation: '(escaped "🍫%0")' }), /character 1 /);
});

test('escaped UTF-8 spans byte chunks, rejects malformed input and resets between values', () => {
  for (const offset of [65533, 65534, 65535, 65536]) {
    const prefix = 'a'.repeat(offset);
    for (const unicode of ['🍫', '%F0%9F%8D%AB']) {
      assert.equal(
        decode({ notation: `(escaped "${prefix}${unicode}%0D")` }),
        `${prefix}🍫\r`
      );
    }
  }
  for (const payload of [
    '%F0%9F',
    '%FF',
    '%C0%AF',
    '%ED%A0%80',
    '%80',
    '%0',
    '%GG',
    `${'a'.repeat(65535)}%F0%9F%GG`,
  ]) {
    assert.throws(
      () => decode({ notation: `(escaped "${payload}")` }),
      SyntaxError
    );
    assert.equal(decode({ notation: '(escaped "%F0%9F%8D%AB")' }), '🍫');
  }
  // Existing TextDecoder semantics: only an initial BOM is stripped.
  assert.equal(
    decode({ notation: '(escaped "%EF%BB%BFtext%EF%BB%BF")' }),
    'text\uFEFF'
  );
  assert.equal(decode({ notation: '(escaped "\ud800%0D")' }), '\uFFFD\r');
  assert.equal(decode({ notation: '"\ud800"' }), '\ud800');
});
