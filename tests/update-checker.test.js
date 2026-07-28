import test from 'node:test';
import assert from 'node:assert/strict';
import { compareVersions } from '../src/main/version-utils.js';

test('compares release versions', () => {
  assert.equal(compareVersions('0.2.0', '0.1.9'), 1);
  assert.equal(compareVersions('v0.2.0', '0.2.0'), 0);
  assert.equal(compareVersions('0.1.0', '0.2.0'), -1);
});
