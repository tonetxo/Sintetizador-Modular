const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('decoderAPI', {
  onDecodeRequest: (callback) => ipcRenderer.on('decode-request', callback),
  sendDecodeResult: (result) => ipcRenderer.send('decode-result', result)
});