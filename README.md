# Lirum All Image Converter

A simple, lightweight desktop application for converting images between different formats. Built with Electron and featuring a clean, intuitive drag-and-drop interface.

## Features

- **Drag & Drop Interface**: Simply drop an image onto the app to begin conversion
- **WebAssembly HEIC Support**: Decode Apple HEIC/HEIF images without native OS dependencies
- **Quality Control**: Adjustable JPEG quality slider (10-100%)
- **Cross-Platform**: Works on Windows, macOS, and Linux
- **No External Dependencies**: Uses built-in browser Canvas API and WebAssembly for image processing
- **Privacy Focused**: All processing happens locally on your machine

## Supported Formats

### Source Formats
- WebP
- HEIC / HEIF (via WebAssembly decoder)
- PNG
- JPEG / JPG
- GIF (first frame only)
- BMP

### Target Formats
- JPEG - Best for photos and web use
- PNG - Lossless quality with transparency support

## Installation

### Prerequisites

- Node.js 18 or higher
- npm or yarn

### Setup

```bash
# Clone or download the repository
cd lirum-all-image-converter

# Install dependencies
npm install
```

## Usage

### Running the App

**Windows:**
```powershell
.\scripts\win\run.ps1
```

**macOS:**
```bash
./scripts/mac/run.sh
```

**Linux:**
```bash
./scripts/linux/run.sh
```

Or directly with npm:
```bash
npm start
```

### Converting an Image

1. Launch the application
2. Drag and drop an image file onto the drop zone, or click "Browse Files" to select one
3. Choose your target format (JPEG or PNG) from the right panel
4. Adjust JPEG quality if needed (only affects JPEG output)
5. Select where to save the converted file
6. Press Escape key at any time to reset and convert another image

### HEIC Support

HEIC images (common on Apple devices) are decoded using libheif-js WebAssembly. The first time you load a HEIC file, it may take a moment to initialize the decoder. Subsequent conversions will be faster.

## Building

### Build for Distribution

**Windows:**
```powershell
.\scripts\win\build.ps1
```

**macOS:**
```bash
./scripts/mac/build.sh
```

**Linux:**
```bash
./scripts/linux/build.sh
```

Builds will be output to the `dist/` directory.

### Development Mode

Run with developer tools enabled:

**Windows:**
```powershell
.\scripts\win\dev.ps1
```

**macOS/Linux:**
```bash
./scripts/mac/dev.sh  # or ./scripts/linux/dev.sh
```

## Project Structure

```
lirum-all-image-converter/
├── main.js              # Electron main process
├── index.html           # Application UI
├── renderer.js          # Frontend logic and conversion
├── heic-decoder.js      # HEIC WebAssembly decoder module
├── styles.css           # Application styles
├── package.json         # Dependencies and scripts
├── scripts/             # Platform-specific build/run scripts
│   ├── win/
│   ├── linux/
│   └── mac/
└── README.md
```

## Technical Details

### Image Conversion

Standard image conversions use the HTML5 Canvas API:
- Images are drawn to a canvas element
- Canvas is exported to the target format using `canvas.toDataURL()`
- For JPEG, a white background is applied to handle transparency

### HEIC Decoding

HEIC images require special handling:
1. File is read as an ArrayBuffer
2. libheif-js WebAssembly decoder processes the data
3. Decoded pixels are drawn to a canvas
4. Canvas is used for further conversion or preview

### Error Handling

The application includes comprehensive error handling for:
- Corrupted or unreadable files
- Invalid image dimensions
- Disk space and permission issues
- Memory constraints
- Decoder initialization failures

Errors are displayed in the status bar at the bottom of the window.

## Platform Notes

### Windows
- PowerShell execution policy may need to be set to allow scripts: `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser`

### macOS
- On first run, macOS may warn about the app being from an unidentified developer. Right-click the app and select "Open" to proceed.

### Linux
- Some distributions may need additional dependencies for Electron apps. See the Electron documentation for details.

## License

MIT License

## Credits

- Built with Electron
- HEIC support via libheif-js
- Icons and UI inspired by modern design principles
