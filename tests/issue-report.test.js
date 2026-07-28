import assert from 'node:assert/strict';
import test from 'node:test';
import { formatIssueReport } from '../src/main/issue-report.js';

test('issue report contains diagnostics but no conversation fields', () => {
  const report = formatIssueReport({ diagnostics: { appVersion: '0.5.0', electron: '43', profile: 'Work' }, health: [{ status: 'pass', label: 'Sandbox', detail: 'ok' }], logs: ['INFO startup'] });
  assert.match(report, /0\.5\.0/);
  assert.match(report, /Sandbox/);
  assert.match(report, /intentionally excludes cookies, prompts, and conversation content/i);
  assert.doesNotMatch(report, /super-secret-user-prompt|session-cookie-value|assistant response body/i);
});
