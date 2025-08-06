// main.js
const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
let decoderWindow;

// Promise to resolve when the decoder window is ready
let decoderReadyPromise = null;

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
    decoderWindow.webContents.openDevTools();
    decoderWindow.on('closed', () => { decoderWindow = null; });

    // Setup the promise that resolves when the decoder is ready
    decoderReadyPromise = new Promise(resolve => {
        ipcMain.once('decoder-ready', () => {
            console.log('[Main] Decoder window is ready.');
            resolve();
        });
    });
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
          { label: 'Load Patch', accelerator: 'CmdOrCtrl+L', click: () => { mainWindow.webContents.send('request-load-patch'); } },
          { label: 'Save Patch', accelerator: 'CmdOrCtrl+S', click: () => { mainWindow.webContents.send('request-save-patch'); } },
          { type: 'separator' },
          { role: 'quit' }
        ]
      },
      { label: 'Edit', submenu: [ { role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' } ] },
      { label: 'View', submenu: [ { role: 'reload' }, { role: 'forcereload' }, { role: 'toggledevtools' }, { type: 'separator' }, { role: 'resetzoom' }, { role: 'zoomin' }, { role: 'zoomout' }, { type: 'separator' }, { role: 'togglefullscreen' } ] },
      {
        label: 'Help',
        submenu: [
          {
            label: 'Plantillas',
            submenu: [
              { label: 'Sinte 1', click: () => { mainWindow.webContents.send('load-template-patch', 'sinte_1.json'); } },
              { label: 'Sinte 2', click: () => { mainWindow.webContents.send('load-template-patch', 'sinte_2.json'); } },
              { label: 'Arpegios', click: () => { mainWindow.webContents.send('load-template-patch', 'arpegios.json'); } }
            ]
          },
          {
            label: 'Versión',
            click: () => {
              const packageJson = require('./package.json');
              dialog.showMessageBox(mainWindow, {
                type: 'info',
                title: 'Versión',
                message: `Versión: ${packageJson.version}`
              });
            }
          },
          {
            label: 'Ayuda',
            click: () => {
              dialog.showMessageBox(mainWindow, {
                type: 'info',
                title: 'Ayuda',
                message: 'Crea módulos haciendo clic derecho en el lienzo. Conecta los módulos arrastrando desde las salidas a las entradas. Elimina módulos o conexiones seleccionándolos y pulsando la tecla Supr.'
              });
            }
          }
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
    return new Promise((resolve, reject) => {
        decoderReadyPromise.then(() => {
            try {
                if (!decoderWindow) {
                    throw new Error('La ventana de decodificación no está disponible.');
                }

                const onDecodeResult = (event, result) => {
                    if (result.moduleId === moduleId) {
                        ipcMain.removeListener('decode-result', onDecodeResult);
                        if (result.success) {
                            resolve(result);
                        } else {
                            reject(new Error(result.error));
                        }
                    }
                };

                ipcMain.on('decode-result', onDecodeResult);

                const audioData = fs.readFileSync(filePath);
                // Send the raw buffer; Electron will handle the transfer efficiently.
                decoderWindow.webContents.send('decode-request', {
                    audioData: audioData,
                    moduleId
                });

            } catch (error) {
                console.error(`[Main] Error en handle 'decode-audio-file':`, error);
                reject(error);
            }
        }).catch(reject); // Captura errores de la promesa decoderReadyPromise
    });
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
