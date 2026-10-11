import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  exemption,
  isChangeset,
  validateContent,
} from './validate-changeset.mjs';

test('only files under .changeset that are not the README count', () => {
  assert.equal(isChangeset('.changeset/brave-cats-sing.md'), true);
  assert.equal(isChangeset('.changeset/README.md'), false);
  assert.equal(isChangeset('.changeset/config.json'), false);
  assert.equal(isChangeset('src/index.js'), false);
});

test('release PRs and Dependabot PRs are exempt, other PRs are not (issue #71)', () => {
  assert.match(exemption({ headRef: 'changeset-release/main' }), /release/);
  assert.match(
    exemption({ headRef: 'dependabot/npm/x', author: 'dependabot[bot]' }),
    /dependabot/
  );
  // A human branch that merely looks like Dependabot's is still checked.
  assert.equal(
    exemption({ headRef: 'dependabot/npm/x', author: 'someone' }),
    null
  );
  assert.equal(exemption({ headRef: 'issue-71', author: 'someone' }), null);
});

test('a changeset needs a bump type and a description', () => {
  assert.equal(
    validateContent("---\n'lino-objects-codec': patch\n---\n\nFix\n").ok,
    true
  );
  assert.equal(
    validateContent("---\n'lino-objects-codec': patch\n---\n").ok,
    false
  );
  assert.equal(validateContent("---\n'other': patch\n---\n\nFix\n").ok, false);
});
