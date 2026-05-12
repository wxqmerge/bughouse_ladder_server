# Bughouse Ladder - Build & Test Script (Windows)
# Builds the frontend and server, then runs all tests including stress tests

$ErrorActionPreference = "Stop"
$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
$ProjectRoot = Split-Path -Parent $ScriptRoot
$OriginalLocation = Get-Location

try {

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " Bughouse Ladder - Build & Test" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# --- Frontend Build ---
Write-Host "[1/4] Building frontend..." -ForegroundColor Yellow
Set-Location $ProjectRoot
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Frontend build failed!" -ForegroundColor Red
    throw "Frontend build failed"
}
Write-Host "Frontend build complete." -ForegroundColor Green
Write-Host ""

# --- Server Build ---
Write-Host "[2/4] Building server..." -ForegroundColor Yellow
Set-Location "$ProjectRoot\server"
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Server build failed!" -ForegroundColor Red
    throw "Server build failed"
}
Write-Host "Server build complete." -ForegroundColor Green
Write-Host ""

# --- Frontend Tests ---
Write-Host "[3/4] Running frontend tests (including stress tests)..." -ForegroundColor Yellow
Set-Location $ProjectRoot
npm run test:run
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Frontend tests failed!" -ForegroundColor Red
    throw "Frontend tests failed"
}
Write-Host "Frontend tests complete." -ForegroundColor Green
Write-Host ""

# --- Server Tests ---
Write-Host "[4/4] Running server tests (including stress tests)..." -ForegroundColor Yellow
Set-Location "$ProjectRoot\server"
npm run test:run
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Server tests failed!" -ForegroundColor Red
    throw "Server tests failed"
}
Write-Host "Server tests complete." -ForegroundColor Green
Write-Host ""

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " ALL DONE - Build & Tests Passed" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
}
finally {
    Set-Location $OriginalLocation
}
