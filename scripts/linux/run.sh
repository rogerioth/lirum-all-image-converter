#!/bin/bash
# Lirum All Image Converter - Linux Run Script
# This script runs the Electron app in development mode

set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

echo -e "\033[36m🚀 Starting Lirum All Image Converter...\033[0m"
echo ""

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo -e "\033[33m📦 Dependencies not found. Installing...\033[0m"
    npm install
    echo ""
fi

# Run the app
npm start
