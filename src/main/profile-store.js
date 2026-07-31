import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { writeJsonFile } from './atomic-json-store.js';

export const PROFILE_COLORS = Object.freeze(['blue', 'violet', 'emerald', 'amber', 'rose', 'cyan']);
export const PROFILE_ICONS = Object.freeze(['person', 'briefcase', 'flask', 'star', 'code', 'shield']);
export const PROFILE_ICON_GLYPHS = Object.freeze({
  person: '●', briefcase: '◆', flask: '▲', star: '★', code: '⌘', shield: '⬢',
});

const DEFAULT_PROFILES = Object.freeze([
  { id: 'personal', name: 'Personal', color: 'blue', icon: 'person' },
  { id: 'work', name: 'Work', color: 'violet', icon: 'briefcase' },
  { id: 'testing', name: 'Testing', color: 'emerald', icon: 'flask' },
]);

export function sanitizeProfileName(value) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 40);
}

export function sanitizeProfileAppearance(input = {}, fallbackIndex = 0) {
  return {
    color: PROFILE_COLORS.includes(input.color) ? input.color : PROFILE_COLORS[fallbackIndex % PROFILE_COLORS.length],
    icon: PROFILE_ICONS.includes(input.icon) ? input.icon : PROFILE_ICONS[fallbackIndex % PROFILE_ICONS.length],
  };
}

function sanitizeProfiles(value) {
  const seen = new Set();
  const profiles = [];
  for (const [index, entry] of (Array.isArray(value) ? value : []).entries()) {
    const name = sanitizeProfileName(entry?.name);
    const id = typeof entry?.id === 'string' && /^[a-z0-9-]{1,64}$/.test(entry.id) ? entry.id : '';
    if (!name || !id || seen.has(id)) continue;
    seen.add(id);
    profiles.push({ id, name, ...sanitizeProfileAppearance(entry, index) });
  }
  return profiles.length ? profiles : DEFAULT_PROFILES.map((item) => ({ ...item }));
}

export function partitionForProfile(id) {
  const safeId = /^[a-z0-9-]{1,64}$/.test(id) ? id : 'personal';
  return `persist:chatdesk-profile-${safeId}`;
}

export class ProfileStore {
  constructor(filePath) { this.filePath = filePath; this.state = this.#read(); this.writeQueue = Promise.resolve(); this.lastWriteError = null; }
  #read() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      const profiles = sanitizeProfiles(parsed.profiles);
      const activeId = profiles.some((item) => item.id === parsed.activeId) ? parsed.activeId : profiles[0].id;
      return { profiles, activeId };
    } catch { return { profiles: DEFAULT_PROFILES.map((item) => ({ ...item })), activeId: 'personal' }; }
  }
  #write() {
    const snapshot = structuredClone(this.state);
    this.writeQueue = this.writeQueue
      .then(() => writeJsonFile(this.filePath, snapshot))
      .catch((error) => { this.lastWriteError = error; console.warn('[ChatDesk] Failed to save profiles:', error.message); });
  }
  async flush() { await this.writeQueue; if (this.lastWriteError) throw this.lastWriteError; }
  getState() { return structuredClone(this.state); }
  getActive() { return this.state.profiles.find((item) => item.id === this.state.activeId); }
  get(id) { return this.state.profiles.find((item) => item.id === id); }
  setActive(id) {
    if (!this.get(id)) throw new Error('Profile not found.');
    this.state.activeId = id; this.#write(); return this.getState();
  }
  add(input) {
    const payload = typeof input === 'string' ? { name: input } : (input ?? {});
    const clean = sanitizeProfileName(payload.name);
    if (!clean) throw new Error('Enter a valid profile name.');
    if (this.state.profiles.some((item) => item.name.toLowerCase() === clean.toLowerCase())) throw new Error('A profile with that name already exists.');
    const id = crypto.randomUUID().replaceAll('-', '').slice(0, 16);
    const appearance = sanitizeProfileAppearance(payload, this.state.profiles.length);
    this.state.profiles.push({ id, name: clean, ...appearance });
    this.state.activeId = id; this.#write(); return this.getState();
  }
  update(id, patch = {}) {
    const index = this.state.profiles.findIndex((item) => item.id === id);
    if (index < 0) throw new Error('Profile not found.');
    const current = this.state.profiles[index];
    const name = patch.name === undefined ? current.name : sanitizeProfileName(patch.name);
    if (!name) throw new Error('Enter a valid profile name.');
    if (this.state.profiles.some((item) => item.id !== id && item.name.toLowerCase() === name.toLowerCase())) throw new Error('A profile with that name already exists.');
    this.state.profiles[index] = { ...current, name, ...sanitizeProfileAppearance({ ...current, ...patch }, index) };
    this.#write(); return this.getState();
  }
  remove(id) {
    if (this.state.profiles.length <= 1) throw new Error('At least one profile must remain.');
    const next = this.state.profiles.filter((item) => item.id !== id);
    if (next.length === this.state.profiles.length) throw new Error('Profile not found.');
    this.state.profiles = next;
    if (this.state.activeId === id) this.state.activeId = next[0].id;
    this.#write(); return this.getState();
  }
}
