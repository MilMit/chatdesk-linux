import { BrowserWindow, ipcMain, screen } from 'electron';

export class FindController {
  constructor({ htmlPath, preloadPath, iconPath, getTarget, getParent }) {
    this.htmlPath = htmlPath;
    this.preloadPath = preloadPath;
    this.iconPath = iconPath;
    this.getTarget = getTarget;
    this.getParent = getParent;
    this.window = null;
    this.query = '';
    this.requestId = null;
    this.resultListener = (_event, result) => {
      if (result.requestId !== this.requestId || !this.window || this.window.isDestroyed()) return;
      this.window.webContents.send('find:result', result);
    };
    this.registered = false;
  }

  registerIpc(isTrustedSender) {
    if (this.registered) return;
    this.registered = true;
    ipcMain.handle('find:query', (event, payload = {}) => {
      if (!isTrustedSender(event)) throw new Error('Untrusted find sender.');
      return this.find(payload.query, { forward: payload.forward !== false, findNext: payload.findNext === true, matchCase: payload.matchCase === true });
    });
    ipcMain.on('find:close', (event) => { if (isTrustedSender(event)) this.close(); });
  }

  isSender(sender) {
    return Boolean(this.window && !this.window.isDestroyed() && sender === this.window.webContents);
  }

  #position() {
    const parent = this.getParent?.();
    if (!parent || parent.isDestroyed() || !this.window || this.window.isDestroyed()) return;
    const bounds = parent.getBounds();
    const display = screen.getDisplayMatching(bounds);
    const width = Math.min(520, Math.max(380, Math.floor(bounds.width * 0.42)));
    const height = 64;
    const x = Math.min(display.workArea.x + display.workArea.width - width - 12, bounds.x + bounds.width - width - 18);
    const y = Math.max(display.workArea.y + 8, bounds.y + 54);
    this.window.setBounds({ x, y, width, height });
  }

  #ensureWindow() {
    if (this.window && !this.window.isDestroyed()) return this.window;
    const parent = this.getParent?.();
    if (!parent || parent.isDestroyed()) return null;
    this.window = new BrowserWindow({
      parent,
      width: 460,
      height: 64,
      show: false,
      frame: false,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      backgroundColor: '#171a21',
      icon: this.iconPath,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: false, preload: this.preloadPath },
    });
    this.window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    this.window.webContents.on('will-navigate', (event) => event.preventDefault());
    this.window.on('closed', () => { this.window = null; });
    parent.on('move', () => this.#position());
    parent.on('resize', () => this.#position());
    void this.window.loadFile(this.htmlPath);
    return this.window;
  }

  open(initialQuery = '') {
    const target = this.getTarget?.();
    if (!target || target.isDestroyed()) return false;
    const win = this.#ensureWindow();
    if (!win) return false;
    this.#position();
    win.show();
    win.focus();
    win.webContents.send('find:open', { query: initialQuery || this.query });
    return true;
  }

  find(query, options = {}) {
    const target = this.getTarget?.();
    const value = String(query || '').slice(0, 500);
    if (!target || target.isDestroyed()) return { activeMatchOrdinal: 0, matches: 0, finalUpdate: true };
    if (!value) {
      this.query = '';
      target.stopFindInPage('clearSelection');
      return { activeMatchOrdinal: 0, matches: 0, finalUpdate: true };
    }
    if (this.query !== value) options.findNext = false;
    this.query = value;
    target.removeListener('found-in-page', this.resultListener);
    target.on('found-in-page', this.resultListener);
    this.requestId = target.findInPage(value, options);
    return { requestId: this.requestId, query: value };
  }

  close() {
    const target = this.getTarget?.();
    if (target && !target.isDestroyed()) {
      target.removeListener('found-in-page', this.resultListener);
      target.stopFindInPage('clearSelection');
    }
    if (this.window && !this.window.isDestroyed()) this.window.destroy();
    this.window = null;
    this.query = '';
    this.requestId = null;
  }
}
