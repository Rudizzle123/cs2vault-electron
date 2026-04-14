/**
 * preload.js
 * Exposes a safe, minimal API to the renderer via contextBridge.
 * The renderer never has access to Node.js directly.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cs2vault', {

  // ── Storage (replaces localStorage) ─────────────────────────────────────
  store: {
    get:    (key)         => ipcRenderer.invoke('store:get', key),
    set:    (key, value)  => ipcRenderer.invoke('store:set', key, value),
    delete: (key)         => ipcRenderer.invoke('store:delete', key),
  },

  // ── HTTP fetch (replaces fetch() for external APIs) ──────────────────────
  // Returns { ok, status, body } where body is a raw string — parse JSON yourself
  fetch: (url, headers) => ipcRenderer.invoke('fetch:get', url, headers),

  // ── Native OS notifications ───────────────────────────────────────────────
  notify: (title, body) => ipcRenderer.invoke('notify', title, body),

  // ── App metadata ─────────────────────────────────────────────────────────
  version:  () => ipcRenderer.invoke('app:version'),
  userData: () => ipcRenderer.invoke('app:userData'),

  // ── File export dialog ────────────────────────────────────────────────────
  exportSave: (filename, content) => ipcRenderer.invoke('export:save', filename, content),

  // ── File import dialog ────────────────────────────────────────────────────
  importOpen: () => ipcRenderer.invoke('import:open'),

  // ── Auto-updater ──────────────────────────────────────────────────────────
  updater: {
    check:   () => ipcRenderer.invoke('updater:check'),
    install: () => ipcRenderer.invoke('updater:install'),
    onStatus:   (cb) => ipcRenderer.on('updater:status', (_e, ...args) => cb(...args)),
    onProgress: (cb) => ipcRenderer.on('updater:progress', (_e, pct) => cb(pct)),
  },

  // ── Platform detection ────────────────────────────────────────────────────
  platform: process.platform,

});
