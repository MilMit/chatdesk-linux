import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanTrackingUrl, codeBlockText, markdownText, quoteText } from '../src/main/context-menu-utils.js';

test('formats selected text for native copy actions', () => {
  assert.equal(quoteText('one\ntwo'), '> one\n> two');
  assert.equal(codeBlockText('const ok = true;'), '```text\nconst ok = true;\n```');
  assert.equal(markdownText('Example', { linkText: 'Example', linkURL: 'https://example.com/' }), '[Example](https://example.com/)');
});

test('removes tracking parameters but preserves useful query parameters', () => {
  assert.equal(
    cleanTrackingUrl('https://example.com/search?q=electron&utm_source=test&gclid=secret'),
    'https://example.com/search?q=electron',
  );
  assert.equal(cleanTrackingUrl('javascript:alert(1)'), 'javascript:alert(1)');
});
