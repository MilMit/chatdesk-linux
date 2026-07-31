import fs from 'node:fs';
import path from 'node:path';
import { Notification, shell } from 'electron';

function uniquePath(directory, filename) {
  const parsed = path.parse(filename);
  let candidate = path.join(directory, filename);
  let counter = 1;
  while (fs.existsSync(candidate)) {
    candidate = path.join(directory, `${parsed.name} (${counter})${parsed.ext}`);
    counter += 1;
  }
  return candidate;
}

function loadHistory(filePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return Array.isArray(parsed) ? parsed.filter((item) => item && item.id && item.filename).slice(-200) : [];
  } catch {
    return [];
  }
}

export class DownloadManager {
  constructor({ historyPath, getSettings, send, onUpdate = null }) {
    this.historyPath = historyPath;
    this.getSettings = getSettings;
    this.send = send;
    this.onUpdate = onUpdate;
    this.items = new Map(loadHistory(historyPath).map((item) => [item.id, { ...item, item: null }]));
    this.sessions = new WeakSet();
    this.persistQueue = Promise.resolve();
  }

  attachSession(targetSession, profileName) {
    if (this.sessions.has(targetSession)) return;
    this.sessions.add(targetSession);
    targetSession.on('will-download', (_event, item) => this.#track(item, profileName));
  }

  list() {
    return [...this.items.values()].map((record) => this.#serialize(record)).slice(-200);
  }

  clearHistory() {
    for (const [id, record] of this.items) {
      if (!record.item || ['completed', 'cancelled', 'interrupted'].includes(record.state)) this.items.delete(id);
    }
    this.#persist();
    return this.list();
  }

  #track(item, profileName) {
    const settings = this.getSettings();
    const directory = settings.downloadPath;
    if (directory) {
      fs.mkdirSync(directory, { recursive: true });
      item.setSavePath(uniquePath(directory, item.getFilename()));
    }

    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const record = {
      id,
      item,
      filename: item.getFilename(),
      path: item.getSavePath(),
      state: 'progressing',
      received: 0,
      total: item.getTotalBytes(),
      speed: 0,
      paused: false,
      canResume: false,
      profile: profileName,
      startedAt: new Date().toISOString(),
      completedAt: '',
    };
    this.items.set(id, record);
    this.#emit(record);

    item.on('updated', (_event, state) => {
      record.state = state;
      record.path = item.getSavePath();
      this.#emit(record);
    });

    item.once('done', (_event, state) => {
      record.state = state;
      record.path = item.getSavePath();
      record.completedAt = new Date().toISOString();
      this.#emit(record);
      this.#persist();

      if (state === 'completed' && this.getSettings().notifications && Notification.isSupported()) {
        new Notification({ title: 'Download complete', body: item.getFilename(), silent: false }).show();
      }
    });
  }

  #serialize(record) {
    if (!record.item) return { ...record, item: undefined };
    const total = record.item.getTotalBytes();
    const received = record.item.getReceivedBytes();
    return {
      id: record.id,
      filename: record.item.getFilename(),
      path: record.item.getSavePath() || record.path,
      state: record.state,
      received,
      total,
      percent: total > 0 ? Math.min(100, Math.round((received / total) * 100)) : 0,
      speed: record.item.getCurrentBytesPerSecond(),
      canResume: record.item.canResume(),
      paused: record.item.isPaused(),
      profile: record.profile,
      startedAt: record.startedAt,
      completedAt: record.completedAt,
    };
  }

  #emit(record) {
    const serialized = this.#serialize(record);
    Object.assign(record, serialized);
    this.send('download:update', serialized);
    this.onUpdate?.(serialized, this.list());
  }

  #persist() {
    const history = this.list().map(({ item, ...entry }) => entry);
    this.persistQueue = this.persistQueue
      .then(() => fs.promises.mkdir(path.dirname(this.historyPath), { recursive: true }))
      .then(() => fs.promises.writeFile(this.historyPath, `${JSON.stringify(history, null, 2)}\n`, { mode: 0o600 }))
      .catch((error) => console.warn('[ChatDesk] Failed to save download history:', error.message));
  }

  async flush() { await this.persistQueue; }

  action(id, action) {
    const record = this.items.get(id);
    if (!record) return false;
    const item = record.item;
    if (action === 'cancel' && item) item.cancel();
    if (action === 'pause' && item && !item.isPaused()) item.pause();
    if (action === 'resume' && item && item.canResume()) item.resume();
    if (action === 'open' && record.path) void shell.openPath(record.path);
    if (action === 'folder' && record.path) shell.showItemInFolder(record.path);
    return true;
  }
}
