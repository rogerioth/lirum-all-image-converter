# Lirum All Image Converter - Windows Dev Mode with Hot Reload
# This script runs the Electron app with dev tools enabled

$ErrorActionPreference = "Stop"

$rootDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $rootDir

Write-Host "Starting Lirum All Image Converter (Dev Mode)..." -ForegroundColor Cyan
Write-Host ""

# Check if node_modules exists
if (-not (Test-Path "node_modules")) {
    Write-Host "Dependencies not found. Installing..." -ForegroundColor Yellow
    npm install
    Write-Host ""
}

# Run in dev mode
npm run dev
