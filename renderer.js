const { ipcRenderer } = require('electron');
const HeicDecoder = require('./heic-decoder');

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

// State
let currentImage = null;
let currentFileName = '';
let currentFileType = '';
let currentCanvas = null;
let heicDecoder = null;

// Initialize HEIC decoder
async function initHeicDecoder() {
  try {
    heicDecoder = new HeicDecoder();
    await heicDecoder.init();
    console.log('HEIC decoder initialized');
  } catch (err) {
    console.warn('HEIC decoder initialization failed:', err);
    showStatus('HEIC support unavailable', 'error');
    heicDecoder = null;
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

async function handleFile(file) {
  // Validate file exists
  if (!file) {
    showStatus('No file provided', 'error');
    return;
  }

  // Check if file is an image or HEIC
  const isHeic = heicDecoder && heicDecoder.isHeicFile(file);
  
  if (!file.type.startsWith('image/') && !isHeic) {
    showStatus('Please select an image file (JPG, PNG, WebP, HEIC)', 'error');
    return;
  }

  currentFileName = file.name;
  currentFileType = file.type || (isHeic ? 'image/heic' : 'image/unknown');

  showProcessing(true, 'Loading image...');

  try {
    if (isHeic) {
      await handleHeicFile(file);
    } else {
      await handleStandardImage(file);
    }
  } catch (err) {
    console.error('Error loading image:', err);
    showStatus(`Error: ${err.message || 'Unknown error'}`, 'error');
    showProcessing(false);
  }
}

async function handleHeicFile(file) {
  // Validate HEIC file before processing
  if (heicDecoder) {
    const validation = heicDecoder.validateFile(file);
    if (!validation.valid) {
      throw new Error(validation.error);
    }
  }

  // Check if decoder is available
  if (!heicDecoder) {
    throw new Error('HEIC decoder not available. Please restart the app.');
  }

  // Decode HEIC using WebAssembly
  showProcessing(true, 'Decoding HEIC...');
  
  const canvas = await heicDecoder.decode(file, (decodeError) => {
    // Error callback during decode
    console.error('HEIC decode error:', decodeError);
  });
  
  if (!canvas) {
    throw new Error('HEIC decoder returned empty result');
  }
  
  currentCanvas = canvas;
  
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
    showStatus(`Loaded HEIC: ${file.name}`, 'success');
    showProcessing(false);
  };
  
  img.onerror = () => {
    showStatus('Failed to load HEIC preview image', 'error');
    showProcessing(false);
    currentCanvas = null;
  };
  
  img.src = dataUrl;
}

async function handleStandardImage(file) {
  return new Promise((resolve, reject) => {
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
  
  // Store canvas if provided (for HEIC)
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

  showStatus('Converting...', 'info');
  showProcessing(true, 'Converting...');

  // Use requestAnimationFrame to allow UI to update
  requestAnimationFrame(() => {
    try {
      let canvas;
      
      // Use existing canvas if available (HEIC), otherwise create new
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
          if (result.success) {
            showStatus(`Saved: ${result.path}`, 'success');
          } else {
            showStatus('Save cancelled', 'info');
          }
          showProcessing(false);
        })
        .catch(err => {
          console.error('Save error:', err);
          let errorMsg = 'Failed to save file';
          if (err.message) {
            errorMsg += `: ${err.message}`;
          }
          showStatus(errorMsg, 'error');
          showProcessing(false);
        });
    } catch (err) {
      console.error('Conversion error:', err);
      showStatus(`Conversion failed: ${err.message || 'Unknown error'}`, 'error');
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

// Keyboard shortcut to reset (Escape)
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    resetApp();
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
}

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
  // Ensure processing overlay is hidden on start
  showProcessing(false);
  initHeicDecoder();
});

// Global error handlers
window.onerror = (message, source, lineno, colno, error) => {
  console.error('Global error:', { message, source, lineno, colno, error });
  showStatus(`Error: ${message}`, 'error');
  showProcessing(false);
  return false;
};

window.onunhandledrejection = (event) => {
  console.error('Unhandled promise rejection:', event.reason);
  showStatus(`Error: ${event.reason?.message || 'Unknown error'}`, 'error');
  showProcessing(false);
};
