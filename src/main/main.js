// src/main/main.js
const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron');
const path = require('path');
const fsp = require('fs').promises;
const fs = require('fs');

let mainWindow;
let decoderWindow;

function createDecoderWindow() {
    if (decoderWindow) return;
    decoderWindow = new BrowserWindow({
        show: false,
        webPreferences: {
            preload: path.join(__dirname, '../decoder/preload-decoder.js'),
        }
    });
    decoderWindow.loadFile(path.join(__dirname, '../decoder/decoder.html'));
    decoderWindow.on('closed', () => { decoderWindow = null; });
}

function createMainWindow() {
    mainWindow = new BrowserWindow({
        width: 1600,
        height: 900,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            sandbox: false,
        },
        backgroundColor: '#1e1e1e'
    });
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
    
    if (process.env.NODE_ENV !== 'production') {
        mainWindow.webContents.openDevTools();
    }
    mainWindow.on('closed', () => {
        app.quit();
    });

    const isMac = process.platform === 'darwin';
    const menuTemplate = [
        ...(isMac ? [{ label: app.name, submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'services' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] }] : []),
        { label: 'File', submenu: [{ label: 'Save Patch', accelerator: 'CmdOrCtrl+S', click: () => mainWindow.webContents.send('request-save-patch') }, { label: 'Load Patch', accelerator: 'CmdOrCtrl+O', click: () => mainWindow.webContents.send('request-load-patch') }, isMac ? { role: 'close' } : { role: 'quit' }] },
        { label: 'Edit', submenu: [{ label: 'Undo', accelerator: 'CmdOrCtrl+Z', click: () => mainWindow.webContents.send('request-undo') }, { label: 'Redo', accelerator: 'Shift+CmdOrCtrl+Z', click: () => mainWindow.webContents.send('request-redo') }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }] },
        { label: 'View', submenu: [{ role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }] }
    ];
    const menu = Menu.buildFromTemplate(menuTemplate);
    Menu.setApplicationMenu(menu);
}

app.whenReady().then(() => {
    createMainWindow();
    createDecoderWindow();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
});

ipcMain.on('request-audio-file', async (event, moduleId) => {
    try {
        // --- CORRECCIÓN ---
        // No pasar 'mainWindow' como padre del diálogo para evitar un deadlock en ciertas plataformas.
        const result = await dialog.showOpenDialog({
            properties: ['openFile'],
            filters: [{ name: 'Audio', extensions: ['wav', 'mp3', 'ogg', 'flac'] }]
        });

        if (result.canceled || result.filePaths.length === 0) {
            return;
        }

        const filePath = result.filePaths[0];
        const audioData = await fsp.readFile(filePath);
        
        if (decoderWindow) {
            decoderWindow.webContents.send('decode-request', { audioData, moduleId });
        }
    } catch (error) {
        console.error('Error handling audio file request:', error);
        if (mainWindow) {
            mainWindow.webContents.send('audio-decode-error', { moduleId, error: error.message });
        }
    }
});

ipcMain.on('decode-result', (event, result) => {
    if (mainWindow) {
        mainWindow.webContents.send('audio-decoded', result);
    }
});

ipcMain.handle('save-patch-dialog', async (event, patchData) => {
    // --- CORRECCIÓN --- No pasar 'mainWindow' como padre.
    const { filePath } = await dialog.showSaveDialog({
        title: 'Save Patch',
        defaultPath: 'my-patch.json',
        filters: [{ name: 'JSON Files', extensions: ['json'] }]
    });
    if (filePath) {
        try {
            await fsp.writeFile(filePath, patchData);
            return { success: true };
        } catch(e) { return { success: false, error: e.message }; }
    }
    return { success: false, canceled: true };
});

ipcMain.handle('load-patch-dialog', async (event) => {
    // --- CORRECCIÓN --- No pasar 'mainWindow' como padre.
    const { filePaths } = await dialog.showOpenDialog({
        title: 'Load Patch',
        properties: ['openFile'],
        filters: [{ name: 'JSON Files', extensions: ['json'] }]
    });
    if (filePaths && filePaths.length > 0) {
        try {
            const data = await fsp.readFile(filePaths[0], 'utf-8');
            return { success: true, data: JSON.parse(data) };
        } catch(e) { return { success: false, error: e.message }; }
    }
    return { success: false, canceled: true };
});