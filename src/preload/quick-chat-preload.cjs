'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('quickChat', Object.freeze({
  bootstrap() { return ipcRenderer.invoke('quick-chat:bootstrap'); },
  capture(source) { return ipcRenderer.invoke('quick-chat:capture', source); },
  submit(payload) { return ipcRenderer.invoke('quick-chat:submit', payload); },
  close() { ipcRenderer.send('quick-chat:close'); },
}));
