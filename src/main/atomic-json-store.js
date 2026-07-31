import fs from 'node:fs';
import path from 'node:path';

export function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return structuredClone(fallback);
  }
}

export async function writeJsonFile(filePath, value) {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  await fs.promises.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await fs.promises.rename(temporaryPath, filePath);
}

export class AtomicJsonStore {
  constructor(filePath, fallback, sanitizer = (value) => value, io = {}) {
    this.filePath = filePath;
    this.fallback = structuredClone(fallback);
    this.sanitizer = sanitizer;
    this.read = typeof io.read === 'function' ? io.read : readJsonFile;
    this.write = typeof io.write === 'function' ? io.write : writeJsonFile;
    this.value = this.sanitizer(this.read(filePath, this.fallback));
    this.writeQueue = Promise.resolve();
    this.lastWriteError = null;
  }

  get() {
    return structuredClone(this.value);
  }

  #queueWrite(value) {
    const snapshot = structuredClone(value);
    this.writeQueue = this.writeQueue
      .then(() => this.write(this.filePath, snapshot))
      .catch((error) => {
        this.lastWriteError = error;
        console.warn(`[ChatDesk] Failed to persist ${path.basename(this.filePath)}:`, error.message);
      });
  }

  replace(next) {
    this.value = this.sanitizer(next);
    this.#queueWrite(this.value);
    return this.get();
  }

  reset() {
    return this.replace(this.fallback);
  }

  async flush() {
    await this.writeQueue;
    if (this.lastWriteError) throw this.lastWriteError;
  }
}
