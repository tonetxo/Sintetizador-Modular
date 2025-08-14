// src/main/preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    // --- CORRECCIÓN --- Cambiado a un método no bloqueante 'send'
    requestAudioFile: (moduleId) => ipcRenderer.send('request-audio-file', moduleId),
    
    savePatch: (patchData) => ipcRenderer.invoke('save-patch-dialog', patchData),
    loadPatch: () => ipcRenderer.invoke('load-patch-dialog'),
    
    on: (channel, callback) => {
        const validChannels = [
            'audio-decoded',
            'audio-decode-error', // Escuchar posibles errores
            'request-save-patch', 
            'request-load-patch',
            'request-undo',
            'request-redo'
        ];
        if (validChannels.includes(channel)) {
            ipcRenderer.on(channel, (event, ...args) => callback(...args));
        }
    }
});