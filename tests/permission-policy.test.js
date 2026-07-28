import test from 'node:test';
import assert from 'node:assert/strict';
import { isPermissionAllowed } from '../src/main/permission-policy.js';

test('allows notifications only for trusted app origins', () => {
  assert.equal(isPermissionAllowed({
    permission: 'notifications',
    requestingUrl: 'https://chatgpt.com/',
  }), true);

  assert.equal(isPermissionAllowed({
    permission: 'notifications',
    requestingUrl: 'https://example.com/',
  }), false);
});

test('allows requested audio and video media for trusted app origins', () => {
  assert.equal(isPermissionAllowed({
    permission: 'media',
    requestingUrl: 'https://chatgpt.com/',
    mediaTypes: ['audio'],
  }), true);

  assert.equal(isPermissionAllowed({
    permission: 'media',
    requestingUrl: 'https://chatgpt.com/',
    mediaTypes: ['audio', 'video'],
  }), true);

  assert.equal(isPermissionAllowed({
    permission: 'media',
    requestingUrl: 'https://chatgpt.com/',
    mediaType: 'video',
  }), true);
});

test('denies unknown media types and empty media requests', () => {
  assert.equal(isPermissionAllowed({
    permission: 'media',
    requestingUrl: 'https://chatgpt.com/',
    mediaType: 'unknown',
  }), false);

  assert.equal(isPermissionAllowed({
    permission: 'media',
    requestingUrl: 'https://chatgpt.com/',
  }), false);
});

test('denies all unapproved permissions', () => {
  for (const permission of ['geolocation', 'clipboard-read', 'display-capture', 'midi', 'usb']) {
    assert.equal(isPermissionAllowed({
      permission,
      requestingUrl: 'https://chatgpt.com/',
    }), false);
  }
});


test('allows sanitized clipboard writes but never clipboard reads', () => {
  assert.equal(isPermissionAllowed({
    permission: 'clipboard-sanitized-write',
    requestingUrl: 'https://chatgpt.com/',
  }), true);
  assert.equal(isPermissionAllowed({
    permission: 'clipboard-read',
    requestingUrl: 'https://chatgpt.com/',
  }), false);
  assert.equal(isPermissionAllowed({
    permission: 'clipboard-sanitized-write',
    requestingUrl: 'https://example.com/',
  }), false);
});
