#!/bin/bash
# Lirum All Image Converter - macOS Build Script
# This script builds the Electron app for distribution

set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

echo "🔨 Building Lirum All Image Converter..."
echo ""

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Dependencies not found. Installing..."
    npm install
    echo ""
fi

# Check if electron-builder is installed
if [ ! -f "node_modules/.bin/electron-builder" ]; then
    echo "📦 Installing electron-builder..."
    npm install --save-dev electron-builder
    echo ""
fi

# Build for macOS
echo "🏗️  Building for macOS..."
npx electron-builder --mac

echo ""
echo "✅ Build complete! Check the 'dist' folder."
