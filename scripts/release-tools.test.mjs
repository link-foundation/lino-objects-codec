import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadReleaseTools } from './release-tools.mjs';

test('locked release packages execute commands with the shared current parser', async () => {
  const { $, makeConfig } = await loadReleaseTools();
  assert.equal(typeof makeConfig, 'function');
  const result = await $`echo "release tools ready"`.run({ capture: true });
  assert.equal(result.code, 0);
  assert.equal(result.stdout.trim(), 'release tools ready');
});

test('locked configuration parser reads a lenv file and preserves CLI priority', async () => {
  const { makeConfig } = await loadReleaseTools();
  const cwd = mkdtempSync(join(tmpdir(), 'release-config-'));
  try {
    writeFileSync(join(cwd, '.lenv'), 'RELEASE_NAME: from-file\nRETRY_COUNT: 3\n');
    const config = makeConfig({
      cwd,
      env: { values: {}, autoMap: true },
      argv: ['node', 'release.js', '--release-name', 'from-cli'],
      yargs: ({ yargs }) => yargs
        .option('release-name', { type: 'string' })
        .option('retry-count', { type: 'number' }),
    });
    assert.equal(config.releaseName, 'from-cli');
    assert.equal(config.retryCount, 3);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
