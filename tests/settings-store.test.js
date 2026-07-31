import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, sanitizeSettings } from '../src/main/settings-store.js';

test('sanitizes unsafe or invalid settings', () => {
  const settings = sanitizeSettings({ theme: 'neon', zoomFactor: 99, mainShortcut: '' });
  assert.equal(settings.theme, 'system');
  assert.equal(settings.zoomFactor, 1.5);
  assert.equal(settings.mainShortcut, DEFAULT_SETTINGS.mainShortcut);
});

test('preserves supported settings', () => {
  const settings = sanitizeSettings({ theme: 'light', zoomFactor: 1.15, notifications: false });
  assert.equal(settings.theme, 'light');
  assert.equal(settings.zoomFactor, 1.15);
  assert.equal(settings.notifications, false);
  assert.equal(settings.activityPopups, true);
});

test('supports activity popup preferences', () => {
  const settings = sanitizeSettings({ activityPopups: false, connectionActivity: false, autoHideCompletedDownloads: false });
  assert.equal(settings.activityPopups, false);
  assert.equal(settings.connectionActivity, false);
  assert.equal(settings.autoHideCompletedDownloads, false);
});


test('supports language, onboarding, daily update checks, and Command Palette settings', () => {
  const settings = sanitizeSettings({
    language: 'fa',
    onboardingComplete: true,
    autoCheckUpdates: false,
    lastUpdateCheckAt: '2026-07-28T00:00:00.000Z',
    commandPaletteShortcut: 'CommandOrControl+Shift+K',
  });
  assert.equal(settings.language, 'fa');
  assert.equal(settings.onboardingComplete, true);
  assert.equal(settings.autoCheckUpdates, false);
  assert.equal(settings.lastUpdateCheckAt, '2026-07-28T00:00:00.000Z');
  assert.equal(settings.commandPaletteShortcut, 'CommandOrControl+Shift+K');
});


test('supports native interaction and performance preferences', () => {
  const settings = sanitizeSettings({
    motionMode: 'reduced',
    memorySaverMinutes: 30,
    startupMode: 'tray',
    focusAlwaysOnTop: true,
    nativeContextMenu: false,
  });
  assert.equal(settings.motionMode, 'reduced');
  assert.equal(settings.memorySaverMinutes, 30);
  assert.equal(settings.startupMode, 'tray');
  assert.equal(settings.focusAlwaysOnTop, true);
  assert.equal(settings.nativeContextMenu, false);
});


test('keeps long responses active and recovery alerts enabled by default', () => {
  const defaults = sanitizeSettings({});
  assert.equal(defaults.keepLongResponsesActive, true);
  assert.equal(defaults.streamRecoveryAlerts, true);
  const disabled = sanitizeSettings({ keepLongResponsesActive: false, streamRecoveryAlerts: false });
  assert.equal(disabled.keepLongResponsesActive, false);
  assert.equal(disabled.streamRecoveryAlerts, false);
});
