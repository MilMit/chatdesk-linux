import test from 'node:test';
import assert from 'node:assert/strict';
import { getAppViewBounds, PROFILE_STRIP_HEIGHT, shouldShowAppView } from '../src/main/view-layout.js';

test('reserves a non-interactive profile indicator strip above ChatGPT', () => {
  assert.equal(PROFILE_STRIP_HEIGHT, 4);
  assert.deepEqual(getAppViewBounds({ width: 1200, height: 800 }), { x: 0, y: 4, width: 1200, height: 796 });
  assert.deepEqual(getAppViewBounds({ width: 1200, height: 800 }, { profileStrip: false }), { x: 0, y: 0, width: 1200, height: 800 });
});

test('never creates negative app view dimensions', () => {
  assert.deepEqual(getAppViewBounds({ width: -1, height: -20 }), { x: 0, y: 0, width: 0, height: 0 });
  assert.deepEqual(getAppViewBounds({ width: 10, height: 2 }), { x: 0, y: 0, width: 10, height: 2 });
});

test('shows ChatGPT only in app mode after a successful reveal', () => {
  assert.equal(shouldShowAppView({ chromeMode: 'app', appRevealed: true, mainFrameLoadFailed: false }), true);
  assert.equal(shouldShowAppView({ chromeMode: 'settings', appRevealed: true, mainFrameLoadFailed: false }), false);
  assert.equal(shouldShowAppView({ chromeMode: 'app', appRevealed: false, mainFrameLoadFailed: false }), false);
  assert.equal(shouldShowAppView({ chromeMode: 'app', appRevealed: true, mainFrameLoadFailed: true }), false);
});
