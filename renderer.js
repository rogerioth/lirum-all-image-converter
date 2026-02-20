const { ipcRenderer, shell } = require('electron');
const HeicDecoder = require('./heic-decoder');
const logger = require('./logger');
let ExifReader = null;

try {
  ExifReader = require('exifreader');
} catch (err) {
  console.warn('ExifReader not available. Metadata view will be limited.', err);
}

// DOM Elements
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const previewContainer = document.getElementById('previewContainer');
const previewImage = document.getElementById('previewImage');
const imageInfo = document.getElementById('imageInfo');
const formatCards = document.querySelectorAll('.format-card');
const statusText = document.getElementById('statusText');
const formatSettings = document.getElementById('formatSettings');
const selectedFormatName = document.getElementById('selectedFormatName');
const selectedFormatExt = document.getElementById('selectedFormatExt');
const noSettingsNote = document.getElementById('noSettingsNote');
const convertBtn = document.getElementById('convertBtn');
const qualityControl = document.getElementById('qualityControl');
const qualitySlider = document.getElementById('quality');
const qualityLabelText = document.getElementById('qualityLabelText');
const qualityValue = document.getElementById('qualityValue');
const processingOverlay = document.getElementById('processingOverlay');

// Modal Elements

const menuModal = document.getElementById('menuModal');
const closeMenu = document.getElementById('closeMenu');
const viewLogsBtn = document.getElementById('viewLogsBtn');
const viewInfoMenuBtn = document.getElementById('viewInfoMenuBtn');
const aboutBtn = document.getElementById('aboutBtn');
const viewInfoBtn = document.getElementById('viewInfoBtn');

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
let currentFile = null;
let currentFileName = '';
let currentFileType = '';
let currentCanvas = null;
let heicDecoder = null;
let activeModal = null;
let currentFilePath = null;
let currentInfoPayload = null;
let currentInfoKey = null;
let selectedFormat = null;

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

// Format cards
formatCards.forEach(card => {
  card.addEventListener('click', () => {
    if (!currentImage || card.disabled) return;
    selectFormat(card);
  });
});

convertBtn.addEventListener('click', () => {
  if (!currentImage || !selectedFormat) return;
  convertImage(selectedFormat.format, selectedFormat.mime);
});

// Format Settings Close Button
const closeFormatSettings = document.getElementById('closeFormatSettings');
closeFormatSettings.addEventListener('click', clearFormatSelection);

// Modal Event Listeners
closeMenu.addEventListener('click', closeActiveModal);
viewLogsBtn.addEventListener('click', () => {
  closeActiveModal();
  // Request main process to open log window
  ipcRenderer.send('menu-show-logs');
});
viewInfoMenuBtn.addEventListener('click', () => {
  closeActiveModal();
  openInfoWindow();
});
aboutBtn.addEventListener('click', () => {
  closeActiveModal();
  openModal(aboutModal);
});
closeAbout.addEventListener('click', closeActiveModal);
closeConversionComplete.addEventListener('click', closeActiveModal);

if (viewInfoBtn) {
  viewInfoBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openInfoWindow();
  });
}

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

function formatBytes(bytes) {
  if (typeof bytes !== 'number' || Number.isNaN(bytes)) return 'Unknown';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  const precision = unitIndex === 0 ? 0 : size >= 10 ? 0 : 1;
  return `${size.toFixed(precision)} ${units[unitIndex]}`;
}

function formatDateTime(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString();
}

function gcd(a, b) {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
}

function formatTagValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value instanceof ArrayBuffer) {
    return `<${value.byteLength} bytes>`;
  }
  if (ArrayBuffer.isView(value)) {
    return `<${value.byteLength} bytes>`;
  }
  if (Array.isArray(value)) {
    return value.map(formatTagValue).join(', ');
  }
  try {
    return JSON.stringify(value);
  } catch (err) {
    return String(value);
  }
}

function normalizeExifNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value === 'object') {
    if ('numerator' in value && 'denominator' in value) {
      const denom = value.denominator || 1;
      return denom ? value.numerator / denom : null;
    }
    if ('value' in value) {
      return normalizeExifNumber(value.value);
    }
  }
  return null;
}

function parseDmsString(value) {
  if (!value || typeof value !== 'string') return null;
  const parts = value.match(/-?\d+(?:\.\d+)?/g);
  if (!parts || parts.length === 0) return null;
  const numbers = parts.map(Number).filter((n) => Number.isFinite(n));
  if (numbers.length === 0) return null;
  return numbers;
}

function dmsToDecimal(dms, ref) {
  if (!Array.isArray(dms) || dms.length === 0) return null;
  const degrees = dms.length >= 1 ? normalizeExifNumber(dms[0]) : null;
  const minutes = dms.length >= 2 ? normalizeExifNumber(dms[1]) : 0;
  const seconds = dms.length >= 3 ? normalizeExifNumber(dms[2]) : 0;

  if (degrees === null) return null;
  const decimal = Math.abs(degrees) + (minutes || 0) / 60 + (seconds || 0) / 3600;
  if (!ref) return decimal;
  const upperRef = String(ref).toUpperCase();
  if (upperRef === 'S' || upperRef === 'W') {
    return -decimal;
  }
  return decimal;
}

function extractGpsFromTags(tags) {
  if (!tags) return null;
  const latTag = tags.GPSLatitude;
  const latRefTag = tags.GPSLatitudeRef;
  const lonTag = tags.GPSLongitude;
  const lonRefTag = tags.GPSLongitudeRef;
  const altTag = tags.GPSAltitude;
  const altRefTag = tags.GPSAltitudeRef;

  const latRef = latRefTag?.value || latRefTag?.description || null;
  const lonRef = lonRefTag?.value || lonRefTag?.description || null;

  let latValue = latTag?.value ?? latTag?.description ?? null;
  let lonValue = lonTag?.value ?? lonTag?.description ?? null;

  if (typeof latValue === 'string') {
    latValue = parseDmsString(latValue) || latValue;
  }
  if (typeof lonValue === 'string') {
    lonValue = parseDmsString(lonValue) || lonValue;
  }

  const latitude = Array.isArray(latValue)
    ? dmsToDecimal(latValue, latRef)
    : normalizeExifNumber(latValue);
  const longitude = Array.isArray(lonValue)
    ? dmsToDecimal(lonValue, lonRef)
    : normalizeExifNumber(lonValue);

  if (latitude === null || longitude === null) return null;

  let altitude = null;
  if (altTag?.value !== undefined) {
    altitude = normalizeExifNumber(altTag.value ?? altTag.description);
    const altRef = altRefTag?.value ?? altRefTag?.description ?? null;
    if (altitude !== null && altRef !== null && Number(altRef) === 1) {
      altitude = -Math.abs(altitude);
    }
  }

  return {
    latitude,
    longitude,
    altitude,
    latitudeRef: latRef || null,
    longitudeRef: lonRef || null
  };
}

function buildTagEntry(name, tag) {
  const section = tag.section || 'General';
  const description = tag.description;
  const rawValue = tag.value;
  const value = formatTagValue(description !== undefined ? description : rawValue);
  let raw = null;

  if (description !== undefined && description !== null) {
    const rawFormatted = formatTagValue(rawValue);
    if (rawFormatted && rawFormatted !== value) {
      raw = rawFormatted;
    }
  }

  return {
    name,
    section,
    value,
    raw
  };
}

function getInfoKey(file, filePath) {
  const name = file?.name || '';
  const size = file?.size || '';
  const modified = file?.lastModified || '';
  const pathKey = filePath || file?.path || '';
  return `${name}|${size}|${modified}|${pathKey}`;
}

async function buildInfoPayload() {
  if (!currentFile) return null;

  const filePath = currentFilePath || currentFile.path || null;
  const infoKey = getInfoKey(currentFile, filePath);
  if (currentInfoPayload && currentInfoKey === infoKey) {
    return currentInfoPayload;
  }

  const path = require('path');
  const fs = require('fs');

  let stats = null;
  if (filePath) {
    try {
      stats = fs.statSync(filePath);
    } catch (err) {
      logger.warn('Failed to stat file for metadata', { filePath, error: err.message });
    }
  }

  const width = currentImage?.naturalWidth || currentCanvas?.width || null;
  const height = currentImage?.naturalHeight || currentCanvas?.height || null;
  const ratioDivisor = width && height ? gcd(width, height) : null;
  const ratio = ratioDivisor ? `${width / ratioDivisor}:${height / ratioDivisor}` : null;
  const megapixels = width && height ? ((width * height) / 1000000).toFixed(2) : null;

  const fileInfo = {
    name: currentFile.name || currentFileName || 'Unknown',
    path: filePath,
    directory: filePath ? path.dirname(filePath) : null,
    extension: path.extname(filePath || currentFile.name || '').toLowerCase() || null,
    sizeBytes: currentFile.size,
    sizeLabel: formatBytes(currentFile.size),
    mimeType: currentFileType || currentFile.type || 'unknown',
    lastModified: formatDateTime(currentFile.lastModified),
    createdAt: stats ? formatDateTime(stats.birthtime) : null,
    modifiedAt: stats ? formatDateTime(stats.mtime) : null,
    accessedAt: stats ? formatDateTime(stats.atime) : null,
    permissions: stats ? `0o${(stats.mode & 0o777).toString(8)}` : null
  };

  const imageInfo = {
    width,
    height,
    megapixels,
    aspectRatio: ratio
  };

  let metadata = { entries: [], total: 0 };
  let metadataError = null;
  let gps = null;

  if (!ExifReader) {
    metadataError = 'ExifReader dependency is not installed.';
  } else {
    try {
      const arrayBuffer = await currentFile.arrayBuffer();
      const tags = ExifReader.load(arrayBuffer);
      const entries = Object.keys(tags).map((name) => buildTagEntry(name, tags[name]));
      metadata = { entries, total: entries.length };
      gps = extractGpsFromTags(tags);
    } catch (err) {
      metadataError = err.message || 'Failed to read metadata.';
    }
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    file: fileInfo,
    image: imageInfo,
    metadata,
    metadataError,
    gps
  };

  currentInfoPayload = payload;
  currentInfoKey = infoKey;
  return payload;
}

async function openInfoWindow() {
  if (!currentFile) {
    showStatus('No image loaded', 'error');
    return;
  }

  ipcRenderer.send('open-info-window');
  showStatus('Preparing image metadata...', 'info');

  try {
    const payload = await buildInfoPayload();
    ipcRenderer.send('info-window-data', payload);
    const statusMessage = payload?.metadataError ? 'Metadata loaded with warnings' : 'Image metadata ready';
    showStatus(statusMessage, payload?.metadataError ? 'info' : 'success');
  } catch (err) {
    logger.error('Failed to build image metadata', null, err);
    showStatus('Failed to read image metadata', 'error');
  }
}

function isTiffFile(file) {
  if (!file || !file.name) return false;
  const name = file.name.toLowerCase();
  const type = (file.type || '').toLowerCase();
  return type === 'image/tiff' || name.endsWith('.tif') || name.endsWith('.tiff');
}

async function handleFile(file, filePath = null) {
  const startTime = Date.now();
  clearFormatSelection();
  disableInfoButton();
  currentFile = null;
  currentFilePath = null;
  currentInfoPayload = null;
  currentInfoKey = null;
  
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
  const isTiff = isTiffFile(file);
  const isWasmDecoded = isHeic || isAvif;
  const isSharpDecoded = isTiff;
  const standardExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.tif', '.tiff'];
  const hasStandardExtension = file.name
    ? standardExtensions.some(ext => file.name.toLowerCase().endsWith(ext))
    : false;
  const isStandardImage = (file.type && file.type.startsWith('image/')) || hasStandardExtension;
  
  if (!isStandardImage && !isWasmDecoded && !isSharpDecoded) {
    logger.error('Unsupported file type', { 
      fileName: file.name, 
      fileType: file.type 
    });
    showStatus('Please select an image file (JPG, PNG, WebP, HEIC, AVIF, GIF, BMP, TIFF)', 'error');
    return;
  }

  currentFile = file;
  currentFileName = file.name;
  currentFileType = file.type || (isHeic ? 'image/heic' : isAvif ? 'image/avif' : isTiff ? 'image/tiff' : 'image/unknown');
  currentFilePath = filePath || file.path || null;
  currentInfoPayload = null;
  currentInfoKey = null;

  showProcessing(true, 'Loading image...');

  try {
    if (isWasmDecoded) {
      await handleWasmDecodedFile(file, isHeic ? 'HEIC' : 'AVIF');
    } else if (isSharpDecoded) {
      await handleSharpDecodedFile(file, 'TIFF');
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

async function handleSharpDecodedFile(file, formatName) {
  const startTime = Date.now();
  showProcessing(true, `Decoding ${formatName}...`);

  let result;
  const filePath = currentFilePath || file.path || null;
  let arrayBuffer = null;

  if (!filePath) {
    try {
      arrayBuffer = await file.arrayBuffer();
    } catch (err) {
      throw new Error(`Failed to read ${formatName} data: ${err.message}`);
    }
  }

  try {
    result = await ipcRenderer.invoke('decode-image', { filePath, arrayBuffer });
  } catch (err) {
    const message = err?.message || String(err);
    throw new Error(`${formatName} decode failed: ${message}`);
  }

  if (!result || !result.dataUrl) {
    throw new Error(`${formatName} decoder returned empty result`);
  }

  const img = new Image();

  return new Promise((resolve, reject) => {
    img.onload = () => {
      currentImage = img;
      currentCanvas = null;
      showPreview(img, file);
      enableFormatButtons();
      showStatus(`Loaded ${formatName}: ${file.name}`, 'success');
      showProcessing(false);

      const decodeDuration = Date.now() - startTime;
      logger.logFileLoad(
        file.name,
        formatName.toLowerCase(),
        file.size,
        `${img.naturalWidth}x${img.naturalHeight}`,
        'Sharp',
        true
      );
      logger.success(`${formatName} decoded`, { duration: `${decodeDuration}ms` });
      resolve();
    };

    img.onerror = () => {
      reject(new Error(`Failed to load ${formatName} preview image`));
    };

    img.src = result.dataUrl;
  });
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

  enableInfoButton();
}


function selectFormat(card) {
  formatCards.forEach(btn => {
    btn.classList.toggle('selected', btn === card);
  });

  const format = card.dataset.format;
  const mime = card.dataset.mime;
  const extension = card.dataset.extension || format;
  const qualityEnabled = card.dataset.quality === 'true';
  const qualityLabel = card.dataset.qualityLabel || 'Quality';

  selectedFormat = {
    format,
    mime,
    extension,
    quality: qualityEnabled,
    qualityLabel
  };

  const nameEl = card.querySelector('.format-name');
  const displayName = nameEl ? nameEl.textContent : format.toUpperCase();
  selectedFormatName.textContent = displayName;
  selectedFormatExt.textContent = `.${extension}`;

  formatSettings.hidden = false;
  convertBtn.disabled = false;
  convertBtn.textContent = `Convert to ${displayName}`;

  if (qualityEnabled) {
    qualityLabelText.textContent = qualityLabel;
    qualityControl.hidden = false;
    noSettingsNote.hidden = true;
  } else {
    qualityControl.hidden = true;
    noSettingsNote.hidden = false;
  }
}

function clearFormatSelection() {
  selectedFormat = null;
  formatCards.forEach(btn => {
    btn.classList.remove('selected');
  });
  formatSettings.hidden = true;
  convertBtn.disabled = true;
  qualityControl.hidden = true;
  noSettingsNote.hidden = true;
}

function enableFormatButtons() {
  formatCards.forEach(btn => {
    btn.disabled = false;
  });
}

function disableFormatButtons() {
  formatCards.forEach(btn => {
    btn.disabled = true;
  });
  clearFormatSelection();
}

function enableInfoButton() {
  if (viewInfoBtn) {
    viewInfoBtn.disabled = false;
  }
}

function disableInfoButton() {
  if (viewInfoBtn) {
    viewInfoBtn.disabled = true;
  }
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
        if (format === 'jpeg' || format === 'bmp') {
          canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');

          if (!ctx) {
            throw new Error('Failed to create canvas context');
          }

          canvas.width = currentCanvas.width;
          canvas.height = currentCanvas.height;

          if (canvas.width === 0 || canvas.height === 0) {
            throw new Error('Canvas has invalid dimensions (0x0)');
          }

          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(currentCanvas, 0, 0);
        } else {
          canvas = currentCanvas;
        }
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
        if (format === 'jpeg' || format === 'bmp') {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        
        ctx.drawImage(currentImage, 0, 0);
      }

      // Get quality for formats that support it
      let targetQuality = undefined;
      if (selectedFormat && selectedFormat.format === format && selectedFormat.quality) {
        targetQuality = parseInt(qualitySlider.value, 10);
        if (Number.isNaN(targetQuality) || targetQuality < 1 || targetQuality > 100) {
          targetQuality = 90; // Fallback to 90%
        }
      }

      // Convert to base PNG for encoder pipeline
      let dataUrl;
      try {
        dataUrl = canvas.toDataURL('image/png');
      } catch (err) {
        throw new Error(`Canvas export failed: ${err.message}. The image may be too large.`);
      }
      
      // Validate data URL was created
      if (!dataUrl || !dataUrl.startsWith('data:')) {
        throw new Error('Failed to generate image data');
      }
      
      // Generate default filename
      const originalName = currentFileName.replace(/\.[^/.]+$/, '');
      const extension = selectedFormat?.extension || (format === 'jpeg' ? 'jpg' : format);
      const defaultName = `${originalName}_converted.${extension}`;
      

      // Save via main process
      ipcRenderer.invoke('save-image', {
        dataUrl,
        defaultName,
        targetFormat: format,
        quality: targetQuality
      })
        .then(result => {
          const duration = Date.now() - startTime;
          
          if (result.success) {
            showStatus(`Saved: ${result.path}`, 'success');
            logger.logConversion(
              sourceFormat,
              format.toUpperCase(),
              currentFileName,
              result.size,
              `${canvas.width}x${canvas.height}`,
              duration,
              true
            );
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

  // Ctrl/Cmd + I to open image info
  if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
    e.preventDefault();
    openInfoWindow();
  }
});

function resetApp() {
  currentImage = null;
  currentFile = null;
  currentFileName = '';
  currentFileType = '';
  currentCanvas = null;
  currentFilePath = null;
  currentInfoPayload = null;
  currentInfoKey = null;
  previewImage.src = '';
  previewContainer.hidden = true;
  dropZone.querySelector('.drop-content').hidden = false;
  fileInput.value = '';
  disableFormatButtons();
  disableInfoButton();
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

ipcRenderer.on('menu-open-info', () => {
  logger.info('Image info triggered from menu');
  openInfoWindow();
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
        '.tif': 'image/tiff',
        '.tiff': 'image/tiff',
        '.heic': 'image/heic',
        '.heif': 'image/heif',
        '.avif': 'image/avif'
      };
      
      const file = new File([buffer], fileName, { type: mimeTypes[ext] || 'image/unknown' });
      handleFile(file, filePath);
    }
  } catch (err) {
    logger.error('Failed to open file from dialog', null, err);
    showStatus('Failed to open file', 'error');
  }
});
