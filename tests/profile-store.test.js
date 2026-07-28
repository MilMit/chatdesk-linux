import assert from 'node:assert/strict';
import test from 'node:test';
import { partitionForProfile, sanitizeProfileName } from '../src/main/profile-store.js';

test('creates persistent isolated partitions for profiles', () => {
  assert.equal(partitionForProfile('work'), 'persist:chatdesk-profile-work');
  assert.equal(partitionForProfile('../unsafe'), 'persist:chatdesk-profile-personal');
});

test('sanitizes profile names', () => {
  assert.equal(sanitizeProfileName('  Work\u0000  '), 'Work');
  assert.equal(sanitizeProfileName('x'.repeat(100)).length, 40);
});
