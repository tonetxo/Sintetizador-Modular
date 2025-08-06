// preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  savePatch: (patch) => ipcRenderer.invoke('save-patch', patch),
  loadPatch: () => ipcRenderer.invoke('load-patch'),
  loadPatchFromFile: (filePath) => ipcRenderer.invoke('load-patch-from-file', filePath),
  onRequestLoadPatch: (callback) => ipcRenderer.on('request-load-patch', callback),
  onRequestSavePatch: (callback) => ipcRenderer.on('request-save-patch', callback),
  logMessage: (message) => ipcRenderer.invoke('log-message', message),
  // ***** CORRECCIÓN APLICADA: Volvemos a .invoke *****
  decodeAudioFile: (filePath, moduleId) => ipcRenderer.invoke('decode-audio-file', { filePath, moduleId }),
  onDecodeComplete: (callback) => ipcRenderer.on('decode-complete', callback),
  onLoadTemplatePatch: (callback) => ipcRenderer.on('load-template-patch', (event, templateName) => callback(templateName))
});