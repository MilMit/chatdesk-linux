import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ProfileStore, sanitizeProfileAppearance } from '../src/main/profile-store.js';

test('sanitizes profile colors and icons', () => {
  assert.deepEqual(sanitizeProfileAppearance({ color: 'rose', icon: 'star' }), { color: 'rose', icon: 'star' });
  assert.deepEqual(sanitizeProfileAppearance({ color: 'unsafe', icon: 'unsafe' }, 1), { color: 'violet', icon: 'briefcase' });
});

test('migrates old profiles and persists appearance updates', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'chatdesk-profile-'));
  const file = path.join(directory, 'profiles.json');
  fs.writeFileSync(file, JSON.stringify({ profiles: [{ id: 'personal', name: 'Personal' }], activeId: 'personal' }));
  const store = new ProfileStore(file);
  assert.equal(store.get('personal').color, 'blue');
  const state = store.update('personal', { color: 'cyan', icon: 'shield' });
  assert.equal(state.profiles[0].color, 'cyan');
  assert.equal(state.profiles[0].icon, 'shield');
});
