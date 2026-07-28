import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const packageJson = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const metainfo = fs.readFileSync(
  new URL('../packaging/linux/io.github.milmit.chatdesk.metainfo.xml', import.meta.url),
  'utf8',
);
const enrichScript = fs.readFileSync(new URL('../scripts/enrich-deb.js', import.meta.url), 'utf8');

test('Linux package metadata is complete', () => {
  assert.equal(packageJson.productName ?? packageJson.build.productName, 'ChatDesk Linux');
  assert.equal(packageJson.license, 'MIT');
  assert.equal(packageJson.build.linux.maintainer, 'MilMit <MilMit@users.noreply.github.com>');
  assert.equal(packageJson.build.linux.vendor, 'MilMit');
  assert.equal(packageJson.build.linux.desktop.entry.Icon, 'io.github.milmit.chatdesk');
  assert.equal(packageJson.build.deb.packageName, 'chatdesk-linux');
});

test('AppStream metadata identifies the app, developer, license, and desktop entry', () => {
  assert.match(metainfo, /<id>io\.github\.milmit\.chatdesk<\/id>/);
  assert.match(metainfo, /<name>ChatDesk Linux<\/name>/);
  assert.match(metainfo, /<name>MilMit<\/name>/);
  assert.match(metainfo, /<project_license>MIT<\/project_license>/);
  assert.match(metainfo, /<launchable type="desktop-id">io\.github\.milmit\.chatdesk\.desktop<\/launchable>/);
  assert.match(metainfo, /<icon type="stock">io\.github\.milmit\.chatdesk<\/icon>/);
});

test('Debian enrichment installs AppStream metadata and matching icon', () => {
  assert.match(enrichScript, /usr', 'share', 'metainfo/);
  assert.match(enrichScript, /512x512/);
  assert.match(enrichScript, /dpkg-deb/);
  assert.match(enrichScript, /--root-owner-group/);
});
