import { BrowserWindow, screen } from 'electron';
import { activityWindowHeight, isTerminalDownload, shouldShowActivity } from './activity-state.js';

const COMPLETED_LIFETIME_MS = 6500;
const FAILED_LIFETIME_MS = 9000;
const CONNECTING_DELAY_MS = 900;
const CONNECTED_LIFETIME_MS = 1800;

export class ActivityWindow {
  constructor({ parent, htmlPath, preloadPath, iconPath, safeMode = false, getSettings, getDark, getLanguage, getProfile }) {
    this.parent = parent;
    this.htmlPath = htmlPath;
    this.preloadPath = preloadPath;
    this.iconPath = iconPath;
    this.safeMode = safeMode;
    this.getSettings = getSettings;
    this.getDark = getDark;
    this.getLanguage = getLanguage;
    this.getProfile = getProfile;
    this.window = null;
    this.downloads = new Map();
    this.connection = null;
    this.toast = null;
    this.suppressed = true;
    this.loaded = false;
    this.connectingTimer = null;
    this.connectionTimer = null;
    this.toastTimer = null;
    this.downloadTimers = new Map();
  }

  isSender(sender) {
    return Boolean(this.window && !this.window.isDestroyed() && sender === this.window.webContents);
  }

  #settings() {
    return this.getSettings?.() ?? {};
  }

  #enabled() {
    return !this.safeMode && this.#settings().activityPopups !== false;
  }

  #ensureWindow() {
    if (this.window && !this.window.isDestroyed()) return this.window;
    if (!this.parent || this.parent.isDestroyed()) return null;
    this.window = new BrowserWindow({
      parent: this.parent,
      width: 410,
      height: 120,
      minWidth: 360,
      maxWidth: 460,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      focusable: true,
      hasShadow: false,
      icon: this.iconPath,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        webSecurity: true,
        preload: this.preloadPath,
      },
    });
    this.window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    this.window.webContents.on('will-navigate', (event) => event.preventDefault());
    this.window.webContents.on('preload-error', (_event, preloadPath, error) => {
      console.error(`[ChatDesk] Activity preload failed: ${preloadPath}`, error);
    });
    this.window.webContents.once('did-finish-load', () => {
      this.loaded = true;
      this.#pushState();
    });
    this.window.on('closed', () => {
      this.window = null;
      this.loaded = false;
    });
    void this.window.loadFile(this.htmlPath);
    return this.window;
  }

  #visibleDownloads() {
    return [...this.downloads.values()]
      .sort((a, b) => {
        const activeDifference = Number(b.state === 'progressing') - Number(a.state === 'progressing');
        return activeDifference || String(b.startedAt).localeCompare(String(a.startedAt));
      })
      .slice(0, 3);
  }

  #payload() {
    const settings = this.#settings();
    return {
      animations: settings.animations !== false && !this.safeMode,
      dark: this.getDark?.() !== false,
      language: this.getLanguage?.() || 'en',
      profile: this.getProfile?.() || null,
      downloads: this.#visibleDownloads(),
      hiddenDownloadCount: Math.max(0, this.downloads.size - 3),
      connection: settings.connectionActivity === false ? null : this.connection,
      toast: this.toast,
    };
  }

  #hasContent(payload = this.#payload()) {
    return shouldShowActivity({
      enabled: this.#enabled(),
      suppressed: this.suppressed || !this.parent?.isVisible() || this.parent?.isMinimized(),
      downloadCount: payload.downloads.length,
      hasConnection: Boolean(payload.connection),
      hasToast: Boolean(payload.toast),
    });
  }

  #pushState() {
    const payload = this.#payload();
    if (!this.#hasContent(payload)) {
      this.hide();
      return;
    }
    const target = this.#ensureWindow();
    if (!target) return;
    const height = activityWindowHeight({
      downloadCount: payload.downloads.length,
      hasConnection: Boolean(payload.connection),
      hasToast: Boolean(payload.toast),
    });
    const bounds = target.getBounds();
    if (bounds.height !== height) target.setSize(bounds.width, height, false);
    this.reposition();
    if (this.loaded) target.webContents.send('activity:state', payload);
    if (!target.isVisible()) target.showInactive();
  }

  updateSettings() {
    this.#pushState();
  }

  setSuppressed(value) {
    this.suppressed = value === true;
    this.#pushState();
  }

  setConnection(state, message = '') {
    clearTimeout(this.connectingTimer);
    clearTimeout(this.connectionTimer);
    this.connectingTimer = null;
    this.connectionTimer = null;

    if (!state || state === 'idle') {
      this.connection = null;
      this.#pushState();
      return;
    }

    if (state === 'connecting') {
      if (this.#settings().connectionActivity === false) return;
      this.connectingTimer = setTimeout(() => {
        this.connection = { state, message: message || 'Connecting to ChatGPT…' };
        this.#pushState();
      }, CONNECTING_DELAY_MS);
      return;
    }

    this.connection = { state, message };
    this.#pushState();
    if (state === 'connected') {
      this.connectionTimer = setTimeout(() => {
        this.connection = null;
        this.#pushState();
      }, CONNECTED_LIFETIME_MS);
    }
  }

  showToast(message, { type = 'info', duration = 3400, actionLabel = '', action = '' } = {}) {
    if (!message) return;
    clearTimeout(this.toastTimer);
    this.toast = { message: String(message), type, actionLabel, action };
    this.#pushState();
    if (duration > 0) {
      this.toastTimer = setTimeout(() => {
        this.toast = null;
        this.#pushState();
      }, duration);
    }
  }

  dismissToast() {
    clearTimeout(this.toastTimer);
    this.toast = null;
    this.#pushState();
  }

  updateDownload(item) {
    if (!item?.id) return;
    clearTimeout(this.downloadTimers.get(item.id));
    this.downloadTimers.delete(item.id);
    this.downloads.set(item.id, { ...item });
    this.#pushState();

    if (isTerminalDownload(item) && this.#settings().autoHideCompletedDownloads !== false) {
      const delay = item.state === 'completed' ? COMPLETED_LIFETIME_MS : FAILED_LIFETIME_MS;
      const timer = setTimeout(() => this.dismissDownload(item.id), delay);
      this.downloadTimers.set(item.id, timer);
    }
  }

  dismissDownload(id) {
    clearTimeout(this.downloadTimers.get(id));
    this.downloadTimers.delete(id);
    this.downloads.delete(id);
    this.#pushState();
  }

  showNow() {
    this.suppressed = false;
    this.#pushState();
  }

  reposition() {
    if (!this.window || this.window.isDestroyed() || !this.parent || this.parent.isDestroyed()) return;
    const parentBounds = this.parent.getBounds();
    const workArea = screen.getDisplayMatching(parentBounds).workArea;
    const { width, height } = this.window.getBounds();
    const margin = 18;
    const desiredX = parentBounds.x + parentBounds.width - width - margin;
    const desiredY = parentBounds.y + parentBounds.height - height - margin;
    const x = Math.max(workArea.x + margin, Math.min(desiredX, workArea.x + workArea.width - width - margin));
    const y = Math.max(workArea.y + margin, Math.min(desiredY, workArea.y + workArea.height - height - margin));
    this.window.setPosition(Math.round(x), Math.round(y), false);
  }

  hide() {
    if (this.window && !this.window.isDestroyed()) this.window.hide();
  }

  destroy() {
    clearTimeout(this.connectingTimer);
    clearTimeout(this.connectionTimer);
    clearTimeout(this.toastTimer);
    for (const timer of this.downloadTimers.values()) clearTimeout(timer);
    this.downloadTimers.clear();
    if (this.window && !this.window.isDestroyed()) this.window.destroy();
    this.window = null;
  }
}
