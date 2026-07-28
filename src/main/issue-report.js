import os from 'node:os';

function redactHome(value) {
  const home = os.homedir();
  return String(value ?? '').split(home).join('~');
}

export function formatIssueReport({ diagnostics = {}, health = [], logs = [] } = {}) {
  const lines = [
    '# ChatDesk Linux issue report',
    '',
    '> Review this report before publishing. It intentionally excludes cookies, prompts, and conversation content.',
    '',
    '## Problem',
    '',
    '<!-- Describe what happened and what you expected. -->',
    '',
    '## Diagnostics',
    '',
    '```text',
    `Version: ${diagnostics.appVersion || 'Unknown'}`,
    `Electron: ${diagnostics.electron || 'Unknown'}`,
    `Chromium: ${diagnostics.chromium || 'Unknown'}`,
    `Platform: ${diagnostics.platform || 'Unknown'} ${diagnostics.arch || ''}`.trim(),
    `Desktop: ${diagnostics.desktop || 'Unknown'} / ${diagnostics.display || 'Unknown'}`,
    `Profile: ${diagnostics.profile || 'Unknown'}`,
    `Safe mode: ${diagnostics.safeMode ? 'Yes' : 'No'}`,
    `Online: ${diagnostics.online ? 'Yes' : 'No'}`,
    '```',
    '',
    '## Health checks',
    '',
    ...health.map((item) => `- ${item.status === 'pass' ? '✅' : item.status === 'warn' ? '⚠️' : '❌'} ${item.label}: ${item.detail}`),
    '',
    '## Recent sanitized logs',
    '',
    '```text',
    ...logs.slice(-80).map((line) => redactHome(line).slice(0, 1000)),
    '```',
  ];
  return lines.join('\n');
}
