import {
  app,
  BrowserWindow,
  clipboard,
  crashReporter,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  nativeTheme,
  net,
  powerSaveBlocker,
  screen,
  safeStorage,
  shell,
  session,
  Tray,
  WebContentsView,
} from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ActivityWindow } from './activity-window.js';
import { CaptureStore } from './capture-store.js';
import { installNativeContextMenu } from './context-menu.js';
import { collectSharedFiles, findDeepLink, parseDeepLink } from './deep-link.js';
import { summarizeDownloads } from './activity-state.js';
import { setLinuxAutostart } from './autostart.js';
import { formatDiagnostics, desktopEnvironment, displayProtocol } from './diagnostics.js';
import { DownloadManager } from './download-manager.js';
import { FindController } from './find-controller.js';
import { FileLogger, sanitizeUrlForLog } from './logger.js';
import { runHealthChecks } from './health-check.js';
import { formatIssueReport } from './issue-report.js';
import { classifyUrl } from './navigation-policy.js';
import { collectPerformanceReport, formatPerformanceReport } from './performance-monitor.js';
import { resolveLanguage, stringsFor } from './locale.js';
import { PROFILE_ICON_GLYPHS, ProfileStore, partitionForProfile } from './profile-store.js';
import { ProfileWindowManager } from './profile-window-manager.js';
import { expandPromptTemplate, PromptStore } from './prompt-store.js';
import { getSecureWebPreferences, secureWebContents, setExternalLinksEnabled } from './security.js';
import { DEFAULT_SETTINGS, sanitizeSettings, SettingsStore } from './settings-store.js';
import { isLongResponseRequest, isObservedConnectionRequest, isRecoverableConnectionError, shouldDisableBackgroundThrottling } from './stream-stability.js';
import { checkForUpdates } from './update-checker.js';
import { getAppViewBounds, shouldShowAppView } from './view-layout.js';
import { WindowStateStore } from './window-state.js';
import { WorkspaceStore } from './workspace-store.js';

const APP_URL = 'https://chatgpt.com/';
const APP_ID = 'io.github.milmit.chatdesk';
const REVEAL_TIMEOUT_MS = 3500;
const FAILURE_TIMEOUT_MS = 10000;
const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const UPDATE_STARTUP_DELAY_MS = 15_000;
const UNRESPONSIVE_GRACE_MS = 30_000;
const STREAM_POWER_RELEASE_MS = 4_000;
const APP_START_AT = Date.now();
const currentFile = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFile);
const rootDirectory = path.resolve(currentDirectory, '../..');
const iconPath = path.join(rootDirectory, 'assets/icon.png');
const shellPath = path.join(rootDirectory, 'src/renderer/index.html');
const shellPreloadPath = path.join(rootDirectory, 'build/preload/chrome-preload.cjs');
const quickChatPath = path.join(rootDirectory, 'src/quick-chat/index.html');
const quickChatPreloadPath = path.join(rootDirectory, 'build/preload/quick-chat-preload.cjs');
const activityPath = path.join(rootDirectory, 'src/activity/index.html');
const activityPreloadPath = path.join(rootDirectory, 'build/preload/activity-preload.cjs');
const findPath = path.join(rootDirectory, 'src/find/index.html');
const findPreloadPath = path.join(rootDirectory, 'build/preload/find-preload.cjs');
const SAFE_MODE = process.argv.includes('--safe-mode');
const UI_SMOKE_TEST = process.argv.includes('--ui-smoke-test');

app.commandLine.appendSwitch('enable-features', 'GlobalShortcutsPortal');
app.userAgentFallback = app.userAgentFallback.replace(/\sElectron\/[^\s]+/g, '');
app.setAppUserModelId(APP_ID);

const userDataPath = app.getPath('userData');
const logDirectory = path.join(userDataPath, 'logs');
const logPath = path.join(logDirectory, 'chatdesk.log');
const crashStatePath = path.join(userDataPath, 'last-crash.json');
const sandboxPath = app.isPackaged
  ? path.join(process.resourcesPath, '..', 'chrome-sandbox')
  : path.join(rootDirectory, 'node_modules/electron/dist/chrome-sandbox');
const logger = new FileLogger(logPath);
logger.installConsoleBridge();
app.setPath('crashDumps', path.join(userDataPath, 'Crashpad'));
crashReporter.start({
  productName: 'ChatDesk Linux',
  uploadToServer: false,
  extra: { appVersion: app.getVersion(), safeMode: String(SAFE_MODE) },
});

const settingsStore = new SettingsStore(path.join(userDataPath, 'settings.json'));
const profileStore = new ProfileStore(path.join(userDataPath, 'profiles.json'));
const windowStateStore = new WindowStateStore(path.join(userDataPath, 'window-state.json'));
let captureStore = null;
const promptStore = new PromptStore(path.join(userDataPath, 'prompts.json'));
const workspaceStore = new WorkspaceStore(path.join(userDataPath, 'workspaces.json'));
const shareQueue = new Map();
let settings = SAFE_MODE
  ? { ...DEFAULT_SETTINGS, minimizeToTray: false, launchAtStartup: false, animations: false, motionMode: 'off', hardwareAcceleration: false }
  : settingsStore.get();
if (!settings.hardwareAcceleration || SAFE_MODE) app.disableHardwareAcceleration();

let mainWindow = null;
let appView = null;
let quickChatWindow = null;
let tray = null;
let downloadManager = null;
let activityWindow = null;
let quitting = false;
let chromeMode = 'splash';
let appRevealed = false;
let mainFrameLoadFailed = false;
let saveTimer = null;
let revealTimer = null;
let failureTimer = null;
let lastFailure = null;
let lastActiveDownloadCount = -1;
let automaticUpdateTimer = null;
let profileWindowManager = null;
let compactMode = false;
let normalWindowBounds = null;
let shortcutStatus = {};
let requestedQuickProfileId = '';
let protocolRegistered = false;
let findController = null;
let focusMode = false;
let requestedQuickText = '';
let startupViewLoaded = false;
let persistenceFlushed = false;
let flushingQuit = false;
let rendererUnresponsive = false;
let unresponsiveTimer = null;
let streamPowerBlockerId = null;
let streamPowerReleaseTimer = null;
const activeLongResponseRequests = new Set();
const monitoredSessions = new WeakSet();
let lastStreamError = null;


async function flushPersistentState() {
  const writes = [
    settingsStore.flush?.(),
    profileStore.flush?.(),
    windowStateStore.flush?.(),
    captureStore?.flush?.(),
    promptStore.flush?.(),
    workspaceStore.flush?.(),
    downloadManager?.flush?.(),
    profileWindowManager?.flush?.(),
    logger.flush?.(),
  ].filter(Boolean);
  await Promise.race([
    Promise.allSettled(writes),
    new Promise((resolve) => setTimeout(resolve, 1500)),
  ]);
}

function isAlive(value) { return value && !value.isDestroyed(); }
function activeProfile() { return profileStore.getActive(); }
function activePartition() { return partitionForProfile(activeProfile()?.id ?? 'personal'); }

function profileGlyph(profile) { return PROFILE_ICON_GLYPHS[profile?.icon] || '●'; }

function readClipboardSource(source = 'clipboard') {
  const type = source === 'selection' && process.platform === 'linux' ? 'selection' : 'clipboard';
  try { return clipboard.readText(type).trim().slice(0, 20_000); }
  catch (error) { console.warn(`[ChatDesk] Failed to read ${type}:`, error.message); return ''; }
}

function maybeStoreCapture(text, source = 'manual', profileId = activeProfile()?.id || '') {
  if (!settings.clipboardHistoryEnabled || SAFE_MODE || !captureStore) return { saved: false, reason: 'disabled' };
  return captureStore.add(text, { source, profileId });
}

function createCaptureProtectionCodec() {
  try {
    if (!safeStorage.isEncryptionAvailable()) return null;
    const backend = process.platform === 'linux' ? safeStorage.getSelectedStorageBackend() : 'os-keychain';
    if (backend === 'basic_text' || backend === 'unknown') return null;
    return {
      name: backend,
      encrypt: (plainText) => safeStorage.encryptString(plainText),
      decrypt: (encrypted) => safeStorage.decryptString(encrypted),
    };
  } catch (error) {
    console.warn('[ChatDesk] Capture history encryption unavailable:', error.message);
    return null;
  }
}


function commandIdForPayload(payload = {}) {
  if (payload.id === 'profile' && payload.profileId) return `profile:${payload.profileId}`;
  if (payload.id === 'profile-window' && payload.profileId) return `profile-window:${payload.profileId}`;
  if (payload.id === 'workspace' && payload.workspaceId) return `workspace:${payload.workspaceId}`;
  if (payload.id === 'prompt' && payload.promptId) return `prompt:${payload.promptId}`;
  return String(payload.id || '');
}

function rememberCommand(payload = {}) {
  if (SAFE_MODE) return;
  const id = commandIdForPayload(payload);
  if (!id) return;
  const recentCommands = [id, ...(settings.recentCommands || []).filter((item) => item !== id)].slice(0, 20);
  settings = settingsStore.replace({ ...settings, recentCommands });
  sendToShell('settings:changed', publicSettings());
}

async function listLogLines({ level = 'all', limit = 400 } = {}) {
  try {
    const lines = (await fs.promises.readFile(logPath, 'utf8')).split(/\r?\n/).filter(Boolean);
    const filtered = level === 'all' ? lines : lines.filter((line) => line.toLowerCase().includes(`[${level.toLowerCase()}]`));
    return filtered.slice(-Math.min(2000, Math.max(1, Number(limit) || 400)));
  } catch { return []; }
}

function serializeShareQueue() {
  return [...shareQueue.values()].map((item) => ({ ...item }));
}

async function stageSharedFiles(values = []) {
  for (const raw of Array.isArray(values) ? values : []) {
    const filePath = path.resolve(String(raw || ''));
    try {
      const stat = await fs.promises.stat(filePath);
      if (!stat.isFile()) continue;
      const id = Buffer.from(filePath).toString('base64url').slice(0, 80);
      shareQueue.set(id, {
        id,
        path: filePath,
        name: path.basename(filePath),
        size: stat.size,
        extension: path.extname(filePath).toLowerCase(),
      });
    } catch {}
  }
  const items = serializeShareQueue();
  sendToShell('power:changed', { type: 'share', items });
  return items;
}

function registerDeepLinkProtocol() {
  try {
    if (app.isPackaged) protocolRegistered = app.setAsDefaultProtocolClient('chatdesk');
    else protocolRegistered = app.setAsDefaultProtocolClient('chatdesk', process.execPath, [app.getAppPath()]);
  } catch (error) {
    protocolRegistered = false;
    console.warn('[ChatDesk] Could not register chatdesk:// protocol:', error.message);
  }
  return protocolRegistered;
}

function targetCompactBounds(side = settings.compactSide) {
  const display = screen.getDisplayMatching(mainWindow?.getBounds?.() || screen.getPrimaryDisplay().workArea);
  const area = display.workArea;
  const width = Math.min(area.width, Math.max(380, settings.compactWidth || 460));
  const height = Math.max(600, area.height - 32);
  return {
    x: side === 'left' ? area.x + 16 : area.x + area.width - width - 16,
    y: area.y + 16,
    width,
    height: Math.min(area.height - 32, height),
  };
}

function animateBounds(target, duration = 220) {
  if (!isAlive(mainWindow)) return;
  if (!settings.animations || SAFE_MODE) { mainWindow.setBounds(target); return; }
  const start = mainWindow.getBounds();
  const steps = 12;
  let step = 0;
  const timer = setInterval(() => {
    step += 1;
    const progress = 1 - ((1 - step / steps) ** 3);
    const value = {};
    for (const key of ['x', 'y', 'width', 'height']) value[key] = Math.round(start[key] + (target[key] - start[key]) * progress);
    if (isAlive(mainWindow)) mainWindow.setBounds(value);
    if (step >= steps || !isAlive(mainWindow)) clearInterval(timer);
  }, Math.max(12, Math.round(duration / steps)));
}

function setCompactMode(enabled, side = settings.compactSide) {
  if (!isAlive(mainWindow)) return { enabled: false, side };
  const next = enabled === true;
  if (next === compactMode && (!next || side === settings.compactSide)) return { enabled: compactMode, side: settings.compactSide };
  if (next) {
    normalWindowBounds = mainWindow.getBounds();
    compactMode = true;
    settings = SAFE_MODE ? settings : settingsStore.replace({ ...settings, compactSide: side });
    mainWindow.setAlwaysOnTop(true);
    mainWindow.setAutoHideMenuBar(true);
    mainWindow.setMenuBarVisibility(false);
    animateBounds(targetCompactBounds(side));
  } else {
    compactMode = false;
    mainWindow.setAlwaysOnTop(settings.alwaysOnTop);
    mainWindow.setAutoHideMenuBar(settings.autoHideMenuBar);
    mainWindow.setMenuBarVisibility(!settings.autoHideMenuBar);
    if (normalWindowBounds) animateBounds(normalWindowBounds);
  }
  rebuildMenus();
  sendToShell('power:changed', { type: 'compact', enabled: compactMode, side: settings.compactSide });
  return { enabled: compactMode, side: settings.compactSide };
}

function resolvedLanguage() {
  return resolveLanguage(settings.language, app.getLocale());
}

function tr() {
  return stringsFor(resolvedLanguage());
}

function activeProfileLabel() {
  const profile = activeProfile();
  if (!profile) return 'ChatDesk Linux';
  return `${PROFILE_ICON_GLYPHS[profile.icon] || '●'} ${profile.name}`;
}

function writeClipboardText(value) {
  const text = String(value ?? '');
  if (!text) throw new Error(tr()('clipboardFailed'));
  try {
    clipboard.writeText(text, 'clipboard');
    return true;
  } catch (error) {
    console.error('[ChatDesk] Clipboard write failed:', error);
    throw new Error(tr()('clipboardFailed'));
  }
}

function resolvedMotionMode() {
  if (SAFE_MODE || settings.motionMode === 'off') return 'off';
  if (settings.motionMode === 'reduced') return 'reduced';
  if (settings.motionMode === 'full') return 'full';
  return 'system';
}

function openQuickCaptureWithText(text = '', profileId = '') {
  requestedQuickText = String(text || '').trim().slice(0, 20_000);
  requestedQuickProfileId = profileId || requestedQuickProfileId;
  toggleQuickChat({ forceShow: true, profileId });
}

async function applyPromptToSelection(promptId, selectedText = '', profileId = activeProfile()?.id || '') {
  const prompt = promptStore.get(promptId);
  if (!prompt) throw new Error('Prompt not found.');
  const profile = profileStore.get(profileId) || activeProfile();
  const text = expandPromptTemplate(prompt.template, {
    clipboard: selectedText || readClipboardSource('clipboard'),
    selection: selectedText || readClipboardSource('selection'),
    date: new Date().toLocaleDateString(),
    profile: profile?.name || '',
  });
  writeClipboardText(text);
  maybeStoreCapture(text, 'prompt', profile?.id || '');
  openQuickCaptureWithText(text, profile?.id || '');
  return true;
}

function contextMenuOptions(getWindow = () => mainWindow) {
  return {
    getWindow,
    isEnabled: () => settings.nativeContextMenu !== false,
    getPrompts: () => promptStore.list(),
    getProfiles: () => profileStore.getState().profiles,
    onQuickCapture: (text) => openQuickCaptureWithText(text),
    onApplyPrompt: (promptId, text) => void applyPromptToSelection(promptId, text),
    onAddCapture: (text) => {
      const result = maybeStoreCapture(text, 'context-menu');
      const message = result.saved ? 'Added to private capture history.' : 'Private capture history is disabled.';
      activityWindow?.showToast(message, { type: result.saved ? 'success' : 'info' });
    },
    onCommandPalette: showCommandPalette,
    onReportProblem: () => showPanel('report'),
    onToast: (message, type = 'info') => activityWindow?.showToast(message, { type }),
    onOpenProfileWindow: (profileId, url) => openProfileWindow(profileId, { url }),
    onOpenLink: async (url) => {
      const classification = classifyUrl(url);
      if (classification === 'app' || classification === 'auth') {
        focusMainWindow();
        if (!appView) createAppView();
        await loadApp(url);
      } else if (classification === 'external') await shell.openExternal(url);
    },
  };
}

function setFocusMode(enabled) {
  focusMode = enabled === true;
  if (!isAlive(mainWindow)) return { enabled: false };
  mainWindow.setAutoHideMenuBar(focusMode || settings.autoHideMenuBar);
  mainWindow.setMenuBarVisibility(!focusMode && !settings.autoHideMenuBar);
  mainWindow.setAlwaysOnTop(focusMode ? settings.focusAlwaysOnTop : settings.alwaysOnTop);
  activityWindow?.setSuppressed(focusMode || chromeMode !== 'app');
  findController?.close();
  rebuildMenus();
  sendToShell('focus:changed', { enabled: focusMode });
  return { enabled: focusMode };
}

function sendToShell(channel, payload) {
  if (isAlive(mainWindow) && !mainWindow.webContents.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

function contentBounds() {
  if (!isAlive(mainWindow)) return { width: 1280, height: 820 };
  const { width, height } = mainWindow.getContentBounds();
  return { width, height };
}

function layoutAppView() {
  if (!isAlive(mainWindow) || !appView) return;
  appView.setBounds(getAppViewBounds(contentBounds()));
  appView.setVisible(shouldShowAppView({ chromeMode, appRevealed, mainFrameLoadFailed }));
}

function setChromeMode(mode, payload = undefined) {
  chromeMode = mode;
  layoutAppView();
  activityWindow?.setSuppressed(focusMode || mode !== 'app');
  sendToShell('ui:show', { mode, payload });
}

function focusMainWindow() {
  if (!isAlive(mainWindow)) return;
  if (!appView) { createAppView(); void loadApp(); }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  activityWindow?.reposition();
  activityWindow?.setSuppressed(chromeMode !== 'app');
}

function toggleMainWindow() {
  if (!isAlive(mainWindow)) return;
  if (mainWindow.isVisible() && mainWindow.isFocused()) mainWindow.hide();
  else focusMainWindow();
}

function scheduleWindowStateSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { if (compactMode && normalWindowBounds) windowStateStore.writeBounds(normalWindowBounds, false); else windowStateStore.write(mainWindow); }, 250);
}

function applyTheme() {
  nativeTheme.themeSource = settings.theme;
  const motionMode = resolvedMotionMode();
  sendToShell('theme:changed', { source: settings.theme, dark: nativeTheme.shouldUseDarkColors, motionMode });
  activityWindow?.updateSettings();
}

function applyWindowSettings() {
  if (!isAlive(mainWindow)) return;
  mainWindow.setAlwaysOnTop(focusMode ? settings.focusAlwaysOnTop : settings.alwaysOnTop);
  mainWindow.setAutoHideMenuBar(focusMode || settings.autoHideMenuBar);
  mainWindow.setMenuBarVisibility(!focusMode && !settings.autoHideMenuBar);
}

function applyWebSettings() {
  if (!appView || appView.webContents.isDestroyed()) return;
  appView.webContents.setZoomFactor(settings.zoomFactor);
  appView.webContents.session.setSpellCheckerEnabled(settings.spellcheck);
  appView.webContents.setBackgroundThrottling(!shouldDisableBackgroundThrottling(settings));
  setExternalLinksEnabled(settings.externalLinks);
}

function applyAutostart() {
  if (SAFE_MODE) return;
  void setLinuxAutostart({
    enabled: settings.launchAtStartup,
    executable: process.execPath,
    appPath: app.getAppPath(),
    isPackaged: app.isPackaged,
  }).catch((error) => console.warn('[ChatDesk] Could not update autostart:', error.message));
}

function safelyRegisterShortcut(accelerator, callback) {
  try { return globalShortcut.register(accelerator, callback); }
  catch (error) { console.error(`Invalid global shortcut: ${accelerator}`, error); return false; }
}

function showCommandPalette() {
  showPanel('command');
}

function registerShortcuts(target = settings) {
  globalShortcut.unregisterAll();
  if (SAFE_MODE) {
    shortcutStatus = { mainShortcut: false, quickChatShortcut: false, commandPaletteShortcut: false, safeMode: true };
    return shortcutStatus;
  }
  const status = {
    mainShortcut: safelyRegisterShortcut(target.mainShortcut, toggleMainWindow),
    quickChatShortcut: safelyRegisterShortcut(target.quickChatShortcut, toggleQuickChat),
    commandPaletteShortcut: safelyRegisterShortcut(target.commandPaletteShortcut, showCommandPalette),
  };
  for (const workspace of workspaceStore.list()) {
    if (workspace.shortcut) status[`workspace:${workspace.id}`] = safelyRegisterShortcut(workspace.shortcut, () => void applyWorkspace(workspace.id));
  }
  for (const prompt of promptStore.list()) {
    if (prompt.shortcut) status[`prompt:${prompt.id}`] = safelyRegisterShortcut(prompt.shortcut, () => void copyExpandedPrompt(prompt.id, { openCapture: true }));
  }
  shortcutStatus = status;
  sendToShell('shortcuts:status', status);
  return status;
}

function stopStreamPowerProtection() {
  clearTimeout(streamPowerReleaseTimer);
  streamPowerReleaseTimer = null;
  if (streamPowerBlockerId !== null && powerSaveBlocker.isStarted(streamPowerBlockerId)) {
    powerSaveBlocker.stop(streamPowerBlockerId);
  }
  streamPowerBlockerId = null;
}

function refreshStreamPowerProtection() {
  clearTimeout(streamPowerReleaseTimer);
  streamPowerReleaseTimer = null;
  const enabled = !SAFE_MODE && settings.keepLongResponsesActive !== false;
  if (enabled && activeLongResponseRequests.size > 0) {
    if (streamPowerBlockerId === null || !powerSaveBlocker.isStarted(streamPowerBlockerId)) {
      streamPowerBlockerId = powerSaveBlocker.start('prevent-app-suspension');
      console.info('[ChatDesk] Long-response suspension protection started.');
    }
    return;
  }
  streamPowerReleaseTimer = setTimeout(() => {
    stopStreamPowerProtection();
    console.info('[ChatDesk] Long-response suspension protection stopped.');
  }, STREAM_POWER_RELEASE_MS);
  streamPowerReleaseTimer.unref?.();
}

function requestKey(details = {}) {
  return `${details.webContentsId || 0}:${details.id || 0}`;
}

function clearLongResponseRequestsForWebContents(webContentsId) {
  const prefix = `${Number(webContentsId) || 0}:`;
  for (const key of [...activeLongResponseRequests]) {
    if (key.startsWith(prefix)) activeLongResponseRequests.delete(key);
  }
  refreshStreamPowerProtection();
}

function handleObservedConnectionError(details = {}) {
  if (!isRecoverableConnectionError(details)) return;
  lastStreamError = {
    at: new Date().toISOString(),
    error: String(details.error || details.errorDescription || 'Unknown network error'),
    resourceType: details.resourceType || 'unknown',
    url: sanitizeUrlForLog(details.url || ''),
  };
  console.warn(`[ChatDesk] ChatGPT connection error: ${lastStreamError.error} (${lastStreamError.resourceType}) ${lastStreamError.url}`);
  if (settings.streamRecoveryAlerts !== false && details.webContentsId === appView?.webContents.id) {
    activityWindow?.showToast('The ChatGPT response stream was interrupted. The server may still finish the answer.', {
      type: 'error',
      duration: 0,
      actionLabel: 'Recover current chat',
      action: 'recover-chat',
    });
  }
}

function installStreamStabilityMonitor(targetSession) {
  if (!targetSession || monitoredSessions.has(targetSession)) return;
  monitoredSessions.add(targetSession);
  const filter = { urls: ['*://chatgpt.com/*', '*://*.chatgpt.com/*', '*://openai.com/*', '*://*.openai.com/*'] };
  targetSession.webRequest.onBeforeRequest(filter, (details, callback) => {
    if (isLongResponseRequest(details)) {
      activeLongResponseRequests.add(requestKey(details));
      refreshStreamPowerProtection();
    }
    callback({ cancel: false });
  });
  const finish = (details) => {
    activeLongResponseRequests.delete(requestKey(details));
    refreshStreamPowerProtection();
  };
  targetSession.webRequest.onCompleted(filter, finish);
  targetSession.webRequest.onErrorOccurred(filter, (details) => {
    finish(details);
    if (isObservedConnectionRequest(details)) handleObservedConnectionError(details);
  });
}

function clearUnresponsiveState({ recovered = false } = {}) {
  clearTimeout(unresponsiveTimer);
  unresponsiveTimer = null;
  const wasUnresponsive = rendererUnresponsive;
  rendererUnresponsive = false;
  if (recovered && wasUnresponsive && settings.streamRecoveryAlerts !== false) {
    activityWindow?.showToast('ChatGPT became responsive again. Your current conversation was preserved.', { type: 'success', duration: 3600 });
  }
}

function handleRendererUnresponsive() {
  if (rendererUnresponsive) return;
  rendererUnresponsive = true;
  console.warn('[ChatDesk] ChatGPT renderer became temporarily unresponsive; waiting before offering recovery.');
  if (settings.streamRecoveryAlerts !== false) {
    activityWindow?.showToast('ChatGPT is busy. ChatDesk is waiting without reloading your conversation.', {
      type: 'info',
      duration: 0,
      actionLabel: 'Recover now',
      action: 'recover-chat',
    });
  }
  unresponsiveTimer = setTimeout(() => {
    if (!rendererUnresponsive || settings.streamRecoveryAlerts === false) return;
    activityWindow?.showToast('ChatGPT is still not responding. Reload the current chat to retrieve any answer completed on the server.', {
      type: 'error',
      duration: 0,
      actionLabel: 'Recover current chat',
      action: 'recover-chat',
    });
  }, UNRESPONSIVE_GRACE_MS);
  unresponsiveTimer.unref?.();
}

async function recoverCurrentChat() {
  if (!appView || appView.webContents.isDestroyed()) return false;
  const currentUrl = appView.webContents.getURL() || APP_URL;
  clearUnresponsiveState();
  activeLongResponseRequests.clear();
  refreshStreamPowerProtection();
  activityWindow?.dismissToast();
  console.info(`[ChatDesk] Recovering current chat: ${sanitizeUrlForLog(currentUrl)}`);
  await loadApp(currentUrl);
  return true;
}

function clearLoadTimers() {
  clearTimeout(revealTimer);
  clearTimeout(failureTimer);
  revealTimer = null;
  failureTimer = null;
}

function showOffline(error = {}) {
  clearLoadTimers();
  mainFrameLoadFailed = true;
  appRevealed = false;
  lastFailure = {
    type: 'offline',
    code: error.errorCode ?? '',
    description: error.errorDescription || 'ChatDesk could not reach ChatGPT.',
    online: net.isOnline(),
  };
  console.warn('[ChatDesk] Load failed:', lastFailure.description);
  activityWindow?.setConnection('offline', lastFailure.description);
  setChromeMode('offline', lastFailure);
}

function showApp(reason = 'ready') {
  if (!appView || appView.webContents.isDestroyed() || mainFrameLoadFailed) return;
  clearLoadTimers();
  appRevealed = true;
  setChromeMode('app');
  const url = appView.webContents.getURL() || APP_URL;
  console.info(`[ChatDesk] Showing ChatGPT (${reason}): ${sanitizeUrlForLog(url)}`);
  sendToShell('app:ready', { url: sanitizeUrlForLog(url), reason });
  activityWindow?.setConnection('connected', tr()('ready'));
}

function scheduleReveal() {
  clearTimeout(revealTimer);
  revealTimer = setTimeout(() => showApp('timeout'), REVEAL_TIMEOUT_MS);
  clearTimeout(failureTimer);
  failureTimer = setTimeout(() => {
    if (!appRevealed && !mainFrameLoadFailed) showOffline({ errorDescription: 'ChatGPT did not become ready within 10 seconds.' });
  }, FAILURE_TIMEOUT_MS);
}

async function loadApp(url = APP_URL) {
  if (!appView || appView.webContents.isDestroyed()) createAppView();
  if (!appView || appView.webContents.isDestroyed()) return;
  startupViewLoaded = true;
  clearLoadTimers();
  mainFrameLoadFailed = false;
  appRevealed = false;
  setChromeMode(settings.animations && !SAFE_MODE ? 'splash' : 'loading');
  sendToShell('app:loading', true);
  activityWindow?.setConnection('connecting', tr()('connecting'));
  if (!net.isOnline()) return showOffline({ errorDescription: 'No internet connection was detected.' });
  scheduleReveal();
  try {
    await appView.webContents.loadURL(url);
    showApp('loadURL');
  } catch (error) {
    if (error?.code !== 'ERR_ABORTED') console.error('Failed to load ChatGPT:', error);
  }
}

async function recordCrash(details) {
  const record = {
    at: new Date().toISOString(),
    reason: details?.reason || details?.type || 'unknown',
    exitCode: details?.exitCode ?? '',
    profile: activeProfile()?.name || 'Unknown',
  };
  try { await fs.promises.writeFile(crashStatePath, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 }); } catch {}
  return record;
}

function showCrash(details) {
  clearLoadTimers();
  mainFrameLoadFailed = true;
  appRevealed = false;
  const record = {
    at: new Date().toISOString(),
    reason: details?.reason || details?.type || 'unknown',
    exitCode: details?.exitCode ?? '',
    profile: activeProfile()?.name || 'Unknown',
  };
  void recordCrash(details);
  lastFailure = { type: 'crash', ...record };
  console.error('[ChatDesk] Renderer failure:', record);
  setChromeMode('crash', record);
}

function destroyAppView() {
  findController?.close();
  clearUnresponsiveState();
  if (!appView) return;
  clearLongResponseRequestsForWebContents(appView.webContents.id);
  try { mainWindow?.contentView.removeChildView(appView); } catch {}
  try { if (!appView.webContents.isDestroyed()) appView.webContents.close(); } catch {}
  appView = null;
}

function createAppView() {
  destroyAppView();
  const profile = activeProfile();
  const partition = activePartition();
  appView = new WebContentsView({ webPreferences: getSecureWebPreferences(partition) });
  appView.setBackgroundColor('#202123');
  appView.setVisible(false);
  secureWebContents(appView.webContents);
  installStreamStabilityMonitor(appView.webContents.session);
  if (settings.nativeContextMenu !== false) installNativeContextMenu(appView.webContents, contextMenuOptions());
  appView.webContents.on('before-input-event', (event, input) => {
    const modifier = input.control || input.meta;
    if (modifier && input.key.toLowerCase() === 'f') { event.preventDefault(); findController?.open(); }
    else if (input.alt && input.key === 'Left') { event.preventDefault(); if (appView.webContents.navigationHistory.canGoBack()) appView.webContents.navigationHistory.goBack(); }
    else if (input.alt && input.key === 'Right') { event.preventDefault(); if (appView.webContents.navigationHistory.canGoForward()) appView.webContents.navigationHistory.goForward(); }
    else if (input.key === 'F11') { event.preventDefault(); setFocusMode(!focusMode); }
    else if (input.key === 'Escape' && focusMode) { event.preventDefault(); setFocusMode(false); }
  });
  mainWindow.contentView.addChildView(appView);
  layoutAppView();
  applyWebSettings();
  downloadManager?.attachSession(appView.webContents.session, profile?.name || 'Personal');

  appView.webContents.on('did-start-navigation', (_event, url, _inPlace, isMainFrame) => {
    if (!isMainFrame) return;
    mainFrameLoadFailed = false;
    console.info(`[ChatDesk] Navigating: ${sanitizeUrlForLog(url)}`);
    sendToShell('app:loading', true);
    activityWindow?.setConnection('connecting', tr()('loading'));
    scheduleReveal();
  });
  appView.webContents.on('dom-ready', () => showApp('dom-ready'));
  appView.webContents.on('did-stop-loading', () => { sendToShell('app:loading', false); showApp('did-stop-loading'); });
  appView.webContents.on('did-finish-load', () => { applyWebSettings(); showApp('did-finish-load'); });
  appView.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame || errorCode === -3) return;
    showOffline({ errorCode, errorDescription, validatedURL });
  });
  appView.webContents.on('render-process-gone', (_event, details) => { clearUnresponsiveState(); showCrash(details); });
  appView.webContents.on('unresponsive', handleRendererUnresponsive);
  appView.webContents.on('responsive', () => clearUnresponsiveState({ recovered: true }));
}

async function switchProfile(id) {
  const nextProfile = profileStore.get(id);
  if (!nextProfile) throw new Error('Profile not found.');
  setChromeMode('switching', { name: nextProfile.name, color: nextProfile.color, glyph: profileGlyph(nextProfile) });
  profileStore.setActive(id);
  createAppView();
  rebuildMenus();
  const state = profileStore.getState();
  sendToShell('profiles:changed', state);
  await loadApp();
  const message = tr()('switchedProfile', { name: activeProfile()?.name || 'profile' });
  activityWindow?.showToast(message, { type: 'success' });
  updateWindowIdentity();
  return state;
}

function openProfileWindow(profileId, options = {}) {
  focusMainWindow();
  const win = profileWindowManager?.open(profileId, options);
  if (!win) throw new Error('Could not open the profile window.');
  return { profileId, openProfiles: profileWindowManager.listOpen() };
}

async function copyExpandedPrompt(promptId, { openCapture = false, profileId = activeProfile()?.id || '' } = {}) {
  const prompt = promptStore.get(promptId);
  if (!prompt) throw new Error('Prompt not found.');
  const clipboardText = readClipboardSource('clipboard');
  const selection = readClipboardSource('selection');
  const profile = profileStore.get(profileId) || activeProfile();
  const text = expandPromptTemplate(prompt.template, {
    clipboard: clipboardText,
    selection: selection || clipboardText,
    date: new Date().toLocaleDateString(),
    profile: profile?.name || '',
  });
  if (!text) throw new Error('The expanded prompt is empty.');
  writeClipboardText(text);
  maybeStoreCapture(text, 'prompt', profile?.id || '');
  if (openCapture) {
    requestedQuickProfileId = profile?.id || '';
    toggleQuickChat({ forceShow: true });
  }
  activityWindow?.showToast(`Prompt copied: ${prompt.title}`, { type: 'success' });
  return { ok: true, text, title: prompt.title };
}

async function applyWorkspace(id) {
  const workspace = workspaceStore.get(id);
  if (!workspace) throw new Error('Workspace not found.');
  if (profileStore.get(workspace.profileId) && workspace.profileId !== activeProfile()?.id) await switchProfile(workspace.profileId);
  if (!SAFE_MODE) {
    settings = settingsStore.replace({
      ...settings,
      zoomFactor: workspace.zoomFactor,
      theme: workspace.theme,
      alwaysOnTop: workspace.alwaysOnTop,
      compactSide: workspace.compactSide,
    });
  }
  applyTheme();
  applyWindowSettings();
  applyWebSettings();
  if (isAlive(mainWindow) && !workspace.compact) {
    setCompactMode(false);
    animateBounds({ ...mainWindow.getBounds(), width: workspace.width, height: workspace.height });
  } else if (workspace.compact) setCompactMode(true, workspace.compactSide);
  if (workspace.startPage === 'new') await loadApp(APP_URL);
  rebuildMenus();
  sendToShell('settings:changed', publicSettings());
  activityWindow?.showToast(`Workspace applied: ${workspace.name}`, { type: 'success' });
  return workspace;
}

function updateWindowIdentity() {
  const title = `${activeProfileLabel()} — ChatDesk Linux${SAFE_MODE ? ' — Safe Mode' : ''}`;
  if (isAlive(mainWindow)) mainWindow.setTitle(title);
  if (tray) tray.setToolTip(title);
  activityWindow?.updateSettings();
}

function createProfile() {
  if (!isAlive(mainWindow)) return;
  void dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Add profile',
    message: 'Profile creation is available in Settings → Profiles.',
    detail: 'Open Settings and enter a profile name. Each profile has separate cookies and login data.',
    buttons: ['Open Settings', 'Cancel'],
    defaultId: 0,
    cancelId: 1,
  }).then(({ response }) => { if (response === 0) showPanel('settings', { focus: 'profiles' }); });
}

function showPanel(mode, payload = undefined) {
  focusMainWindow();
  setChromeMode(mode, payload);
}

function closePanel() {
  if (mainFrameLoadFailed) setChromeMode(lastFailure?.type === 'crash' ? 'crash' : 'offline', lastFailure);
  else if (appRevealed) setChromeMode('app');
  else setChromeMode(settings.animations && !SAFE_MODE ? 'splash' : 'loading');
}

function setZoom(next) {
  const zoomFactor = Math.min(1.5, Math.max(0.75, Math.round(next * 20) / 20));
  updateSettings({ zoomFactor });
}

function previewActivityCenter() {
  if (!appRevealed || mainFrameLoadFailed) return;
  setChromeMode('app');
  focusMainWindow();
  activityWindow?.showToast('Activity Center is ready.', { type: 'info', duration: 3600 });
}

function createApplicationMenu() {
  const t = tr();
  const profileState = profileStore.getState();
  const profileSubmenu = profileState.profiles.map((profile) => ({
    label: `${PROFILE_ICON_GLYPHS[profile.icon] || '●'} ${profile.name}`,
    type: 'radio',
    checked: profile.id === profileState.activeId,
    click: () => void switchProfile(profile.id),
  }));
  profileSubmenu.push({ type: 'separator' }, { label: t('manageProfiles'), click: () => showPanel('settings', { focus: 'profiles' }) });
  const profileWindowSubmenu = profileState.profiles.map((profile) => ({
    label: `${PROFILE_ICON_GLYPHS[profile.icon] || '●'} ${profile.name}`,
    click: () => openProfileWindow(profile.id),
  }));
  const workspaceSubmenu = workspaceStore.list().map((workspace) => ({
    label: workspace.name,
    accelerator: workspace.shortcut || undefined,
    click: () => void applyWorkspace(workspace.id),
  }));
  workspaceSubmenu.push({ type: 'separator' }, { label: 'Manage Workspaces…', click: () => showPanel('workspaces') });

  return Menu.buildFromTemplate([
    {
      label: t('file'),
      submenu: [
        { label: t('newChat'), accelerator: 'CommandOrControl+N', click: () => void loadApp(APP_URL) },
        { label: t('reload'), accelerator: 'CommandOrControl+R', click: () => appView?.webContents.reload() },
        { label: 'Recover Current Chat', accelerator: 'CommandOrControl+Shift+R', click: () => void recoverCurrentChat() },
        { label: 'Find in Conversation…', accelerator: 'CommandOrControl+F', click: () => findController?.open() },
        { label: 'Back', accelerator: 'Alt+Left', enabled: Boolean(appView?.webContents.navigationHistory.canGoBack()), click: () => appView?.webContents.navigationHistory.goBack() },
        { label: 'Forward', accelerator: 'Alt+Right', enabled: Boolean(appView?.webContents.navigationHistory.canGoForward()), click: () => appView?.webContents.navigationHistory.goForward() },
        { label: t('downloads'), accelerator: 'CommandOrControl+J', click: () => showPanel('downloads') },
        { label: 'Share Files…', click: async () => {
          const result = await dialog.showOpenDialog(mainWindow, { properties: ['openFile', 'multiSelections'] });
          if (!result.canceled) { const items = await stageSharedFiles(result.filePaths); if (items.length) showPanel('share'); }
        } },
        { label: 'Open Profile in New Window', submenu: profileWindowSubmenu },
        { type: 'separator' },
        { label: t('back'), accelerator: 'Escape', click: closePanel },
        { type: 'separator' },
        { label: t('quit'), role: 'quit' },
      ],
    },
    {
      label: t('view'),
      submenu: [
        { label: t('zoomIn'), accelerator: 'CommandOrControl+Plus', click: () => setZoom(settings.zoomFactor + 0.05) },
        { label: t('zoomOut'), accelerator: 'CommandOrControl+-', click: () => setZoom(settings.zoomFactor - 0.05) },
        { label: t('resetZoom'), accelerator: 'CommandOrControl+0', click: () => setZoom(1) },
        { type: 'separator' },
        { label: t('activity'), accelerator: 'CommandOrControl+Shift+A', enabled: !SAFE_MODE, click: previewActivityCenter },
        { label: compactMode ? 'Exit Compact Mode' : 'Compact Mode', accelerator: 'CommandOrControl+Shift+C', click: () => setCompactMode(!compactMode) },
        { label: 'Dock Compact Left', enabled: compactMode, click: () => setCompactMode(true, 'left') },
        { label: 'Dock Compact Right', enabled: compactMode, click: () => setCompactMode(true, 'right') },
        { type: 'separator' },
        { label: focusMode ? 'Exit Focus Mode' : 'Focus Mode', accelerator: 'F11', click: () => setFocusMode(!focusMode) },
        { role: 'togglefullscreen' },
        { type: 'separator' },
        { label: t('alwaysOnTop'), type: 'checkbox', checked: settings.alwaysOnTop, click: (item) => updateSettings({ alwaysOnTop: item.checked }) },
      ],
    },
    {
      label: t('tools'),
      submenu: [
        { label: t('commandPalette'), accelerator: 'CommandOrControl+Shift+P', click: showCommandPalette },
        { label: t('quickChat'), enabled: !SAFE_MODE, click: toggleQuickChat },
        { label: t('settings'), accelerator: 'CommandOrControl+,', click: () => showPanel('settings') },
        { label: t('profiles'), submenu: profileSubmenu },
        { label: 'Workspaces', submenu: workspaceSubmenu },
        { label: 'Prompt Library', click: () => showPanel('prompts') },
        { label: 'Recent Captures', click: () => showPanel('captures') },
        { label: 'Share Queue', click: () => showPanel('share') },
        { type: 'separator' },
        { label: t('diagnostics'), click: () => showPanel('diagnostics') },
        { label: 'Installation Health', click: () => showPanel('health') },
        { label: 'Log Viewer', click: () => showPanel('logs') },
        { type: 'separator' },
        { label: SAFE_MODE ? t('restartNormal') : t('restartSafe'), click: () => restartApplication(!SAFE_MODE) },
      ],
    },
    {
      label: t('help'),
      submenu: [
        { label: t('checkUpdates'), click: () => showPanel('about', { checkUpdates: true }) },
        { label: t('about'), click: () => showPanel('about') },
        { type: 'separator' },
        { label: t('github'), click: () => void shell.openExternal('https://github.com/MilMit/chatdesk-linux') },
        { label: 'Report a Problem…', click: () => showPanel('report') },
        { label: t('issue'), click: () => void shell.openExternal('https://github.com/MilMit/chatdesk-linux/issues') },
      ],
    },
  ]);
}

function rebuildMenus() {
  const menu = createApplicationMenu();
  Menu.setApplicationMenu(menu);
  if (isAlive(mainWindow)) mainWindow.setMenu(menu);
  refreshTrayMenu();
}

function refreshTrayMenu() {
  if (!tray) return;
  const t = tr();
  const summary = summarizeDownloads(downloadManager?.list() ?? []);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: t('openChatDesk'), click: focusMainWindow },
    { label: t('newChat'), click: () => void loadApp(APP_URL) },
    { label: t('commandPalette'), click: showCommandPalette },
    { label: t('quickChat'), click: toggleQuickChat },
    { label: summary.activeCount ? `${t('downloads')} (${summary.activeCount})` : t('downloads'), click: () => showPanel('downloads') },
    { label: t('settings'), click: () => showPanel('settings') },
    { label: t('activity'), click: previewActivityCenter },
    { type: 'separator' },
    { label: t('quit'), click: () => { quitting = true; app.quit(); } },
  ]));
}

function createTray() {
  if (SAFE_MODE || tray) return;
  const image = nativeImage.createFromPath(iconPath).resize({ width: 22, height: 22 });
  tray = new Tray(image);
  tray.setToolTip('ChatDesk Linux');
  tray.on('click', toggleMainWindow);
  refreshTrayMenu();
}

async function runUiSmokeTest() {
  const fail = (message) => {
    console.error(`UI_SMOKE_TEST_FAILED: ${message}`);
    quitting = true;
    app.exit(1);
  };
  try {
    const bridgeVersion = await mainWindow.webContents.executeJavaScript('window.chatdesk?.bridgeVersion ?? 0');
    if (bridgeVersion !== 4) return fail(`preload bridge version was ${bridgeVersion}`);
    const diagnostics = await mainWindow.webContents.executeJavaScript("window.chatdesk.invoke('diagnostics:get')");
    if (!diagnostics?.appVersion) return fail('diagnostics IPC did not return app data');
    const clipboardOk = await mainWindow.webContents.executeJavaScript("window.chatdesk.invoke('clipboard:test')");
    if (clipboardOk !== true) return fail('clipboard IPC test did not complete');
    setChromeMode('settings');
    await new Promise((resolve) => setTimeout(resolve, 80));
    const settingsVisible = await mainWindow.webContents.executeJavaScript("!document.getElementById('settingsContent').classList.contains('hidden')");
    if (!settingsVisible) return fail('settings panel did not open');
    setChromeMode('command');
    await new Promise((resolve) => setTimeout(resolve, 80));
    const commandVisible = await mainWindow.webContents.executeJavaScript("!document.getElementById('commandContent').classList.contains('hidden') && Boolean(document.getElementById('commandSearch'))");
    if (!commandVisible) return fail('Command Palette did not open');
    setChromeMode('onboarding');
    await new Promise((resolve) => setTimeout(resolve, 80));
    const onboardingVisible = await mainWindow.webContents.executeJavaScript("!document.getElementById('onboardingContent').classList.contains('hidden')");
    if (!onboardingVisible) return fail('onboarding did not open');
    console.info('UI_SMOKE_TEST_OK');
    quitting = true;
    app.exit(0);
  } catch (error) {
    fail(error?.stack || error?.message || String(error));
  }
}

function createMainWindow() {
  const state = windowStateStore.read(screen.getAllDisplays());
  const startInTray = settings.startupMode === 'tray' && !SAFE_MODE && !UI_SMOKE_TEST;
  mainWindow = new BrowserWindow({
    ...state.bounds,
    minWidth: 800,
    minHeight: 600,
    show: false,
    frame: true,
    autoHideMenuBar: settings.autoHideMenuBar,
    backgroundColor: '#111318',
    icon: iconPath,
    title: SAFE_MODE ? 'ChatDesk Linux — Safe Mode' : 'ChatDesk Linux',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
      preload: shellPreloadPath,
    },
  });

  mainWindow.webContents.on('preload-error', (_event, preloadPath, error) => console.error(`[ChatDesk] Shell preload failed: ${preloadPath}`, error));
  mainWindow.webContents.on('console-message', (_event, details) => { if (details.level === 'error') console.error(`[ChatDesk] Shell renderer: ${details.message}`); });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  if (settings.nativeContextMenu !== false) installNativeContextMenu(mainWindow.webContents, contextMenuOptions(() => mainWindow));

  findController = new FindController({
    htmlPath: findPath, preloadPath: findPreloadPath, iconPath,
    getTarget: () => appView?.webContents || null,
    getParent: () => mainWindow,
  });

  if (!startInTray) createAppView();
  activityWindow = new ActivityWindow({
    parent: mainWindow,
    htmlPath: activityPath,
    preloadPath: activityPreloadPath,
    iconPath,
    safeMode: SAFE_MODE,
    getSettings: () => settings,
    getDark: () => nativeTheme.shouldUseDarkColors,
    getLanguage: resolvedLanguage,
    getProfile: activeProfile,
  });
  mainWindow.on('resize', () => { layoutAppView(); activityWindow?.reposition(); scheduleWindowStateSave(); });
  mainWindow.on('move', () => { activityWindow?.reposition(); scheduleWindowStateSave(); });
  mainWindow.on('minimize', () => activityWindow?.hide());
  mainWindow.on('hide', () => activityWindow?.hide());
  mainWindow.on('show', () => activityWindow?.setSuppressed(chromeMode !== 'app'));
  mainWindow.on('close', (event) => {
    if (compactMode && normalWindowBounds) windowStateStore.writeBounds(normalWindowBounds, false); else windowStateStore.write(mainWindow);
    if (!quitting && settings.minimizeToTray && !SAFE_MODE) {
      event.preventDefault();
      mainWindow.hide();
      return;
    }
    quitting = true;
  });
  mainWindow.on('closed', () => { findController?.close(); findController = null; activityWindow?.destroy(); activityWindow = null; destroyAppView(); mainWindow = null; });

  mainWindow.webContents.once('did-finish-load', () => {
    applyTheme();
    applyWindowSettings();
    sendToShell('settings:changed', publicSettings());
    sendToShell('profiles:changed', profileStore.getState());
    const shouldShowAtStartup = !startInTray || !settings.onboardingComplete;
    if (shouldShowAtStartup) mainWindow.show();
    if (shouldShowAtStartup && state.maximized) mainWindow.maximize();
    updateWindowIdentity();
    if (UI_SMOKE_TEST) {
      void runUiSmokeTest();
      return;
    }
    if (!settings.onboardingComplete && !SAFE_MODE) setChromeMode('onboarding');
    else if (!startInTray) {
      void loadApp().then(() => { if (settings.startupMode === 'compact') setCompactMode(true, settings.compactSide); });
    }
    updateDownloadIndicators();
    handleCommandLine(process.argv);
    scheduleAutomaticUpdateCheck();
  });
  void mainWindow.loadFile(shellPath);
}

function createQuickChatWindow() {
  if (SAFE_MODE) return;
  quickChatWindow = new BrowserWindow({
    width: 760,
    height: 390,
    minWidth: 620,
    minHeight: 340,
    show: false,
    frame: false,
    transparent: true,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: '#00000000',
    icon: iconPath,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: false, preload: quickChatPreloadPath },
  });
  quickChatWindow.webContents.on('preload-error', (_event, preloadPath, error) => console.error(`[ChatDesk] Quick Capture preload failed: ${preloadPath}`, error));
  quickChatWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  quickChatWindow.on('closed', () => { quickChatWindow = null; });
  void quickChatWindow.loadFile(quickChatPath);
}

function toggleQuickChat({ forceShow = false, profileId = '' } = {}) {
  if (SAFE_MODE) return;
  if (profileId) requestedQuickProfileId = profileId;
  if (!isAlive(quickChatWindow)) createQuickChatWindow();
  if (!isAlive(quickChatWindow)) return;
  if (quickChatWindow.isVisible() && !forceShow) quickChatWindow.hide();
  else { quickChatWindow.center(); quickChatWindow.show(); quickChatWindow.focus(); }
}

function readLastCrash() {
  try {
    const parsed = JSON.parse(fs.readFileSync(crashStatePath, 'utf8'));
    return `${parsed.at} — ${parsed.reason}`;
  } catch { return ''; }
}

function diagnosticsData() {
  return {
    appName: 'ChatDesk Linux',
    appVersion: app.getVersion(),
    electron: process.versions.electron,
    chromium: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform,
    arch: process.arch,
    desktop: desktopEnvironment(),
    display: displayProtocol(),
    safeMode: SAFE_MODE,
    online: net.isOnline(),
    profile: activeProfile()?.name || 'Unknown',
    session: activePartition(),
    url: appView ? sanitizeUrlForLog(appView.webContents.getURL() || APP_URL) : APP_URL,
    hardwareAcceleration: app.isHardwareAccelerationEnabled(),
    activityCenter: SAFE_MODE ? 'Disabled in Safe Mode' : settings.activityPopups ? 'Enabled' : 'Disabled',
    logFile: logPath,
    lastCrash: readLastCrash(),
    clipboardWrite: 'Allowed for trusted ChatGPT pages and native ChatDesk actions',
    compactMode: compactMode ? `Enabled (${settings.compactSide})` : 'Off',
    protocol: protocolRegistered ? 'chatdesk:// registered' : 'Not registered or source mode',
    openProfileWindows: profileWindowManager?.listOpen().join(', ') || 'None',
    clipboardHistory: settings.clipboardHistoryEnabled ? `Enabled (${captureStore?.list().length || 0} items; ${captureStore?.protection || 'not initialized'})` : 'Disabled',
    longResponseProtection: settings.keepLongResponsesActive === false ? 'Disabled' : 'Enabled',
    backgroundThrottling: appView?.webContents.getBackgroundThrottling() ? 'Enabled' : 'Disabled for long responses',
    rendererState: rendererUnresponsive ? 'Temporarily unresponsive' : 'Responsive',
    activeLongResponseRequests: activeLongResponseRequests.size,
    streamPowerProtection: streamPowerBlockerId !== null && powerSaveBlocker.isStarted(streamPowerBlockerId) ? 'Active' : 'Idle',
    lastStreamError: lastStreamError ? `${lastStreamError.at} — ${lastStreamError.error} — ${lastStreamError.resourceType}` : 'None recorded',
  };
}

async function performanceData() {
  const profileStates = profileWindowManager?.listWindowStates() || [];
  const windows = [mainWindow, ...profileStates.filter((item) => item.visible)];
  const hiddenWindows = profileStates.filter((item) => !item.visible || item.minimized);
  return collectPerformanceReport({
    targetSession: appView?.webContents.session || session.fromPartition(activePartition()),
    startupStartedAt: APP_START_AT,
    windows,
    hiddenWindows,
    memorySaverMinutes: settings.memorySaverMinutes,
  });
}

async function cacheData() {
  const targetSession = appView?.webContents.session || session.fromPartition(activePartition());
  let size = 0;
  try { size = await targetSession.getCacheSize(); } catch {}
  return { bytes: size, profile: activeProfile()?.name || 'Unknown' };
}

async function clearCacheKind(kind = 'http') {
  const targetSession = appView?.webContents.session || session.fromPartition(activePartition());
  if (kind === 'code') await targetSession.clearCodeCaches({});
  else if (kind === 'session') {
    await targetSession.clearStorageData();
    if (appView) await loadApp();
  } else await targetSession.clearCache();
  return cacheData();
}

function publicSettings() {
  return {
    ...settings,
    version: app.getVersion(),
    versions: { electron: process.versions.electron, chromium: process.versions.chrome, node: process.versions.node },
    hardwareAccelerationActive: app.isHardwareAccelerationEnabled(),
    safeMode: SAFE_MODE,
    resolvedLanguage: resolvedLanguage(),
    compactMode,
    openProfileWindows: profileWindowManager?.listOpen() ?? [],
    resolvedMotionMode: resolvedMotionMode(),
    focusMode,
  };
}

function updateSettings(patch) {
  const previous = settings;
  const candidate = sanitizeSettings({ ...settings, ...patch, ...(patch.motionMode ? { animations: patch.motionMode !== 'off' } : {}) });
  if (!SAFE_MODE && (previous.mainShortcut !== candidate.mainShortcut || previous.quickChatShortcut !== candidate.quickChatShortcut || previous.commandPaletteShortcut !== candidate.commandPaletteShortcut)) {
    const old = settings;
    settings = candidate;
    const status = registerShortcuts(candidate);
    if (!status.mainShortcut || !status.quickChatShortcut || !status.commandPaletteShortcut) {
      settings = old;
      registerShortcuts(old);
      throw new Error('That shortcut is invalid, duplicated, or already used by another application.');
    }
  }
  settings = SAFE_MODE ? settings : settingsStore.replace(candidate);
  captureStore.maxItems = settings.clipboardHistoryLimit;
  const restartRequired = previous.hardwareAcceleration !== settings.hardwareAcceleration;
  applyTheme();
  applyWindowSettings();
  applyWebSettings();
  profileWindowManager?.applySettings();
  applyAutostart();
  activityWindow?.updateSettings();
  updateWindowIdentity();
  rebuildMenus();
  scheduleAutomaticUpdateCheck();
  const response = { ...publicSettings(), restartRequired };
  sendToShell('settings:changed', response);
  return response;
}

async function performUpdateCheck({ automatic = false } = {}) {
  const result = await checkForUpdates(app.getVersion());
  if (!SAFE_MODE) {
    settings = settingsStore.replace({ ...settings, lastUpdateCheckAt: new Date().toISOString() });
    sendToShell('settings:changed', publicSettings());
  }
  if (automatic && result.status === 'available') {
    activityWindow?.showToast(tr()('updateAvailable', { version: result.latestVersion }), {
      type: 'info', duration: 9000, actionLabel: tr()('checkUpdates'), action: 'update',
    });
  }
  return result;
}

function scheduleAutomaticUpdateCheck() {
  clearTimeout(automaticUpdateTimer);
  automaticUpdateTimer = null;
  if (SAFE_MODE || UI_SMOKE_TEST || settings.autoCheckUpdates === false) return;
  const last = Date.parse(settings.lastUpdateCheckAt || '');
  const elapsed = Number.isFinite(last) ? Date.now() - last : UPDATE_CHECK_INTERVAL_MS;
  const delay = elapsed >= UPDATE_CHECK_INTERVAL_MS ? UPDATE_STARTUP_DELAY_MS : Math.max(60_000, UPDATE_CHECK_INTERVAL_MS - elapsed);
  automaticUpdateTimer = setTimeout(async () => {
    try { await performUpdateCheck({ automatic: true }); }
    catch (error) { console.warn('[ChatDesk] Automatic update check failed:', error.message); }
    scheduleAutomaticUpdateCheck();
  }, delay);
}


function commandCatalog() {
  const favoriteSet = new Set(settings.favoriteCommands || []);
  const recentMap = new Map((settings.recentCommands || []).map((id, index) => [id, index]));
  const core = [
    ['new-chat', 'New Chat', 'Start a clean ChatGPT conversation', 'Chat', 'Ctrl+N', '＋'],
    ['reload', 'Reload ChatGPT', 'Reload the current ChatGPT page', 'Chat', 'Ctrl+R', '↻'],
    ['quick-chat', 'Quick Capture', 'Capture selection or clipboard and prepare a prompt', 'Capture', settings.quickChatShortcut, '✦'],
    ['compact', compactMode ? 'Exit Compact Mode' : 'Compact Mode', 'Dock a narrow always-on-top ChatDesk window', 'Window', 'Ctrl+Shift+C', '▯'],
    ['find', 'Find in Conversation', 'Search the current ChatGPT conversation', 'Chat', 'Ctrl+F', '⌕'],
    ['focus', focusMode ? 'Exit Focus Mode' : 'Focus Mode', 'Hide local chrome and distractions', 'Window', 'F11', '◉'],
    ['performance', 'Performance Monitor', 'Inspect process memory, CPU and cache use', 'Support', '', '⌁'],
    ['settings', 'Settings', 'Open ChatDesk settings', 'System', 'Ctrl+,', '⚙'],
    ['downloads', 'Downloads', 'View local download activity', 'System', 'Ctrl+J', '↓'],
    ['prompts', 'Prompt Library', 'Manage reusable local prompt templates', 'Power Tools', '', '✎'],
    ['workspaces', 'Workspaces', 'Apply saved profile and window presets', 'Power Tools', '', '▦'],
    ['captures', 'Recent Captures', 'View opt-in local capture history', 'Power Tools', '', '◫'],
    ['share', 'Share Queue', 'Stage files to use with ChatGPT', 'Power Tools', '', '⇧'],
    ['health', 'Installation Health', 'Check sandbox, protocol, storage and shortcuts', 'Support', '', '♥'],
    ['logs', 'Log Viewer', 'Inspect sanitized local application logs', 'Support', '', '≡'],
    ['report', 'Report a Problem', 'Prepare a privacy-safe issue report', 'Support', '', '!'],
    ['diagnostics', 'Diagnostics', 'View runtime and session information', 'Support', '', 'i'],
    ['about', 'About', 'Version and update information', 'System', '', 'M'],
    ['check-updates', 'Check for Updates', 'Check GitHub Releases', 'System', '', '⇩'],
    ['activity', 'Activity Center', 'Preview animated activity cards', 'System', 'Ctrl+Shift+A', '●'],
    ['safe-mode', SAFE_MODE ? 'Restart Normally' : 'Restart in Safe Mode', 'Restart with optional features disabled', 'Support', '', '◇'],
  ].map(([id, label, description, category, shortcut, glyph]) => ({ id, key: id, label, description, category, shortcut, glyph }));

  const dynamic = [];
  for (const profile of profileStore.getState().profiles) {
    dynamic.push({ id: 'profile', profileId: profile.id, key: `profile:${profile.id}`, label: `Switch profile: ${profile.name}`, description: 'Use this profile in the main window', category: 'Profiles', shortcut: '', glyph: profileGlyph(profile) });
    dynamic.push({ id: 'profile-window', profileId: profile.id, key: `profile-window:${profile.id}`, label: `Open profile window: ${profile.name}`, description: 'Open an independent ChatGPT window with isolated cookies', category: 'Profiles', shortcut: '', glyph: '□' });
  }
  for (const workspace of workspaceStore.list()) dynamic.push({ id: 'workspace', workspaceId: workspace.id, key: `workspace:${workspace.id}`, label: `Workspace: ${workspace.name}`, description: `Profile ${workspace.profileId} • ${workspace.compact ? 'compact' : `${workspace.width}×${workspace.height}`}`, category: 'Workspaces', shortcut: workspace.shortcut, glyph: '▦' });
  for (const prompt of promptStore.list()) dynamic.push({ id: 'prompt', promptId: prompt.id, key: `prompt:${prompt.id}`, label: `Prompt: ${prompt.title}`, description: prompt.category, category: 'Prompts', shortcut: prompt.shortcut, glyph: prompt.favorite ? '★' : '✎' });

  return [...core, ...dynamic].map((item) => ({
    ...item,
    favorite: favoriteSet.has(item.key),
    recentRank: recentMap.has(item.key) ? recentMap.get(item.key) : 999,
  }));
}

function toggleCommandFavorite(key) {
  const value = String(key || '');
  if (!value) return commandCatalog();
  const favorite = new Set(settings.favoriteCommands || []);
  if (favorite.has(value)) favorite.delete(value); else favorite.add(value);
  settings = SAFE_MODE ? settings : settingsStore.replace({ ...settings, favoriteCommands: [...favorite] });
  sendToShell('settings:changed', publicSettings());
  return commandCatalog();
}

async function runCommand(payload = {}) {
  const id = String(payload.id || '');
  rememberCommand(payload);
  if (id === 'profile') return { profiles: await switchProfile(payload.profileId) };
  if (id === 'profile-window') return openProfileWindow(payload.profileId);
  if (id === 'workspace') return { workspace: await applyWorkspace(payload.workspaceId) };
  if (id === 'prompt') return copyExpandedPrompt(payload.promptId, { openCapture: true });
  if (id === 'new-chat') { closePanel(); await loadApp(APP_URL); return true; }
  if (id === 'reload') { closePanel(); appView?.webContents.reload(); return true; }
  if (id === 'quick-chat') { closePanel(); toggleQuickChat({ forceShow: true }); return true; }
  if (id === 'compact') { closePanel(); return setCompactMode(!compactMode); }
  if (id === 'find') { closePanel(); return findController?.open() || false; }
  if (id === 'focus') { closePanel(); return setFocusMode(!focusMode); }
  if (id === 'performance') { showPanel('diagnostics', { focus: 'performance' }); return true; }
  if (['settings', 'downloads', 'diagnostics', 'about', 'prompts', 'workspaces', 'captures', 'logs', 'health', 'share', 'report'].includes(id)) { showPanel(id); return true; }
  if (id === 'check-updates') { showPanel('about', { checkUpdates: true }); return true; }
  if (id === 'activity') { closePanel(); previewActivityCenter(); return true; }
  if (id === 'safe-mode') { restartApplication(!SAFE_MODE); return true; }
  throw new Error('Unknown command.');
}

function restartApplication(safeMode = false) {
  const args = process.argv.slice(1).filter((arg) => arg !== '--safe-mode');
  if (safeMode) args.push('--safe-mode');
  app.relaunch({ args });
  quitting = true;
  app.exit(0);
}

function isTrustedSender(event) {
  return event.sender === mainWindow?.webContents || event.sender === quickChatWindow?.webContents || activityWindow?.isSender(event.sender) || findController?.isSender(event.sender);
}

function registerIpc() {
  ipcMain.handle('settings:get', (event) => { if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender.'); return publicSettings(); });
  ipcMain.handle('settings:update', (event, patch) => { if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender.'); return updateSettings(patch ?? {}); });
  ipcMain.handle('settings:choose-download-folder', async (event) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender.');
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory', 'createDirectory'] });
    if (result.canceled || !result.filePaths[0]) return settings.downloadPath;
    return updateSettings({ downloadPath: result.filePaths[0] }).downloadPath;
  });
  ipcMain.handle('settings:clear-cache', async (event) => { if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender.'); await appView.webContents.session.clearCache(); return true; });
  ipcMain.handle('settings:clear-session', async (event) => { if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender.'); await appView.webContents.session.clearStorageData(); await loadApp(); return true; });
  ipcMain.handle('settings:export', async (event) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender.');
    const result = await dialog.showSaveDialog(mainWindow, { defaultPath: 'chatdesk-settings.json', filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (result.canceled || !result.filePath) return false;
    await fs.promises.writeFile(result.filePath, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
    return true;
  });
  ipcMain.handle('settings:import', async (event) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender.');
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (result.canceled || !result.filePaths[0]) return publicSettings();
    const parsed = JSON.parse(await fs.promises.readFile(result.filePaths[0], 'utf8'));
    return updateSettings(parsed);
  });
  ipcMain.handle('settings:factory-reset', async (event) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender.');
    settings = settingsStore.reset();
    captureStore.clear();
    promptStore.reset();
    workspaceStore.reset();
    shareQueue.clear();
    await appView.webContents.session.clearStorageData();
    restartApplication(false);
    return true;
  });
  ipcMain.handle('profiles:get', (event) => { if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender.'); return profileStore.getState(); });
  ipcMain.handle('profiles:open-window', (event, profileId) => { if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender.'); return openProfileWindow(profileId); });
  ipcMain.handle('profiles:add', async (event, name) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender.');
    const state = profileStore.add(name); await switchProfile(state.activeId); return state;
  });
  ipcMain.handle('profiles:update', (event, payload = {}) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender.');
    const state = profileStore.update(payload.id, payload);
    rebuildMenus();
    updateWindowIdentity();
    sendToShell('profiles:changed', state);
    return state;
  });
  ipcMain.handle('profiles:switch', async (event, id) => { if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender.'); await switchProfile(id); return profileStore.getState(); });
  ipcMain.handle('profiles:remove', async (event, id) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender.');
    const partition = partitionForProfile(id);
    const state = profileStore.remove(id);
    try { await session.fromPartition(partition).clearStorageData(); } catch (error) { console.warn('Could not clear deleted profile storage:', error); }
    await switchProfile(state.activeId);
    return state;
  });
  ipcMain.handle('downloads:list', (event) => { if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender.'); return downloadManager.list(); });
  ipcMain.handle('downloads:clear-history', (event) => { if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender.'); return downloadManager.clearHistory(); });
  ipcMain.handle('download:action', (event, payload) => { if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender.'); return downloadManager.action(payload?.id, payload?.action); });
  ipcMain.handle('diagnostics:get', (event) => { if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender.'); const data = diagnosticsData(); return { ...data, text: formatDiagnostics(data) }; });
  ipcMain.handle('diagnostics:copy', (event) => { if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender.'); return writeClipboardText(formatDiagnostics(diagnosticsData())); });
  ipcMain.handle('performance:get', async (event) => { if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender.'); return performanceData(); });
  ipcMain.handle('performance:copy', async (event) => { if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender.'); writeClipboardText(formatPerformanceReport(await performanceData())); return true; });
  ipcMain.handle('cache:get', async (event) => { if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender.'); return cacheData(); });
  ipcMain.handle('cache:clear', async (event, kind) => { if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender.'); return clearCacheKind(kind); });
  ipcMain.handle('focus:get', (event) => { if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender.'); return { enabled: focusMode }; });
  ipcMain.handle('focus:toggle', (event, enabled) => { if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender.'); return setFocusMode(enabled === undefined ? !focusMode : enabled === true); });
  ipcMain.handle('clipboard:test', (event) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender.');
    const sample = `ChatDesk clipboard test — ${new Date().toISOString()}`;
    writeClipboardText(sample);
    if (clipboard.readText('clipboard') !== sample) throw new Error(tr()('clipboardFailed'));
    return true;
  });
  ipcMain.handle('diagnostics:open-logs', async (event) => { if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender.'); await shell.openPath(logDirectory); return true; });
  ipcMain.handle('update:check', (event) => { if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender.'); return performUpdateCheck(); });
  ipcMain.handle('command:execute', async (event, payload) => { if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender.'); return runCommand(payload); });
  ipcMain.handle('command:list', (event) => { if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender.'); return commandCatalog(); });
  ipcMain.handle('command:favorite', (event, key) => { if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender.'); return toggleCommandFavorite(key); });
  ipcMain.handle('compact:get', (event) => { if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender.'); return { enabled: compactMode, side: settings.compactSide }; });
  ipcMain.handle('compact:toggle', (event, enabled) => { if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender.'); return setCompactMode(enabled === undefined ? !compactMode : enabled === true); });
  ipcMain.handle('compact:dock', (event, side) => { if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender.'); return setCompactMode(true, side === 'left' ? 'left' : 'right'); });

  ipcMain.handle('workspaces:list', (event) => { if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender.'); return workspaceStore.list(); });
  ipcMain.handle('workspaces:save', (event, payload) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender.');
    const result = workspaceStore.save(payload); registerShortcuts(); rebuildMenus(); sendToShell('power:changed', { type: 'workspaces', items: result }); return result;
  });
  ipcMain.handle('workspaces:remove', (event, id) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender.');
    const result = workspaceStore.remove(id); registerShortcuts(); rebuildMenus(); sendToShell('power:changed', { type: 'workspaces', items: result }); return result;
  });
  ipcMain.handle('workspaces:apply', async (event, id) => { if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender.'); return applyWorkspace(id); });

  ipcMain.handle('prompts:list', (event) => { if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender.'); return promptStore.list(); });
  ipcMain.handle('prompts:save', (event, payload) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender.');
    const result = promptStore.save(payload); registerShortcuts(); sendToShell('power:changed', { type: 'prompts', items: result }); return result;
  });
  ipcMain.handle('prompts:remove', (event, id) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender.');
    const result = promptStore.remove(id); registerShortcuts(); sendToShell('power:changed', { type: 'prompts', items: result }); return result;
  });
  ipcMain.handle('prompts:favorite', (event, id) => { if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender.'); const result = promptStore.toggleFavorite(id); sendToShell('power:changed', { type: 'prompts', items: result }); return result; });
  ipcMain.handle('prompts:copy', (event, id) => { if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender.'); return copyExpandedPrompt(id); });

  ipcMain.handle('captures:list', (event) => { if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender.'); return { enabled: settings.clipboardHistoryEnabled, protection: captureStore.protection, items: captureStore.list() }; });
  ipcMain.handle('captures:remove', (event, id) => { if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender.'); return captureStore.remove(id); });
  ipcMain.handle('captures:clear', (event) => { if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender.'); return captureStore.clear(); });
  ipcMain.handle('captures:copy', (event, id) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender.');
    const item = captureStore.list().find((entry) => entry.id === id); if (!item) throw new Error('Capture not found.'); writeClipboardText(item.text); return true;
  });

  ipcMain.handle('logs:list', async (event, options) => { if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender.'); return listLogLines(options || {}); });
  ipcMain.handle('logs:copy', async (event, options) => { if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender.'); writeClipboardText((await listLogLines(options || {})).join('\n')); return true; });
  ipcMain.handle('logs:export', async (event, options) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender.');
    const result = await dialog.showSaveDialog(mainWindow, { defaultPath: 'chatdesk-sanitized.log', filters: [{ name: 'Log file', extensions: ['log', 'txt'] }] });
    if (result.canceled || !result.filePath) return false; await fs.promises.writeFile(result.filePath, `${(await listLogLines(options || {})).join('\n')}\n`, { mode: 0o600 }); return true;
  });
  ipcMain.handle('logs:clear', async (event) => { if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender.'); await fs.promises.mkdir(logDirectory, { recursive: true }); await fs.promises.writeFile(logPath, '', { mode: 0o600 }); return true; });

  ipcMain.handle('health:run', async (event) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender.');
    return runHealthChecks({ userDataPath, sandboxPath, shortcutStatus, protocolRegistered, profilePartition: activePartition() });
  });
  ipcMain.handle('issue:prepare', async (event) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender.');
    const health = await runHealthChecks({ userDataPath, sandboxPath, shortcutStatus, protocolRegistered, profilePartition: activePartition() });
    return formatIssueReport({ diagnostics: diagnosticsData(), health, logs: await listLogLines({ limit: 120 }) });
  });
  ipcMain.handle('issue:copy', async (event) => { if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender.'); const health = await runHealthChecks({ userDataPath, sandboxPath, shortcutStatus, protocolRegistered, profilePartition: activePartition() }); writeClipboardText(formatIssueReport({ diagnostics: diagnosticsData(), health, logs: await listLogLines({ limit: 120 }) })); return true; });
  ipcMain.handle('issue:save', async (event) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender.');
    const health = await runHealthChecks({ userDataPath, sandboxPath, shortcutStatus, protocolRegistered, profilePartition: activePartition() });
    const report = formatIssueReport({ diagnostics: diagnosticsData(), health, logs: await listLogLines({ limit: 120 }) });
    const result = await dialog.showSaveDialog(mainWindow, { defaultPath: 'chatdesk-issue-report.md', filters: [{ name: 'Markdown', extensions: ['md'] }] });
    if (result.canceled || !result.filePath) return false; await fs.promises.writeFile(result.filePath, `${report}\n`, { mode: 0o600 }); return true;
  });
  ipcMain.handle('issue:open', async (event) => { if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender.'); await shell.openExternal('https://github.com/MilMit/chatdesk-linux/issues/new?template=bug_report.yml'); return true; });

  ipcMain.handle('share:stage', async (event, filePaths) => { if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender.'); return stageSharedFiles(filePaths); });
  ipcMain.handle('share:list', (event) => { if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender.'); return serializeShareQueue(); });
  ipcMain.handle('share:remove', (event, id) => { if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender.'); shareQueue.delete(id); return serializeShareQueue(); });
  ipcMain.handle('share:clear', (event) => { if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender.'); shareQueue.clear(); return []; });
  ipcMain.handle('share:copy-paths', (event) => { if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender.'); writeClipboardText(serializeShareQueue().map((item) => item.path).join('\n')); return true; });
  ipcMain.handle('share:show-file', (event, id) => { if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender.'); const item = shareQueue.get(id); if (!item) return false; shell.showItemInFolder(item.path); return true; });

  ipcMain.handle('onboarding:complete', async (event, payload = {}) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender.');
    settings = settingsStore.replace({ ...settings, language: payload.language || settings.language, onboardingComplete: true });
    applyTheme();
    rebuildMenus();
    sendToShell('settings:changed', publicSettings());
    await loadApp();
    scheduleAutomaticUpdateCheck();
    return publicSettings();
  });
  ipcMain.handle('external:open', async (event, url) => { if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender.'); const parsed = new URL(url); if (parsed.protocol !== 'https:') throw new Error('Only HTTPS URLs are allowed.'); await shell.openExternal(parsed.href); return true; });
  ipcMain.handle('quick-chat:bootstrap', (event) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender.');
    const clipboardText = readClipboardSource('clipboard');
    const selection = readClipboardSource('selection');
    const profileState = profileStore.getState();
    return {
      language: resolvedLanguage(),
      requestedProfileId: requestedQuickProfileId,
      clipboard: requestedQuickText || clipboardText,
      selection: requestedQuickText || selection,
      profiles: { ...profileState, profiles: profileState.profiles.map((profile) => ({ ...profile, glyph: profileGlyph(profile) })) },
      prompts: promptStore.list().map((prompt) => ({
        ...prompt,
        preview: expandPromptTemplate(prompt.template, { clipboard: requestedQuickText || clipboardText, selection: requestedQuickText || selection || clipboardText, date: new Date().toLocaleDateString(), profile: activeProfile()?.name || '' }),
      })),
    };
  });
  ipcMain.handle('quick-chat:capture', (event, source) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender.');
    return { source: source === 'selection' ? 'selection' : 'clipboard', text: readClipboardSource(source) };
  });
  ipcMain.handle('quick-chat:submit', async (event, payload = {}) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender.');
    const normalized = String(payload.text ?? '').trim().slice(0, 20_000);
    if (!normalized) return { ok: false, message: 'Enter some text to capture.' };
    const profileId = profileStore.get(payload.profileId) ? payload.profileId : activeProfile()?.id;
    writeClipboardText(normalized);
    maybeStoreCapture(normalized, payload.promptId ? 'prompt' : 'manual', profileId);
    quickChatWindow?.hide();
    requestedQuickProfileId = '';
    requestedQuickText = '';
    if (payload.destination === 'window') openProfileWindow(profileId, { newChat: true });
    else {
      if (profileId && profileId !== activeProfile()?.id) await switchProfile(profileId);
      focusMainWindow();
      if (payload.destination === 'new') await loadApp(APP_URL);
    }
    const message = tr()('promptCopied');
    activityWindow?.showToast(message, { type: 'success' });
    sendToShell('toast:show', { message, type: 'success' });
    return { ok: true };
  });

  ipcMain.on('ui:close', (event) => { if (isTrustedSender(event)) closePanel(); });
  ipcMain.on('app:retry', (event) => { if (isTrustedSender(event)) void loadApp(); });
  ipcMain.on('app:reload', (event) => { if (isTrustedSender(event)) appView?.webContents.reload(); });
  ipcMain.on('app:new-chat', (event) => { if (isTrustedSender(event)) void loadApp(APP_URL); });
  ipcMain.on('app:restart', (event, safeMode) => { if (isTrustedSender(event)) restartApplication(safeMode === true); });
  ipcMain.on('quick-chat:open', (event) => { if (isTrustedSender(event)) toggleQuickChat(); });
  ipcMain.on('quick-chat:close', (event) => { if (isTrustedSender(event)) quickChatWindow?.hide(); });
  ipcMain.on('activity:command', (event, payload = {}) => {
    if (!activityWindow?.isSender(event.sender)) return;
    if (payload.type === 'download') downloadManager?.action(payload.id, payload.action);
    if (payload.type === 'dismiss-download') activityWindow.dismissDownload(payload.id);
    if (payload.type === 'dismiss-toast') activityWindow.dismissToast();
    if (payload.type === 'open-downloads') showPanel('downloads');
    if (payload.type === 'retry') void loadApp();
    if (payload.type === 'diagnostics') showPanel('diagnostics');
    if (payload.type === 'toast-action' && payload.action === 'downloads') showPanel('downloads');
    if (payload.type === 'toast-action' && payload.action === 'update') showPanel('about', { checkUpdates: true });
    if (payload.type === 'toast-action' && payload.action === 'recover-chat') void recoverCurrentChat();
  });
}

function updateDownloadIndicators(items = downloadManager?.list() ?? []) {
  const summary = summarizeDownloads(items);
  if (isAlive(mainWindow)) {
    mainWindow.setProgressBar(summary.activeCount ? (summary.indeterminate ? 2 : summary.progress) : -1);
    const progressLabel = summary.indeterminate ? 'active' : `${Math.round(summary.progress * 100)}%`;
    const suffix = summary.activeCount ? ` — ${summary.activeCount} download${summary.activeCount === 1 ? '' : 's'} (${progressLabel})` : '';
    mainWindow.setTitle(`${activeProfileLabel()} — ChatDesk Linux${SAFE_MODE ? ' — Safe Mode' : ''}${suffix}`);
  }
  if (tray && summary.activeCount !== lastActiveDownloadCount) {
    tray.setToolTip(summary.activeCount ? `${activeProfileLabel()} — ${summary.activeCount} active download${summary.activeCount === 1 ? '' : 's'}` : `${activeProfileLabel()} — ChatDesk Linux`);
    lastActiveDownloadCount = summary.activeCount;
    refreshTrayMenu();
  }
}

function handleDownloadUpdate(item, items) {
  activityWindow?.updateDownload(item);
  updateDownloadIndicators(items);
}

async function handleDeepLink(value) {
  const action = parseDeepLink(value);
  if (!action) return false;
  focusMainWindow();
  if (action.type === 'new-chat') {
    if (action.profileId && profileStore.get(action.profileId)) await switchProfile(action.profileId);
    await loadApp(APP_URL);
  }
  if (action.type === 'quick-capture') toggleQuickChat({ forceShow: true, profileId: action.profileId });
  if (action.type === 'profile-window') openProfileWindow(action.profileId);
  if (action.type === 'workspace') await applyWorkspace(action.workspaceId);
  if (action.type === 'panel') showPanel(action.panel);
  return true;
}

function handleCommandLine(argv = []) {
  const deepLink = findDeepLink(argv);
  if (deepLink) void handleDeepLink(deepLink);
  const sharedFiles = collectSharedFiles(argv.slice(1));
  if (sharedFiles.length) { void stageSharedFiles(sharedFiles).then((items) => { if (items.length) showPanel('share'); }); }
  if (argv.includes('--new-chat')) void loadApp(APP_URL);
  if (argv.includes('--quick-chat')) toggleQuickChat({ forceShow: true });
  if (argv.includes('--downloads')) showPanel('downloads');
  if (argv.includes('--settings')) showPanel('settings');
  if (argv.includes('--diagnostics')) showPanel('diagnostics');
  if (argv.includes('--command-palette')) showCommandPalette();
  if (argv.includes('--prompts')) showPanel('prompts');
  if (argv.includes('--workspaces')) showPanel('workspaces');
  if (argv.includes('--health')) showPanel('health');
  if (argv.includes('--share')) showPanel('share');
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();
else {
  app.on('second-instance', (_event, argv) => { focusMainWindow(); handleCommandLine(argv); });
  app.on('open-url', (event, url) => { event.preventDefault(); void handleDeepLink(url); });
  app.whenReady().then(() => {
    console.info(`[ChatDesk] Starting ${app.getVersion()}${SAFE_MODE ? ' in safe mode' : ''}`);
    nativeTheme.themeSource = settings.theme;
    if (settings.startupMode === 'personal' && profileStore.get('personal')) profileStore.setActive('personal');
    setExternalLinksEnabled(settings.externalLinks);
    downloadManager = new DownloadManager({
      historyPath: path.join(userDataPath, 'download-history.json'),
      getSettings: () => settings,
      send: sendToShell,
      onUpdate: handleDownloadUpdate,
    });
    profileWindowManager = new ProfileWindowManager({
      statePath: path.join(userDataPath, 'profile-window-state.json'),
      iconPath,
      appUrl: APP_URL,
      profileStore,
      downloadManager,
      getSettings: () => settings,
      contextMenuOptions: () => contextMenuOptions(),
      prepareSession: installStreamStabilityMonitor,
      onWebContentsDestroyed: clearLongResponseRequestsForWebContents,
    });
    protocolRegistered = registerDeepLinkProtocol();
    captureStore = new CaptureStore(path.join(userDataPath, 'captures.json'), {
      maxItems: settings.clipboardHistoryLimit,
      codec: createCaptureProtectionCodec(),
    });
    registerIpc();
    createMainWindow();
    findController?.registerIpc(isTrustedSender);
    createTray();
    applyAutostart();
    registerShortcuts();
    rebuildMenus();
    nativeTheme.on('updated', applyTheme);
  }).catch((error) => { console.error('Application startup failed:', error); app.quit(); });

  app.on('activate', focusMainWindow);
  app.on('before-quit', (event) => {
    quitting = true;
    clearTimeout(automaticUpdateTimer);
    clearUnresponsiveState();
    activeLongResponseRequests.clear();
    stopStreamPowerProtection();
    profileWindowManager?.closeAll();
    if (persistenceFlushed || flushingQuit) return;
    event.preventDefault();
    flushingQuit = true;
    void flushPersistentState().finally(() => {
      persistenceFlushed = true;
      app.quit();
    });
  });
  app.on('will-quit', () => globalShortcut.unregisterAll());
  app.on('window-all-closed', () => { if (quitting || SAFE_MODE || !settings.minimizeToTray) app.quit(); });
  process.on('uncaughtException', (error) => console.error('Uncaught exception:', error));
  process.on('unhandledRejection', (error) => console.error('Unhandled rejection:', error));
}
