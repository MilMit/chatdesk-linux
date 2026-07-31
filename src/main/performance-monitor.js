import { app } from 'electron';

function bytesFromWorkingSetKilobytes(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number * 1024)) : 0;
}

export function summarizeProcessMetrics(metrics = app.getAppMetrics()) {
  const processes = (Array.isArray(metrics) ? metrics : []).map((metric) => ({
    type: metric.type || 'Unknown',
    pid: metric.pid,
    cpuPercent: Number(metric.cpu?.percentCPUUsage || 0),
    memoryBytes: bytesFromWorkingSetKilobytes(metric.memory?.workingSetSize),
    privateBytes: bytesFromWorkingSetKilobytes(metric.memory?.privateBytes),
    sandboxed: metric.sandboxed !== false,
  }));
  return {
    totalMemoryBytes: processes.reduce((sum, item) => sum + item.memoryBytes, 0),
    totalCpuPercent: processes.reduce((sum, item) => sum + item.cpuPercent, 0),
    processCount: processes.length,
    processes,
  };
}

export async function collectPerformanceReport({
  targetSession,
  startupStartedAt = Date.now(),
  windows = [],
  hiddenWindows = [],
  memorySaverMinutes = 0,
} = {}) {
  const summary = summarizeProcessMetrics();
  let cacheBytes = 0;
  try { cacheBytes = targetSession ? await targetSession.getCacheSize() : 0; } catch {}
  return {
    capturedAt: new Date().toISOString(),
    startupMilliseconds: Math.max(0, Date.now() - startupStartedAt),
    cacheBytes,
    activeWindows: windows.filter(Boolean).length,
    hiddenWindows: hiddenWindows.filter(Boolean).length,
    memorySaverMinutes,
    ...summary,
  };
}

export function formatPerformanceReport(report = {}) {
  const mb = (value) => `${(Number(value || 0) / 1024 / 1024).toFixed(1)} MB`;
  const lines = [
    'ChatDesk Performance Report',
    `Captured: ${report.capturedAt || ''}`,
    `Startup elapsed: ${report.startupMilliseconds || 0} ms`,
    `Total memory: ${mb(report.totalMemoryBytes)}`,
    `Total CPU: ${Number(report.totalCpuPercent || 0).toFixed(2)}%`,
    `Processes: ${report.processCount || 0}`,
    `Active windows: ${report.activeWindows || 0}`,
    `Hidden windows: ${report.hiddenWindows || 0}`,
    `HTTP cache: ${mb(report.cacheBytes)}`,
    `Memory saver: ${report.memorySaverMinutes ? `${report.memorySaverMinutes} minutes` : 'Off'}`,
    '',
    ...(report.processes || []).map((item) => `${item.type} (PID ${item.pid}): ${mb(item.memoryBytes)}, ${item.cpuPercent.toFixed(2)}% CPU, sandbox=${item.sandboxed}`),
  ];
  return lines.join('\n');
}
