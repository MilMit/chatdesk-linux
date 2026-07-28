import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const APP_ID = 'io.github.milmit.chatdesk';
const DESKTOP_ID = `${APP_ID}.desktop`;
const PROJECT_ROOT = process.cwd();
const DIST_DIR = path.join(PROJECT_ROOT, 'dist');
const METAINFO_SOURCE = path.join(
  PROJECT_ROOT,
  'packaging',
  'linux',
  `${APP_ID}.metainfo.xml`,
);
const ICON_SOURCE = path.join(PROJECT_ROOT, 'assets', 'icon.png');

function run(command, args, options = {}) {
  execFileSync(command, args, {
    stdio: 'inherit',
    ...options,
  });
}

function replaceControlField(control, name, value) {
  const pattern = new RegExp(`^${name}:.*$`, 'mi');
  if (pattern.test(control)) {
    return control.replace(pattern, `${name}: ${value}`);
  }
  return `${control.trimEnd()}\n${name}: ${value}\n`;
}

function updateDesktopEntry(contents) {
  const lines = contents.split(/\r?\n/);
  let inDesktopEntry = false;
  let iconUpdated = false;
  let nameUpdated = false;
  let commentUpdated = false;

  const updated = lines.map((line) => {
    if (line.startsWith('[')) {
      inDesktopEntry = line.trim() === '[Desktop Entry]';
      return line;
    }
    if (!inDesktopEntry) return line;

    if (line.startsWith('Icon=')) {
      iconUpdated = true;
      return `Icon=${APP_ID}`;
    }
    if (line.startsWith('Name=')) {
      nameUpdated = true;
      return 'Name=ChatDesk Linux';
    }
    if (line.startsWith('Comment=')) {
      commentUpdated = true;
      return 'Comment=Unofficial ChatGPT desktop client for Linux';
    }
    return line;
  });

  const desktopSection = updated.indexOf('[Desktop Entry]');
  if (desktopSection >= 0) {
    let insertionPoint = desktopSection + 1;
    if (!nameUpdated) updated.splice(insertionPoint++, 0, 'Name=ChatDesk Linux');
    if (!commentUpdated) {
      updated.splice(insertionPoint++, 0, 'Comment=Unofficial ChatGPT desktop client for Linux');
    }
    if (!iconUpdated) updated.splice(insertionPoint, 0, `Icon=${APP_ID}`);
  }

  return `${updated.join('\n').trimEnd()}\n`;
}

function findDesktopFile(root) {
  const directory = path.join(root, 'usr', 'share', 'applications');
  if (!fs.existsSync(directory)) return null;

  const files = fs.readdirSync(directory).filter((name) => name.endsWith('.desktop'));
  const exact = files.find((name) => name === DESKTOP_ID);
  const fallback = files.find((name) => name.includes('chatdesk'));
  const selected = exact ?? fallback ?? files[0];
  return selected ? path.join(directory, selected) : null;
}

function enrichDeb(debPath) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'chatdesk-deb-'));
  const extracted = path.join(tempRoot, 'package');
  fs.mkdirSync(extracted, { recursive: true });

  try {
    run('dpkg-deb', ['--raw-extract', debPath, extracted]);

    const controlPath = path.join(extracted, 'DEBIAN', 'control');
    let control = fs.readFileSync(controlPath, 'utf8');
    control = replaceControlField(control, 'Maintainer', 'MilMit <MilMit@users.noreply.github.com>');
    control = replaceControlField(control, 'Homepage', 'https://github.com/MilMit/chatdesk-linux');
    control = replaceControlField(control, 'Vendor', 'MilMit');
    control = replaceControlField(control, 'License', 'MIT');
    fs.writeFileSync(controlPath, control, 'utf8');

    const metainfoDirectory = path.join(extracted, 'usr', 'share', 'metainfo');
    fs.mkdirSync(metainfoDirectory, { recursive: true });
    fs.copyFileSync(METAINFO_SOURCE, path.join(metainfoDirectory, `${APP_ID}.metainfo.xml`));

    const iconDirectory = path.join(
      extracted,
      'usr',
      'share',
      'icons',
      'hicolor',
      '512x512',
      'apps',
    );
    fs.mkdirSync(iconDirectory, { recursive: true });
    fs.copyFileSync(ICON_SOURCE, path.join(iconDirectory, `${APP_ID}.png`));

    const desktopFile = findDesktopFile(extracted);
    if (!desktopFile) {
      throw new Error('The Debian package does not contain a .desktop file.');
    }
    fs.writeFileSync(desktopFile, updateDesktopEntry(fs.readFileSync(desktopFile, 'utf8')), 'utf8');

    const outputPath = `${debPath}.new`;
    run('dpkg-deb', ['--build', '--root-owner-group', extracted, outputPath]);
    fs.renameSync(outputPath, debPath);

    console.log(`[ChatDesk] Enriched Debian metadata: ${path.basename(debPath)}`);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

if (!fs.existsSync(METAINFO_SOURCE)) {
  throw new Error(`Missing AppStream metadata: ${METAINFO_SOURCE}`);
}
if (!fs.existsSync(ICON_SOURCE)) {
  throw new Error(`Missing application icon: ${ICON_SOURCE}`);
}
if (!fs.existsSync(DIST_DIR)) {
  throw new Error('dist/ does not exist. Build the Debian package first.');
}

const debFiles = fs
  .readdirSync(DIST_DIR)
  .filter((name) => name.endsWith('.deb'))
  .map((name) => path.join(DIST_DIR, name));

if (debFiles.length === 0) {
  throw new Error('No .deb package was found in dist/.');
}

for (const debFile of debFiles) enrichDeb(debFile);
