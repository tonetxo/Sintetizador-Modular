const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
let decoderWindow;

function createDecoderWindow() {
    decoderWindow = new BrowserWindow({
        show: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload-decoder.js'),
            nodeIntegration: false,
            contextIsolation: true
        }
    });
    decoderWindow.loadFile('decoder.html');
    decoderWindow.webContents.openDevTools(); // Habilitar DevTools para depuración
    decoderWindow.on('closed', () => { decoderWindow = null; });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    backgroundColor: '#333333'
  });

  // mainWindow.loadFile('index.html'); // Moved to app.whenReady()
  mainWindow.webContents.openDevTools();

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (decoderWindow) {
      decoderWindow.close();
      decoderWindow = null;
    }
  });

  mainWindow.webContents.on('did-finish-load', () => {
    const menuTemplate = [
      {
        label: 'File',
        submenu: [
          {
            label: 'Load Patch',
            accelerator: 'CmdOrCtrl+L',
            click: () => { mainWindow.webContents.send('request-load-patch'); }
          },
          {
            label: 'Save Patch',
            accelerator: 'CmdOrCtrl+S',
            click: () => { mainWindow.webContents.send('request-save-patch'); }
          },
          { type: 'separator' },
          { role: 'quit' }
        ]
      },
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
        ]
      },
      {
        label: 'View',
        submenu: [
          { role: 'reload' },
          { role: 'forcereload' },
          { role: 'toggledevtools' },
          { type: 'separator' },
          { role: 'resetzoom' },
          { role: 'zoomin' },
          { role: 'zoomout' },
          { type: 'separator' },
          { role: 'togglefullscreen' }
        ]
      }
    ];

    const menu = Menu.buildFromTemplate(menuTemplate);
    Menu.setApplicationMenu(menu);
  });
}

app.whenReady().then(() => {
  createWindow();
  createDecoderWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  ipcMain.handle('decode-audio-file', (event, { filePath, moduleId }) => {
    try {
        const audioData = fs.readFileSync(filePath);
        if (decoderWindow) {
            decoderWindow.webContents.send('decode-request', { audioData, moduleId });
        }
    } catch (error) {
        mainWindow.webContents.send('decode-complete', { success: false, moduleId, error: error.message });
    }
  });

  ipcMain.on('decode-result', (event, result) => {
    if (mainWindow) {
        mainWindow.webContents.send('decode-complete', result);
    }
  });

  ipcMain.handle('save-patch', async (event, patch) => {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Guardar Patch',
      defaultPath: 'patch.json',
      filters: [{ name: 'JSON Files', extensions: ['json'] }]
    });
    if (canceled || !filePath) return { success: false };
    try {
      fs.writeFileSync(filePath, JSON.stringify(patch, null, 2));
      return { success: true, path: filePath };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('load-patch', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Cargar Patch',
      properties: ['openFile'],
      filters: [{ name: 'JSON Files', extensions: ['json'] }]
    });
    if (canceled || filePaths.length === 0) return { success: false };
    return loadPatchFromFile(filePaths[0]);
  });

  ipcMain.handle('load-patch-from-file', (event, filePath) => {
      return loadPatchFromFile(filePath);
  });

  ipcMain.handle('log-message', (event, message) => {
    const logFilePath = path.join(app.getPath('userData'), 'app.log');
    fs.appendFileSync(logFilePath, `[${new Date().toISOString()}] ${message}\n`);
  });

  // Load the main window content AFTER all IPC handlers are registered
  mainWindow.loadFile('index.html');
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

function loadPatchFromFile(filePath) {
    try {
        const absolutePath = path.resolve(__dirname, filePath);
        const patchData = JSON.parse(fs.readFileSync(absolutePath, 'utf-8'));
        return { success: true, data: patchData };
    } catch (error) {
        return { success: false, error: error.message };
    }
}
