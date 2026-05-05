import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCratesIoVersionBadge,
  buildReleaseTag,
  buildReleaseTitle,
  normalizeReleaseVersionForBadge,
} from './release-format-helpers.mjs';

test('normalizeReleaseVersionForBadge strips rust- and rust_ prefixes', () => {
  assert.equal(normalizeReleaseVersionForBadge('rust-v0.2.1'), '0.2.1');
  assert.equal(normalizeReleaseVersionForBadge('rust_v0.2.1'), '0.2.1');
  assert.equal(normalizeReleaseVersionForBadge('v0.2.1'), '0.2.1');
  assert.equal(normalizeReleaseVersionForBadge('0.2.1'), '0.2.1');
});

test('buildCratesIoVersionBadge produces a clean shields.io badge for any input format', () => {
  // The bug from issue #33: rust-v0.2.1 release page had no badge at all.
  const badge = buildCratesIoVersionBadge('lino-objects-codec', 'rust-v0.2.1');
  assert.match(badge, /crates\.io-0\.2\.1-orange\.svg/);
  assert.match(badge, /crates\.io\/crates\/lino-objects-codec\/0\.2\.1/);
  assert.doesNotMatch(badge, /rust-v0\.2\.1/);
});

test('buildReleaseTitle produces "[Rust] X.Y.Z"', () => {
  assert.equal(buildReleaseTitle('Rust', 'rust-v0.2.1'), '[Rust] 0.2.1');
  assert.equal(buildReleaseTitle('Rust', '0.2.1'), '[Rust] 0.2.1');
});

test('buildReleaseTag joins prefix with bare semver', () => {
  assert.equal(buildReleaseTag('rust_v', '0.2.1'), 'rust_v0.2.1');
  assert.equal(buildReleaseTag('rust_v', 'rust-v0.2.1'), 'rust_v0.2.1');
});
