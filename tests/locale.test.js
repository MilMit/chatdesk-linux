import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveLanguage, stringsFor } from '../src/main/locale.js';
import { directionForLanguage, normalizeLanguage, t } from '../src/shared/i18n.js';

test('resolves Persian system locales and keeps English as fallback', () => {
  assert.equal(resolveLanguage('system', 'fa-IR'), 'fa');
  assert.equal(resolveLanguage('system', 'en-US'), 'en');
  assert.equal(resolveLanguage('fa', 'en-US'), 'fa');
  assert.equal(normalizeLanguage('system', 'fa-IR'), 'fa');
});

test('uses RTL only for Persian and translates native menu strings', () => {
  assert.equal(directionForLanguage('fa'), 'rtl');
  assert.equal(directionForLanguage('en'), 'ltr');
  assert.equal(t('fa', 'panel.settings'), 'تنظیمات');
  assert.equal(stringsFor('fa')('file'), 'فایل');
});
