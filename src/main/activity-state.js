const ACTIVE_STATES = new Set(['progressing']);
const TERMINAL_STATES = new Set(['completed', 'cancelled', 'interrupted']);

export function isActiveDownload(item) {
  return Boolean(item && ACTIVE_STATES.has(item.state));
}

export function isTerminalDownload(item) {
  return Boolean(item && TERMINAL_STATES.has(item.state));
}

export function summarizeDownloads(items = []) {
  const active = items.filter(isActiveDownload);
  const known = active.filter((item) => Number(item.total) > 0);
  const totalBytes = known.reduce((sum, item) => sum + Number(item.total || 0), 0);
  const receivedBytes = known.reduce((sum, item) => sum + Math.min(Number(item.received || 0), Number(item.total || 0)), 0);
  return {
    activeCount: active.length,
    pausedCount: active.filter((item) => item.paused).length,
    indeterminate: active.length > 0 && known.length === 0,
    progress: totalBytes > 0 ? Math.max(0, Math.min(1, receivedBytes / totalBytes)) : 0,
  };
}

export function activityWindowHeight({ downloadCount = 0, hasConnection = false, hasToast = false } = {}) {
  const cards = Math.min(3, Math.max(0, Number(downloadCount) || 0));
  const content = 22 + (hasConnection ? 56 : 0) + (cards * 112) + (hasToast ? 64 : 0);
  return Math.max(96, Math.min(470, content));
}

export function shouldShowActivity({ enabled, suppressed, downloadCount = 0, hasConnection = false, hasToast = false } = {}) {
  return enabled === true && suppressed !== true && (downloadCount > 0 || hasConnection === true || hasToast === true);
}
