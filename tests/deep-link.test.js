import assert from 'node:assert/strict';
import test from 'node:test';
import { collectSharedFiles, findDeepLink, parseDeepLink } from '../src/main/deep-link.js';

test('parses only supported chatdesk deep links', () => {
  assert.deepEqual(parseDeepLink('chatdesk://new?profile=work'), { type: 'new-chat', profileId: 'work' });
  assert.deepEqual(parseDeepLink('chatdesk://open/settings'), { type: 'panel', panel: 'settings' });
  assert.deepEqual(parseDeepLink('chatdesk://workspace?id=coding'), { type: 'workspace', workspaceId: 'coding' });
  assert.equal(parseDeepLink('javascript:alert(1)'), null);
  assert.equal(parseDeepLink('chatdesk://open/unknown'), null);
});

test('finds deep links and filters command switches from shared files', () => {
  assert.equal(findDeepLink(['app', 'chatdesk://capture']), 'chatdesk://capture');
  assert.deepEqual(collectSharedFiles(['--share', '/tmp/a.pdf', 'chatdesk://new']), ['/tmp/a.pdf']);
});
