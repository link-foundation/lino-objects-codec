import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  compareVersions,
  isVersionAtLeast,
  selectLatestSatisfyingMajor,
} from '../scripts/npm-version-helpers.mjs';

test('compareVersions orders semantic versions numerically', () => {
  assert.equal(compareVersions('11.10.0', '11.5.1'), 1);
  assert.equal(compareVersions('11.5.1', '11.5.1'), 0);
  assert.equal(compareVersions('11.4.9', '11.5.1'), -1);
});

test('isVersionAtLeast accepts v-prefixed Node.js versions', () => {
  assert.equal(isVersionAtLeast('v22.14.0', '22.14.0'), true);
  assert.equal(isVersionAtLeast('v22.13.1', '22.14.0'), false);
});

test('selectLatestSatisfyingMajor pins npm to supported 11.x releases', () => {
  assert.equal(
    selectLatestSatisfyingMajor({
      versions: ['10.9.7', '11.4.2', '11.5.1', '11.13.0', '12.0.0'],
      major: 11,
      minimum: '11.5.1',
    }),
    '11.13.0'
  );
});
