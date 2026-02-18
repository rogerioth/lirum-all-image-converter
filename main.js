const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
let logWindow = null;

// Store logs in main process for sharing between windows
const MAX_LOGS = 1000;
let sharedLogs = [];

// Store last saved file path for "show in folder" feature
let lastSavedFilePath = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 600,
    minWidth: 700,
    minHeight: 450,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    titleBarStyle: 'hiddenInset',
    show: false
  });

  mainWindow.loadFile('index.html');

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    // Close log window if main window closes
    if (logWindow) {
      logWindow.close();
    }
  });

  // Create application menu
  createApplicationMenu();
}

function createLogWindow() {
  if (logWindow) {
    logWindow.focus();
    return;
  }

  logWindow = new BrowserWindow({
    width: 800,
    height: 500,
    minWidth: 500,
    minHeight: 300,
    parent: mainWindow,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    title: 'Application Logs - Lirum',
    icon: path.join(__dirname, 'assets/icon.png')
  });

  logWindow.loadFile('log-window.html');

  logWindow.on('closed', () => {
    logWindow = null;
  });

  // Handle log window IPC
  ipcMain.on('log-window-ready', () => {
    // Send existing logs to log window
    if (logWindow && !logWindow.isDestroyed()) {
      logWindow.webContents.send('log-batch', sharedLogs);
    }
  });

  ipcMain.on('close-log-window', () => {
    if (logWindow && !logWindow.isDestroyed()) {
      logWindow.close();
    }
  });

  ipcMain.on('clear-logs', () => {
    sharedLogs = [];
    if (logWindow && !logWindow.isDestroyed()) {
      logWindow.webContents.send('log-cleared');
    }
    // Also notify main window
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('logs-cleared');
    }
  });

  ipcMain.on('logs-exported', () => {
    console.log('Logs exported from log window');
  });
}

// Function to add log from renderer processes
function addLog(logEntry) {
  sharedLogs.push(logEntry);
  
  // Limit max logs
  if (sharedLogs.length > MAX_LOGS) {
    sharedLogs.shift();
  }
  
  // Broadcast to all windows
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('log-entry', logEntry);
  }
  
  if (logWindow && !logWindow.isDestroyed()) {
    logWindow.webContents.send('log-update', logEntry);
  }
}

// IPC handler for logging from renderer
ipcMain.on('add-log', (event, logEntry) => {
  addLog(logEntry);
});

function createApplicationMenu() {
  const isMac = process.platform === 'darwin';

  const template = [
    // App / File Menu
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              {
                label: 'About ' + app.name,
                click: () => {
                  if (mainWindow) {
                    mainWindow.webContents.send('menu-about');
                  }
                }
              },
              { type: 'separator' },
              {
                label: 'Hide ' + app.name,
                accelerator: 'Command+H',
                role: 'hide'
              },
              {
                label: 'Hide Others',
                accelerator: 'Command+Shift+H',
                role: 'hideOthers'
              },
              { label: 'Show All', role: 'unhide' },
              { type: 'separator' },
              {
                label: 'Quit',
                accelerator: 'Command+Q',
                click: () => {
                  app.quit();
                }
              }
            ]
          }
        ]
      : [
          {
            label: 'File',
            submenu: [
              {
                label: 'Open Image...',
                accelerator: 'Ctrl+O',
                click: () => {
                  if (mainWindow) {
                    mainWindow.webContents.send('menu-open-file');
                  }
                }
              },
              { type: 'separator' },
              {
                label: 'Exit',
                accelerator: 'Ctrl+Q',
                click: () => {
                  app.quit();
                }
              }
            ]
          }
        ]),

    // Edit Menu
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
        { label: 'Redo', accelerator: 'Shift+CmdOrCtrl+Z', role: 'redo' },
        { type: 'separator' },
        { label: 'Cut', accelerator: 'CmdOrCtrl+X', role: 'cut' },
        { label: 'Copy', accelerator: 'CmdOrCtrl+C', role: 'copy' },
        { label: 'Paste', accelerator: 'CmdOrCtrl+V', role: 'paste' },
        ...(isMac
          ? [
              { label: 'Paste and Match Style', role: 'pasteAndMatchStyle' },
              { label: 'Delete', role: 'delete' },
              { label: 'Select All', accelerator: 'Cmd+A', role: 'selectAll' }
            ]
          : [{ label: 'Select All', accelerator: 'Ctrl+A', role: 'selectAll' }])
      ]
    },

    // View Menu
    {
      label: 'View',
      submenu: [
        {
          label: 'Show Logs',
          accelerator: 'CmdOrCtrl+L',
          click: () => {
            createLogWindow();
          }
        },
        { type: 'separator' },
        {
          label: 'Reload',
          accelerator: 'CmdOrCtrl+R',
          click: () => {
            if (mainWindow) {
              mainWindow.reload();
            }
          }
        },
        {
          label: 'Toggle Developer Tools',
          accelerator: isMac ? 'Alt+Command+I' : 'Ctrl+Shift+I',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.toggleDevTools();
            }
          }
        },
        { type: 'separator' },
        { label: 'Actual Size', role: 'resetZoom' },
        { label: 'Zoom In', role: 'zoomIn' },
        { label: 'Zoom Out', role: 'zoomOut' },
        { type: 'separator' },
        { label: 'Toggle Fullscreen', role: 'togglefullscreen' }
      ]
    },

    // Window Menu
    {
      label: 'Window',
      submenu: [
        { label: 'Minimize', accelerator: 'CmdOrCtrl+M', role: 'minimize' },
        { label: 'Close', accelerator: 'CmdOrCtrl+W', role: 'close' },
        ...(isMac
          ? [
              { type: 'separator' },
              { label: 'Bring All to Front', role: 'front' },
              { type: 'separator' },
              {
                label: 'Window',
                role: 'window',
                submenu: [{ label: 'Minimize', role: 'minimize' }]
              }
            ]
          : [])
      ]
    },

    // Help Menu
    {
      label: 'Help',
      submenu: [
        {
          label: 'View Logs',
          accelerator: 'CmdOrCtrl+L',
          click: () => {
            createLogWindow();
          }
        },
        { type: 'separator' },
        {
          label: 'About',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu-about');
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Documentation',
          click: async () => {
            const readmePath = path.join(__dirname, 'README.md');
            if (fs.existsSync(readmePath)) {
              await shell.openPath(readmePath);
            } else {
              dialog.showErrorBox('Documentation Not Found', 'README.md not found.');
            }
          }
        },
        {
          label: 'GitHub Repository',
          click: async () => {
            await shell.openExternal('https://github.com');
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC handlers for menu actions
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('show-open-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      {
        name: 'Images',
        extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'heic', 'heif', 'avif']
      },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  return result;
});

// Handle save dialog
ipcMain.handle('save-image', async (event, { dataUrl, defaultName }) => {
  try {
    // Validate inputs
    if (!dataUrl || typeof dataUrl !== 'string') {
      throw new Error('Invalid image data provided');
    }
    
    if (!defaultName || typeof defaultName !== 'string') {
      defaultName = 'converted_image.jpg';
    }

    // Ensure default name has proper extension
    const extension = path.extname(defaultName).toLowerCase();
    const validExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'];
    if (!validExtensions.includes(extension)) {
      defaultName += '.jpg';
    }

    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: defaultName,
      filters: [
        { name: 'JPEG Image', extensions: ['jpg', 'jpeg'] },
        { name: 'PNG Image', extensions: ['png'] },
        { name: 'WebP Image', extensions: ['webp'] },
        { name: 'All Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'] }
      ],
      title: 'Save Converted Image'
    });

    if (result.canceled || !result.filePath) {
      return { success: false, cancelled: true };
    }

    // Parse data URL
    const matches = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      throw new Error('Invalid data URL format');
    }

    const base64Data = matches[2];
    
    // Validate base64 data
    if (!base64Data || base64Data.length === 0) {
      throw new Error('Empty image data');
    }

    // Convert to buffer
    let buffer;
    try {
      buffer = Buffer.from(base64Data, 'base64');
    } catch (err) {
      throw new Error('Failed to decode image data: ' + err.message);
    }

    // Validate buffer size
    if (buffer.length === 0) {
      throw new Error('Decoded image is empty');
    }

    // Check for reasonable image size (max 100MB)
    const MAX_SIZE = 100 * 1024 * 1024;
    if (buffer.length > MAX_SIZE) {
      throw new Error(`Image too large (${(buffer.length / 1024 / 1024).toFixed(1)}MB). Max: 100MB`);
    }

    // Write file
    try {
      fs.writeFileSync(result.filePath, buffer);
    } catch (err) {
      if (err.code === 'EACCES') {
        throw new Error('Permission denied. Cannot write to selected location.');
      } else if (err.code === 'ENOSPC') {
        throw new Error('Not enough disk space to save file.');
      } else if (err.code === 'EBUSY') {
        throw new Error('File is locked by another program.');
      } else {
        throw new Error(`Failed to write file: ${err.message}`);
      }
    }

    // Verify file was written
    try {
      const stats = fs.statSync(result.filePath);
      if (stats.size === 0) {
        throw new Error('File was created but is empty');
      }
      if (stats.size !== buffer.length) {
        console.warn(`File size mismatch: expected ${buffer.length}, got ${stats.size}`);
      }
    } catch (err) {
      throw new Error('Failed to verify saved file: ' + err.message);
    }

    // Store the saved file path
    lastSavedFilePath = result.filePath;
    
    return { success: true, path: result.filePath, size: buffer.length };

  } catch (err) {
    console.error('Save image error:', err);
    return { 
      success: false, 
      error: err.message || 'Unknown error during save',
      code: err.code
    };
  }
});

// Handle open folder request
ipcMain.handle('open-containing-folder', async (event, filePath) => {
  try {
    const targetPath = filePath || lastSavedFilePath;
    if (!targetPath) {
      return { success: false, error: 'No file path available' };
    }
    
    // shell.showItemInFolder reveals the file in the folder
    shell.showItemInFolder(targetPath);
    return { success: true };
  } catch (err) {
    console.error('Open folder error:', err);
    return { success: false, error: err.message };
  }
});

// Handle open file request
ipcMain.handle('open-file', async (event, filePath) => {
  try {
    const targetPath = filePath || lastSavedFilePath;
    if (!targetPath) {
      return { success: false, error: 'No file path available' };
    }
    
    // shell.openPath opens the file with default application
    const result = await shell.openPath(targetPath);
    if (result) {
      // result is an error message if it failed
      return { success: false, error: result };
    }
    return { success: true };
  } catch (err) {
    console.error('Open file error:', err);
    return { success: false, error: err.message };
  }
});

// Handle any unhandled errors in main process
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception in main process:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection in main process:', reason);
});

// Export for use in other modules if needed
module.exports = { addLog };
