#!/bin/bash
# Lirum All Image Converter - macOS Dev Mode with Hot Reload
# This script runs the Electron app with dev tools enabled

set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

echo "🚀 Starting Lirum All Image Converter (Dev Mode)..."
echo ""

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Dependencies not found. Installing..."
    npm install
    echo ""
fi

# Run in dev mode
npm run dev
