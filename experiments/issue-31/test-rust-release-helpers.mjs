import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  decideRustRelease,
  parseCratesVersionResponse,
} from '../../rust/scripts/crates-release-helpers.mjs';

test('issue 31 reproduction: crates.io 403 is not treated as unpublished', () => {
  assert.throws(
    () => parseCratesVersionResponse({ status: 403, body: 'Forbidden' }),
    /refusing to guess release state/
  );
});

test('issue 31 expected rerun behavior: missing current version publishes without bump', () => {
  assert.deepEqual(
    decideRustRelease({
      hasFragments: false,
      currentVersionPublished: false,
    }),
    {
      shouldRelease: true,
      skipBump: true,
      reason: 'current Cargo.toml version is missing from crates.io',
    }
  );
});
