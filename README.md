# Lirum All Image Converter

A simple, lightweight desktop application for converting images between different formats. Built with Electron and featuring a clean, intuitive drag-and-drop interface. Supports modern formats like HEIC and AVIF through WebAssembly decoders.

## Features

- **Drag & Drop Interface**: Simply drop an image onto the app to begin conversion
- **WebAssembly HEIC/AVIF Support**: Decode Apple HEIC/HEIF and AVIF images using libheif-js WebAssembly
- **Quality Control**: Adjustable JPEG/WebP/AVIF/HEIC quality slider (10-100%)
- **Cross-Platform**: Works on Windows, macOS, and Linux
- **Local Processing**: Uses Canvas, WebAssembly, and Sharp for broad format support (no cloud)
- **Privacy Focused**: All processing happens locally on your machine
- **Detailed Logging**: Comprehensive event and error logging with separate log viewer window and export capability
- **Post-Conversion Actions**: Show file in folder or open the converted file directly after conversion

## Supported Formats

### Source Formats
- WebP
- HEIC / HEIF (via WebAssembly decoder)
- AVIF (via WebAssembly decoder - same as HEIC)
- PNG
- JPEG / JPG
- GIF (first frame only)
- BMP
- TIFF (via Sharp)

### Target Formats
- JPEG - Best for photos and web use
- PNG - Lossless quality with transparency support
- WebP - Modern balance of size and quality
- AVIF - High efficiency modern format
- HEIC - High efficiency for Apple ecosystems
- GIF - Single-frame export
- BMP - Uncompressed bitmap output
- TIFF - Archival-grade output

## Installation

### Prerequisites

- Node.js 20.5 or higher
- npm or yarn

### Setup

```bash
# Clone or download the repository
cd lirum-all-image-converter

# Install dependencies
npm install
```


### Native Module Rebuild (Required for extended formats)

This app uses the `sharp` library to export formats like AVIF, HEIC, TIFF, GIF, and BMP. After installing dependencies, rebuild native modules for Electron:

```bash
npm run rebuild
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
3. Choose your target format from the right panel
4. Adjust quality if the format supports it (JPEG/WebP/AVIF/HEIC)
5. Select where to save the converted file
6. After conversion, choose to show the file in folder, open the file directly, or convert another image
7. Press Escape key at any time to reset and convert another image

### Menu Bar

The application includes a native menu bar with the following options:

**File** (Windows/Linux) / **App** (macOS)
- Open Image (Ctrl/Cmd+O) - Browse for an image file
- Exit/Quit

**Edit**
- Standard editing commands (Undo, Redo, Cut, Copy, Paste, Select All)

**View**
- Show Logs (Ctrl/Cmd+L) - Open the log viewer
- Reload (Ctrl/Cmd+R) - Reload the application
- Toggle Developer Tools - Open Chrome DevTools
- Zoom controls and fullscreen toggle

**Window**
- Minimize, Close window controls

**Help**
- View Logs (Ctrl/Cmd+L)
- About - Show application information
- Documentation - Open README.md

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Escape` | Reset app / Close modal |
| `Ctrl/Cmd + O` | Open image file |
| `Ctrl/Cmd + L` | Open log viewer |
| `Ctrl/Cmd + Shift + I` | Toggle Developer Tools |

### HEIC and AVIF Support

HEIC (common on Apple devices) and AVIF (next-gen format with superior compression) are both decoded using libheif-js WebAssembly. The first time you load one of these files, it may take a moment to initialize the decoder. Subsequent conversions will be faster.

### Logging System

The application includes a comprehensive logging system that tracks:
- File load events (format, size, dimensions, decoder used)
- Conversion events (source/target formats, duration, success/failure)
- Decoder initialization status
- Errors with full stack traces

Access logs via the View menu or by pressing `Ctrl/Cmd + L`. Logs open in a separate window so you can continue using the app while monitoring logs. The log window can be filtered by level, searched, exported to text file, or cleared.

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
├── heic-decoder.js      # HEIC/AVIF WebAssembly decoder module
├── logger.js            # Logging system
├── log-window.html      # Log viewer window UI
├── log-window.js        # Log viewer window renderer
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

Standard image conversions use the HTML5 Canvas API for preview:
- Images are drawn to a canvas element in the renderer
- The canvas is exported as PNG and passed to the main process
- Sharp encodes the requested output format (JPEG/PNG/WebP/AVIF/HEIC/GIF/BMP/TIFF)
- For JPEG/BMP, a white background is applied to handle transparency

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
- HEIC and AVIF support via libheif-js
- Output encoding and TIFF decoding via Sharp
- Metadata parsing via ExifReader
- Comprehensive logging system
- Icons and UI inspired by modern design principles
