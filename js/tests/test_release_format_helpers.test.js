import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCratesIoVersionBadge,
  buildNpmVersionBadge,
  buildNuGetVersionBadge,
  buildPyPiVersionBadge,
  buildReleaseTag,
  buildReleaseTitle,
  encodeShieldsStaticBadgeSegment,
  normalizeReleaseVersionForBadge,
} from '../scripts/release-format-helpers.mjs';

test('normalizeReleaseVersionForBadge strips bare leading v', () => {
  assert.equal(normalizeReleaseVersionForBadge('v0.3.5'), '0.3.5');
  assert.equal(normalizeReleaseVersionForBadge('0.3.5'), '0.3.5');
});

test('normalizeReleaseVersionForBadge strips dash-style language prefixes', () => {
  // The js-v0.3.5 case from the broken release that motivated issue #33.
  assert.equal(normalizeReleaseVersionForBadge('js-v0.3.5'), '0.3.5');
  assert.equal(normalizeReleaseVersionForBadge('rust-v0.2.1'), '0.2.1');
  assert.equal(normalizeReleaseVersionForBadge('python-v1.2.3'), '1.2.3');
  assert.equal(normalizeReleaseVersionForBadge('csharp-v0.2.0'), '0.2.0');
});

test('normalizeReleaseVersionForBadge strips underscore-style language prefixes', () => {
  // The new js_v / rust_v / python_v / csharp_v convention from issue #33.
  assert.equal(normalizeReleaseVersionForBadge('js_v0.3.5'), '0.3.5');
  assert.equal(normalizeReleaseVersionForBadge('rust_v0.2.1'), '0.2.1');
  assert.equal(normalizeReleaseVersionForBadge('python_v1.2.3'), '1.2.3');
  assert.equal(normalizeReleaseVersionForBadge('csharp_v0.2.0'), '0.2.0');
});

test('normalizeReleaseVersionForBadge handles pre-release and build metadata', () => {
  assert.equal(
    normalizeReleaseVersionForBadge('js_v1.0.0-beta.1'),
    '1.0.0-beta.1'
  );
  assert.equal(
    normalizeReleaseVersionForBadge('rust_v1.0.0+build.7'),
    '1.0.0+build.7'
  );
});

test('encodeShieldsStaticBadgeSegment escapes dashes and underscores per shields.io', () => {
  assert.equal(
    encodeShieldsStaticBadgeSegment('1.0.0-beta.1'),
    '1.0.0--beta.1'
  );
  assert.equal(
    encodeShieldsStaticBadgeSegment('1.0.0+build_7'),
    '1.0.0%2Bbuild__7'
  );
});

test('buildNpmVersionBadge produces a valid shields.io badge with bare semver', () => {
  // This is the bug from issue #33: when called with "js-v0.3.5", the badge
  // must show "npm-0.3.5", not "npm-js-v0.3.5".
  const badge = buildNpmVersionBadge('lino-objects-codec', 'js-v0.3.5');
  assert.match(badge, /npm-0\.3\.5-blue\.svg/);
  assert.match(badge, /npmjs\.com\/package\/lino-objects-codec\/v\/0\.3\.5/);
  assert.doesNotMatch(badge, /js-v0\.3\.5/);
});

test('buildCratesIoVersionBadge uses bare semver in URL and label', () => {
  const badge = buildCratesIoVersionBadge('lino-objects-codec', 'rust-v0.2.1');
  assert.match(badge, /crates\.io-0\.2\.1-orange\.svg/);
  assert.match(badge, /crates\.io\/crates\/lino-objects-codec\/0\.2\.1/);
  assert.doesNotMatch(badge, /rust-v0\.2\.1/);
});

test('buildNuGetVersionBadge uses bare semver in URL and label', () => {
  const badge = buildNuGetVersionBadge('LinoObjectsCodec', 'csharp-v0.2.0');
  assert.match(badge, /nuget-0\.2\.0-blue\.svg/);
  assert.match(badge, /nuget\.org\/packages\/LinoObjectsCodec\/0\.2\.0/);
});

test('buildPyPiVersionBadge uses bare semver in URL and label', () => {
  const badge = buildPyPiVersionBadge('lino-objects-codec', 'python-v1.2.3');
  assert.match(badge, /pypi-1\.2\.3-blue\.svg/);
  assert.match(badge, /pypi\.org\/project\/lino-objects-codec\/1\.2\.3/);
});

test('buildReleaseTitle produces "[Language] X.Y.Z" regardless of input format', () => {
  assert.equal(
    buildReleaseTitle('JavaScript', 'js-v0.3.5'),
    '[JavaScript] 0.3.5'
  );
  assert.equal(buildReleaseTitle('JavaScript', '0.3.5'), '[JavaScript] 0.3.5');
  assert.equal(buildReleaseTitle('Rust', 'rust-v0.2.1'), '[Rust] 0.2.1');
  assert.equal(buildReleaseTitle('Python', 'python_v1.2.3'), '[Python] 1.2.3');
  assert.equal(buildReleaseTitle('C#', 'csharp_v0.2.0'), '[C#] 0.2.0');
});

test('buildReleaseTag joins prefix with bare semver', () => {
  // Accepts a raw semver and prepends the canonical prefix.
  assert.equal(buildReleaseTag('js_v', '0.3.5'), 'js_v0.3.5');
  assert.equal(buildReleaseTag('rust_v', '0.2.1'), 'rust_v0.2.1');
  // Also tolerates pre-prefixed input ("js-v0.3.5") so callers can pass
  // either bare semver or a canonical/legacy tag.
  assert.equal(buildReleaseTag('js_v', 'js-v0.3.5'), 'js_v0.3.5');
  assert.equal(buildReleaseTag('python_v', 'python_v1.2.3'), 'python_v1.2.3');
});
