import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { sanitizeWorkspace, WorkspaceStore } from '../src/main/workspace-store.js';

test('sanitizes workspace bounds and zoom', () => {
  const item = sanitizeWorkspace({ name: 'Coding', width: 12, height: 99, zoomFactor: 9, compactSide: 'bad' });
  assert.equal(item.width, 800);
  assert.equal(item.height, 600);
  assert.equal(item.zoomFactor, 1.5);
  assert.equal(item.compactSide, 'right');
});

test('creates and removes workspace presets', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chatdesk-workspaces-'));
  const store = new WorkspaceStore(path.join(dir, 'workspaces.json'));
  const list = store.save({ name: 'Support', profileId: 'work', compact: true });
  const created = list.find((item) => item.name === 'Support');
  assert.ok(created);
  assert.equal(store.remove(created.id).some((item) => item.id === created.id), false);
});
