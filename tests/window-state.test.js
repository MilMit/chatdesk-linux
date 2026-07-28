import test from 'node:test';
import assert from 'node:assert/strict';
import { boundsIntersectWorkArea, sanitizeBounds } from '../src/main/window-state.js';

test('enforces minimum window dimensions', () => {
  assert.deepEqual(sanitizeBounds({ width: 100, height: 100 }), { width: 800, height: 600 });
});

test('detects whether a saved window remains visible', () => {
  assert.equal(boundsIntersectWorkArea({ x: 20, y: 20, width: 800, height: 600 }, { x: 0, y: 0, width: 1920, height: 1080 }), true);
  assert.equal(boundsIntersectWorkArea({ x: 4000, y: 4000, width: 800, height: 600 }, { x: 0, y: 0, width: 1920, height: 1080 }), false);
});
