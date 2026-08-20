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
// paths, so every package-relative comparison has to strip the `csharp/` prefix
// first.
test('toPackagePaths strips the package prefix and drops foreign packages', () => {
  const files = [
    'csharp/src/Lino.Objects.Codec/Codec.cs',
    'rust/src/lib.rs',
    '.github/workflows/csharp.yml',
  ];
  assert.deepEqual(toPackagePaths(files, 'csharp/'), [
    'src/Lino.Objects.Codec/Codec.cs',
  ]);
});

test('toPackagePaths is a no-op at the repository root', () => {
  const files = ['src/Codec.cs'];
  assert.deepEqual(toPackagePaths(files, ''), files);
});

test('an examples-only pull request is not a code change', () => {
  const { outputs } = classifyChanges(['csharp/examples/Demo.cs'], 'csharp/');
  assert.equal(outputs['any-code-changed'], 'false');
  assert.equal(outputs['cs-changed'], 'true');
});

test('a changeset-only pull request is not a code change', () => {
  const { outputs } = classifyChanges(
    ['csharp/.changeset/happy-pandas-run.md'],
    'csharp/'
  );
  assert.equal(outputs['any-code-changed'], 'false');
  assert.equal(outputs['docs-changed'], 'true');
});

test('the project file is detected through the package prefix', () => {
  const { outputs } = classifyChanges(
    ['csharp/src/Lino.Objects.Codec/Lino.Objects.Codec.csproj'],
    'csharp/'
  );
  assert.equal(outputs['project-changed'], 'true');
  assert.equal(outputs['any-code-changed'], 'true');
});

test('a source change is a code change', () => {
  const { outputs } = classifyChanges(
    ['csharp/src/Lino.Objects.Codec/Codec.cs'],
    'csharp/'
  );
  assert.equal(outputs['any-code-changed'], 'true');
  assert.equal(outputs['cs-changed'], 'true');
});

test('a workflow change counts as a code change', () => {
  const { outputs } = classifyChanges(
    ['.github/workflows/csharp.yml'],
    'csharp/'
  );
  assert.equal(outputs['workflow-changed'], 'true');
  assert.equal(outputs['any-code-changed'], 'true');
});

test('changes in another package are ignored', () => {
  const { outputs } = classifyChanges(
    ['python/src/lino_objects_codec/codec.py'],
    'csharp/'
  );
  assert.equal(outputs['any-code-changed'], 'false');
  assert.equal(outputs['docs-changed'], 'false');
});

test('isWorkflowFile only matches repository-root workflow paths', () => {
  assert.equal(isWorkflowFile('.github/workflows/csharp.yml'), true);
  assert.equal(isWorkflowFile('csharp/.github/workflows/csharp.yml'), false);
});

test('markdown is excluded from code changes anywhere in the package', () => {
  assert.equal(isExcludedFromCodeChanges('docs/guide.md'), true);
  assert.equal(isExcludedFromCodeChanges('src/README.md'), true);
  assert.equal(isExcludedFromCodeChanges('src/Codec.cs'), false);
});
