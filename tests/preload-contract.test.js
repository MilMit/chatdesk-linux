import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const chromePreload = fs.readFileSync(new URL('../src/preload/chrome-preload.cjs', import.meta.url), 'utf8');
const quickChatPreload = fs.readFileSync(new URL('../src/preload/quick-chat-preload.cjs', import.meta.url), 'utf8');
const activityPreload = fs.readFileSync(new URL('../src/preload/activity-preload.cjs', import.meta.url), 'utf8');
const mainSource = fs.readFileSync(new URL('../src/main/index.js', import.meta.url), 'utf8');

test('sandboxed preload scripts use CommonJS instead of ESM imports', () => {
  for (const source of [chromePreload, quickChatPreload, activityPreload]) {
    assert.match(source, /require\(['"]electron['"]\)/);
    assert.doesNotMatch(source, /^\s*import\s/m);
  }
});

test('main window references the CommonJS preload files', () => {
  assert.match(mainSource, /chrome-preload\.cjs/);
  assert.match(mainSource, /quick-chat-preload\.cjs/);
  assert.match(mainSource, /activity-preload\.cjs/);
  assert.doesNotMatch(mainSource, /chrome-preload\.js/);
  assert.doesNotMatch(mainSource, /quick-chat-preload\.js/);
});

test('chrome preload limits renderer IPC to explicit channel allowlists', () => {
  assert.match(chromePreload, /bridgeVersion:\s*4/);
  assert.match(chromePreload, /INVOKE_CHANNELS/);
  assert.match(chromePreload, /SEND_CHANNELS/);
  assert.match(chromePreload, /RECEIVE_CHANNELS/);
  assert.match(chromePreload, /Blocked \$\{operation\} IPC channel/);
});

test('activity preload exposes only a dedicated command channel', () => {
  assert.match(activityPreload, /bridgeVersion:\s*1/);
  assert.match(activityPreload, /activity:state/);
  assert.match(activityPreload, /activity:command/);
  assert.doesNotMatch(activityPreload, /exposeInMainWorld\([^)]*ipcRenderer/);
});
