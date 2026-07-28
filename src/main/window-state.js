import fs from 'node:fs';
import path from 'node:path';

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
  }

  read(displays = []) {
    let bounds = { ...DEFAULT_BOUNDS };
    let maximized = false;

    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      bounds = sanitizeBounds(parsed.bounds);
      maximized = parsed.maximized === true;
    } catch {
      // Defaults are intentional.
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

  writeBounds(bounds, maximized = false) {
    const payload = { bounds: sanitizeBounds(bounds), maximized: maximized === true };
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  }

  write(window) {
    if (!window || window.isDestroyed()) return;

    const payload = {
      bounds: window.isMaximized() ? window.getNormalBounds() : window.getBounds(),
      maximized: window.isMaximized(),
    };

    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  }
}
