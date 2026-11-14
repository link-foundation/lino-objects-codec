import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  compareDependencies,
  decideRustRelease,
  isAlreadyExistingReleaseError,
  normalizeRequirement,
  parseCargoTree,
  parseCratesDependenciesResponse,
  parseCratesVersionResponse,
  parseManifestDependencies,
  satisfiesCaret,
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

const MANIFEST = `[package]
name = "lino-objects-codec"
version = "0.9.4"

[features]
default = []
serde_json = ["dep:serde_json"]

[dependencies]
links-notation = "0.31.4"
base64 = "0.23.1"
serde_json = { version = "1.0.154", optional = true, features = ["preserve_order", "arbitrary_precision"] }
local-only = { path = "../local" }

[dev-dependencies]
serde_json = "1.0.154" # comment
proptest = { version = "1.12.0", default-features = false, features = ["std"] }

[[example]]
name = "json_bridge"
required-features = ["serde_json"]

[target.'cfg(unix)'.dependencies]
ignored = "1.0.0"

[lints.clippy]
all = { level = "warn", priority = -1 }
`;

// What crates.io answered for lino-objects-codec 0.9.3 (issue #84).
const REGISTRY_0_9_3 = JSON.stringify({
  dependencies: [
    { crate_id: 'base64', req: '^0.23.1', kind: 'normal', optional: false },
    {
      crate_id: 'links-notation',
      req: '^0.27.1',
      kind: 'normal',
      optional: false,
    },
    { crate_id: 'proptest', req: '^1.12.0', kind: 'dev', optional: false },
    { crate_id: 'serde_json', req: '^1.0.154', kind: 'dev', optional: false },
    { crate_id: 'serde_json', req: '^1.0.154', kind: 'normal', optional: true },
  ],
});

test('manifest dependencies keep their section, requirement and optional flag', () => {
  assert.deepEqual(parseManifestDependencies(MANIFEST), [
    { name: 'links-notation', kind: 'normal', req: '0.31.4', optional: false },
    { name: 'base64', kind: 'normal', req: '0.23.1', optional: false },
    { name: 'serde_json', kind: 'normal', req: '1.0.154', optional: true },
    { name: 'serde_json', kind: 'dev', req: '1.0.154', optional: false },
    { name: 'proptest', kind: 'dev', req: '1.12.0', optional: false },
  ]);
});

test('renamed dependencies are compared under their crates.io name', () => {
  assert.deepEqual(
    parseManifestDependencies(
      '[dependencies]\nlino = { package = "links-notation", version = "0.31.4" }\n'
    ),
    [
      {
        name: 'links-notation',
        kind: 'normal',
        req: '0.31.4',
        optional: false,
      },
    ]
  );
});

test('bare requirements are caret requirements, as cargo uploads them', () => {
  assert.equal(normalizeRequirement('0.31.4'), '^0.31.4');
  assert.equal(normalizeRequirement('^0.31.4'), '^0.31.4');
  assert.equal(normalizeRequirement('=1.0.0'), '=1.0.0');
});

test('the 0.9.3 registry metadata is reported as stale against the migrated manifest', () => {
  const registry = parseCratesDependenciesResponse({
    status: 200,
    body: REGISTRY_0_9_3,
  });
  assert.deepEqual(
    compareDependencies(parseManifestDependencies(MANIFEST), registry),
    ['links-notation (normal): crates.io has ^0.27.1, expected ^0.31.4']
  );
});

test('matching registry metadata produces no problems', () => {
  const registry = parseCratesDependenciesResponse({
    status: 200,
    body: REGISTRY_0_9_3.replace('^0.27.1', '^0.31.4'),
  });
  assert.deepEqual(
    compareDependencies(parseManifestDependencies(MANIFEST), registry),
    []
  );
});

test('missing, extra and optional-flag differences are all reported', () => {
  const manifest = [
    { name: 'a', kind: 'normal', req: '1.0.0', optional: false },
    { name: 'b', kind: 'normal', req: '1.0.0', optional: true },
  ];
  const registry = [
    { name: 'b', kind: 'normal', req: '^1.0.0', optional: false },
    { name: 'c', kind: 'normal', req: '^1.0.0', optional: false },
  ];
  assert.deepEqual(compareDependencies(manifest, registry), [
    'a (normal): missing from crates.io, expected ^1.0.0',
    'b (normal): crates.io has optional=false, expected optional=true',
    'c (normal): listed on crates.io but not in Cargo.toml',
  ]);
});

test('a dependencies response that is not 200 or not well-formed fails closed', () => {
  assert.throws(
    () => parseCratesDependenciesResponse({ status: 404, body: '' }),
    /HTTP 404/
  );
  assert.throws(
    () => parseCratesDependenciesResponse({ status: 200, body: '{}' }),
    /dependencies array/
  );
  assert.throws(
    () => parseCratesDependenciesResponse({ status: 200, body: 'nope' }),
    /invalid JSON/
  );
});

test('caret requirements follow cargo semantics for 0.x versions', () => {
  assert.equal(satisfiesCaret('0.31.4', '0.31.4'), true);
  assert.equal(satisfiesCaret('0.31.9', '^0.31.4'), true);
  assert.equal(satisfiesCaret('0.31.3', '^0.31.4'), false);
  assert.equal(satisfiesCaret('0.27.1', '^0.31.4'), false);
  assert.equal(satisfiesCaret('0.32.0', '^0.31.4'), false);
  assert.equal(satisfiesCaret('1.9.0', '1.0.154'), true);
  assert.equal(satisfiesCaret('2.0.0', '1.0.154'), false);
  assert.equal(satisfiesCaret('0.0.4', '0.0.3'), false);
  assert.throws(() => satisfiesCaret('1.0.0', '>=1.0.0'), /unsupported/);
});

test('cargo tree output maps each crate to its first resolved version', () => {
  const tree = parseCargoTree(
    'lino-objects-codec v0.9.4\nbase64 v0.23.1\nlinks-notation v0.31.4\nlinks-notation v0.27.1 (*)\n'
  );
  assert.equal(tree.get('lino-objects-codec'), '0.9.4');
  assert.equal(tree.get('links-notation'), '0.31.4');
  assert.equal(tree.get('base64'), '0.23.1');
});
