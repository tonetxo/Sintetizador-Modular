const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1600,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    backgroundColor: '#333333'
  });

  mainWindow.loadFile('index.html');

  // Abrir las herramientas de desarrollo automáticamente
  mainWindow.webContents.openDevTools();

  mainWindow.webContents.on('did-finish-load', () => {
    const menuTemplate = [
      {
        label: 'File',
        submenu: [
          {
            label: 'Load Patch',
            accelerator: 'CmdOrCtrl+L',
            click: () => {
              mainWindow.webContents.send('request-load-patch');
            }
          },
          {
            label: 'Save Patch',
            accelerator: 'CmdOrCtrl+S',
            click: () => {
              mainWindow.webContents.send('request-save-patch');
            }
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

  return mainWindow;
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('save-patch', async (event, patch) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  const { canceled, filePath } = await dialog.showSaveDialog(window, {
    title: 'Guardar Patch',
    defaultPath: 'patch.json',
    filters: [{ name: 'JSON Files', extensions: ['json'] }]
  });

  if (canceled || !filePath) {
    return { success: false };
  }

  try {
    fs.writeFileSync(filePath, JSON.stringify(patch, null, 2));
    return { success: true, path: filePath };
  } catch (error) {
    console.error('Error guardando el patch:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('load-patch', async (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  const { canceled, filePaths } = await dialog.showOpenDialog(window, {
    title: 'Cargar Patch',
    properties: ['openFile'],
    filters: [{ name: 'JSON Files', extensions: ['json'] }]
  });

  if (canceled || filePaths.length === 0) {
    return { success: false };
  }

  return loadPatchFromFile(filePaths[0]);
});

ipcMain.handle('load-patch-from-file', async (event, filePath) => {
    return loadPatchFromFile(filePath);
});

function loadPatchFromFile(filePath) {
    try {
        const absolutePath = path.resolve(__dirname, filePath);
        const patchData = JSON.parse(fs.readFileSync(absolutePath, 'utf-8'));
        return { success: true, data: patchData };
    } catch (error) {
        console.error(`Error cargando el patch desde ${filePath}:`, error);
        return { success: false, error: error.message };
    }
}
