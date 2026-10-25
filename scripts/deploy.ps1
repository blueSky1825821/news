# AI News Broadcasting - One-Click Deployment Script
# Usage: .\scripts\deploy.ps1

$ErrorActionPreference = "Stop"
$rootDir = Split-Path -Parent $PSScriptRoot

function Write-Step {
    param([string]$Message)
    Write-Host "`n[$Message]" -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Message)
    Write-Host "  $Message" -ForegroundColor Green
}

function Write-Error {
    param([string]$Message)
    Write-Host "  $Message" -ForegroundColor Red
}

Write-Host "============================================" -ForegroundColor Green
Write-Host "  AI News Broadcasting - Deploy" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green

# Step 1: Build frontend
Write-Step "1/4 Building frontend..."
Set-Location "$rootDir\frontend"
try {
    npm install
    npm run build
    Write-Success "Frontend built successfully"
} catch {
    Write-Error "Frontend build failed: $_"
    exit 1
}

# Step 2: Install backend dependencies
Write-Step "2/4 Installing backend dependencies..."
Set-Location "$rootDir\backend"
try {
    npm install --production
    Write-Success "Backend dependencies installed"
} catch {
    Write-Error "Backend install failed: $_"
    exit 1
}

# Step 3: Verify dist exists
Write-Step "3/4 Verifying build output..."
$distPath = "$rootDir\frontend\dist"
if (-not (Test-Path "$distPath\index.html")) {
    Write-Error "Build output not found at $distPath\index.html"
    exit 1
}
Write-Success "Build output verified"

# Step 4: Start server
Write-Step "4/4 Starting server..."
$env:NODE_ENV = "production"
Write-Host "`nServer will start on http://localhost:3000" -ForegroundColor Yellow
Write-Host "Press Ctrl+C to stop`n" -ForegroundColor Gray

Set-Location "$rootDir\backend"
node src/server.js
