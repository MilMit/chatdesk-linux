import fs from 'node:fs';
import path from 'node:path';

export function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return structuredClone(fallback);
  }
}

export function writeJsonFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporaryPath, filePath);
}

export class AtomicJsonStore {
  constructor(filePath, fallback, sanitizer = (value) => value, io = {}) {
    this.filePath = filePath;
    this.fallback = structuredClone(fallback);
    this.sanitizer = sanitizer;
    this.read = typeof io.read === 'function' ? io.read : readJsonFile;
    this.write = typeof io.write === 'function' ? io.write : writeJsonFile;
    this.value = this.sanitizer(this.read(filePath, this.fallback));
  }

  get() {
    return structuredClone(this.value);
  }

  replace(next) {
    this.value = this.sanitizer(next);
    this.write(this.filePath, this.value);
    return this.get();
  }

  reset() {
    return this.replace(this.fallback);
  }
}
