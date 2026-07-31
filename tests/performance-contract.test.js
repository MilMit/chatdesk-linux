import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const main = fs.readFileSync(new URL('../src/main/index.js', import.meta.url), 'utf8');
const monitor = fs.readFileSync(new URL('../src/main/performance-monitor.js', import.meta.url), 'utf8');
const profileWindows = fs.readFileSync(new URL('../src/main/profile-window-manager.js', import.meta.url), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('performance work is delayed and hidden profile windows can be released', () => {
  assert.match(main, /UPDATE_STARTUP_DELAY_MS = 15_000/);
  assert.match(profileWindows, /memorySaverMinutes/);
  assert.match(profileWindows, /destroy\(\)/);
  assert.match(monitor, /app\.getAppMetrics/);
  assert.match(monitor, /getCacheSize/);
});

test('release code is bundled with esbuild', () => {
  assert.equal(packageJson.version, '0.6.1');
  assert.equal(packageJson.main, 'build/main/index.js');
  assert.equal(packageJson.devDependencies.esbuild, '0.28.1');
  assert.match(packageJson.scripts['dist:linux'], /npm run bundle/);
});

test('main process avoids synchronous writes in interaction paths', () => {
  assert.doesNotMatch(main, /writeFileSync|appendFileSync|execSync|sendSync/);
});
