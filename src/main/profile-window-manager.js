import fs from 'node:fs';
import path from 'node:path';
import { BrowserWindow, screen } from 'electron';
import { getSecureWebPreferences, secureWebContents } from './security.js';
import { partitionForProfile, PROFILE_ICON_GLYPHS } from './profile-store.js';

const PROFILE_COLOR_DOTS = Object.freeze({ blue: '🔵', violet: '🟣', emerald: '🟢', amber: '🟡', rose: '🔴', cyan: '🩵' });

function readState(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return {}; }
}
function writeState(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(`${filePath}.tmp`, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(`${filePath}.tmp`, filePath);
}
function visibleBounds(bounds) {
  if (!bounds) return null;
  const displays = screen.getAllDisplays();
  return displays.some(({ workArea }) => bounds.x < workArea.x + workArea.width && bounds.x + bounds.width > workArea.x && bounds.y < workArea.y + workArea.height && bounds.y + bounds.height > workArea.y)
    ? bounds : null;
}

export class ProfileWindowManager {
  constructor({ statePath, iconPath, appUrl, profileStore, downloadManager, getSettings, onOpenExternal = null }) {
    this.statePath = statePath;
    this.iconPath = iconPath;
    this.appUrl = appUrl;
    this.profileStore = profileStore;
    this.downloadManager = downloadManager;
    this.getSettings = getSettings;
    this.onOpenExternal = onOpenExternal;
    this.windows = new Map();
    this.state = readState(statePath);
  }

  listOpen() {
    return [...this.windows.keys()];
  }

  open(profileId, { newChat = false } = {}) {
    const profile = this.profileStore.get(profileId);
    if (!profile) throw new Error('Profile not found.');
    const existing = this.windows.get(profileId);
    if (existing && !existing.isDestroyed()) {
      if (existing.isMinimized()) existing.restore();
      existing.show();
      existing.focus();
      if (newChat) void existing.loadURL(this.appUrl);
      return existing;
    }

    const saved = visibleBounds(this.state[profileId]?.bounds);
    const settings = this.getSettings();
    const win = new BrowserWindow({
      ...(saved || { width: 1120, height: 780 }),
      minWidth: 720,
      minHeight: 520,
      show: false,
      frame: true,
      autoHideMenuBar: settings.autoHideMenuBar,
      backgroundColor: '#202123',
      icon: this.iconPath,
      title: `${PROFILE_COLOR_DOTS[profile.color] || '⚪'} ${PROFILE_ICON_GLYPHS[profile.icon] || '●'} ${profile.name} — ChatDesk Linux`,
      webPreferences: getSecureWebPreferences(partitionForProfile(profileId)),
    });
    secureWebContents(win.webContents);
    win.webContents.setZoomFactor(settings.zoomFactor);
    win.webContents.session.setSpellCheckerEnabled(settings.spellcheck);
    this.downloadManager?.attachSession(win.webContents.session, profile.name);
    win.once('ready-to-show', () => win.show());
    const save = () => {
      if (win.isDestroyed() || win.isMinimized()) return;
      this.state[profileId] = { bounds: win.getBounds(), maximized: win.isMaximized() };
      writeState(this.statePath, this.state);
    };
    win.on('resize', save);
    win.on('move', save);
    win.on('close', save);
    win.on('closed', () => this.windows.delete(profileId));
    this.windows.set(profileId, win);
    void win.loadURL(this.appUrl);
    if (this.state[profileId]?.maximized) win.maximize();
    return win;
  }

  close(profileId) {
    const win = this.windows.get(profileId);
    if (win && !win.isDestroyed()) win.close();
  }

  closeAll() {
    for (const win of this.windows.values()) if (!win.isDestroyed()) win.close();
    this.windows.clear();
  }
}
