import crypto from 'node:crypto';
import { AtomicJsonStore } from './atomic-json-store.js';

const DEFAULT_PROMPTS = Object.freeze([
  { id: 'explain-code', title: 'Explain this code', category: 'Coding', template: 'Explain this code clearly, identify risks, and suggest improvements:\n\n{clipboard}', favorite: true, shortcut: '' },
  { id: 'debug-error', title: 'Debug this error', category: 'Coding', template: 'Diagnose this error. Give the most likely cause first, then exact repair steps:\n\n{selection}', favorite: true, shortcut: '' },
  { id: 'rewrite-professional', title: 'Rewrite professionally', category: 'Writing', template: 'Rewrite the following text professionally without changing its meaning:\n\n{clipboard}', favorite: false, shortcut: '' },
  { id: 'translate-english', title: 'Translate to English', category: 'Translation', template: 'Translate the following into natural professional English:\n\n{clipboard}', favorite: false, shortcut: '' },
  { id: 'summarize', title: 'Summarize', category: 'Research', template: 'Summarize the following text, preserving important facts and uncertainties:\n\n{clipboard}', favorite: false, shortcut: '' },
]);

function cleanText(value, max) {
  return String(value ?? '').replaceAll('\u0000', '').trim().slice(0, max);
}

function sanitizePrompt(entry, index = 0) {
  const title = cleanText(entry?.title, 80);
  const template = cleanText(entry?.template, 20_000);
  if (!title || !template) return null;
  const id = typeof entry?.id === 'string' && /^[a-z0-9-]{1,80}$/i.test(entry.id) ? entry.id : crypto.randomUUID();
  return {
    id,
    title,
    category: cleanText(entry?.category, 40) || 'General',
    template,
    favorite: entry?.favorite === true,
    shortcut: cleanText(entry?.shortcut, 80),
    order: Number.isFinite(Number(entry?.order)) ? Number(entry.order) : index,
  };
}

function sanitizeState(value) {
  const source = Array.isArray(value?.prompts) ? value.prompts : DEFAULT_PROMPTS;
  const seen = new Set();
  const prompts = [];
  for (const [index, entry] of source.entries()) {
    const prompt = sanitizePrompt(entry, index);
    if (!prompt || seen.has(prompt.id)) continue;
    seen.add(prompt.id);
    prompts.push(prompt);
  }
  return { prompts: prompts.slice(0, 200) };
}

export function expandPromptTemplate(template, variables = {}) {
  const safe = Object.fromEntries(Object.entries(variables).map(([key, value]) => [key, String(value ?? '')]));
  return String(template ?? '').replace(/\{([a-z][a-z0-9_-]{0,40})\}/gi, (match, key) => (
    Object.hasOwn(safe, key) ? safe[key] : match
  )).trim();
}

export class PromptStore {
  constructor(filePath) {
    this.store = new AtomicJsonStore(filePath, { prompts: DEFAULT_PROMPTS }, sanitizeState);
  }

  list() {
    return this.store.get().prompts.slice().sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.order - b.order || a.title.localeCompare(b.title));
  }

  get(id) {
    return this.list().find((item) => item.id === id) || null;
  }

  save(payload = {}) {
    const state = this.store.get();
    const existingIndex = state.prompts.findIndex((item) => item.id === payload.id);
    const prompt = sanitizePrompt({ ...payload, id: existingIndex >= 0 ? payload.id : crypto.randomUUID(), order: existingIndex >= 0 ? state.prompts[existingIndex].order : state.prompts.length }, state.prompts.length);
    if (!prompt) throw new Error('Prompt title and template are required.');
    if (existingIndex >= 0) state.prompts[existingIndex] = prompt;
    else state.prompts.push(prompt);
    this.store.replace(state);
    return this.list();
  }

  remove(id) {
    const state = this.store.get();
    state.prompts = state.prompts.filter((item) => item.id !== id);
    this.store.replace(state);
    return this.list();
  }

  toggleFavorite(id) {
    const state = this.store.get();
    const prompt = state.prompts.find((item) => item.id === id);
    if (!prompt) throw new Error('Prompt not found.');
    prompt.favorite = !prompt.favorite;
    this.store.replace(state);
    return this.list();
  }

  async flush() { await this.store.flush(); }

  reset() {
    this.store.reset();
    return this.list();
  }
}
