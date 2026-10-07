import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadReleaseTools,
  releaseArguments,
  setOutput,
} from '../scripts/release-tools.mjs';

test('release output appends values and is harmless outside GitHub Actions', () => {
  const directory = mkdtempSync(join(tmpdir(), 'release-output-'));
  const previous = process.env.GITHUB_OUTPUT;
  try {
    delete process.env.GITHUB_OUTPUT;
    setOutput('published', 'false');
    process.env.GITHUB_OUTPUT = join(directory, 'output');
    setOutput('published', 'true');
    setOutput('version', '1.2.3');
    assert.equal(
      readFileSync(process.env.GITHUB_OUTPUT, 'utf8'),
      'published=true\nversion=1.2.3\n'
    );
  } finally {
    if (previous === undefined) {
      delete process.env.GITHUB_OUTPUT;
    } else {
      process.env.GITHUB_OUTPUT = previous;
    }
    rmSync(directory, { recursive: true, force: true });
  }
});

test('release loader requests configuration only for commands that need it', async () => {
  const calls = [];
  globalThis.__releaseToolCalls = calls;
  const fetchSource = async (url) => {
    assert.equal(url, 'https://unpkg.com/use-m/use.js');
    return {
      text: async () => `({ use: async name => {
        globalThis.__releaseToolCalls.push(name);
        return name === 'command-stream' ? { $: 'shell' } : { makeConfig: 'config' };
      } })`,
    };
  };
  try {
    assert.deepEqual(await loadReleaseTools({}, fetchSource), {
      $: 'shell',
      makeConfig: 'config',
    });
    assert.deepEqual(calls.splice(0), ['command-stream', 'lino-arguments']);
    assert.deepEqual(
      await loadReleaseTools({ configuration: false }, fetchSource),
      { $: 'shell' }
    );
    assert.deepEqual(calls, ['command-stream']);
  } finally {
    delete globalThis.__releaseToolCalls;
  }
});

test('release arguments retain environment defaults and do not shadow --version', () => {
  const options = new Map();
  const yargs = {
    option(name, spec) {
      options.set(name, spec);
      return this;
    },
  };
  const environment = { VERSION: '1.2.3', REPOSITORY: 'owner/repo' };
  assert.equal(
    releaseArguments({
      yargs,
      getenv: (key, fallback) => environment[key] ?? fallback,
    }),
    yargs
  );
  assert.equal(options.get('release-version').default, '1.2.3');
  assert.equal(options.get('repository').default, 'owner/repo');
  assert.equal(options.has('version'), false);
});
