import fs from 'node:fs';
import path from 'node:path';
import util from 'node:util';

const MAX_LOG_SIZE = 2 * 1024 * 1024;

function render(value) {
  if (value instanceof Error) return value.stack || value.message;
  if (typeof value === 'string') return value;
  return util.inspect(value, { depth: 4, breakLength: 140, maxArrayLength: 30 });
}

export function sanitizeUrlForLog(value) {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return '<invalid-url>';
  }
}

export class FileLogger {
  constructor(filePath) {
    this.filePath = filePath;
    this.original = {
      info: console.info.bind(console),
      warn: console.warn.bind(console),
      error: console.error.bind(console),
      log: console.log.bind(console),
    };
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    this.#rotate();
  }

  #rotate() {
    try {
      if (fs.statSync(this.filePath).size < MAX_LOG_SIZE) return;
      const oldPath = `${this.filePath}.1`;
      try { fs.unlinkSync(oldPath); } catch {}
      fs.renameSync(this.filePath, oldPath);
    } catch {}
  }

  #write(level, args) {
    const line = `${new Date().toISOString()} [${level}] ${args.map(render).join(' ')}\n`;
    try { fs.appendFileSync(this.filePath, line, { encoding: 'utf8', mode: 0o600 }); } catch {}
    const method = level === 'ERROR' ? 'error' : level === 'WARN' ? 'warn' : 'info';
    this.original[method](...args);
  }

  info(...args) { this.#write('INFO', args); }
  warn(...args) { this.#write('WARN', args); }
  error(...args) { this.#write('ERROR', args); }

  installConsoleBridge() {
    console.info = (...args) => this.info(...args);
    console.log = (...args) => this.info(...args);
    console.warn = (...args) => this.warn(...args);
    console.error = (...args) => this.error(...args);
  }
}
