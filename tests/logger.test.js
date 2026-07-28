import assert from 'node:assert/strict';
import test from 'node:test';
import { sanitizeUrlForLog } from '../src/main/logger.js';

test('removes query strings and fragments from logged URLs', () => {
  assert.equal(sanitizeUrlForLog('https://chatgpt.com/c/abc?secret=yes#part'), 'https://chatgpt.com/c/abc');
  assert.equal(sanitizeUrlForLog('not a url'), '<invalid-url>');
});
