'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const INVOKE_CHANNELS = new Set([
  'settings:get', 'settings:update', 'settings:choose-download-folder', 'settings:clear-cache',
  'settings:clear-session', 'settings:export', 'settings:import', 'settings:factory-reset',
  'profiles:get', 'profiles:add', 'profiles:update', 'profiles:switch', 'profiles:remove', 'profiles:open-window',
  'downloads:list', 'downloads:clear-history', 'download:action',
  'diagnostics:get', 'diagnostics:copy', 'diagnostics:open-logs', 'clipboard:test',
  'update:check', 'external:open', 'command:execute', 'command:list', 'command:favorite',
  'onboarding:complete', 'compact:get', 'compact:toggle', 'compact:dock',
  'workspaces:list', 'workspaces:save', 'workspaces:remove', 'workspaces:apply',
  'prompts:list', 'prompts:save', 'prompts:remove', 'prompts:favorite', 'prompts:copy',
  'captures:list', 'captures:remove', 'captures:clear', 'captures:copy',
  'logs:list', 'logs:copy', 'logs:export', 'logs:clear',
  'health:run', 'issue:prepare', 'issue:copy', 'issue:save', 'issue:open',
  'share:stage', 'share:list', 'share:remove', 'share:clear', 'share:copy-paths', 'share:show-file',
]);
const SEND_CHANNELS = new Set(['ui:close', 'app:retry', 'app:reload', 'app:new-chat', 'app:restart', 'quick-chat:open']);
const RECEIVE_CHANNELS = new Set([
  'ui:show', 'app:ready', 'app:offline', 'app:loading', 'theme:changed', 'settings:changed',
  'profiles:changed', 'shortcuts:status', 'download:update', 'toast:show', 'power:changed',
]);

function requireAllowed(channel, allowed, operation) {
  if (!allowed.has(channel)) throw new Error(`Blocked ${operation} IPC channel: ${String(channel)}`);
}

contextBridge.exposeInMainWorld('chatdesk', Object.freeze({
  bridgeVersion: 4,
  invoke(channel, payload) {
    requireAllowed(channel, INVOKE_CHANNELS, 'invoke');
    return ipcRenderer.invoke(channel, payload);
  },
  send(channel, payload) {
    requireAllowed(channel, SEND_CHANNELS, 'send');
    ipcRenderer.send(channel, payload);
  },
  on(channel, callback) {
    requireAllowed(channel, RECEIVE_CHANNELS, 'receive');
    if (typeof callback !== 'function') throw new TypeError('IPC listener must be a function.');
    const wrapped = (_event, payload) => callback(payload);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  },
  pathForFile(file) {
    return webUtils.getPathForFile(file);
  },
}));
