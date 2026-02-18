// HEIC Decoder using libheif-js WebAssembly
const libheif = require('libheif-js');

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
      console.error('Failed to initialize HEIC decoder:', err);
      throw new Error('HEIC decoder initialization failed: ' + err.message);
    }
  }

  /**
   * Decode HEIC file to a canvas element
   * @param {File|Buffer|ArrayBuffer} file - The HEIC file
   * @param {Function} onError - Optional error callback
   * @returns {Promise<HTMLCanvasElement>}
   */
  async decode(file, onError) {
    if (!this.isReady) {
      await this.init();
    }

    let arrayBuffer;
    try {
      // Convert file to ArrayBuffer
      arrayBuffer = await this._fileToArrayBuffer(file);
    } catch (err) {
      const error = new Error('Failed to read HEIC file: ' + err.message);
      if (onError) onError(error);
      throw error;
    }

    const uint8Array = new Uint8Array(arrayBuffer);

    // Use libheif-js to decode
    let heif;
    try {
      heif = await this.decoder;
    } catch (err) {
      const error = new Error('HEIC decoder not available: ' + err.message);
      if (onError) onError(error);
      throw error;
    }
    
    return new Promise((resolve, reject) => {
      try {
        // libheif-js API
        const decoder = new heif.HeifDecoder();
        const data = decoder.decode(uint8Array);
        
        if (!data || data.length === 0) {
          const error = new Error('Failed to decode HEIC image: no images found in file');
          if (onError) onError(error);
          reject(error);
          return;
        }

        const image = data[0];
        
        // Validate image dimensions
        const width = image.get_width();
        const height = image.get_height();
        
        if (!width || !height || width <= 0 || height <= 0) {
          const error = new Error(`Invalid HEIC image dimensions: ${width}x${height}`);
          if (onError) onError(error);
          reject(error);
          return;
        }

        // Create canvas and draw the image
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          const error = new Error('Failed to get 2D context for canvas');
          if (onError) onError(error);
          reject(error);
          return;
        }

        // Get image data
        const imageDataBuffer = new Uint8ClampedArray(width * height * 4);
        
        image.display({
          data: imageDataBuffer,
          width: width,
          height: height
        }, (decodedData) => {
          if (!decodedData || !decodedData.data) {
            const error = new Error('HEIC display callback returned invalid data');
            if (onError) onError(error);
            reject(error);
            return;
          }
          
          try {
            const imageData = new ImageData(
              decodedData.data,
              decodedData.width,
              decodedData.height
            );
            ctx.putImageData(imageData, 0, 0);
            resolve(canvas);
          } catch (err) {
            const error = new Error('Failed to draw HEIC to canvas: ' + err.message);
            if (onError) onError(error);
            reject(error);
          }
        });
      } catch (err) {
        const error = new Error('HEIC decode error: ' + err.message);
        if (onError) onError(error);
        reject(error);
      }
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
   * Validate if file can be processed
   * @param {File} file
   * @returns {{valid: boolean, error?: string}}
   */
  validateFile(file) {
    if (!file) {
      return { valid: false, error: 'No file provided' };
    }
    
    if (!this.isHeicFile(file)) {
      return { valid: false, error: 'File is not a valid HEIC/HEIF image' };
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
