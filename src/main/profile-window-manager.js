import fs from 'node:fs';
import path from 'node:path';
import { BrowserWindow, screen } from 'electron';
import { installNativeContextMenu } from './context-menu.js';
import { getSecureWebPreferences, secureWebContents } from './security.js';
import { partitionForProfile, PROFILE_ICON_GLYPHS } from './profile-store.js';

const PROFILE_COLOR_DOTS = Object.freeze({ blue: '🔵', violet: '🟣', emerald: '🟢', amber: '🟡', rose: '🔴', cyan: '🩵' });

function readState(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return {}; }
}
function visibleBounds(bounds) {
  if (!bounds) return null;
  const displays = screen.getAllDisplays();
  return displays.some(({ workArea }) => bounds.x < workArea.x + workArea.width && bounds.x + bounds.width > workArea.x && bounds.y < workArea.y + workArea.height && bounds.y + bounds.height > workArea.y)
    ? bounds : null;
}

export class ProfileWindowManager {
  constructor({ statePath, iconPath, appUrl, profileStore, downloadManager, getSettings, contextMenuOptions = null, prepareSession = null, onWebContentsDestroyed = null }) {
    this.statePath = statePath;
    this.iconPath = iconPath;
    this.appUrl = appUrl;
    this.profileStore = profileStore;
    this.downloadManager = downloadManager;
    this.getSettings = getSettings;
    this.contextMenuOptions = contextMenuOptions;
    this.prepareSession = prepareSession;
    this.onWebContentsDestroyed = onWebContentsDestroyed;
    this.windows = new Map();
    this.memoryTimers = new Map();
    this.state = readState(statePath);
    this.persistQueue = Promise.resolve();
  }

  listOpen() { return [...this.windows.keys()]; }

  listWindowStates() {
    return [...this.windows.entries()].map(([profileId, win]) => ({
      profileId,
      visible: !win.isDestroyed() && win.isVisible(),
      minimized: !win.isDestroyed() && win.isMinimized(),
    }));
  }

  #cancelMemoryTimer(profileId) {
    clearTimeout(this.memoryTimers.get(profileId));
    this.memoryTimers.delete(profileId);
  }

  #scheduleMemoryTimer(profileId, win) {
    this.#cancelMemoryTimer(profileId);
    const minutes = Number(this.getSettings()?.memorySaverMinutes || 0);
    if (!minutes || win.isDestroyed()) return;
    const timer = setTimeout(() => {
      if (!win.isDestroyed() && (!win.isVisible() || win.isMinimized())) win.destroy();
    }, minutes * 60_000);
    timer.unref?.();
    this.memoryTimers.set(profileId, timer);
  }

  open(profileId, { newChat = false, url = '' } = {}) {
    const profile = this.profileStore.get(profileId);
    if (!profile) throw new Error('Profile not found.');
    const existing = this.windows.get(profileId);
    const destination = url || this.appUrl;
    if (existing && !existing.isDestroyed()) {
      this.#cancelMemoryTimer(profileId);
      if (existing.isMinimized()) existing.restore();
      existing.show();
      existing.focus();
      if (newChat || url) void existing.loadURL(destination);
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
      webPreferences: { ...getSecureWebPreferences(partitionForProfile(profileId)), backgroundThrottling: settings.keepLongResponsesActive === false },
    });
    secureWebContents(win.webContents);
    this.prepareSession?.(win.webContents.session);
    installNativeContextMenu(win.webContents, {
      ...(this.contextMenuOptions?.() || {}),
      getWindow: () => win,
      onOpenProfileWindow: (targetProfileId, targetUrl) => this.open(targetProfileId, { url: targetUrl }),
    });
    win.webContents.setBackgroundThrottling(settings.keepLongResponsesActive === false);
    win.webContents.setZoomFactor(settings.zoomFactor);
    win.webContents.session.setSpellCheckerEnabled(settings.spellcheck);
    this.downloadManager?.attachSession(win.webContents.session, profile.name);
    win.once('ready-to-show', () => win.show());
    const save = () => {
      if (win.isDestroyed() || win.isMinimized()) return;
      this.state[profileId] = { bounds: win.getBounds(), maximized: win.isMaximized() };
      const snapshot = structuredClone(this.state);
      const temporary = `${this.statePath}.tmp`;
      this.persistQueue = this.persistQueue
        .then(() => fs.promises.mkdir(path.dirname(this.statePath), { recursive: true }))
        .then(() => fs.promises.writeFile(temporary, `${JSON.stringify(snapshot, null, 2)}\n`, { mode: 0o600 }))
        .then(() => fs.promises.rename(temporary, this.statePath))
        .catch((error) => console.warn('[ChatDesk] Profile window state write failed:', error.message));
    };
    win.on('resize', save);
    win.on('move', save);
    win.on('close', save);
    win.on('show', () => this.#cancelMemoryTimer(profileId));
    win.on('restore', () => this.#cancelMemoryTimer(profileId));
    win.on('hide', () => this.#scheduleMemoryTimer(profileId, win));
    win.on('minimize', () => this.#scheduleMemoryTimer(profileId, win));
    win.on('closed', () => {
      this.#cancelMemoryTimer(profileId);
      this.windows.delete(profileId);
    });
    this.windows.set(profileId, win);
    win.webContents.once('destroyed', () => this.onWebContentsDestroyed?.(win.webContents.id));
    void win.loadURL(destination);
    if (this.state[profileId]?.maximized) win.maximize();
    return win;
  }

  applySettings() {
    const settings = this.getSettings();
    for (const win of this.windows.values()) {
      if (win.isDestroyed()) continue;
      win.webContents.setBackgroundThrottling(settings.keepLongResponsesActive === false);
      win.webContents.setZoomFactor(settings.zoomFactor);
      win.webContents.session.setSpellCheckerEnabled(settings.spellcheck);
    }
  }

  close(profileId) {
    const win = this.windows.get(profileId);
    if (win && !win.isDestroyed()) win.close();
  }

  async flush() { await this.persistQueue; }

  closeAll() {
    for (const timer of this.memoryTimers.values()) clearTimeout(timer);
    this.memoryTimers.clear();
    for (const win of this.windows.values()) if (!win.isDestroyed()) win.close();
    this.windows.clear();
  }
}
