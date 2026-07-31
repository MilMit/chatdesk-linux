import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function quoteDesktopArgument(value) {
  return `"${String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}

export function getAutostartPath() {
  return path.join(os.homedir(), '.config', 'autostart', 'chatdesk-linux.desktop');
}

export async function setLinuxAutostart({ enabled, executable, appPath, isPackaged }) {
  const filePath = getAutostartPath();

  if (!enabled) {
    await fs.promises.rm(filePath, { force: true });
    return;
  }

  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  const args = isPackaged ? [] : [appPath];
  const exec = [executable, ...args].map(quoteDesktopArgument).join(' ');
  const desktopFile = [
    '[Desktop Entry]',
    'Type=Application',
    'Version=1.0',
    'Name=ChatDesk Linux',
    'Comment=Start ChatDesk Linux automatically',
    `Exec=${exec}`,
    'Terminal=false',
    'X-GNOME-Autostart-enabled=true',
    '',
  ].join('\n');

  await fs.promises.writeFile(filePath, desktopFile, { mode: 0o644 });
}
