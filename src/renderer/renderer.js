import { directionForLanguage, normalizeLanguage, t } from '../shared/i18n.js';

const $ = (id) => document.getElementById(id);
const api = window.chatdesk;
if (!api || api.bridgeVersion !== 4) {
  document.body.textContent = 'ChatDesk interface failed to initialize. Open the application from a terminal and inspect the preload error.';
  throw new Error('ChatDesk preload bridge v4 is unavailable.');
}

const downloads = new Map();
const ICONS = Object.freeze({ person: '●', briefcase: '◆', flask: '▲', star: '★', code: '⌘', shield: '⬢' });
const COLOR_VALUES = Object.freeze({ blue: '#4f8cff', violet: '#8b5cf6', emerald: '#10b981', amber: '#f59e0b', rose: '#f43f5e', cyan: '#06b6d4' });
let settings = null;
let profiles = null;
let toastTimer = null;
let currentLanguage = 'en';
let commandItems = [];
let commandIndex = 0;
let workspaces = [];
let prompts = [];
let selectedWorkspaceId = '';
let selectedPromptId = '';
let commandQuery = '';
let commandVisibleItems = [];

const panels = ['settingsContent', 'downloadsContent', 'diagnosticsContent', 'aboutContent', 'workspacesContent', 'promptsContent', 'capturesContent', 'logsContent', 'healthContent', 'shareContent', 'reportContent', 'crashContent', 'commandContent', 'onboardingContent'];
const screens = ['splash', 'loading', 'switching', 'offline', 'panel'];

function translateDocument(language) {
  currentLanguage = normalizeLanguage(language);
  document.documentElement.lang = currentLanguage;
  document.documentElement.dir = directionForLanguage(currentLanguage);
  for (const node of document.querySelectorAll('[data-i18n]')) node.textContent = t(currentLanguage, node.dataset.i18n);
  for (const node of document.querySelectorAll('[data-i18n-placeholder]')) node.placeholder = t(currentLanguage, node.dataset.i18nPlaceholder);
  if (settings) renderCommands($('commandSearch').value);
}

function showScreen(id) {
  for (const screen of screens) $(screen).classList.toggle('hidden', screen !== id);
}

function showToast(message, type = 'info') {
  clearTimeout(toastTimer);
  $('toast').textContent = String(message || '');
  $('toast').dataset.type = type;
  $('toast').classList.add('show');
  toastTimer = setTimeout(() => $('toast').classList.remove('show'), 3600);
}

async function safeInvoke(channel, payload, fallbackMessage = '') {
  try { return await api.invoke(channel, payload); }
  catch (error) {
    showToast(error?.message || fallbackMessage || 'The operation failed.', 'error');
    return null;
  }
}

function panelMeta(mode) {
  const map = {
    settings: ['panel.settings', 'panel.settingsSub', 'settingsContent'],
    downloads: ['panel.downloads', 'panel.downloadsSub', 'downloadsContent'],
    diagnostics: ['panel.diagnostics', 'panel.diagnosticsSub', 'diagnosticsContent'],
    about: ['panel.about', 'panel.aboutSub', 'aboutContent'],
    crash: ['panel.crash', 'panel.crashSub', 'crashContent'],
    command: ['panel.command', 'panel.commandSub', 'commandContent'],
    workspaces: ['Workspaces', 'Save and apply profile and window presets.', 'workspacesContent'],
    prompts: ['Prompt Library', 'Reusable local templates with safe variables.', 'promptsContent'],
    captures: ['Recent Captures', 'Opt-in local capture history.', 'capturesContent'],
    logs: ['Log Viewer', 'Sanitized local application logs.', 'logsContent'],
    health: ['Installation Health', 'Sandbox, protocol, storage and shortcut checks.', 'healthContent'],
    share: ['Share to ChatDesk', 'Stage local files without automatic upload.', 'shareContent'],
    report: ['Report a Problem', 'Prepare a privacy-safe GitHub issue report.', 'reportContent'],
    onboarding: ['panel.onboarding', 'panel.onboardingSub', 'onboardingContent'],
  };
  return map[mode] || map.settings;
}

function showPanel(mode, payload = {}) {
  showScreen('panel');
  for (const id of panels) $(id).classList.add('hidden');
  const [titleKey, subtitleKey, content] = panelMeta(mode);
  $('panelTitle').textContent = titleKey.includes('.') ? t(currentLanguage, titleKey) : titleKey;
  $('panelSubtitle').textContent = subtitleKey.includes('.') ? t(currentLanguage, subtitleKey) : subtitleKey;
  $('panelCloseButton').classList.toggle('hidden', mode === 'onboarding');
  $(content).classList.remove('hidden');
  if (mode === 'downloads') void loadDownloads();
  if (mode === 'diagnostics') void loadDiagnostics();
  if (mode === 'about' && payload?.checkUpdates) void checkUpdates();
  if (mode === 'workspaces') void loadWorkspaces();
  if (mode === 'prompts') void loadPrompts();
  if (mode === 'captures') void loadCaptures();
  if (mode === 'logs') void loadLogs();
  if (mode === 'health') void loadHealth();
  if (mode === 'share') void loadShareQueue();
  if (mode === 'report') void loadIssueReport();
  if (mode === 'crash') {
    $('crashMessage').textContent = currentLanguage === 'fa'
      ? `پردازش ChatGPT متوقف شد (${payload?.reason || 'نامشخص'}). محتوای گفتگو در گزارش خرابی ثبت نشده است.`
      : `The ChatGPT renderer stopped (${payload?.reason || 'unknown'}). No conversation content was added to the crash report.`;
  }
  if (mode === 'settings' && payload?.focus === 'profiles') setTimeout(() => $('newProfileName').focus(), 50);
  if (mode === 'command') {
    $('commandSearch').value = '';
    commandIndex = 0;
    renderCommands('');
    setTimeout(() => $('commandSearch').focus(), 20);
  }
  if (mode === 'onboarding') $('onboardingLanguage').value = settings?.language ?? 'system';
}

function applySettings(next) {
  settings = next;
  translateDocument(next.resolvedLanguage || next.language);
  $('languageSelect').value = next.language;
  $('themeSelect').value = next.theme;
  for (const [id, key] of [
    ['launchAtStartup', 'launchAtStartup'], ['minimizeToTray', 'minimizeToTray'], ['alwaysOnTop', 'alwaysOnTop'],
    ['animations', 'animations'], ['autoHideMenuBar', 'autoHideMenuBar'], ['activityPopups', 'activityPopups'],
    ['connectionActivity', 'connectionActivity'], ['autoHideCompletedDownloads', 'autoHideCompletedDownloads'],
    ['hardwareAcceleration', 'hardwareAcceleration'], ['spellcheck', 'spellcheck'], ['notifications', 'notifications'],
    ['externalLinks', 'externalLinks'], ['autoCheckUpdates', 'autoCheckUpdates'], ['clipboardHistoryEnabled', 'clipboardHistoryEnabled'],
  ]) $(id).checked = next[key] === true;
  $('clipboardHistoryEnabled').checked = next.clipboardHistoryEnabled === true;
  $('clipboardHistoryLimit').value = next.clipboardHistoryLimit ?? 20;
  $('compactWidth').value = next.compactWidth ?? 460;
  $('compactSide').value = next.compactSide ?? 'right';
  $('zoomFactor').value = next.zoomFactor;
  $('zoomValue').textContent = `${Math.round(next.zoomFactor * 100)}%`;
  $('mainShortcut').value = next.mainShortcut;
  $('quickChatShortcut').value = next.quickChatShortcut;
  $('commandPaletteShortcut').value = next.commandPaletteShortcut;
  $('downloadPathText').textContent = next.downloadPath || t(currentLanguage, 'common.systemDefault');
  $('restartNotice').classList.toggle('hidden', !next.restartRequired);
  $('safeModeNotice').classList.toggle('hidden', !next.safeMode);
  $('versionText').textContent = `${currentLanguage === 'fa' ? 'نسخه' : 'Version'} ${next.version}${next.safeMode ? ' — Safe Mode' : ''}`;
  $('electronVersion').textContent = next.versions?.electron ?? '—';
  $('chromiumVersion').textContent = next.versions?.chromium ?? '—';
  $('nodeVersion').textContent = next.versions?.node ?? '—';
  $('safeModeButton').textContent = next.safeMode ? t(currentLanguage, 'menu.normalMode') : t(currentLanguage, 'diagnostics.safeMode');
  document.body.classList.toggle('no-animations', next.animations === false || next.safeMode === true);
}

async function updateSetting(key, value) {
  const result = await safeInvoke('settings:update', { [key]: value }, currentLanguage === 'fa' ? 'تنظیم ذخیره نشد.' : 'Could not save that setting.');
  if (result) applySettings(result); else if (settings) applySettings(settings);
}

function profileLabel(profile) { return `${ICONS[profile.icon] || '●'} ${profile.name}`; }
function selectedProfile() { return profiles?.profiles.find((item) => item.id === $('profileSelect').value); }

function applyProfileTheme(profile) {
  const color = COLOR_VALUES[profile?.color] || COLOR_VALUES.blue;
  document.documentElement.style.setProperty('--profile-accent', color);
  $('profileStrip').style.background = color;
}

function syncProfileAppearanceControls() {
  const profile = selectedProfile();
  if (!profile) return;
  $('profileColor').value = profile.color;
  $('profileIcon').value = profile.icon;
}

function applyProfiles(next) {
  profiles = next;
  $('profileSelect').replaceChildren();
  for (const profile of next.profiles) {
    const option = document.createElement('option');
    option.value = profile.id;
    option.textContent = profileLabel(profile);
    option.selected = profile.id === next.activeId;
    $('profileSelect').append(option);
  }
  $('removeProfileButton').disabled = next.profiles.length <= 1;
  applyProfileTheme(next.profiles.find((item) => item.id === next.activeId));
  syncProfileAppearanceControls();
  if ($('workspaceProfile')) {
    $('workspaceProfile').replaceChildren();
    for (const profile of next.profiles) $('workspaceProfile').append(new Option(profileLabel(profile), profile.id));
  }
  void buildCommandItems();
}

function formatBytes(bytes) {
  const number = Number(bytes) || 0;
  if (number < 1024) return `${number} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = number / 1024;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) { value /= 1024; index += 1; }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[index]}`;
}

function renderDownloads() {
  const list = $('downloadList');
  list.replaceChildren();
  if (!downloads.size) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = t(currentLanguage, 'downloads.empty');
    list.append(empty);
    return;
  }
  const sorted = [...downloads.values()].sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
  for (const item of sorted) {
    const card = document.createElement('article'); card.className = 'download-item';
    const head = document.createElement('div'); head.className = 'download-head';
    const name = document.createElement('div'); name.className = 'download-name'; name.textContent = item.filename;
    const percent = document.createElement('div'); percent.textContent = item.state === 'completed' ? t(currentLanguage, 'common.completed') : `${item.percent || 0}%`;
    head.append(name, percent);
    const meta = document.createElement('div'); meta.className = 'download-meta';
    const size = item.total ? `${formatBytes(item.received)} / ${formatBytes(item.total)}` : formatBytes(item.received);
    const speed = item.state === 'progressing' && item.speed ? ` • ${formatBytes(item.speed)}/s` : '';
    meta.textContent = `${size}${speed} • ${item.profile || t(currentLanguage, 'common.profile')} • ${item.state}`;
    const progress = document.createElement('div'); progress.className = 'progress';
    const bar = document.createElement('i'); bar.style.width = `${item.state === 'completed' ? 100 : item.percent || 0}%`; progress.append(bar);
    const actions = document.createElement('div'); actions.className = 'download-actions';
    const addAction = (label, action) => {
      const button = document.createElement('button'); button.textContent = label;
      button.onclick = () => safeInvoke('download:action', { id: item.id, action });
      actions.append(button);
    };
    if (item.state === 'progressing') addAction(item.paused ? 'Resume' : 'Pause', item.paused ? 'resume' : 'pause');
    if (item.state === 'progressing') addAction(currentLanguage === 'fa' ? 'لغو' : 'Cancel', 'cancel');
    if (item.path && item.state === 'completed') {
      addAction(currentLanguage === 'fa' ? 'باز کردن فایل' : 'Open File', 'open');
      addAction(currentLanguage === 'fa' ? 'نمایش پوشه' : 'Show in Folder', 'folder');
    }
    card.append(head, meta, progress, actions); list.append(card);
  }
}

async function loadDownloads() {
  const items = await safeInvoke('downloads:list');
  if (!items) return;
  downloads.clear();
  for (const item of items) downloads.set(item.id, item);
  renderDownloads();
}

async function loadDiagnostics() {
  const data = await safeInvoke('diagnostics:get');
  if (!data) return;
  const fields = {
    App: `${data.appName} ${data.appVersion}`,
    Runtime: `Electron ${data.electron} / Chromium ${data.chromium}`,
    Platform: `${data.platform} ${data.arch}`,
    Desktop: `${data.desktop} / ${data.display}`,
    Network: data.online ? 'Online' : 'Offline',
    Profile: data.profile,
    Session: data.session,
    'ChatGPT URL': data.url,
    'Safe Mode': data.safeMode ? 'Active' : 'Off',
    'Hardware Acceleration': data.hardwareAcceleration ? 'Enabled' : 'Disabled',
    'Activity Center': data.activityCenter || 'Unknown',
    'Clipboard Write': data.clipboardWrite || 'Unknown',
    'Last Crash': data.lastCrash || 'None recorded',
    'Log File': data.logFile,
  };
  $('diagnosticsGrid').replaceChildren();
  for (const [key, value] of Object.entries(fields)) {
    const cell = document.createElement('div'); cell.className = 'diagnostic';
    const label = document.createElement('span'); label.textContent = key;
    const content = document.createElement('b'); content.textContent = value;
    cell.append(label, content); $('diagnosticsGrid').append(cell);
  }
}

async function checkUpdates() {
  $('checkUpdateButton').disabled = true;
  $('checkUpdateButton').textContent = currentLanguage === 'fa' ? 'در حال بررسی…' : 'Checking…';
  $('updateResult').replaceChildren();
  const result = await safeInvoke('update:check');
  if (result) {
    const summary = document.createElement('p');
    summary.textContent = result.status === 'available'
      ? (currentLanguage === 'fa' ? `نسخه ${result.latestVersion} آماده است.` : `Version ${result.latestVersion} is available.`)
      : result.status === 'current'
        ? (currentLanguage === 'fa' ? 'آخرین نسخه نصب است.' : 'You are using the latest release.')
        : result.message;
    $('updateResult').append(summary);
    if (result.changelog) { const change = document.createElement('pre'); change.textContent = result.changelog; $('updateResult').append(change); }
    const assets = document.createElement('div'); assets.className = 'asset-list';
    for (const asset of result.assets || []) {
      const button = document.createElement('button');
      button.textContent = `${asset.name} (${formatBytes(asset.size)})`;
      button.onclick = () => safeInvoke('external:open', asset.url);
      assets.append(button);
    }
    if (assets.childElementCount) $('updateResult').append(assets);
    if (result.url) {
      const release = document.createElement('button');
      release.textContent = currentLanguage === 'fa' ? 'باز کردن صفحه انتشار' : 'Open Release Page';
      release.onclick = () => safeInvoke('external:open', result.url);
      $('updateResult').append(release);
    }
  }
  $('checkUpdateButton').disabled = false;
  $('checkUpdateButton').textContent = t(currentLanguage, 'about.check');
}


function workspaceFormValue() {
  return {
    id: $('workspaceId').value || undefined,
    name: $('workspaceName').value,
    profileId: $('workspaceProfile').value,
    width: Number($('workspaceWidth').value),
    height: Number($('workspaceHeight').value),
    zoomFactor: Number($('workspaceZoom').value),
    theme: $('workspaceTheme').value,
    startPage: $('workspaceStart').value,
    shortcut: $('workspaceShortcut').value,
    compact: $('workspaceCompact').checked,
    compactSide: settings?.compactSide || 'right',
    alwaysOnTop: $('workspaceAlwaysOnTop').checked,
  };
}
function clearWorkspaceForm() {
  selectedWorkspaceId = '';
  $('workspaceId').value = ''; $('workspaceName').value = ''; $('workspaceWidth').value = 1280; $('workspaceHeight').value = 820;
  $('workspaceZoom').value = 1; $('workspaceTheme').value = settings?.theme || 'system'; $('workspaceStart').value = 'current'; $('workspaceShortcut').value = '';
  $('workspaceCompact').checked = false; $('workspaceAlwaysOnTop').checked = false;
  if (profiles) $('workspaceProfile').value = profiles.activeId;
  renderWorkspaces();
}
function selectWorkspace(item) {
  selectedWorkspaceId = item.id; $('workspaceId').value = item.id; $('workspaceName').value = item.name; $('workspaceProfile').value = item.profileId;
  $('workspaceWidth').value = item.width; $('workspaceHeight').value = item.height; $('workspaceZoom').value = item.zoomFactor; $('workspaceTheme').value = item.theme;
  $('workspaceStart').value = item.startPage; $('workspaceShortcut').value = item.shortcut || ''; $('workspaceCompact').checked = item.compact; $('workspaceAlwaysOnTop').checked = item.alwaysOnTop;
  renderWorkspaces();
}
function renderWorkspaces() {
  $('workspaceList').replaceChildren();
  for (const item of workspaces) {
    const button = document.createElement('button'); button.classList.toggle('active', item.id === selectedWorkspaceId);
    const text = document.createElement('span'); const title = document.createElement('b'); title.textContent = item.name;
    const meta = document.createElement('small'); meta.textContent = `${item.profileId} • ${item.compact ? 'Compact' : `${item.width}×${item.height}`} • ${Math.round(item.zoomFactor * 100)}%`;
    text.append(title, meta); const shortcut = document.createElement('kbd'); shortcut.textContent = item.shortcut || ''; button.append(text, shortcut); button.onclick = () => selectWorkspace(item); $('workspaceList').append(button);
  }
}
async function loadWorkspaces() {
  const result = await safeInvoke('workspaces:list'); if (!result) return; workspaces = result; renderWorkspaces(); if (!selectedWorkspaceId && workspaces[0]) selectWorkspace(workspaces[0]);
}

function clearPromptForm() {
  selectedPromptId = ''; $('promptId').value = ''; $('promptTitle').value = ''; $('promptCategory').value = 'General'; $('promptTemplate').value = ''; $('promptShortcut').value = ''; $('promptFavorite').checked = false; renderPrompts();
}
function selectPrompt(item) {
  selectedPromptId = item.id; $('promptId').value = item.id; $('promptTitle').value = item.title; $('promptCategory').value = item.category; $('promptTemplate').value = item.template; $('promptShortcut').value = item.shortcut || ''; $('promptFavorite').checked = item.favorite; renderPrompts();
}
function renderPrompts() {
  const needle = $('promptFilter')?.value.trim().toLowerCase() || '';
  $('promptList').replaceChildren();
  for (const item of prompts.filter((prompt) => `${prompt.title} ${prompt.category}`.toLowerCase().includes(needle))) {
    const button = document.createElement('button'); button.classList.toggle('active', item.id === selectedPromptId);
    const text = document.createElement('span'); const title = document.createElement('b'); title.textContent = `${item.favorite ? '★ ' : ''}${item.title}`;
    const meta = document.createElement('small'); meta.textContent = item.category; text.append(title, meta); const shortcut = document.createElement('kbd'); shortcut.textContent = item.shortcut || ''; button.append(text, shortcut); button.onclick = () => selectPrompt(item); $('promptList').append(button);
  }
}
async function loadPrompts() { const result = await safeInvoke('prompts:list'); if (!result) return; prompts = result; renderPrompts(); if (!selectedPromptId && prompts[0]) selectPrompt(prompts[0]); }

async function loadCaptures() {
  const result = await safeInvoke('captures:list'); if (!result) return; const list = $('captureList'); list.replaceChildren();
  $('captureProtectionStatus').textContent = result.protection === 'file-permissions-only' ? 'Protection: file permissions only (no secure keyring backend detected).' : `Protection: encrypted with ${result.protection}.`;
  if (!result.enabled) { const note = document.createElement('p'); note.className = 'notice'; note.textContent = 'Capture history is disabled. Enable it in Settings → Power tools and privacy.'; list.append(note); }
  if (!result.items.length) { const empty = document.createElement('p'); empty.className = 'empty'; empty.textContent = 'No captures stored.'; list.append(empty); return; }
  for (const item of result.items) {
    const card = document.createElement('article'); card.className = 'capture-card'; const pre = document.createElement('pre'); pre.textContent = item.text;
    const meta = document.createElement('div'); meta.className = 'capture-meta'; meta.textContent = `${item.source} • ${new Date(item.createdAt).toLocaleString()}`;
    const actions = document.createElement('div'); actions.className = 'actions';
    const copy = document.createElement('button'); copy.textContent = 'Copy'; copy.onclick = async () => { if (await safeInvoke('captures:copy', item.id)) showToast('Capture copied.', 'success'); };
    const remove = document.createElement('button'); remove.className = 'danger'; remove.textContent = 'Delete'; remove.onclick = async () => { await safeInvoke('captures:remove', item.id); void loadCaptures(); };
    actions.append(copy, remove); card.append(pre, meta, actions); list.append(card);
  }
}

async function loadLogs() { const lines = await safeInvoke('logs:list', { level: $('logLevel').value, limit: 800 }); if (lines) $('logViewer').textContent = lines.join('\n') || 'No log entries.'; }
async function loadHealth() {
  const checks = await safeInvoke('health:run'); if (!checks) return; $('healthList').replaceChildren();
  for (const item of checks) { const card = document.createElement('article'); card.className = 'health-card'; const status = document.createElement('span'); status.className = 'status'; status.textContent = item.status === 'pass' ? '✅' : item.status === 'warn' ? '⚠️' : '❌'; const text = document.createElement('div'); const title = document.createElement('b'); title.textContent = item.label; const detail = document.createElement('small'); detail.textContent = item.detail; text.append(title, detail); card.append(status, text); $('healthList').append(card); }
}
function renderShareQueue(items) {
  $('shareList').replaceChildren();
  if (!items.length) { const empty = document.createElement('p'); empty.className = 'empty'; empty.textContent = 'No staged files.'; $('shareList').append(empty); return; }
  for (const item of items) { const card = document.createElement('article'); card.className = 'share-card'; const text = document.createElement('div'); const title = document.createElement('b'); title.textContent = item.name; const meta = document.createElement('div'); meta.className = 'share-meta'; meta.textContent = `${formatBytes(item.size)} • ${item.extension || 'file'}`; text.append(title, meta); const actions = document.createElement('div'); actions.className = 'actions'; const folder = document.createElement('button'); folder.textContent = 'Show'; folder.onclick = () => safeInvoke('share:show-file', item.id); const remove = document.createElement('button'); remove.textContent = 'Remove'; remove.onclick = async () => renderShareQueue(await safeInvoke('share:remove', item.id) || []); actions.append(folder, remove); card.append(text, actions); $('shareList').append(card); }
}
async function loadShareQueue() { renderShareQueue(await safeInvoke('share:list') || []); }
async function stageFiles(fileList) {
  const paths = [];
  for (const file of fileList) { try { const value = api.pathForFile(file); if (value) paths.push(value); } catch {} }
  if (paths.length) renderShareQueue(await safeInvoke('share:stage', paths) || []);
}
async function loadIssueReport() { const report = await safeInvoke('issue:prepare'); if (typeof report === 'string') $('issueReportText').value = report; }

function fuzzyScore(text, query) {
  const source = String(text || '').toLocaleLowerCase(currentLanguage);
  const needle = String(query || '').trim().toLocaleLowerCase(currentLanguage);
  if (!needle) return 1;
  const direct = source.indexOf(needle);
  if (direct >= 0) return 500 - direct * 2 - (source.length - needle.length) * 0.01;
  let position = -1;
  let score = 0;
  let streak = 0;
  for (const character of needle) {
    const next = source.indexOf(character, position + 1);
    if (next < 0) return -1;
    streak = next === position + 1 ? streak + 1 : 0;
    score += 10 + streak * 6 - Math.max(0, next - position - 1);
    position = next;
  }
  return score;
}

async function buildCommandItems() {
  const result = await safeInvoke('command:list');
  if (Array.isArray(result)) commandItems = result;
  return commandItems;
}

async function renderCommands(query = '') {
  commandQuery = query;
  if (!commandItems.length) await buildCommandItems();
  const scored = commandItems
    .map((item) => ({ item, score: Math.max(fuzzyScore(item.label, query), fuzzyScore(`${item.category} ${item.description}`, query) - 30) }))
    .filter(({ score }) => score >= 0)
    .sort((a, b) => Number(b.item.favorite) - Number(a.item.favorite) || a.item.recentRank - b.item.recentRank || b.score - a.score || a.item.label.localeCompare(b.item.label));
  commandVisibleItems = scored.map(({ item }) => item);
  $('commandList').replaceChildren();
  $('commandEmpty').classList.toggle('hidden', commandVisibleItems.length > 0);
  commandIndex = Math.min(commandIndex, Math.max(0, commandVisibleItems.length - 1));
  commandVisibleItems.forEach((item, index) => {
    const button = document.createElement('div'); button.className = `command-item${index === commandIndex ? ' selected' : ''}`; button.tabIndex = 0; button.setAttribute('role', 'button');
    const icon = document.createElement('span'); icon.className = 'command-icon'; icon.textContent = item.glyph || '›';
    const copy = document.createElement('span');
    const label = document.createElement('b'); label.textContent = item.label;
    const description = document.createElement('small'); description.textContent = `${item.category || ''}${item.description ? ` • ${item.description}` : ''}`;
    copy.append(label, description);
    const shortcut = document.createElement('kbd'); shortcut.textContent = item.shortcut || '';
    const favorite = document.createElement('button'); favorite.type = 'button'; favorite.className = 'command-favorite'; favorite.textContent = item.favorite ? '★' : '☆'; favorite.title = 'Favorite';
    favorite.onclick = async (event) => { event.stopPropagation(); const updated = await safeInvoke('command:favorite', item.key); if (updated) { commandItems = updated; await renderCommands(commandQuery); } };
    button.append(icon, copy, shortcut, favorite);
    button.onclick = () => executeCommand(item);
    $('commandList').append(button);
  });
}

async function executeCommand(item) {
  const result = await safeInvoke('command:execute', {
    id: item.id,
    profileId: item.profileId,
    workspaceId: item.workspaceId,
    promptId: item.promptId,
  });
  if (result?.profiles) applyProfiles(result.profiles);
  commandItems = [];
}

$('panelCloseButton').onclick = () => api.send('ui:close');
$('retryButton').onclick = () => api.send('app:retry');
$('offlineDiagnostics').onclick = () => showPanel('diagnostics');
$('languageSelect').onchange = (event) => updateSetting('language', event.target.value);
$('themeSelect').onchange = (event) => updateSetting('theme', event.target.value);
for (const [id, key] of [
  ['launchAtStartup', 'launchAtStartup'], ['minimizeToTray', 'minimizeToTray'], ['alwaysOnTop', 'alwaysOnTop'],
  ['animations', 'animations'], ['autoHideMenuBar', 'autoHideMenuBar'], ['activityPopups', 'activityPopups'],
  ['connectionActivity', 'connectionActivity'], ['autoHideCompletedDownloads', 'autoHideCompletedDownloads'],
  ['hardwareAcceleration', 'hardwareAcceleration'], ['spellcheck', 'spellcheck'], ['notifications', 'notifications'],
  ['externalLinks', 'externalLinks'], ['autoCheckUpdates', 'autoCheckUpdates'], ['clipboardHistoryEnabled', 'clipboardHistoryEnabled'],
]) $(id).onchange = (event) => updateSetting(key, event.target.checked);
$('zoomFactor').oninput = (event) => { $('zoomValue').textContent = `${Math.round(event.target.value * 100)}%`; };
$('zoomFactor').onchange = (event) => updateSetting('zoomFactor', Number(event.target.value));
$('mainShortcut').onchange = (event) => updateSetting('mainShortcut', event.target.value);
$('quickChatShortcut').onchange = (event) => updateSetting('quickChatShortcut', event.target.value);
$('commandPaletteShortcut').onchange = (event) => updateSetting('commandPaletteShortcut', event.target.value);
$('clipboardHistoryLimit').onchange = (event) => updateSetting('clipboardHistoryLimit', Number(event.target.value));
$('compactWidth').onchange = (event) => updateSetting('compactWidth', Number(event.target.value));
$('compactSide').onchange = (event) => updateSetting('compactSide', event.target.value);
$('chooseDownloadFolder').onclick = async () => {
  const value = await safeInvoke('settings:choose-download-folder');
  if (typeof value === 'string') $('downloadPathText').textContent = value || t(currentLanguage, 'common.systemDefault');
};
$('clearCacheButton').onclick = async () => { if (await safeInvoke('settings:clear-cache')) showToast(t(currentLanguage, 'toast.cacheCleared'), 'success'); };
$('clearSessionButton').onclick = async () => {
  const message = currentLanguage === 'fa' ? 'از پروفایل فعلی خارج و اطلاعات نشست پاک شود؟' : 'Sign out and clear stored ChatGPT data for the current profile?';
  if (confirm(message) && await safeInvoke('settings:clear-session')) api.send('ui:close');
};
$('exportSettingsButton').onclick = async () => { if (await safeInvoke('settings:export')) showToast(t(currentLanguage, 'toast.settingsExported'), 'success'); };
$('importSettingsButton').onclick = async () => {
  const result = await safeInvoke('settings:import');
  if (result) { applySettings(result); showToast(t(currentLanguage, 'toast.settingsImported'), 'success'); }
};
$('factoryResetButton').onclick = async () => {
  const message = currentLanguage === 'fa' ? 'همه تنظیمات بازنشانی و نشست فعلی پاک شود؟' : 'Reset all ChatDesk settings and sign out?';
  if (confirm(message)) await safeInvoke('settings:factory-reset');
};
$('profileSelect').onchange = syncProfileAppearanceControls;
$('switchProfileButton').onclick = async () => {
  const result = await safeInvoke('profiles:switch', $('profileSelect').value);
  if (result) applyProfiles(result);
};
$('openProfileWindowButton').onclick = () => safeInvoke('profiles:open-window', $('profileSelect').value);
$('addProfileButton').onclick = async () => {
  const result = await safeInvoke('profiles:add', {
    name: $('newProfileName').value,
    color: $('profileColor').value,
    icon: $('profileIcon').value,
  });
  if (result) { applyProfiles(result); $('newProfileName').value = ''; }
};
$('removeProfileButton').onclick = async () => {
  const message = currentLanguage === 'fa' ? 'این پروفایل حذف شود؟' : 'Delete this profile from ChatDesk?';
  if (confirm(message)) {
    const result = await safeInvoke('profiles:remove', $('profileSelect').value);
    if (result) applyProfiles(result);
  }
};
$('saveProfileAppearance').onclick = async () => {
  const result = await safeInvoke('profiles:update', { id: $('profileSelect').value, color: $('profileColor').value, icon: $('profileIcon').value });
  if (result) { applyProfiles(result); showToast(t(currentLanguage, 'toast.profileUpdated'), 'success'); }
};
$('newWorkspaceButton').onclick = clearWorkspaceForm;
$('saveWorkspaceButton').onclick = async () => { const result = await safeInvoke('workspaces:save', workspaceFormValue()); if (result) { workspaces = result; renderWorkspaces(); showToast('Workspace saved.', 'success'); commandItems = []; } };
$('applyWorkspaceButton').onclick = async () => { const id = $('workspaceId').value; if (id) { await safeInvoke('workspaces:apply', id); api.send('ui:close'); } };
$('deleteWorkspaceButton').onclick = async () => { const id = $('workspaceId').value; if (id && confirm('Delete this workspace?')) { workspaces = await safeInvoke('workspaces:remove', id) || []; clearWorkspaceForm(); commandItems = []; } };
$('newPromptButton').onclick = clearPromptForm;
$('promptFilter').oninput = renderPrompts;
$('savePromptButton').onclick = async () => { const result = await safeInvoke('prompts:save', { id: $('promptId').value || undefined, title: $('promptTitle').value, category: $('promptCategory').value, template: $('promptTemplate').value, shortcut: $('promptShortcut').value, favorite: $('promptFavorite').checked }); if (result) { prompts = result; renderPrompts(); showToast('Prompt saved.', 'success'); commandItems = []; } };
$('copyPromptButton').onclick = async () => { const id = $('promptId').value; if (id && await safeInvoke('prompts:copy', id)) showToast('Expanded prompt copied.', 'success'); };
$('deletePromptButton').onclick = async () => { const id = $('promptId').value; if (id && confirm('Delete this prompt?')) { prompts = await safeInvoke('prompts:remove', id) || []; clearPromptForm(); commandItems = []; } };
$('clearCapturesButton').onclick = async () => { if (confirm('Clear all local captures?')) { await safeInvoke('captures:clear'); void loadCaptures(); } };
$('logLevel').onchange = loadLogs;
$('refreshLogsButton').onclick = loadLogs;
$('copyLogsButton').onclick = async () => { if (await safeInvoke('logs:copy', { level: $('logLevel').value, limit: 800 })) showToast('Logs copied.', 'success'); };
$('exportLogsButton').onclick = () => safeInvoke('logs:export', { level: $('logLevel').value, limit: 2000 });
$('clearLogsButton').onclick = async () => { if (confirm('Clear the local log file?')) { await safeInvoke('logs:clear'); void loadLogs(); } };
$('runHealthButton').onclick = loadHealth;
$('shareFileInput').onchange = (event) => stageFiles(event.target.files);
for (const type of ['dragenter', 'dragover']) $('shareDropZone').addEventListener(type, (event) => { event.preventDefault(); $('shareDropZone').classList.add('dragging'); });
for (const type of ['dragleave', 'drop']) $('shareDropZone').addEventListener(type, (event) => { event.preventDefault(); $('shareDropZone').classList.remove('dragging'); });
$('shareDropZone').addEventListener('drop', (event) => stageFiles(event.dataTransfer.files));
$('copySharePathsButton').onclick = async () => { if (await safeInvoke('share:copy-paths')) showToast('File paths copied.', 'success'); };
$('openShareChatButton').onclick = () => api.send('ui:close');
$('clearShareButton').onclick = async () => renderShareQueue(await safeInvoke('share:clear') || []);
$('copyIssueButton').onclick = async () => { if (await safeInvoke('issue:copy')) showToast('Issue report copied.', 'success'); };
$('saveIssueButton').onclick = () => safeInvoke('issue:save');
$('openIssueButton').onclick = () => safeInvoke('issue:open');

$('clearDownloadHistory').onclick = async () => {
  const items = await safeInvoke('downloads:clear-history');
  if (items) { downloads.clear(); for (const item of items) downloads.set(item.id, item); renderDownloads(); }
};
$('copyDiagnostics').onclick = async () => {
  const result = await safeInvoke('diagnostics:copy', undefined, t(currentLanguage, 'toast.copyFailed'));
  if (result === true) showToast(t(currentLanguage, 'toast.copied'), 'success');
};
$('testClipboard').onclick = async () => {
  const result = await safeInvoke('clipboard:test', undefined, t(currentLanguage, 'toast.copyFailed'));
  if (result === true) showToast(t(currentLanguage, 'toast.clipboardTestPassed'), 'success');
};
$('openLogs').onclick = () => safeInvoke('diagnostics:open-logs');
$('diagClearCache').onclick = async () => { if (await safeInvoke('settings:clear-cache')) showToast(t(currentLanguage, 'toast.cacheCleared'), 'success'); };
$('diagResetSession').onclick = async () => {
  const message = currentLanguage === 'fa' ? 'نشست پروفایل فعلی پاک شود؟' : 'Clear the current profile session?';
  if (confirm(message)) await safeInvoke('settings:clear-session');
};
$('restartApp').onclick = () => api.send('app:restart', settings?.safeMode === true);
$('safeModeButton').onclick = () => api.send('app:restart', settings?.safeMode !== true);
$('checkUpdateButton').onclick = checkUpdates;
$('openGitHubButton').onclick = () => safeInvoke('external:open', 'https://github.com/milmit/chatdesk-linux');
$('reloadAfterCrash').onclick = () => api.send('app:retry');
$('restartAfterCrash').onclick = () => api.send('app:restart', settings?.safeMode === true);
$('crashDiagnostics').onclick = () => showPanel('diagnostics');
$('commandSearch').oninput = (event) => { commandIndex = 0; renderCommands(event.target.value); };
$('commandSearch').onkeydown = (event) => {
  const count = $('commandList').children.length;
  if (event.key === 'ArrowDown' && count) { event.preventDefault(); commandIndex = (commandIndex + 1) % count; renderCommands(event.currentTarget.value); }
  if (event.key === 'ArrowUp' && count) { event.preventDefault(); commandIndex = (commandIndex - 1 + count) % count; renderCommands(event.currentTarget.value); }
  if (event.key === 'Enter' && count) { event.preventDefault(); $('commandList').children[commandIndex]?.click(); }
};
$('onboardingLanguage').onchange = (event) => translateDocument(event.target.value);
$('completeOnboarding').onclick = async () => {
  const result = await safeInvoke('onboarding:complete', { language: $('onboardingLanguage').value });
  if (result) applySettings(result);
};

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !$('panel').classList.contains('hidden') && !$('onboardingContent').classList.contains('hidden')) api.send('ui:close');
});
api.on('ui:show', ({ mode, payload }) => {
  if (mode === 'app') return;
  if (['splash', 'loading', 'switching', 'offline'].includes(mode)) {
    if (mode === 'switching') { $('switchingTitle').textContent = payload?.name ? `Switching to ${payload.name}…` : 'Switching profile…'; $('switchingBadge').textContent = payload?.glyph || '●'; if (payload?.color && COLOR_VALUES[payload.color]) $('switchingBadge').style.background = COLOR_VALUES[payload.color]; }
    showScreen(mode);
  }
  else showPanel(mode, payload);
});
api.on('app:offline', (payload) => {
  $('offlineMessage').textContent = payload.description || (currentLanguage === 'fa' ? 'اتصال اینترنت را بررسی کنید.' : 'Check your network connection and try again.');
  showScreen('offline');
});
api.on('theme:changed', ({ dark }) => document.body.classList.toggle('light', !dark));
api.on('settings:changed', applySettings);
api.on('profiles:changed', applyProfiles);
api.on('download:update', (item) => {
  downloads.set(item.id, item);
  renderDownloads();
  if (item.state === 'completed') showToast(`${item.filename}: ${t(currentLanguage, 'toast.downloaded')}`, 'success');
});
api.on('toast:show', ({ message, type }) => showToast(message, type));
api.on('power:changed', ({ type, items }) => {
  if (type === 'workspaces') { workspaces = items || []; renderWorkspaces(); }
  if (type === 'prompts') { prompts = items || []; renderPrompts(); }
  if (type === 'share') renderShareQueue(items || []);
  commandItems = [];
});

Promise.all([api.invoke('settings:get'), api.invoke('profiles:get')])
  .then(([nextSettings, nextProfiles]) => { applySettings(nextSettings); applyProfiles(nextProfiles); })
  .catch((error) => showToast(error.message, 'error'));
