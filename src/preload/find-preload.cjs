'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('chatdeskFind', Object.freeze({
  query: (payload) => ipcRenderer.invoke('find:query', payload),
  close: () => ipcRenderer.send('find:close'),
  onOpen: (callback) => ipcRenderer.on('find:open', (_event, payload) => callback(payload)),
  onResult: (callback) => ipcRenderer.on('find:result', (_event, payload) => callback(payload)),
}));
