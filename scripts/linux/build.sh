#!/bin/bash
# Lirum All Image Converter - Linux Build Script
# This script builds the Electron app for distribution

set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

echo -e "\033[36m🔨 Building Lirum All Image Converter...\033[0m"
echo ""

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo -e "\033[33m📦 Dependencies not found. Installing...\033[0m"
    npm install
    echo ""
fi

# Check if electron-builder is installed
if [ ! -f "node_modules/.bin/electron-builder" ]; then
    echo -e "\033[33m📦 Installing electron-builder...\033[0m"
    npm install --save-dev electron-builder
    echo ""
fi

# Build for Linux
echo -e "\033[32m🏗️  Building for Linux...\033[0m"
npx electron-builder --linux

echo ""
echo -e "\033[36m✅ Build complete! Check the 'dist' folder.\033[0m"
