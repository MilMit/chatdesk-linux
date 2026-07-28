import crypto from 'node:crypto';
import { AtomicJsonStore } from './atomic-json-store.js';

const THEMES = new Set(['system', 'light', 'dark']);
const SIDES = new Set(['left', 'right']);
const START_PAGES = new Set(['current', 'new']);
const DEFAULT_WORKSPACES = Object.freeze([
  { id: 'coding', name: 'Coding', profileId: 'work', width: 1280, height: 820, compact: false, compactSide: 'right', alwaysOnTop: false, zoomFactor: 0.95, theme: 'dark', startPage: 'current', shortcut: '' },
  { id: 'writing', name: 'Writing', profileId: 'personal', width: 1040, height: 820, compact: false, compactSide: 'right', alwaysOnTop: false, zoomFactor: 1, theme: 'system', startPage: 'new', shortcut: '' },
  { id: 'research', name: 'Research', profileId: 'personal', width: 1440, height: 900, compact: false, compactSide: 'right', alwaysOnTop: false, zoomFactor: 0.9, theme: 'system', startPage: 'current', shortcut: '' },
]);

function clean(value, max) { return String(value ?? '').replaceAll('\u0000', '').trim().slice(0, max); }
function clamp(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : fallback;
}
function clampZoom(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(1.5, Math.max(0.75, Math.round(number * 20) / 20)) : 1;
}

export function sanitizeWorkspace(entry = {}) {
  const name = clean(entry.name, 60);
  if (!name) return null;
  return {
    id: typeof entry.id === 'string' && /^[a-z0-9-]{1,80}$/i.test(entry.id) ? entry.id : crypto.randomUUID(),
    name,
    profileId: clean(entry.profileId, 64) || 'personal',
    width: clamp(entry.width, 800, 3840, 1280),
    height: clamp(entry.height, 600, 2160, 820),
    compact: entry.compact === true,
    compactSide: SIDES.has(entry.compactSide) ? entry.compactSide : 'right',
    alwaysOnTop: entry.alwaysOnTop === true,
    zoomFactor: clampZoom(entry.zoomFactor),
    theme: THEMES.has(entry.theme) ? entry.theme : 'system',
    startPage: START_PAGES.has(entry.startPage) ? entry.startPage : 'current',
    shortcut: clean(entry.shortcut, 80),
  };
}

function sanitizeState(value) {
  const source = Array.isArray(value?.workspaces) ? value.workspaces : DEFAULT_WORKSPACES;
  const workspaces = [];
  const seen = new Set();
  for (const entry of source) {
    const workspace = sanitizeWorkspace(entry);
    if (!workspace || seen.has(workspace.id)) continue;
    seen.add(workspace.id);
    workspaces.push(workspace);
  }
  return { workspaces: workspaces.slice(0, 50) };
}

export class WorkspaceStore {
  constructor(filePath) {
    this.store = new AtomicJsonStore(filePath, { workspaces: DEFAULT_WORKSPACES }, sanitizeState);
  }
  list() { return this.store.get().workspaces; }
  get(id) { return this.list().find((item) => item.id === id) || null; }
  save(payload = {}) {
    const state = this.store.get();
    const index = state.workspaces.findIndex((item) => item.id === payload.id);
    const workspace = sanitizeWorkspace({ ...payload, id: index >= 0 ? payload.id : crypto.randomUUID() });
    if (!workspace) throw new Error('Workspace name is required.');
    if (index >= 0) state.workspaces[index] = workspace;
    else state.workspaces.push(workspace);
    this.store.replace(state);
    return this.list();
  }
  remove(id) {
    const state = this.store.get();
    state.workspaces = state.workspaces.filter((item) => item.id !== id);
    this.store.replace(state);
    return this.list();
  }
  reset() { this.store.reset(); return this.list(); }
}
