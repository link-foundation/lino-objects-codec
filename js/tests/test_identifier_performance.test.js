import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { URL } from 'node:url';
import { formatIndented } from '../src/index.js';

test('identifier trimming preserves nested ids and the empty fallback', () => {
  const result = formatIndented({
    id: 'root',
    obj: { __key__: { ok: true }, ___: { ok: false } },
  });
  assert.match(result, /root_key:\n {2}ok true/);
  assert.match(result, /root_item:\n {2}ok false/);
});

test(
  'long internal underscores finish within a bounded subprocess',
  { timeout: 5000 },
  async () => {
    const source = new URL('../src/index.js', import.meta.url).href;
    const { stdout } = await promisify(execFile)(
      process.execPath,
      [
        '--max-old-space-size=64',
        '--input-type=module',
        '-e',
        `import { formatIndented } from ${JSON.stringify(source)};
     const key = 'a' + '_'.repeat(100000) + 'b';
     const text = formatIndented({ id: 'root', obj: { [key]: { ok: true } } });
     console.log(text.endsWith('root_' + key + ':\\n  ok true'));`,
      ],
      { timeout: 3000, maxBuffer: 1024 }
    );
    assert.equal(stdout.trim(), 'true');
  }
);
