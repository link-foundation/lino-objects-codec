import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  decideRustRelease,
  isAlreadyExistingReleaseError,
  parseCratesVersionResponse,
} from './crates-release-helpers.mjs';

test('crates.io 200 version probe means the current version is published', () => {
  assert.equal(
    parseCratesVersionResponse({
      status: 200,
      body: JSON.stringify({ version: { num: '0.2.0' } }),
    }),
    true
  );
});

test('crates.io 404 version probe means the current version is unpublished', () => {
  assert.equal(parseCratesVersionResponse({ status: 404, body: '' }), false);
});

test('crates.io 200 probe without version metadata fails closed', () => {
  assert.throws(
    () =>
      parseCratesVersionResponse({
        status: 200,
        body: JSON.stringify({ version: null }),
      }),
    /did not include a version object/
  );
});

test('ambiguous crates.io probe responses fail instead of triggering publish', () => {
  assert.throws(
    () => parseCratesVersionResponse({ status: 403, body: 'Forbidden' }),
    /refusing to guess release state/
  );
});

test('release decision skips published current versions when no fragments exist', () => {
  assert.deepEqual(
    decideRustRelease({
      hasFragments: false,
      currentVersionPublished: true,
    }),
    {
      shouldRelease: false,
      skipBump: false,
      reason: 'current Cargo.toml version already exists on crates.io',
    }
  );
});

test('release decision republishes missing current versions without bumping', () => {
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

test('release decision bumps when changelog fragments exist', () => {
  assert.deepEqual(
    decideRustRelease({
      hasFragments: true,
      currentVersionPublished: true,
    }),
    {
      shouldRelease: true,
      skipBump: false,
      reason: 'changelog fragments found',
    }
  );
});

test('GitHub release already-existing errors are idempotent', () => {
  assert.equal(
    isAlreadyExistingReleaseError(
      'gh: Validation Failed (HTTP 422): already_exists'
    ),
    true
  );
});
