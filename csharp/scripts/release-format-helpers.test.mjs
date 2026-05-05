import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildNuGetVersionBadge,
  buildReleaseTag,
  buildReleaseTitle,
  isAlreadyExistingReleaseError,
  normalizeReleaseVersionForBadge,
} from './release-format-helpers.mjs';

test('normalizeReleaseVersionForBadge strips csharp- and csharp_ prefixes', () => {
  assert.equal(normalizeReleaseVersionForBadge('csharp-v0.2.0'), '0.2.0');
  assert.equal(normalizeReleaseVersionForBadge('csharp_v0.2.0'), '0.2.0');
  assert.equal(normalizeReleaseVersionForBadge('v0.2.0'), '0.2.0');
});

test('buildNuGetVersionBadge produces a NuGet shields.io badge for any input format', () => {
  const badge = buildNuGetVersionBadge('LinoObjectsCodec', 'csharp-v0.2.0');
  assert.match(badge, /nuget-0\.2\.0-blue\.svg/);
  assert.match(badge, /nuget\.org\/packages\/LinoObjectsCodec\/0\.2\.0/);
  assert.doesNotMatch(badge, /csharp-v0\.2\.0/);
});

test('buildReleaseTitle produces "[C#] X.Y.Z"', () => {
  assert.equal(buildReleaseTitle('C#', 'csharp-v0.2.0'), '[C#] 0.2.0');
  assert.equal(buildReleaseTitle('C#', '0.2.0'), '[C#] 0.2.0');
});

test('buildReleaseTag joins prefix with bare semver', () => {
  assert.equal(buildReleaseTag('csharp_v', '0.2.0'), 'csharp_v0.2.0');
  assert.equal(buildReleaseTag('csharp_v', 'csharp-v0.2.0'), 'csharp_v0.2.0');
});

test('isAlreadyExistingReleaseError matches GitHub already_exists responses', () => {
  assert.equal(
    isAlreadyExistingReleaseError(
      '{"errors":[{"resource":"Release","code":"already_exists"}]}'
    ),
    true
  );
  assert.equal(
    isAlreadyExistingReleaseError('Validation Failed'),
    true
  );
  assert.equal(isAlreadyExistingReleaseError('some other error'), false);
});
