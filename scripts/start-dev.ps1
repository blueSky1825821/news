# AI News Broadcasting - Development Start Script
# Usage: .\scripts\start-dev.ps1
# Starts both backend and frontend dev servers

$ErrorActionPreference = "Stop"
$rootDir = Split-Path -Parent $PSScriptRoot

function Write-Step {
    param([string]$Message)
    Write-Host "`n[$Message]" -ForegroundColor Cyan
}

function Write-Info {
    param([string]$Message)
    Write-Host "  $Message" -ForegroundColor Green
}

Write-Host "============================================" -ForegroundColor Green
Write-Host "  AI News Broadcasting - Dev Mode" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green

# Step 1: Install dependencies
Write-Step "1/3 Installing dependencies..."
Set-Location "$rootDir\backend"
npm install | Out-Null
Write-Info "Backend dependencies ready"

Set-Location "$rootDir\frontend"
npm install | Out-Null
Write-Info "Frontend dependencies ready"

# Step 2: Start backend
Write-Step "2/3 Starting backend server..."
$backendJob = Start-Process -FilePath "powershell" -ArgumentList "-NoExit", "-Command", "Set-Location '$rootDir\backend'; npm run dev" -PassThru
Write-Info "Backend starting on http://localhost:3001 (PID: $($backendJob.Id))"

# Wait a bit for backend to start
Start-Sleep -Seconds 2

# Step 3: Start frontend
Write-Step "3/3 Starting frontend dev server..."
$frontendJob = Start-Process -FilePath "powershell" -ArgumentList "-NoExit", "-Command", "Set-Location '$rootDir\frontend'; npm run dev" -PassThru
Write-Info "Frontend starting on http://localhost:3000 (PID: $($frontendJob.Id))"

Write-Host "`n============================================" -ForegroundColor Green
Write-Host "  Both services are starting..." -ForegroundColor Green
Write-Host "  Frontend: http://localhost:3000" -ForegroundColor Yellow
Write-Host "  Backend:  http://localhost:3001" -ForegroundColor Yellow
Write-Host "============================================" -ForegroundColor Green
Write-Host "`nClose the PowerShell windows to stop services." -ForegroundColor Gray
