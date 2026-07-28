import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const mainSource = fs.readFileSync(new URL('../src/main/index.js', import.meta.url), 'utf8');
const securitySource = fs.readFileSync(new URL('../src/main/security.js', import.meta.url), 'utf8');
const preloadSource = fs.readFileSync(new URL('../src/preload/chrome-preload.cjs', import.meta.url), 'utf8');

test('uses native Linux window controls and a reliable local preload environment', () => {
  assert.match(mainSource, /frame:\s*true/);
  assert.doesNotMatch(mainSource, /app\.enableSandbox\(\)/);
  assert.match(mainSource, /sandbox:\s*false/);
  assert.match(mainSource, /Menu\.setApplicationMenu/);
});

test('remote ChatGPT content remains sandboxed', () => {
  assert.match(securitySource, /sandbox:\s*true/);
  assert.match(securitySource, /contextIsolation:\s*true/);
  assert.match(securitySource, /nodeIntegration:\s*false/);
});

test('shell preload exposes a versioned, restricted bridge', () => {
  assert.match(preloadSource, /bridgeVersion:\s*4/);
  assert.doesNotMatch(preloadSource, /exposeInMainWorld\([^)]*ipcRenderer/);
});
