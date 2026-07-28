import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { expandPromptTemplate, PromptStore } from '../src/main/prompt-store.js';

test('expands only known prompt variables', () => {
  assert.equal(expandPromptTemplate('A {clipboard} B {unknown}', { clipboard: 'text' }), 'A text B {unknown}');
});

test('persists prompt templates and favorites', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chatdesk-prompts-'));
  const store = new PromptStore(path.join(dir, 'prompts.json'));
  const saved = store.save({ title: 'Test', category: 'QA', template: 'Check {selection}' });
  const prompt = saved.find((item) => item.title === 'Test');
  assert.ok(prompt);
  assert.equal(store.toggleFavorite(prompt.id).find((item) => item.id === prompt.id).favorite, true);
});
