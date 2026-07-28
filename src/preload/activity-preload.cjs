'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const RECEIVE_CHANNELS = new Set(['activity:state']);
const SEND_CHANNELS = new Set(['activity:command']);

contextBridge.exposeInMainWorld('chatdeskActivity', Object.freeze({
  bridgeVersion: 1,
  on(channel, callback) {
    if (!RECEIVE_CHANNELS.has(channel)) throw new Error(`Blocked activity receive channel: ${String(channel)}`);
    if (typeof callback !== 'function') throw new TypeError('Activity listener must be a function.');
    const wrapped = (_event, payload) => callback(payload);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  },
  send(channel, payload) {
    if (!SEND_CHANNELS.has(channel)) throw new Error(`Blocked activity send channel: ${String(channel)}`);
    ipcRenderer.send(channel, payload);
  },
}));
