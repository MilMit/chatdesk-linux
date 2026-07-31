import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isLongResponseRequest,
  isObservedConnectionRequest,
  isRecoverableConnectionError,
  shouldDisableBackgroundThrottling,
} from '../src/main/stream-stability.js';

test('detects long ChatGPT POST streams without treating persistent WebSockets as power-blocking work', () => {
  assert.equal(isLongResponseRequest({ url: 'https://chatgpt.com/backend-api/conversation', method: 'POST', resourceType: 'xhr' }), true);
  assert.equal(isLongResponseRequest({ url: 'wss://ws.chatgpt.com/ws', method: 'GET', resourceType: 'webSocket' }), false);
  assert.equal(isLongResponseRequest({ url: 'https://evil.example/chatgpt.com', method: 'POST', resourceType: 'xhr' }), false);
});

test('observes ChatGPT WebSocket and request failures but ignores normal aborts', () => {
  assert.equal(isObservedConnectionRequest({ url: 'wss://ws.chatgpt.com/ws', resourceType: 'webSocket' }), true);
  assert.equal(isRecoverableConnectionError({ url: 'wss://ws.chatgpt.com/ws', resourceType: 'webSocket', error: 'net::ERR_CONNECTION_RESET' }), true);
  assert.equal(isRecoverableConnectionError({ url: 'https://chatgpt.com/backend-api/conversation', resourceType: 'xhr', error: 'net::ERR_ABORTED' }), false);
});

test('long response stability disables background throttling by default', () => {
  assert.equal(shouldDisableBackgroundThrottling({}), true);
  assert.equal(shouldDisableBackgroundThrottling({ keepLongResponsesActive: true }), true);
  assert.equal(shouldDisableBackgroundThrottling({ keepLongResponsesActive: false }), false);
});
