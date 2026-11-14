import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { packageVersion } from './package-version.mjs';

test('release reads the JS manifest from a remote ref after main advances', () => {
  const root = mkdtempSync(join(tmpdir(), 'codec-release-'));
  const cwd = join(root, 'js');
  const git = (...args) =>
    execFileSync('git', args, { cwd: root, stdio: 'pipe' });
  try {
    mkdirSync(cwd);
    git('init', '--quiet');
    git('config', 'user.name', 'Regression test');
    git('config', 'user.email', 'test@example.invalid');
    writeFileSync(join(root, 'package.json'), '{"version":"99.0.0"}');
    writeFileSync(join(cwd, 'package.json'), '{"version":"1.2.3"}');
    git('add', '.');
    git('commit', '--quiet', '-m', 'remote package');
    git('update-ref', 'refs/remotes/origin/main', 'HEAD');
    writeFileSync(join(cwd, 'package.json'), '{"version":"1.2.2"}');
    assert.equal(packageVersion({ cwd }), '1.2.2');
    assert.equal(packageVersion({ cwd, ref: 'origin/main' }), '1.2.3');
    assert.equal(packageVersion({ cwd: root, ref: 'origin/main' }), '99.0.0');
    assert.throws(() => packageVersion({ cwd, ref: 'missing-ref' }));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
