# AI News Broadcasting - One-Click Deployment Script
# Usage: .\scripts\deploy.ps1 [-Reinstall]

param([switch]$Reinstall)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "log.ps1")
$rootDir = Split-Path -Parent $PSScriptRoot
$dependencyScript = Join-Path $PSScriptRoot "ensure-npm-deps.js"
$dependencyFlags = @()
if ($Reinstall) { $dependencyFlags += "--reinstall" }

function Write-Step {
    param([string]$Message)
    Write-Log "`n[$Message]" -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Message)
    Write-Log "  $Message" -ForegroundColor Green
}

function Write-Error {
    param([string]$Message)
    Write-Log "  $Message" -ForegroundColor Red
}

Write-Log "============================================" -ForegroundColor Green
Write-Log "  AI News Broadcasting - Deploy" -ForegroundColor Green
Write-Log "============================================" -ForegroundColor Green

# Step 1: Build frontend
Write-Step "1/5 Building frontend..."
Set-Location "$rootDir\frontend"
try {
    node $dependencyScript "$rootDir\frontend" @dependencyFlags
    if ($LASTEXITCODE -ne 0) { throw "Frontend dependency setup failed (exit $LASTEXITCODE)" }
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "Frontend build exited with $LASTEXITCODE" }
    Write-Success "Frontend built successfully"
} catch {
    Write-Error "Frontend build failed: $_"
    exit 1
}

# Step 2: Install backend dependencies
Write-Step "2/5 Checking backend dependencies..."
Set-Location "$rootDir\backend"
try {
    node $dependencyScript "$rootDir\backend" --production @dependencyFlags
    if ($LASTEXITCODE -ne 0) { throw "Backend dependency setup failed (exit $LASTEXITCODE)" }
    Write-Success "Backend dependencies ready"
} catch {
    Write-Error "Backend install failed: $_"
    exit 1
}

# Step 3: Prepare the WeChat publishing browser
Write-Step "3/5 Preparing WeChat browser..."
$env:NODE_ENV = "production"
node (Join-Path $PSScriptRoot "ensure-wechat-browser.mjs")
if ($LASTEXITCODE -ne 0) {
    Write-Error "WeChat browser setup failed (exit $LASTEXITCODE)"
    exit 1
}

# Step 4: Verify dist exists
Write-Step "4/5 Verifying build output..."
$distPath = "$rootDir\frontend\dist"
if (-not (Test-Path "$distPath\index.html")) {
    Write-Error "Build output not found at $distPath\index.html"
    exit 1
}
Write-Success "Build output verified"

# Step 5: Start server
Write-Step "5/5 Starting server..."
Write-Log "`nServer starting on http://0.0.0.0:3000" -ForegroundColor Yellow
Write-Log "Access via: http://<your-ip>:3000" -ForegroundColor Yellow
Write-Log "Press Ctrl+C to stop`n" -ForegroundColor Gray

Set-Location "$rootDir\backend"
node src/server.js
exit $LASTEXITCODE
