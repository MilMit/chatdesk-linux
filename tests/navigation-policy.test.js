import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyUrl,
  isSafeExternalUrl,
  isTrustedAppUrl,
  isTrustedAuthUrl,
} from '../src/main/navigation-policy.js';

test('allows ChatGPT and OpenAI HTTPS pages inside the app', () => {
  assert.equal(isTrustedAppUrl('https://chatgpt.com/'), true);
  assert.equal(isTrustedAppUrl('https://auth.openai.com/authorize'), true);
  assert.equal(isTrustedAppUrl('https://help.openai.com/'), true);
});

test('does not accept lookalike domains', () => {
  assert.equal(isTrustedAppUrl('https://chatgpt.com.evil.example/'), false);
  assert.equal(isTrustedAppUrl('https://evilchatgpt.com/'), false);
  assert.equal(isTrustedAppUrl('https://openai.com.evil.example/'), false);
});

test('allows only explicitly listed authentication providers', () => {
  assert.equal(isTrustedAuthUrl('https://accounts.google.com/o/oauth2/v2/auth'), true);
  assert.equal(isTrustedAuthUrl('https://login.microsoftonline.com/common/oauth2/v2.0/authorize'), true);
  assert.equal(isTrustedAuthUrl('https://appleid.apple.com/auth/authorize'), true);
  assert.equal(isTrustedAuthUrl('https://accounts.google.com.evil.example/'), false);
});

test('opens safe external links in the system browser', () => {
  assert.equal(isSafeExternalUrl('https://example.com/docs'), true);
  assert.equal(isSafeExternalUrl('mailto:security@example.com'), true);
});

test('blocks dangerous or unsupported schemes', () => {
  assert.equal(classifyUrl('javascript:alert(1)'), 'blocked');
  assert.equal(classifyUrl('file:///etc/passwd'), 'blocked');
  assert.equal(classifyUrl('data:text/html,<h1>unsafe</h1>'), 'blocked');
  assert.equal(classifyUrl('http://chatgpt.com/'), 'blocked');
  assert.equal(classifyUrl('not a url'), 'blocked');
});

test('classifies supported destinations correctly', () => {
  assert.equal(classifyUrl('https://chatgpt.com/'), 'app');
  assert.equal(classifyUrl('https://accounts.google.com/'), 'auth');
  assert.equal(classifyUrl('https://example.com/'), 'external');
  assert.equal(classifyUrl('about:blank'), 'blank');
});
