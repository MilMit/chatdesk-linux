import fs from 'node:fs';
import { writeJsonFile } from './atomic-json-store.js';

const DEFAULT_BOUNDS = Object.freeze({ width: 1280, height: 820 });

function isValidNumber(value) {
  return Number.isInteger(value) && Number.isFinite(value);
}

export function sanitizeBounds(input = {}) {
  const output = {
    width: isValidNumber(input.width) ? Math.max(800, input.width) : DEFAULT_BOUNDS.width,
    height: isValidNumber(input.height) ? Math.max(600, input.height) : DEFAULT_BOUNDS.height,
  };

  if (isValidNumber(input.x) && isValidNumber(input.y)) {
    output.x = input.x;
    output.y = input.y;
  }

  return output;
}

export function boundsIntersectWorkArea(bounds, workArea) {
  const left = Math.max(bounds.x ?? workArea.x, workArea.x);
  const top = Math.max(bounds.y ?? workArea.y, workArea.y);
  const right = Math.min((bounds.x ?? workArea.x) + bounds.width, workArea.x + workArea.width);
  const bottom = Math.min((bounds.y ?? workArea.y) + bounds.height, workArea.y + workArea.height);
  return right - left >= 80 && bottom - top >= 80;
}

export class WindowStateStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.writeQueue = Promise.resolve();
    this.lastWriteError = null;
  }

  read(displays = []) {
    let bounds = { ...DEFAULT_BOUNDS };
    let maximized = false;

    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      bounds = sanitizeBounds(parsed.bounds);
      maximized = parsed.maximized === true;
    } catch {
      // A small one-time startup read keeps window creation deterministic.
    }

    if ('x' in bounds && displays.length > 0) {
      const visible = displays.some(({ workArea }) => boundsIntersectWorkArea(bounds, workArea));
      if (!visible) {
        delete bounds.x;
        delete bounds.y;
      }
    }

    return { bounds, maximized };
  }

  #queue(payload) {
    const snapshot = structuredClone(payload);
    this.writeQueue = this.writeQueue
      .then(() => writeJsonFile(this.filePath, snapshot))
      .catch((error) => { this.lastWriteError = error; console.warn('[ChatDesk] Failed to save window state:', error.message); });
  }

  writeBounds(bounds, maximized = false) {
    this.#queue({ bounds: sanitizeBounds(bounds), maximized: maximized === true });
  }

  write(window) {
    if (!window || window.isDestroyed()) return;
    this.#queue({
      bounds: window.isMaximized() ? window.getNormalBounds() : window.getBounds(),
      maximized: window.isMaximized(),
    });
  }

  async flush() {
    await this.writeQueue;
    if (this.lastWriteError) throw this.lastWriteError;
  }
}
