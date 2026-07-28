import assert from 'node:assert/strict';
import test from 'node:test';
import { displayProtocol, formatDiagnostics } from '../src/main/diagnostics.js';

test('detects the Linux display protocol', () => {
  assert.equal(displayProtocol({ XDG_SESSION_TYPE: 'wayland' }), 'wayland');
  assert.equal(displayProtocol({ DISPLAY: ':0' }), 'x11');
});

test('formats diagnostics without conversation content', () => {
  const text = formatDiagnostics({ appName:'ChatDesk',appVersion:'1',electron:'1',chromium:'1',node:'1',platform:'linux',arch:'x64',desktop:'GNOME',display:'wayland',safeMode:false,online:true,profile:'Personal',session:'persist:test',url:'https://chatgpt.com/',hardwareAcceleration:true,logFile:'/tmp/log',lastCrash:'' });
  assert.match(text, /Profile: Personal/);
  assert.doesNotMatch(text, /prompt|response|cookie/i);
});
