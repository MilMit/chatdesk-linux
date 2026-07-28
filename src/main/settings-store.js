import fs from 'node:fs';
import path from 'node:path';

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
    animations: input.animations !== false,
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
  constructor(filePath) { this.filePath = filePath; this.settings = this.#read(); }
  #read() {
    try { return sanitizeSettings(JSON.parse(fs.readFileSync(this.filePath, 'utf8'))); }
    catch { return { ...DEFAULT_SETTINGS }; }
  }
  get() { return { ...this.settings }; }
  update(patch) { this.settings = sanitizeSettings({ ...this.settings, ...patch }); this.#write(); return this.get(); }
  replace(next) { this.settings = sanitizeSettings(next); this.#write(); return this.get(); }
  reset() { this.settings = { ...DEFAULT_SETTINGS }; this.#write(); return this.get(); }
  #write() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.tmp`;
    fs.writeFileSync(tempPath, `${JSON.stringify(this.settings, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(tempPath, this.filePath);
  }
}
