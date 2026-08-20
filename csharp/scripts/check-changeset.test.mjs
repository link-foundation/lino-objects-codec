import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  evaluate,
  isChangeset,
  isReleaseBranch,
  isSourceFile,
} from './check-changeset.mjs';

test('recognises C# source files by package-relative path', () => {
  assert.equal(isSourceFile('src/Lino.Objects.Codec/ObjectCodec.cs'), true);
  assert.equal(isSourceFile('tests/Lino.Objects.Codec.Tests/BasicTypesTests.cs'), true);
  assert.equal(isSourceFile('examples/BasicUsage/Program.cs'), true);
  assert.equal(isSourceFile('scripts/check-changeset.mjs'), true);
  assert.equal(isSourceFile('src/Lino.Objects.Codec/Lino.Objects.Codec.csproj'), true);
});

test('does not treat documentation or changesets as source', () => {
  assert.equal(isSourceFile('README.md'), false);
  assert.equal(isSourceFile('.changeset/20260820_000000_note.md'), false);
  // Repo-root-relative paths must not match: git without --relative would
  // report these, and matching them would break the check (issue #39).
  assert.equal(isSourceFile('csharp/src/Lino.Objects.Codec/ObjectCodec.cs'), false);
});

test('recognises changesets but not their README', () => {
  assert.equal(isChangeset('.changeset/20260820_071844_issue_39.md'), true);
  assert.equal(isChangeset('.changeset/README.md'), false);
  assert.equal(isChangeset('.changeset/config.json'), false);
});

test('fails when source changes carry no changeset', () => {
  const result = evaluate(['src/Lino.Objects.Codec/ObjectCodec.cs']);
  assert.equal(result.ok, false);
  assert.deepEqual(result.sourceFiles, ['src/Lino.Objects.Codec/ObjectCodec.cs']);
  assert.deepEqual(result.changesets, []);
});

test('passes when a changeset accompanies the source change', () => {
  const result = evaluate([
    'src/Lino.Objects.Codec/ObjectCodec.cs',
    '.changeset/20260820_000000_note.md',
  ]);
  assert.equal(result.ok, true);
});

test('passes for documentation-only changes', () => {
  assert.equal(evaluate(['README.md', 'docs/guide.md']).ok, true);
});

test('exempts automated release branches', () => {
  assert.equal(isReleaseBranch('changeset-release/main'), true);
  assert.equal(isReleaseBranch('changeset-manual-release-20260820'), true);
  assert.equal(isReleaseBranch('issue-41-297a752a4939'), false);
  assert.equal(isReleaseBranch(undefined), false);
});
