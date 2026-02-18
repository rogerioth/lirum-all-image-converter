# Lirum All Image Converter - Windows Build Script
# This script builds the Electron app for distribution

$ErrorActionPreference = "Stop"

$rootDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $rootDir

Write-Host "Building Lirum All Image Converter..." -ForegroundColor Cyan
Write-Host ""

# Check if node_modules exists
if (-not (Test-Path "node_modules")) {
    Write-Host "Dependencies not found. Installing..." -ForegroundColor Yellow
    npm install
    Write-Host ""
}

# Check if electron-builder is installed
if (-not (Test-Path "node_modules/.bin/electron-builder.cmd")) {
    Write-Host "Installing electron-builder..." -ForegroundColor Yellow
    npm install --save-dev electron-builder
    Write-Host ""
}

# Build for Windows
Write-Host "Building for Windows..." -ForegroundColor Green
npx electron-builder --win

Write-Host ""
Write-Host "Build complete! Check the 'dist' folder." -ForegroundColor Cyan
