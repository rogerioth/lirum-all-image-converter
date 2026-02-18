const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

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
  });
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

// Handle any unhandled errors in main process
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception in main process:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection in main process:', reason);
});
