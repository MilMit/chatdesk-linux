import assert from 'node:assert/strict';
import test from 'node:test';
import { activityWindowHeight, isActiveDownload, shouldShowActivity, summarizeDownloads } from '../src/main/activity-state.js';

test('summarizes active downloads using byte-weighted progress', () => {
  const summary = summarizeDownloads([
    { state: 'progressing', total: 100, received: 50, paused: false },
    { state: 'progressing', total: 300, received: 150, paused: true },
    { state: 'completed', total: 20, received: 20 },
  ]);
  assert.equal(summary.activeCount, 2);
  assert.equal(summary.pausedCount, 1);
  assert.equal(summary.progress, 0.5);
  assert.equal(summary.indeterminate, false);
});

test('marks downloads without known totals as indeterminate', () => {
  const summary = summarizeDownloads([{ state: 'progressing', total: 0, received: 10 }]);
  assert.equal(summary.activeCount, 1);
  assert.equal(summary.indeterminate, true);
  assert.equal(isActiveDownload({ state: 'progressing' }), true);
});

test('activity visibility respects enablement and suppression', () => {
  assert.equal(shouldShowActivity({ enabled: true, suppressed: false, downloadCount: 1 }), true);
  assert.equal(shouldShowActivity({ enabled: true, suppressed: true, downloadCount: 1 }), false);
  assert.equal(shouldShowActivity({ enabled: false, suppressed: false, hasToast: true }), false);
});

test('activity height is bounded for large queues', () => {
  assert.equal(activityWindowHeight({}), 96);
  assert.ok(activityWindowHeight({ downloadCount: 1, hasConnection: true, hasToast: true }) > 96);
  assert.ok(activityWindowHeight({ downloadCount: 99, hasConnection: true, hasToast: true }) <= 470);
});
