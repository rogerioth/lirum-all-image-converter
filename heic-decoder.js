// HEIC/AVIF Decoder using libheif-js WebAssembly
// Note: libheif-js supports both HEIC and AVIF formats
// Prefer wasm bundle for better AVIF support, fall back to JS build if needed.
const libheif = (() => {
  try {
    return require('libheif-js/wasm-bundle');
  } catch (err) {
    return require('libheif-js');
  }
})();

class HeicDecoder {
  constructor() {
    this.decoder = null;
    this.isReady = false;
  }

  async init() {
    if (this.isReady) return;
    
    try {
      // libheif-js exports a ready-to-use module
      this.decoder = libheif;
      this.isReady = true;
    } catch (err) {
      console.error('Failed to initialize HEIC/AVIF decoder:', err);
      throw new Error('Decoder initialization failed: ' + err.message);
    }
  }

  /**
   * Decode HEIC/AVIF file to a canvas element
   * @param {File|Buffer|ArrayBuffer} file - The HEIC/AVIF file
   * @param {Function} onError - Optional error callback
   * @returns {Promise<HTMLCanvasElement>}
   */
  async decode(file, onError) {
    if (!this.isReady) {
      await this.init();
    }

    // Convert file to ArrayBuffer
    const arrayBuffer = await this._fileToArrayBuffer(file);
    const uint8Array = new Uint8Array(arrayBuffer);

    try {
      return await this._decodeWithLibheif(uint8Array);
    } catch (err) {
      if (this.isAvifFile(file)) {
        try {
          return await this._decodeAvifNatively(file);
        } catch (nativeErr) {
          if (onError) onError(nativeErr);
          throw nativeErr;
        }
      }
      if (onError) onError(err);
      throw err;
    }
  }

  async _decodeWithLibheif(uint8Array) {
    const heif = await this.decoder;

    return new Promise((resolve, reject) => {
      try {
        const decoder = new heif.HeifDecoder();
        const data = decoder.decode(uint8Array);

        if (!data || data.length === 0) {
          reject(new Error('Failed to decode image: no images found in file'));
          return;
        }

        const image = data[0];
        const width = image.get_width();
        const height = image.get_height();

        if (!width || !height || width <= 0 || height <= 0) {
          reject(new Error(`Invalid image dimensions: ${width}x${height}`));
          return;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          reject(new Error('Failed to get 2D context for canvas'));
          return;
        }

        const imageData = ctx.createImageData(width, height);

        image.display(imageData, (displayData) => {
          if (!displayData) {
            reject(new Error('Display callback returned invalid data'));
            return;
          }

          try {
            ctx.putImageData(imageData, 0, 0);
            resolve(canvas);
          } catch (err) {
            reject(new Error('Failed to draw to canvas: ' + err.message));
          }
        });
      } catch (err) {
        reject(new Error('Decode error: ' + err.message));
      }
    });
  }

  async _decodeAvifNatively(file) {
    if (typeof createImageBitmap === 'function') {
      try {
        const bitmap = await createImageBitmap(file);
        try {
          if (!bitmap.width || !bitmap.height) {
            throw new Error(`Invalid image dimensions: ${bitmap.width}x${bitmap.height}`);
          }
          const canvas = document.createElement('canvas');
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            throw new Error('Failed to get 2D context for canvas');
          }
          ctx.drawImage(bitmap, 0, 0);
          return canvas;
        } finally {
          if (typeof bitmap.close === 'function') {
            bitmap.close();
          }
        }
      } catch (err) {
        // Fall through to Image element decoding.
      }
    }

    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        try {
          if (!img.naturalWidth || !img.naturalHeight) {
            throw new Error(`Invalid image dimensions: ${img.naturalWidth}x${img.naturalHeight}`);
          }
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            throw new Error('Failed to get 2D context for canvas');
          }
          ctx.drawImage(img, 0, 0);
          resolve(canvas);
        } catch (err) {
          reject(new Error('Native AVIF decode failed: ' + err.message));
        } finally {
          URL.revokeObjectURL(url);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Native AVIF decode failed'));
      };
      img.src = url;
    });
  }

  /**
   * Check if a file is HEIC format
   * @param {File} file 
   * @returns {boolean}
   */
  isHeicFile(file) {
    if (!file || !file.name) return false;
    
    const name = file.name.toLowerCase();
    const type = (file.type || '').toLowerCase();
    
    return type === 'image/heic' || 
           type === 'image/heif' ||
           name.endsWith('.heic') || 
           name.endsWith('.heif');
  }

  /**
   * Check if a file is AVIF format
   * @param {File} file 
   * @returns {boolean}
   */
  isAvifFile(file) {
    if (!file || !file.name) return false;
    
    const name = file.name.toLowerCase();
    const type = (file.type || '').toLowerCase();
    
    return type === 'image/avif' ||
           name.endsWith('.avif');
  }

  /**
   * Check if a file requires this decoder (HEIC or AVIF)
   * @param {File} file 
   * @returns {boolean}
   */
  isSupportedFile(file) {
    return this.isHeicFile(file) || this.isAvifFile(file);
  }

  /**
   * Validate if file can be processed
   * @param {File} file
   * @returns {{valid: boolean, error?: string}}
   */
  validateFile(file) {
    if (!file) {
      return { valid: false, error: 'No file provided' };
    }
    
    if (!this.isSupportedFile(file)) {
      return { valid: false, error: 'File is not a valid HEIC/HEIF/AVIF image' };
    }
    
    // Check file size (max 100MB for safety)
    const MAX_SIZE = 100 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return { valid: false, error: `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max: 100MB` };
    }
    
    if (file.size === 0) {
      return { valid: false, error: 'File is empty (0 bytes)' };
    }
    
    return { valid: true };
  }

  _fileToArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        if (!e.target.result) {
          reject(new Error('FileReader returned empty result'));
          return;
        }
        resolve(e.target.result);
      };
      
      reader.onerror = (e) => {
        const error = reader.error || new Error('Unknown FileReader error');
        reject(new Error(`File read error: ${error.message || error.name || 'Unknown'}`));
      };
      
      reader.onabort = () => {
        reject(new Error('File reading was aborted'));
      };
      
      try {
        reader.readAsArrayBuffer(file);
      } catch (err) {
        reject(new Error(`Failed to start file read: ${err.message}`));
      }
    });
  }
}

module.exports = HeicDecoder;
