import fs from 'node:fs';
import path from 'node:path';
import { writeJsonFile } from './atomic-json-store.js';

export const DEFAULT_SETTINGS = Object.freeze({
  language: 'system',
  onboardingComplete: false,
  autoCheckUpdates: true,
  lastUpdateCheckAt: '',
  theme: 'system',
  minimizeToTray: true,
  launchAtStartup: false,
  hardwareAcceleration: true,
  zoomFactor: 1,
  spellcheck: true,
  notifications: true,
  externalLinks: true,
  mainShortcut: 'CommandOrControl+Shift+M',
  quickChatShortcut: 'CommandOrControl+Shift+Space',
  commandPaletteShortcut: 'CommandOrControl+Shift+P',
  downloadPath: '',
  alwaysOnTop: false,
  animations: true,
  motionMode: 'system',
  memorySaverMinutes: 10,
  startupMode: 'last',
  focusAlwaysOnTop: false,
  nativeContextMenu: true,
  keepLongResponsesActive: true,
  streamRecoveryAlerts: true,
  autoHideMenuBar: false,
  activityPopups: true,
  connectionActivity: true,
  autoHideCompletedDownloads: true,
  clipboardHistoryEnabled: false,
  clipboardHistoryLimit: 20,
  compactWidth: 460,
  compactSide: 'right',
  recentCommands: [],
  favoriteCommands: [],
});

const ALLOWED_THEMES = new Set(['system', 'light', 'dark']);
const ALLOWED_LANGUAGES = new Set(['system', 'en', 'fa']);
const ALLOWED_COMPACT_SIDES = new Set(['left', 'right']);
const ALLOWED_MOTION_MODES = new Set(['system', 'full', 'reduced', 'off']);
const ALLOWED_STARTUP_MODES = new Set(['last', 'personal', 'compact', 'tray']);
const ALLOWED_MEMORY_SAVER_MINUTES = new Set([0, 10, 30]);

function clampZoom(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return DEFAULT_SETTINGS.zoomFactor;
  return Math.min(1.5, Math.max(0.75, Math.round(number * 20) / 20));
}

function sanitizeStringList(value, maxItems = 20) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const result = [];
  for (const item of value) {
    const text = typeof item === 'string' ? item.trim().slice(0, 100) : '';
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
    if (result.length >= maxItems) break;
  }
  return result;
}

function sanitizeTimestamp(value) {
  if (typeof value !== 'string' || !value) return '';
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : '';
}

export function sanitizeSettings(input = {}) {
  const stringOrDefault = (value, fallback) => (
    typeof value === 'string' && value.trim() ? value.trim() : fallback
  );

  return {
    language: ALLOWED_LANGUAGES.has(input.language) ? input.language : DEFAULT_SETTINGS.language,
    onboardingComplete: input.onboardingComplete === true,
    autoCheckUpdates: input.autoCheckUpdates !== false,
    lastUpdateCheckAt: sanitizeTimestamp(input.lastUpdateCheckAt),
    theme: ALLOWED_THEMES.has(input.theme) ? input.theme : DEFAULT_SETTINGS.theme,
    minimizeToTray: input.minimizeToTray !== false,
    launchAtStartup: input.launchAtStartup === true,
    hardwareAcceleration: input.hardwareAcceleration !== false,
    zoomFactor: clampZoom(input.zoomFactor),
    spellcheck: input.spellcheck !== false,
    notifications: input.notifications !== false,
    externalLinks: input.externalLinks !== false,
    mainShortcut: stringOrDefault(input.mainShortcut, DEFAULT_SETTINGS.mainShortcut),
    quickChatShortcut: stringOrDefault(input.quickChatShortcut, DEFAULT_SETTINGS.quickChatShortcut),
    commandPaletteShortcut: stringOrDefault(input.commandPaletteShortcut, DEFAULT_SETTINGS.commandPaletteShortcut),
    downloadPath: typeof input.downloadPath === 'string' ? input.downloadPath : '',
    alwaysOnTop: input.alwaysOnTop === true,
    animations: input.motionMode === 'off' ? false : input.animations !== false,
    motionMode: ALLOWED_MOTION_MODES.has(input.motionMode) ? input.motionMode : (input.animations === false ? 'off' : DEFAULT_SETTINGS.motionMode),
    memorySaverMinutes: ALLOWED_MEMORY_SAVER_MINUTES.has(Number(input.memorySaverMinutes)) ? Number(input.memorySaverMinutes) : DEFAULT_SETTINGS.memorySaverMinutes,
    startupMode: ALLOWED_STARTUP_MODES.has(input.startupMode) ? input.startupMode : DEFAULT_SETTINGS.startupMode,
    focusAlwaysOnTop: input.focusAlwaysOnTop === true,
    nativeContextMenu: input.nativeContextMenu !== false,
    keepLongResponsesActive: input.keepLongResponsesActive !== false,
    streamRecoveryAlerts: input.streamRecoveryAlerts !== false,
    autoHideMenuBar: input.autoHideMenuBar === true,
    activityPopups: input.activityPopups !== false,
    connectionActivity: input.connectionActivity !== false,
    autoHideCompletedDownloads: input.autoHideCompletedDownloads !== false,
    clipboardHistoryEnabled: input.clipboardHistoryEnabled === true,
    clipboardHistoryLimit: Math.min(50, Math.max(1, Math.round(Number(input.clipboardHistoryLimit) || DEFAULT_SETTINGS.clipboardHistoryLimit))),
    compactWidth: Math.min(720, Math.max(380, Math.round(Number(input.compactWidth) || DEFAULT_SETTINGS.compactWidth))),
    compactSide: ALLOWED_COMPACT_SIDES.has(input.compactSide) ? input.compactSide : DEFAULT_SETTINGS.compactSide,
    recentCommands: sanitizeStringList(input.recentCommands, 20),
    favoriteCommands: sanitizeStringList(input.favoriteCommands, 50),
  };
}

export class SettingsStore {
  constructor(filePath) { this.filePath = filePath; this.settings = this.#read(); this.writeQueue = Promise.resolve(); this.lastWriteError = null; }
  #read() {
    try { return sanitizeSettings(JSON.parse(fs.readFileSync(this.filePath, 'utf8'))); }
    catch { return { ...DEFAULT_SETTINGS }; }
  }
  get() { return { ...this.settings }; }
  update(patch) { this.settings = sanitizeSettings({ ...this.settings, ...patch }); this.#write(); return this.get(); }
  replace(next) { this.settings = sanitizeSettings(next); this.#write(); return this.get(); }
  reset() { this.settings = { ...DEFAULT_SETTINGS }; this.#write(); return this.get(); }
  #write() {
    const snapshot = structuredClone(this.settings);
    this.writeQueue = this.writeQueue
      .then(() => writeJsonFile(this.filePath, snapshot))
      .catch((error) => { this.lastWriteError = error; console.warn('[ChatDesk] Failed to save settings:', error.message); });
  }
  async flush() { await this.writeQueue; if (this.lastWriteError) throw this.lastWriteError; }
}
