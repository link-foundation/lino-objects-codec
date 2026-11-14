import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

test('git identity is passed literally without shell evaluation or logging', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'codec-git-config-'));
  const name = 'Release "bot" $(touch injected)';
  const email = 'private+release@example.invalid';
  try {
    execFileSync('git', ['init', '--quiet'], { cwd });
    const output = execFileSync(
      process.execPath,
      [fileURLToPath(new URL('./git-config.mjs', import.meta.url))],
      {
        cwd,
        encoding: 'utf8',
        env: { ...process.env, GIT_USER_NAME: name, GIT_USER_EMAIL: email },
      }
    );
    assert.equal(
      execFileSync('git', ['config', 'user.name'], {
        cwd,
        encoding: 'utf8',
      }).trim(),
      name
    );
    assert.equal(
      execFileSync('git', ['config', 'user.email'], {
        cwd,
        encoding: 'utf8',
      }).trim(),
      email
    );
    assert.equal(existsSync(join(cwd, 'injected')), false);
    assert.equal(output.includes(name), false);
    assert.equal(output.includes(email), false);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
