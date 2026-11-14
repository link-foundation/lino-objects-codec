import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
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

test('release commit interpolation preserves quotes and shell syntax literally', async () => {
  const { $ } = await loadReleaseTools({ configuration: false });
  const cwd = mkdtempSync(join(tmpdir(), 'release-commit-'));
  const message = '1.2.3 "quoted" $(touch injected) `touch injected-too`';
  try {
    execFileSync('git', ['init', '--quiet'], { cwd });
    const git = $({
      cwd,
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'Release test',
        GIT_AUTHOR_EMAIL: 'release@example.invalid',
        GIT_COMMITTER_NAME: 'Release test',
        GIT_COMMITTER_EMAIL: 'release@example.invalid',
      },
    });
    const result =
      await git`git -c commit.gpgsign=false commit --allow-empty -m ${message}`.run(
        { capture: true }
      );
    assert.equal(result.code, 0);
    assert.equal(
      execFileSync('git', ['log', '-1', '--format=%B'], {
        cwd,
        encoding: 'utf8',
      }).trim(),
      message
    );
    assert.equal(existsSync(join(cwd, 'injected')), false);
    assert.equal(existsSync(join(cwd, 'injected-too')), false);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('locked configuration parser reads a lenv file and preserves CLI priority', async () => {
  const { makeConfig } = await loadReleaseTools();
  const cwd = mkdtempSync(join(tmpdir(), 'release-config-'));
  try {
    writeFileSync(
      join(cwd, '.lenv'),
      'RELEASE_NAME: from-file\nRETRY_COUNT: 3\n'
    );
    const config = makeConfig({
      cwd,
      env: { values: {}, autoMap: true },
      argv: ['node', 'release.js', '--release-name', 'from-cli'],
      yargs: ({ yargs }) =>
        yargs
          .option('release-name', { type: 'string' })
          .option('retry-count', { type: 'number' }),
    });
    assert.equal(config.releaseName, 'from-cli');
    assert.equal(config.retryCount, 3);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
