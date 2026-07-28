import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { CaptureStore, looksSensitiveCapture } from '../src/main/capture-store.js';

test('capture history is bounded, deduplicated, and local', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chatdesk-captures-'));
  const store = new CaptureStore(path.join(dir, 'captures.json'), { maxItems: 2 });
  store.add('first'); store.add('second'); store.add('first'); store.add('third');
  assert.deepEqual(store.list().map((item) => item.text), ['third', 'first']);
  assert.equal(fs.statSync(path.join(dir, 'captures.json')).mode & 0o777, 0o600);
});

test('likely secrets are not persisted', () => {
  assert.equal(looksSensitiveCapture('password = hunter2'), true);
  assert.equal(looksSensitiveCapture('-----BEGIN PRIVATE KEY-----'), true);
  assert.equal(looksSensitiveCapture('ordinary product description'), false);
});

test('capture history supports protected at-rest storage with migration', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'chatdesk-captures-protected-'));
  const filePath = path.join(directory, 'captures.json');
  fs.writeFileSync(filePath, JSON.stringify({ items: [{ id: 'legacy', text: 'legacy capture', source: 'manual', profileId: 'personal', createdAt: new Date().toISOString() }] }));
  const codec = {
    name: 'test-keyring',
    encrypt: (text) => Buffer.from(text.split('').reverse().join('')),
    decrypt: (buffer) => Buffer.from(buffer).toString().split('').reverse().join(''),
  };
  const store = new CaptureStore(filePath, { codec });
  assert.equal(store.protection, 'test-keyring');
  assert.equal(store.list()[0].text, 'legacy capture');
  const envelope = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  assert.equal(envelope.format, 'chatdesk-safe-storage-v1');
  assert.equal(envelope.backend, 'test-keyring');
  assert.doesNotMatch(fs.readFileSync(filePath, 'utf8'), /legacy capture/);
  const reopened = new CaptureStore(filePath, { codec });
  assert.equal(reopened.list()[0].text, 'legacy capture');
});
