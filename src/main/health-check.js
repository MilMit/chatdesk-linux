import fs from 'node:fs';
import path from 'node:path';
import { Notification, app, net, session } from 'electron';

function result(id, label, status, detail) { return { id, label, status, detail }; }

export async function runHealthChecks({ userDataPath, sandboxPath, shortcutStatus = {}, protocolRegistered = false, profilePartition = '' } = {}) {
  const checks = [];
  try {
    const stat = await fs.promises.stat(sandboxPath);
    const mode = stat.mode & 0o7777;
    const ownerOk = typeof stat.uid !== 'number' || stat.uid === 0;
    checks.push(result('sandbox', 'Chromium sandbox', mode === 0o4755 && ownerOk ? 'pass' : 'warn', `mode ${mode.toString(8)}${ownerOk ? '' : ', not owned by root'}`));
  } catch {
    checks.push(result('sandbox', 'Chromium sandbox', app.isPackaged ? 'warn' : 'fail', 'helper file was not found'));
  }

  try {
    const probe = path.join(userDataPath, '.health-write-test');
    await fs.promises.writeFile(probe, 'ok', { mode: 0o600 });
    await fs.promises.rm(probe, { force: true });
    checks.push(result('storage', 'Session storage', 'pass', 'user data directory is writable'));
  } catch (error) {
    checks.push(result('storage', 'Session storage', 'fail', error.message));
  }

  checks.push(result('network', 'Network', net.isOnline() ? 'pass' : 'warn', net.isOnline() ? 'online' : 'offline'));
  checks.push(result('notifications', 'Notifications', Notification.isSupported() ? 'pass' : 'warn', Notification.isSupported() ? 'supported' : 'not reported by the desktop environment'));
  checks.push(result('protocol', 'chatdesk:// protocol', protocolRegistered ? 'pass' : 'warn', protocolRegistered ? 'registered' : 'not registered or running from source'));

  const shortcuts = Object.entries(shortcutStatus).filter(([key]) => key !== 'safeMode');
  if (shortcuts.length) {
    const failed = shortcuts.filter(([, value]) => value !== true).map(([key]) => key);
    checks.push(result('shortcuts', 'Global shortcuts', failed.length ? 'warn' : 'pass', failed.length ? `unavailable: ${failed.join(', ')}` : 'registered'));
  }

  if (profilePartition) {
    try {
      const target = session.fromPartition(profilePartition);
      checks.push(result('profile-session', 'Profile session', target ? 'pass' : 'fail', profilePartition));
    } catch (error) {
      checks.push(result('profile-session', 'Profile session', 'fail', error.message));
    }
  }

  return checks;
}
