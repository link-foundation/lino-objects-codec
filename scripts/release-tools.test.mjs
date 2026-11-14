import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadReleaseTools } from './release-tools.mjs';

test('locked release packages execute commands with the shared current parser', async () => {
  const { $, makeConfig } = await loadReleaseTools();
  assert.equal(typeof makeConfig, 'function');
  const result = await $`echo "release tools ready"`.run({ capture: true });
  assert.equal(result.code, 0);
  assert.equal(result.stdout.trim(), 'release tools ready');
});
