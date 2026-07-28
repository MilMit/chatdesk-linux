import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync(new URL('../src/renderer/index.html', import.meta.url), 'utf8');
const renderer = fs.readFileSync(new URL('../src/renderer/renderer.js', import.meta.url), 'utf8');
const preload = fs.readFileSync(new URL('../src/preload/chrome-preload.cjs', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../src/main/index.js', import.meta.url), 'utf8');
const quickRenderer = fs.readFileSync(new URL('../src/quick-chat/renderer.js', import.meta.url), 'utf8');

function htmlIds(source) {
  return new Set([...source.matchAll(/\bid=["']([^"']+)["']/g)].map((match) => match[1]));
}

test('every renderer element lookup has a matching HTML id', () => {
  const ids = htmlIds(html);
  const lookups = [...renderer.matchAll(/\$\(['"]([^'"]+)['"]\)/g)].map((match) => match[1]);
  const missing = [...new Set(lookups)].filter((id) => !ids.has(id));
  assert.deepEqual(missing, []);
});

test('renderer invoke channels are present in both preload and main', () => {
  const channels = [...new Set([...renderer.matchAll(/(?:safeInvoke|api\.invoke)\(['"]([^'"]+)['"]/g)].map((match) => match[1]))];
  for (const channel of channels) {
    assert.match(preload, new RegExp(channel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(main, new RegExp(channel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('clipboard access stays in the main process, not local renderers', () => {
  assert.doesNotMatch(renderer, /navigator\.clipboard/);
  assert.doesNotMatch(quickRenderer, /navigator\.clipboard/);
  assert.match(main, /clipboard\.writeText/);
});


test('renderer send channels are present in both preload and main', () => {
  const channels = [...new Set([...renderer.matchAll(/api\.send\(['"]([^'"]+)['"]/g)].map((match) => match[1]))];
  for (const channel of channels) {
    const escaped = channel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(preload, new RegExp(escaped));
    assert.match(main, new RegExp(escaped));
  }
});

test('Quick Chat reports rejected clipboard writes instead of hiding the error', () => {
  const quickPreload = fs.readFileSync(new URL('../src/preload/quick-chat-preload.cjs', import.meta.url), 'utf8');
  assert.match(quickPreload, /quick-chat:submit/);
  assert.match(main, /quick-chat:submit/);
  assert.match(quickRenderer, /catch \(error\)/);
  assert.match(quickRenderer, /errorText/);
});

test('first-run onboarding and Command Palette surfaces exist', () => {
  assert.match(html, /id="onboardingContent"/);
  assert.match(html, /id="commandContent"/);
  assert.match(main, /onboardingComplete/);
  assert.match(main, /commandPaletteShortcut/);
});
