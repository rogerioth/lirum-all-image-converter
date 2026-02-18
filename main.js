const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');


let sharp = null;
try {
  sharp = require('sharp');
} catch (err) {
  console.warn('Sharp is not available. Additional formats may be disabled.', err.message);
}

const OUTPUT_FORMATS = {
  jpeg: { label: 'JPEG Image', extensions: ['jpg', 'jpeg'] },
  png: { label: 'PNG Image', extensions: ['png'] },
  webp: { label: 'WebP Image', extensions: ['webp'] },
  avif: { label: 'AVIF Image', extensions: ['avif'] },
  heic: { label: 'HEIC Image', extensions: ['heic', 'heif'] },
  gif: { label: 'GIF Image', extensions: ['gif'] },
  bmp: { label: 'BMP Image', extensions: ['bmp'] },
  tiff: { label: 'TIFF Image', extensions: ['tif', 'tiff'] }
};

function normalizeFormat(format) {
  if (!format) return null;
  const value = String(format).toLowerCase();
  if (value === 'jpg') return 'jpeg';
  if (value === 'heif') return 'heic';
  if (value === 'tif') return 'tiff';
  return value;
}

function normalizeQuality(value) {
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed)) return null;
  return Math.min(100, Math.max(1, parsed));
}

function parseDataUrl(dataUrl) {
  const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!matches || matches.length !== 3) {
    throw new Error('Invalid data URL format');
  }
  const base64Data = matches[2];
  if (!base64Data || base64Data.length === 0) {
    throw new Error('Empty image data');
  }
  return Buffer.from(base64Data, 'base64');
}

function ensureExtension(filePath, extension) {
  const ext = path.extname(filePath);
  if (!ext) return `${filePath}.${extension}`;
  return filePath;
}

function buildSaveFilters(targetFormat) {
  const ordered = ['jpeg', 'png', 'webp', 'avif', 'heic', 'gif', 'bmp', 'tiff'];
  const filters = [];
  const formatKey = normalizeFormat(targetFormat);

  if (formatKey && OUTPUT_FORMATS[formatKey]) {
    filters.push({
      name: OUTPUT_FORMATS[formatKey].label,
      extensions: OUTPUT_FORMATS[formatKey].extensions
    });
  }

  ordered.forEach(key => {
    if (!OUTPUT_FORMATS[key]) return;
    if (formatKey === key) return;
    filters.push({
      name: OUTPUT_FORMATS[key].label,
      extensions: OUTPUT_FORMATS[key].extensions
    });
  });

  filters.push({
    name: 'All Images',
    extensions: ordered.flatMap(key => OUTPUT_FORMATS[key].extensions)
  });

  return filters;
}

function encodeBmp(pixelData, width, height) {
  const bytesPerPixel = 3;
  const rowStride = Math.floor((width * bytesPerPixel + 3) / 4) * 4;
  const imageSize = rowStride * height;
  const fileHeaderSize = 14;
  const infoHeaderSize = 40;
  const fileSize = fileHeaderSize + infoHeaderSize + imageSize;

  const buffer = Buffer.alloc(fileSize);

  buffer.write('BM', 0, 2, 'ascii');
  buffer.writeUInt32LE(fileSize, 2);
  buffer.writeUInt32LE(0, 6);
  buffer.writeUInt32LE(fileHeaderSize + infoHeaderSize, 10);

  buffer.writeUInt32LE(infoHeaderSize, 14);
  buffer.writeInt32LE(width, 18);
  buffer.writeInt32LE(height, 22);
  buffer.writeUInt16LE(1, 26);
  buffer.writeUInt16LE(bytesPerPixel * 8, 28);
  buffer.writeUInt32LE(0, 30);
  buffer.writeUInt32LE(imageSize, 34);
  buffer.writeInt32LE(2835, 38);
  buffer.writeInt32LE(2835, 42);
  buffer.writeUInt32LE(0, 46);
  buffer.writeUInt32LE(0, 50);

  let offset = fileHeaderSize + infoHeaderSize;
  for (let y = 0; y < height; y++) {
    const sourceRow = height - 1 - y;
    let rowOffset = offset + y * rowStride;
    for (let x = 0; x < width; x++) {
      const srcIndex = (sourceRow * width + x) * 4;
      buffer[rowOffset++] = pixelData[srcIndex + 2];
      buffer[rowOffset++] = pixelData[srcIndex + 1];
      buffer[rowOffset++] = pixelData[srcIndex];
    }
  }

  return buffer;
}

async function encodeOutputBuffer(inputBuffer, targetFormat, qualityValue) {
  const format = normalizeFormat(targetFormat);
  if (!format) {
    throw new Error('Missing output format');
  }

  const quality = normalizeQuality(qualityValue);

  if (format === 'bmp') {
    if (!sharp) {
      throw new Error('BMP output requires sharp. Please install dependencies and rebuild native modules.');
    }
    const raw = await sharp(inputBuffer, { failOnError: false })
      .raw()
      .toBuffer({ resolveWithObject: true });
    return encodeBmp(raw.data, raw.info.width, raw.info.height);
  }

  if (!sharp) {
    throw new Error('Additional formats require sharp. Please install dependencies and rebuild native modules.');
  }

  let pipeline = sharp(inputBuffer, { failOnError: false });

  if (format === 'jpeg') {
    pipeline = pipeline.flatten({ background: '#ffffff' }).jpeg({ quality: quality || 90 });
  } else if (format === 'png') {
    pipeline = pipeline.png();
  } else if (format === 'webp') {
    pipeline = pipeline.webp({ quality: quality || 90 });
  } else if (format === 'avif') {
    pipeline = pipeline.avif({ quality: quality || 90 });
  } else if (format === 'heic') {
    pipeline = pipeline.heif({ quality: quality || 90, compression: 'hevc' });
  } else if (format === 'gif') {
    pipeline = pipeline.gif();
  } else if (format === 'tiff') {
    pipeline = pipeline.tiff();
  } else {
    throw new Error(`Unsupported output format: ${format}`);
  }

  return pipeline.toBuffer();
}

let mainWindow;
let logWindow = null;
let infoWindow = null;

let lastInfoPayload = null;

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
    if (infoWindow) {
      infoWindow.close();
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

function createInfoWindow() {
  if (infoWindow) {
    infoWindow.focus();
    return;
  }

  infoWindow = new BrowserWindow({
    width: 920,
    height: 640,
    minWidth: 620,
    minHeight: 420,
    parent: mainWindow,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    title: 'Image Info - Lirum',
    icon: path.join(__dirname, 'assets/icon.png')
  });

  infoWindow.loadFile('info-window.html');

  infoWindow.on('closed', () => {
    infoWindow = null;
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

ipcMain.on('menu-show-logs', () => {
  createLogWindow();
});

ipcMain.on('open-info-window', () => {
  createInfoWindow();
});

ipcMain.on('info-window-ready', () => {
  if (infoWindow && !infoWindow.isDestroyed() && lastInfoPayload) {
    infoWindow.webContents.send('info-window-data', lastInfoPayload);
  }
});

ipcMain.on('info-window-data', (event, payload) => {
  lastInfoPayload = payload;
  if (infoWindow && !infoWindow.isDestroyed()) {
    infoWindow.webContents.send('info-window-data', payload);
  }
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
        {
          label: 'Image Info',
          accelerator: 'CmdOrCtrl+I',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu-open-info');
            }
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
        extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'tif', 'tiff', 'heic', 'heif', 'avif']
      },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  return result;
});

ipcMain.handle('decode-image', async (event, { filePath, arrayBuffer, dataUrl }) => {
  if (!sharp) {
    throw new Error('Decoder requires sharp. Please install dependencies and rebuild native modules.');
  }

  let inputBuffer;
  if (filePath) {
    try {
      inputBuffer = fs.readFileSync(filePath);
    } catch (err) {
      throw new Error(`Failed to read file: ${err.message}`);
    }
  } else if (arrayBuffer) {
    inputBuffer = Buffer.from(arrayBuffer);
  } else if (dataUrl) {
    inputBuffer = parseDataUrl(dataUrl);
  } else {
    throw new Error('No image data provided for decoding');
  }

  const decoded = await sharp(inputBuffer, { failOnError: false })
    .png()
    .toBuffer({ resolveWithObject: true });

  if (!decoded?.info?.width || !decoded?.info?.height) {
    throw new Error('Decoded image has invalid dimensions');
  }

  const base64 = decoded.data.toString('base64');
  return {
    success: true,
    dataUrl: `data:image/png;base64,${base64}`,
    width: decoded.info.width,
    height: decoded.info.height
  };
});

// Handle save dialog
ipcMain.handle('save-image', async (event, { dataUrl, defaultName, targetFormat, quality }) => {
  try {
    if (!dataUrl || typeof dataUrl !== 'string') {
      throw new Error('Invalid image data provided');
    }

    let format = normalizeFormat(targetFormat);
    if (!format && defaultName) {
      const extFromName = path.extname(defaultName).toLowerCase().replace('.', '');
      format = normalizeFormat(extFromName);
    }

    const formatInfo = format ? OUTPUT_FORMATS[format] : null;

    if (!defaultName || typeof defaultName !== 'string') {
      defaultName = formatInfo ? `converted_image.${formatInfo.extensions[0]}` : 'converted_image.jpg';
    }

    if (formatInfo) {
      const currentExt = path.extname(defaultName).toLowerCase().replace('.', '');
      if (!formatInfo.extensions.includes(currentExt)) {
        defaultName = defaultName.replace(/\.[^/.]+$/, '') + `.${formatInfo.extensions[0]}`;
      }
    }

    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: defaultName,
      filters: buildSaveFilters(format),
      title: 'Save Converted Image'
    });

    if (result.canceled || !result.filePath) {
      return { success: false, cancelled: true };
    }

    let outputPath = result.filePath;
    if (formatInfo) {
      outputPath = ensureExtension(outputPath, formatInfo.extensions[0]);
    }

    const inputBuffer = parseDataUrl(dataUrl);

    // Check for reasonable image size (max 100MB)
    const MAX_SIZE = 100 * 1024 * 1024;
    if (inputBuffer.length > MAX_SIZE) {
      throw new Error(`Image too large (${(inputBuffer.length / 1024 / 1024).toFixed(1)}MB). Max: 100MB`);
    }

    const outputBuffer = format
      ? await encodeOutputBuffer(inputBuffer, format, quality)
      : inputBuffer;

    try {
      fs.writeFileSync(outputPath, outputBuffer);
    } catch (err) {
      if (err.code === 'EACCES') {
        throw new Error('Permission denied. Cannot write to selected location.');
      } else if (err.code === 'ENOSPC') {
        throw new Error('Not enough disk space to save file.');
      } else if (err.code === 'EBUSY') {
        throw new Error('File is locked by another program.');
      }
      throw new Error(`Failed to write file: ${err.message}`);
    }

    try {
      const stats = fs.statSync(outputPath);
      if (stats.size === 0) {
        throw new Error('File was created but is empty');
      }
    } catch (err) {
      throw new Error('Failed to verify saved file: ' + err.message);
    }

    lastSavedFilePath = outputPath;

    return { success: true, path: outputPath, size: outputBuffer.length, format };
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
