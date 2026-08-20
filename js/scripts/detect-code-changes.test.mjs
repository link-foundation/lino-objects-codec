import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyChanges,
  isExcludedFromCodeChanges,
  isWorkflowFile,
  toPackagePaths,
} from './detect-code-changes.mjs';

// Regression guard for the monorepo path bug found while solving issue #41
// (same class as issue #39): `git diff --name-only` yields repository-root
// paths, so every package-relative comparison has to strip the `js/` prefix
// first.
test('toPackagePaths strips the package prefix and drops foreign packages', () => {
  const files = [
    'js/src/index.mjs',
    'rust/src/lib.rs',
    '.github/workflows/js.yml',
  ];
  assert.deepEqual(toPackagePaths(files, 'js/'), ['src/index.mjs']);
});

test('toPackagePaths is a no-op at the repository root', () => {
  const files = ['src/index.mjs'];
  assert.deepEqual(toPackagePaths(files, ''), files);
});

test('an examples-only pull request is not a code change', () => {
  const { outputs } = classifyChanges(['js/examples/demo.mjs'], 'js/');
  assert.equal(outputs['any-code-changed'], 'false');
  assert.equal(outputs['mjs-changed'], 'true');
});

test('a changeset-only pull request is not a code change', () => {
  const { outputs } = classifyChanges(
    ['js/.changeset/happy-pandas-run.md'],
    'js/'
  );
  assert.equal(outputs['any-code-changed'], 'false');
  assert.equal(outputs['docs-changed'], 'true');
});

test('package.json is detected through the package prefix', () => {
  const { outputs } = classifyChanges(['js/package.json'], 'js/');
  assert.equal(outputs['package-changed'], 'true');
  assert.equal(outputs['any-code-changed'], 'true');
});

test('a source change is a code change', () => {
  const { outputs } = classifyChanges(['js/src/codec.mjs'], 'js/');
  assert.equal(outputs['any-code-changed'], 'true');
  assert.equal(outputs['mjs-changed'], 'true');
});

test('a workflow change counts as a code change', () => {
  const { outputs } = classifyChanges(['.github/workflows/js.yml'], 'js/');
  assert.equal(outputs['workflow-changed'], 'true');
  assert.equal(outputs['any-code-changed'], 'true');
});

test('changes in another package are ignored', () => {
  const { outputs } = classifyChanges(
    ['python/src/lino_objects_codec/codec.py'],
    'js/'
  );
  assert.equal(outputs['any-code-changed'], 'false');
  assert.equal(outputs['docs-changed'], 'false');
});

test('isWorkflowFile only matches repository-root workflow paths', () => {
  assert.equal(isWorkflowFile('.github/workflows/js.yml'), true);
  assert.equal(isWorkflowFile('js/.github/workflows/js.yml'), false);
});

test('markdown is excluded from code changes anywhere in the package', () => {
  assert.equal(isExcludedFromCodeChanges('docs/guide.md'), true);
  assert.equal(isExcludedFromCodeChanges('src/README.md'), true);
  assert.equal(isExcludedFromCodeChanges('src/index.mjs'), false);
});
