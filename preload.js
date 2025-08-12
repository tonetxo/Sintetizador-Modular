// preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  savePatch: (patch) => ipcRenderer.invoke('save-patch', patch),
  loadPatch: () => ipcRenderer.invoke('load-patch'),
  loadPatchFromFile: (filePath) => ipcRenderer.invoke('load-patch-from-file', filePath),
  onRequestLoadPatch: (callback) => ipcRenderer.on('request-load-patch', callback),
  onRequestSavePatch: (callback) => ipcRenderer.on('request-save-patch', callback),
  logMessage: (message) => ipcRenderer.invoke('log-message', message),
  saveRecording: (buffer) => ipcRenderer.invoke('save-recording', buffer),
  openAudioFileDialog: () => ipcRenderer.invoke('open-audio-file-dialog'),
  // ***** CORRECCIÓN APLICADA: Cambiamos a 'send' para un flujo basado en eventos *****
  decodeAudioFile: (filePath, moduleId) => ipcRenderer.send('decode-audio-file', { filePath, moduleId }),
  onDecodeComplete: (callback) => ipcRenderer.on('decode-complete', (event, result) => callback(result)),
  onLoadTemplatePatch: (callback) => ipcRenderer.on('load-template-patch', (event, templateName) => callback(templateName))
});