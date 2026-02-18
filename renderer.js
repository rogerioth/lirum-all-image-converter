const { ipcRenderer, shell } = require('electron');
const HeicDecoder = require('./heic-decoder');
const logger = require('./logger');

// DOM Elements
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const previewContainer = document.getElementById('previewContainer');
const previewImage = document.getElementById('previewImage');
const imageInfo = document.getElementById('imageInfo');
const formatButtons = document.querySelectorAll('.format-btn');
const statusText = document.getElementById('statusText');
const qualityControl = document.getElementById('qualityControl');
const qualitySlider = document.getElementById('quality');
const qualityValue = document.getElementById('qualityValue');
const processingOverlay = document.getElementById('processingOverlay');

// Modal Elements
const menuBtn = document.getElementById('menuBtn');
const menuModal = document.getElementById('menuModal');
const closeMenu = document.getElementById('closeMenu');
const viewLogsBtn = document.getElementById('viewLogsBtn');
const aboutBtn = document.getElementById('aboutBtn');

const conversionCompleteModal = document.getElementById('conversionCompleteModal');
const closeConversionComplete = document.getElementById('closeConversionComplete');
const openFolderBtn = document.getElementById('openFolderBtn');
const openFileBtn = document.getElementById('openFileBtn');
const convertAnotherBtn = document.getElementById('convertAnotherBtn');
const savedFileInfo = document.getElementById('savedFileInfo');

const aboutModal = document.getElementById('aboutModal');
const closeAbout = document.getElementById('closeAbout');

// Store last saved file path for conversion complete actions
let lastSavedFilePath = null;

// State
let currentImage = null;
let currentFileName = '';
let currentFileType = '';
let currentCanvas = null;
let heicDecoder = null;
let activeModal = null;

// Initialize decoder (supports both HEIC and AVIF)
async function initDecoder() {
  logger.info('Initializing decoder...');
  const startTime = Date.now();
  
  try {
    heicDecoder = new HeicDecoder();
    await heicDecoder.init();
    const duration = Date.now() - startTime;
    logger.logDecoderInit('HEIC/AVIF', true);
    logger.success('Decoder initialized', { duration: `${duration}ms` });
  } catch (err) {
    logger.logDecoderInit('HEIC/AVIF', false, err);
    showStatus('HEIC/AVIF support unavailable', 'error');
    heicDecoder = null;
  }
}

// Modal Functions
function openModal(modal) {
  if (activeModal) {
    closeActiveModal();
  }
  modal.hidden = false;
  activeModal = modal;
  logger.debug('Modal opened', { modal: modal.id });
}

function closeActiveModal() {
  if (activeModal) {
    activeModal.hidden = true;
    logger.debug('Modal closed', { modal: activeModal.id });
    activeModal = null;
  }
}

function toggleModal(modal) {
  if (modal.hidden) {
    openModal(modal);
  } else {
    closeActiveModal();
  }
}

// Event Listeners
dropZone.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', (e) => {
  if (e.target.files.length > 0) {
    handleFile(e.target.files[0]);
  }
});

// Drag & Drop
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  
  const files = e.dataTransfer.files;
  if (files.length > 0) {
    logger.info('File dropped', { 
      fileName: files[0].name, 
      fileType: files[0].type,
      fileSize: files[0].size 
    });
    handleFile(files[0]);
  }
});

// Quality slider
qualitySlider.addEventListener('input', (e) => {
  qualityValue.textContent = `${e.target.value}%`;
});

// Format buttons
formatButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    if (!currentImage || btn.disabled) return;
    const format = btn.dataset.format;
    const mime = btn.dataset.mime;
    convertImage(format, mime);
  });
});

// Modal Event Listeners
menuBtn.addEventListener('click', () => openModal(menuModal));
closeMenu.addEventListener('click', closeActiveModal);
viewLogsBtn.addEventListener('click', () => {
  closeActiveModal();
  // Request main process to open log window
  ipcRenderer.send('menu-show-logs');
});
aboutBtn.addEventListener('click', () => {
  closeActiveModal();
  openModal(aboutModal);
});
closeAbout.addEventListener('click', closeActiveModal);
closeConversionComplete.addEventListener('click', closeActiveModal);

// Conversion complete actions
openFolderBtn.addEventListener('click', async () => {
  if (lastSavedFilePath) {
    const result = await ipcRenderer.invoke('open-containing-folder', lastSavedFilePath);
    if (!result.success) {
      logger.error('Failed to open folder', { error: result.error });
      showStatus('Failed to open folder', 'error');
    }
  }
});

openFileBtn.addEventListener('click', async () => {
  if (lastSavedFilePath) {
    const result = await ipcRenderer.invoke('open-file', lastSavedFilePath);
    if (!result.success) {
      logger.error('Failed to open file', { error: result.error });
      showStatus('Failed to open file', 'error');
    }
  }
});

convertAnotherBtn.addEventListener('click', () => {
  closeActiveModal();
  resetApp();
});

// Close modal on overlay click
[menuModal, aboutModal, conversionCompleteModal].forEach(modal => {
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeActiveModal();
    }
  });
});

// Open external links in the system browser
document.addEventListener('click', (e) => {
  const link = e.target.closest('a[data-external-link]');
  if (!link) return;
  e.preventDefault();
  shell.openExternal(link.href);
});

// Function to show conversion complete dialog
function showConversionComplete(filePath) {
  lastSavedFilePath = filePath;
  
  // Extract filename and directory from path
  const path = require('path');
  const fileName = path.basename(filePath);
  const dirName = path.dirname(filePath);
  
  // Update file info display
  savedFileInfo.innerHTML = `
    <div class="file-name">${fileName}</div>
    <div class="file-path">${dirName}</div>
  `;
  
  openModal(conversionCompleteModal);
  logger.info('Conversion complete dialog shown', { filePath });
}

async function handleFile(file) {
  const startTime = Date.now();
  
  // Validate file exists
  if (!file) {
    logger.error('No file provided');
    showStatus('No file provided', 'error');
    return;
  }

  logger.info('Processing file...', { 
    fileName: file.name, 
    fileType: file.type || 'unknown',
    fileSize: `${(file.size / 1024).toFixed(2)} KB`
  });

  // Check if file requires special decoder
  const isHeic = heicDecoder && heicDecoder.isHeicFile(file);
  const isAvif = heicDecoder && heicDecoder.isAvifFile(file);
  const isWasmDecoded = isHeic || isAvif;
  const isStandardImage = file.type.startsWith('image/');
  
  if (!isStandardImage && !isWasmDecoded) {
    logger.error('Unsupported file type', { 
      fileName: file.name, 
      fileType: file.type 
    });
    showStatus('Please select an image file (JPG, PNG, WebP, HEIC, AVIF)', 'error');
    return;
  }

  currentFileName = file.name;
  currentFileType = file.type || (isHeic ? 'image/heic' : isAvif ? 'image/avif' : 'image/unknown');

  showProcessing(true, 'Loading image...');

  try {
    if (isWasmDecoded) {
      await handleWasmDecodedFile(file, isHeic ? 'HEIC' : 'AVIF');
    } else {
      await handleStandardImage(file);
    }
    
    const duration = Date.now() - startTime;
    logger.success('File processing completed', { duration: `${duration}ms` });
  } catch (err) {
    const duration = Date.now() - startTime;
    logger.error('File processing failed', { duration: `${duration}ms` }, err);
    console.error('Error loading image:', err);
    showStatus(`Error: ${err.message || 'Unknown error'}`, 'error');
    showProcessing(false);
  }
}

async function handleWasmDecodedFile(file, formatName) {
  const startTime = Date.now();
  
  // Validate file before processing
  if (heicDecoder) {
    const validation = heicDecoder.validateFile(file);
    if (!validation.valid) {
      throw new Error(validation.error);
    }
  }

  // Check if decoder is available
  if (!heicDecoder) {
    throw new Error(`${formatName} decoder not available. Please restart the app.`);
  }

  // Decode using WebAssembly
  showProcessing(true, `Decoding ${formatName}...`);
  
  const canvas = await heicDecoder.decode(file, (decodeError) => {
    // Error callback during decode
    logger.error(`${formatName} decode callback error`, null, decodeError);
  });
  
  if (!canvas) {
    throw new Error(`${formatName} decoder returned empty result`);
  }
  
  currentCanvas = canvas;
  const decodeDuration = Date.now() - startTime;
  
  // Convert canvas to image for preview
  let dataUrl;
  try {
    dataUrl = canvas.toDataURL('image/png');
  } catch (err) {
    throw new Error('Failed to convert canvas to preview: ' + err.message);
  }
  
  const img = new Image();
  
  img.onload = () => {
    currentImage = img;
    showPreview(img, file, canvas);
    enableFormatButtons();
    showStatus(`Loaded ${formatName}: ${file.name}`, 'success');
    showProcessing(false);
    
    logger.logFileLoad(
      file.name,
      formatName.toLowerCase(),
      file.size,
      `${img.naturalWidth}x${img.naturalHeight}`,
      'WebAssembly',
      true
    );
  };
  
  img.onerror = () => {
    logger.error(`Failed to load ${formatName} preview`, {
      fileName: file.name,
      decodeDuration: `${decodeDuration}ms`
    });
    showStatus(`Failed to load ${formatName} preview image`, 'error');
    showProcessing(false);
    currentCanvas = null;
  };
  
  img.src = dataUrl;
}

async function handleStandardImage(file) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const reader = new FileReader();
    
    reader.onprogress = (e) => {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100);
        showProcessing(true, `Loading image... ${percent}%`);
      }
    };
    
    reader.onload = (e) => {
      if (!e.target.result) {
        reject(new Error('FileReader returned empty data'));
        return;
      }
      
      const img = new Image();
      
      img.onload = () => {
        // Validate loaded image
        if (img.naturalWidth === 0 || img.naturalHeight === 0) {
          reject(new Error('Image has invalid dimensions (0x0)'));
          return;
        }
        
        currentImage = img;
        currentCanvas = null; // Will create on demand
        showPreview(img, file);
        enableFormatButtons();
        showStatus(`Loaded: ${file.name}`, 'success');
        showProcessing(false);
        
        logger.logFileLoad(
          file.name,
          file.type,
          file.size,
          `${img.naturalWidth}x${img.naturalHeight}`,
          'Native',
          true
        );
        
        resolve();
      };
      
      img.onerror = () => {
        reject(new Error('Failed to load image data. The file may be corrupted or unsupported.'));
      };
      
      img.onabort = () => {
        reject(new Error('Image loading was aborted'));
      };
      
      img.src = e.target.result;
    };
    
    reader.onerror = () => {
      const error = reader.error;
      let errorMsg = 'Failed to read file';
      if (error) {
        switch (error.name) {
          case 'NotFoundError':
            errorMsg = 'File not found';
            break;
          case 'NotReadableError':
            errorMsg = 'File is not readable (may be in use by another program)';
            break;
          case 'AbortError':
            errorMsg = 'File reading was cancelled';
            break;
          default:
            errorMsg = `File read error: ${error.message || error.name}`;
        }
      }
      reject(new Error(errorMsg));
    };
    
    reader.onabort = () => {
      reject(new Error('File reading was aborted'));
    };
    
    try {
      reader.readAsDataURL(file);
    } catch (err) {
      reject(new Error('Failed to start file read: ' + err.message));
    }
  });
}

function showPreview(img, file, canvas = null) {
  previewImage.src = img.src;
  previewContainer.hidden = false;
  dropZone.querySelector('.drop-content').hidden = true;
  
  // Format file size
  const sizeKB = (file.size / 1024).toFixed(1);
  const formatName = currentFileType.split('/')[1]?.toUpperCase() || 'UNKNOWN';
  
  imageInfo.innerHTML = `
    <strong>${file.name}</strong><br>
    ${img.naturalWidth} x ${img.naturalHeight} px<br>
    ${sizeKB} KB · ${formatName}
  `;
  
  // Store canvas if provided (for HEIC/AVIF)
  if (canvas) {
    currentCanvas = canvas;
  }
}

function enableFormatButtons() {
  formatButtons.forEach(btn => {
    btn.disabled = false;
  });
  qualityControl.hidden = false;
}

function disableFormatButtons() {
  formatButtons.forEach(btn => {
    btn.disabled = true;
  });
  qualityControl.hidden = true;
}

function convertImage(format, mimeType) {
  if (!currentImage) {
    showStatus('No image loaded', 'error');
    return;
  }

  const startTime = Date.now();
  const sourceFormat = currentFileType.split('/')[1]?.toUpperCase() || 'UNKNOWN';
  
  showStatus('Converting...', 'info');
  showProcessing(true, 'Converting...');
  
  logger.info('Starting conversion...', {
    sourceFormat,
    targetFormat: format.toUpperCase(),
    fileName: currentFileName,
    dimensions: currentImage ? `${currentImage.naturalWidth}x${currentImage.naturalHeight}` : 'unknown'
  });

  // Use requestAnimationFrame to allow UI to update
  requestAnimationFrame(() => {
    try {
      let canvas;
      
      // Use existing canvas if available (HEIC/AVIF), otherwise create new
      if (currentCanvas) {
        canvas = currentCanvas;
      } else {
        canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
          throw new Error('Failed to create canvas context');
        }
        
        canvas.width = currentImage.naturalWidth;
        canvas.height = currentImage.naturalHeight;
        
        // Validate canvas dimensions
        if (canvas.width === 0 || canvas.height === 0) {
          throw new Error('Canvas has invalid dimensions (0x0)');
        }
        
        // Fill white background for JPEG (handles transparency)
        if (format === 'jpeg') {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        
        ctx.drawImage(currentImage, 0, 0);
      }

      // Get quality for JPEG
      let quality = undefined;
      if (format === 'jpeg') {
        quality = parseInt(qualitySlider.value) / 100;
        if (isNaN(quality) || quality < 0 || quality > 1) {
          quality = 0.9; // Fallback to 90%
        }
      }

      // Convert to target format
      let dataUrl;
      try {
        dataUrl = canvas.toDataURL(mimeType, quality);
      } catch (err) {
        throw new Error(`Canvas export failed: ${err.message}. The image may be too large.`);
      }
      
      // Validate data URL was created
      if (!dataUrl || !dataUrl.startsWith('data:')) {
        throw new Error('Failed to generate image data');
      }
      
      // Generate default filename
      const originalName = currentFileName.replace(/\.[^/.]+$/, '');
      const extension = format === 'jpeg' ? 'jpg' : format;
      const defaultName = `${originalName}_converted.${extension}`;
      
      // Save via main process
      ipcRenderer.invoke('save-image', { dataUrl, defaultName })
        .then(result => {
          const duration = Date.now() - startTime;
          
          if (result.success) {
            showStatus(`Saved: ${result.path}`, 'success');
            logger.logConversion(
              sourceFormat,
              format.toUpperCase(),
              currentFileName,
              dataUrl.length,
              `${canvas.width}x${canvas.height}`,
              duration,
              true
            );
            // Show conversion complete dialog
            showConversionComplete(result.path);
          } else {
            showStatus('Save cancelled', 'info');
            logger.info('Save cancelled by user', { fileName: defaultName });
          }
          showProcessing(false);
        })
        .catch(err => {
          const duration = Date.now() - startTime;
          console.error('Save error:', err);
          let errorMsg = 'Failed to save file';
          if (err.message) {
            errorMsg += `: ${err.message}`;
          }
          showStatus(errorMsg, 'error');
          logger.logConversion(
            sourceFormat,
            format.toUpperCase(),
            currentFileName,
            null,
            null,
            duration,
            false,
            err
          );
          showProcessing(false);
        });
    } catch (err) {
      const duration = Date.now() - startTime;
      console.error('Conversion error:', err);
      showStatus(`Conversion failed: ${err.message || 'Unknown error'}`, 'error');
      logger.logConversion(
        sourceFormat,
        format.toUpperCase(),
        currentFileName,
        null,
        null,
        duration,
        false,
        err
      );
      showProcessing(false);
    }
  });
}

function showStatus(message, type = 'info') {
  statusText.textContent = message;
  statusText.className = '';
  if (type) {
    statusText.classList.add(type);
  }
}

function showProcessing(show, message = '') {
  if (show) {
    processingOverlay.hidden = false;
    document.getElementById('processingText').textContent = message;
  } else {
    processingOverlay.hidden = true;
  }
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  // Escape to close modals or reset app
  if (e.key === 'Escape') {
    if (activeModal) {
      closeActiveModal();
    } else {
      resetApp();
    }
  }
  
  // Ctrl/Cmd + O to open file
  if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
    e.preventDefault();
    ipcRenderer.send('menu-open-file');
  }
});

function resetApp() {
  currentImage = null;
  currentFileName = '';
  currentFileType = '';
  currentCanvas = null;
  previewImage.src = '';
  previewContainer.hidden = true;
  dropZone.querySelector('.drop-content').hidden = false;
  fileInput.value = '';
  disableFormatButtons();
  showProcessing(false);
  showStatus('Ready');
  logger.info('App reset');
}

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
  // Ensure processing overlay is hidden on start
  showProcessing(false);
  
  logger.info('Application started');
  
  initDecoder();
});

// Global error handlers
window.onerror = (message, source, lineno, colno, error) => {
  logger.error('Global JavaScript error', {
    message,
    source,
    line: lineno,
    column: colno
  }, error);
  showStatus(`Error: ${message}`, 'error');
  showProcessing(false);
  return false;
};

window.onunhandledrejection = (event) => {
  logger.error('Unhandled promise rejection', {
    reason: event.reason?.message || String(event.reason)
  }, event.reason);
  showStatus(`Error: ${event.reason?.message || 'Unknown error'}`, 'error');
  showProcessing(false);
};

// IPC handlers for native menu events
ipcRenderer.on('menu-about', () => {
  logger.info('About triggered from menu');
  openModal(aboutModal);
});

ipcRenderer.on('menu-open-file', async () => {
  logger.info('Open file triggered from menu');
  try {
    const result = await ipcRenderer.invoke('show-open-dialog');
    if (result && !result.canceled && result.filePaths && result.filePaths.length > 0) {
      const filePath = result.filePaths[0];
      logger.info('File selected from dialog', { filePath });
      
      // Read the file and create a File object
      const fs = require('fs');
      const path = require('path');
      const buffer = fs.readFileSync(filePath);
      const fileName = path.basename(filePath);
      const ext = path.extname(filePath).toLowerCase();
      
      // Map extension to MIME type
      const mimeTypes = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.webp': 'image/webp',
        '.gif': 'image/gif',
        '.bmp': 'image/bmp',
        '.heic': 'image/heic',
        '.heif': 'image/heif',
        '.avif': 'image/avif'
      };
      
      const file = new File([buffer], fileName, { type: mimeTypes[ext] || 'image/unknown' });
      handleFile(file);
    }
  } catch (err) {
    logger.error('Failed to open file from dialog', null, err);
    showStatus('Failed to open file', 'error');
  }
});
