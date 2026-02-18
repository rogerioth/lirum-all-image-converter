#!/bin/bash
# Lirum All Image Converter - macOS Run Script
# This script runs the Electron app in development mode

set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

echo "🚀 Starting Lirum All Image Converter..."
echo ""

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Dependencies not found. Installing..."
    npm install
    echo ""
fi

# Run the app
npm start
