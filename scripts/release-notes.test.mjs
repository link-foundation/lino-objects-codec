import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasShieldsBadge, extractChangelogEntry } from './release-notes.mjs';

test('badge detection requires an image with the exact HTTPS Shields origin', () => {
  assert.equal(
    hasShieldsBadge(
      '[![npm](https://img.shields.io/badge/npm-1-blue.svg)](https://npmjs.com)'
    ),
    true
  );
  for (const text of [
    'Mention img.shields.io in the changes',
    '![npm](https://img.shields.io.evil.invalid/badge/a)',
    '![npm](https://evil.invalid/img.shields.io/badge/a)',
    '![npm](https://img.shields.io@evil.invalid/badge/a)',
    '![npm](http://img.shields.io/badge/a)',
    '![npm](https://img.shields.io:444/badge/a)',
    '![npm](https://[invalid)',
  ])
    assert.equal(hasShieldsBadge(text), false, text);
});

test('changelog lookup treats regexp syntax and build metadata literally', () => {
  const changelog =
    '# Changelog\n## [1.2.3+build.7] - 2026-11-14\n\nCorrect entry\n\n## [1.2.3] - old\nOld entry';
  assert.equal(
    extractChangelogEntry(changelog, '1.2.3+build.7'),
    'Correct entry'
  );
  assert.equal(extractChangelogEntry(changelog, '1.2.3'), 'Old entry');
  assert.equal(extractChangelogEntry(changelog, '1.2.3.*'), '');
  assert.equal(extractChangelogEntry(changelog, '1.2.3\\'), '');
  assert.equal(
    extractChangelogEntry('## 1.2.3\nBare version', '1.2.3'),
    'Bare version'
  );
});
