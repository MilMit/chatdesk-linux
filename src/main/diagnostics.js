export function desktopEnvironment(env = process.env) {
  return env.XDG_CURRENT_DESKTOP || env.DESKTOP_SESSION || 'Unknown';
}

export function displayProtocol(env = process.env) {
  return env.XDG_SESSION_TYPE || (env.WAYLAND_DISPLAY ? 'wayland' : env.DISPLAY ? 'x11' : 'unknown');
}

export function formatDiagnostics(data) {
  const rows = [
    ['App', `${data.appName} ${data.appVersion}`],
    ['Electron', data.electron],
    ['Chromium', data.chromium],
    ['Node.js', data.node],
    ['Platform', `${data.platform} ${data.arch}`],
    ['Desktop', data.desktop],
    ['Display', data.display],
    ['Safe mode', data.safeMode ? 'Yes' : 'No'],
    ['Network', data.online ? 'Online' : 'Offline'],
    ['Profile', data.profile],
    ['Session', data.session],
    ['ChatGPT URL', data.url],
    ['Hardware acceleration', data.hardwareAcceleration ? 'Enabled' : 'Disabled'],
    ['Log file', data.logFile],
    ['Last crash', data.lastCrash || 'None recorded'],
  ];
  return rows.map(([key, value]) => `${key}: ${value}`).join('\n');
}
