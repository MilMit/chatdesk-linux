import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { AtomicJsonStore } from './atomic-json-store.js';

const DEFAULT_STATE = Object.freeze({ items: [] });

const PROTECTED_FORMAT = 'chatdesk-safe-storage-v1';

function isProtectedEnvelope(value) {
  return value?.format === PROTECTED_FORMAT && typeof value?.data === 'string';
}

function protectedIo(codec) {
  return {
    read(filePath, fallback) {
      try {
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (!isProtectedEnvelope(raw)) return raw;
        const plaintext = codec.decrypt(Buffer.from(raw.data, 'base64'));
        return JSON.parse(plaintext);
      } catch {
        return structuredClone(fallback);
      }
    },
    async write(filePath, value) {
      await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
      const temporaryPath = `${filePath}.tmp`;
      const encrypted = codec.encrypt(JSON.stringify(value));
      const envelope = { format: PROTECTED_FORMAT, backend: codec.name, data: Buffer.from(encrypted).toString('base64') };
      await fs.promises.writeFile(temporaryPath, `${JSON.stringify(envelope)}\n`, { mode: 0o600 });
      await fs.promises.rename(temporaryPath, filePath);
    },
  };
}

function fileUsesProtectedEnvelope(filePath) {
  try { return isProtectedEnvelope(JSON.parse(fs.readFileSync(filePath, 'utf8'))); }
  catch { return false; }
}
const SOURCE_VALUES = new Set(['clipboard', 'selection', 'manual', 'prompt', 'share']);
const SENSITIVE_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
  /\b(?:password|passwd|api[_ -]?key|secret|access[_ -]?token|refresh[_ -]?token|bearer)\s*[:=]/i,
  /\b(?:sk|pk)-[A-Za-z0-9_-]{16,}\b/,
  /\b(?:\d[ -]*?){13,19}\b/,
];

export function sanitizeCaptureText(value) {
  return String(value ?? '').replaceAll('\u0000', '').trim().slice(0, 20_000);
}

export function looksSensitiveCapture(value) {
  const text = sanitizeCaptureText(value);
  return Boolean(text && SENSITIVE_PATTERNS.some((pattern) => pattern.test(text)));
}

function sanitizeState(value) {
  const items = [];
  for (const item of Array.isArray(value?.items) ? value.items : []) {
    const text = sanitizeCaptureText(item?.text);
    if (!text || looksSensitiveCapture(text)) continue;
    const id = typeof item?.id === 'string' && /^[a-z0-9-]{1,80}$/i.test(item.id) ? item.id : crypto.randomUUID();
    const createdAt = Number.isFinite(Date.parse(item?.createdAt)) ? new Date(item.createdAt).toISOString() : new Date().toISOString();
    items.push({
      id,
      text,
      source: SOURCE_VALUES.has(item?.source) ? item.source : 'manual',
      profileId: typeof item?.profileId === 'string' ? item.profileId.slice(0, 64) : '',
      createdAt,
    });
  }
  return { items: items.slice(-50) };
}

export class CaptureStore {
  constructor(filePath, { maxItems = 20, codec = null } = {}) {
    this.maxItems = Math.min(50, Math.max(1, Number(maxItems) || 20));
    this.protection = codec?.name || 'file-permissions-only';
    this.store = new AtomicJsonStore(filePath, DEFAULT_STATE, sanitizeState, codec ? protectedIo(codec) : undefined);
    if (codec && fs.existsSync(filePath) && !fileUsesProtectedEnvelope(filePath)) this.store.replace(this.store.get());
  }

  list() {
    return this.store.get().items.slice().reverse();
  }

  add(text, { source = 'manual', profileId = '' } = {}) {
    const normalized = sanitizeCaptureText(text);
    if (!normalized) return { saved: false, reason: 'empty' };
    if (looksSensitiveCapture(normalized)) return { saved: false, reason: 'sensitive' };
    const state = this.store.get();
    state.items = state.items.filter((item) => item.text !== normalized);
    state.items.push({
      id: crypto.randomUUID(),
      text: normalized,
      source: SOURCE_VALUES.has(source) ? source : 'manual',
      profileId: String(profileId || '').slice(0, 64),
      createdAt: new Date().toISOString(),
    });
    state.items = state.items.slice(-this.maxItems);
    this.store.replace(state);
    return { saved: true, item: state.items.at(-1) };
  }

  remove(id) {
    const state = this.store.get();
    const before = state.items.length;
    state.items = state.items.filter((item) => item.id !== id);
    if (state.items.length !== before) this.store.replace(state);
    return this.list();
  }

  clear() {
    this.store.replace(DEFAULT_STATE);
    return [];
  }

  async flush() { await this.store.flush(); }
}
