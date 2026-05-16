# Bughouse Ladder - Build & Test Script (Windows)
# Builds the frontend and server, then runs all tests including stress tests
# Usage: .\deploy\build-and-test.ps1 [--force|--force-critical]
#   --force                Bypass all cooldowns and force package update
#   --force-critical       Force package update for critical security patches (2-day cooldown)

$ErrorActionPreference = "Stop"
$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
$ProjectRoot = Split-Path -Parent $ScriptRoot
$OriginalLocation = Get-Location

# Dependency cooldown configuration
# Normal cooldown: 7 days between package updates
# Critical security patches: 2 days (use --force-critical flag)
$LastPackageUpdateFile = Join-Path $ProjectRoot ".last-package-update"
$PackageCooldownNormal = 604800    # 7 days in seconds
$PackageCooldownCritical = 172800  # 2 days in seconds

# Parse command-line flags
$ForceUpdate = $false
$ForceCritical = $false

foreach ($arg in $args) {
    switch ($arg) {
        "--force" { $ForceUpdate = $true }
        "--force-critical" { $ForceCritical = $true }
        default {
            Write-Host "Unknown flag: $arg" -ForegroundColor Red
            Write-Host "Usage: .\deploy\build-and-test.ps1 [--force|--force-critical]" -ForegroundColor Yellow
            exit 1
        }
    }
}

# Check if package cooldown has passed
# Returns $true if cooldown passed, $false if still in cooldown
function Test-PackageCooldown {
    param(
        [string]$CooldownType = "normal"
    )
    
    $cooldownSeconds = if ($CooldownType -eq "critical") { $PackageCooldownCritical } else { $PackageCooldownNormal }
    
    if (-not (Test-Path $LastPackageUpdateFile)) {
        return $true  # Never updated — allow
    }
    
    if ($ForceUpdate -eq $true) {
        return $true  # Force override
    }
    
    if ($ForceCritical -eq $true -and $CooldownType -eq "critical") {
        return $true  # Critical force override
    }
    
    $lastUpdate = (Get-Item $LastPackageUpdateFile).LastWriteTimeUtc
    $now = Get-Date
    $diff = ($now - $lastUpdate).TotalSeconds
    
    if ($diff -ge $cooldownSeconds) {
        return $true  # Cooldown passed
    }
    
    return $false  # Still in cooldown
}

# Record the timestamp of the last package update
function Set-PackageUpdateTimestamp {
    param()
    Get-Date -UFormat "%s" | Out-File -FilePath $LastPackageUpdateFile -Encoding utf8
}

# Get human-readable time since last update
function Get-TimeSinceLastUpdate {
    if (-not (Test-Path $LastPackageUpdateFile)) {
        return "never"
    }
    
    $lastUpdate = (Get-Item $LastPackageUpdateFile).LastWriteTimeUtc
    $now = Get-Date
    $diff = ($now - $lastUpdate).TotalSeconds
    $days = [math]::Floor($diff / 86400)
    $hours = [math]::Floor(($diff % 86400) / 3600)
    
    return "${days}d ${hours}h ago"
}

# Scan lockfile for packages published within cooldown period
# Returns $true if any package is too new, $false if all packages are old enough
function Test-LockfileAge {
    param(
        [string]$LockfilePath,
        [string]$CooldownType = "normal"
    )
    
    $cooldownSeconds = if ($CooldownType -eq "critical") { $PackageCooldownCritical } else { $PackageCooldownNormal }
    
    if (-not (Test-Path $LockfilePath)) {
        return $false  # No lockfile — nothing to scan
    }
    
    $lockfileContent = Get-Content $LockfilePath -Raw
    
    # Extract package names and versions from lockfile using regex
    $packages = [regex]::Matches($lockfileContent, '"name"\s*:\s*"([^"]+)"\s*,\s*"version"\s*:\s*"([^"]+)"\s*,\s*"sha512"\s*:\s*"([^"]+)"') | 
        ForEach-Object {
            $name = $_.Groups[1].Value
            $sha = $_.Groups[3].Value
            # Skip scoped packages or internal references
            if ($name -notmatch '^@' -and $sha -match '^[a-f0-9]{64}$') {
                return "$name@$sha"
            }
            return $null
        } | Where-Object { $_ -ne $null } | Sort-Object -Unique
    
    if ($packages.Count -eq 0) {
        return $false  # No packages found
    }
    
    $newPackages = @()
    
    foreach ($pkg in $packages) {
        $pkgName = $pkg.Split('@')[0]
        
        try {
            # Query npm registry for publication date
            $response = Invoke-WebRequest -Uri "https://registry.npmjs.org/$pkgName" -UseBasicParsing -TimeoutSec 5 -ErrorAction SilentlyContinue
            
            if ($response.StatusCode -eq 200) {
                $json = $response.Content | ConvertFrom-Json
                $pubDate = $json.time | Get-Member -MemberType NoteProperty | Select-Object -Last 1 | ForEach-Object { $json.time.($_.Name) }
                
                if ($pubDate) {
                    $pkgEpoch = [datetime]::Parse($pubDate).ToUniversalTime()
                    $now = Get-Date
                    $diff = ($now - $pkgEpoch).TotalSeconds
                    
                    if ($diff -lt $cooldownSeconds -and $diff -gt 0) {
                        $newPackages += "$pkgName ($pubDate)"
                    }
                }
            }
        } catch {
            # Skip if we can't determine publication date
            continue
        }
    }
    
    if ($newPackages.Count -gt 0) {
        Write-Host "  WARNING: The following packages were published within the cooldown period:" -ForegroundColor Yellow
        foreach ($pkg in $newPackages) {
            Write-Host "    - $pkg" -ForegroundColor Yellow
        }
        Write-Host "  Consider waiting before deploying to avoid supply chain attacks." -ForegroundColor Yellow
        return $true  # Found new packages
    }
    
    return $false  # All packages old enough
}

try {

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " Bughouse Ladder - Build & Test" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# --- 1. Package Installation with Cooldown ---
Write-Host "[1/6] Installing dependencies..." -ForegroundColor Yellow

$cooldownType = "normal"
if ($ForceCritical -eq $true) {
    $cooldownType = "critical"
    Write-Host "  WARNING: Using critical security patch cooldown (2 days)" -ForegroundColor Yellow
}

if (Test-PackageCooldown $cooldownType) {
    # Frontend install
    Set-Location $ProjectRoot
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Frontend npm install failed!" -ForegroundColor Red
        throw "Frontend npm install failed"
    }
    Set-PackageUpdateTimestamp
    Write-Host "  Frontend dependencies installed (packages updated after ${PackageCooldownNormal} second cooldown)." -ForegroundColor Green
    Write-Host ""
    
    # Server install
    Write-Host "[2/6] Installing server dependencies..." -ForegroundColor Yellow
    Set-Location "$ProjectRoot\server"
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Server npm install failed!" -ForegroundColor Red
        throw "Server npm install failed"
    }
    Write-Host "  Server dependencies installed." -ForegroundColor Green
    Write-Host ""
} else {
    $lastUpdate = Get-TimeSinceLastUpdate
    Write-Host "  Skipped npm install - package cooldown active (last updated: $lastUpdate)" -ForegroundColor Yellow
    Write-Host ""
}

# --- 1.5. Lockfile Scan for Newly Published Packages ---
Write-Host "[3/6] Scanning lockfile for newly published packages..." -ForegroundColor Yellow
$newPackagesFound = $false

Set-Location $ProjectRoot
if (Test-LockfileAge "package-lock.json" "normal") {
    $newPackagesFound = $true
}

if (Test-LockfileAge "server\package-lock.json" "normal") {
    $newPackagesFound = $true
}

if ($newPackagesFound -eq $false) {
    Write-Host "  All packages are older than the cooldown period." -ForegroundColor Green
}
Write-Host ""

# --- 4. Frontend Build ---
Write-Host "[4/6] Building frontend..." -ForegroundColor Yellow
Set-Location $ProjectRoot
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Frontend build failed!" -ForegroundColor Red
    throw "Frontend build failed"
}
Write-Host "Frontend build complete." -ForegroundColor Green
Write-Host ""

# --- 5. Server Build ---
Write-Host "[5/6] Building server..." -ForegroundColor Yellow
Set-Location "$ProjectRoot\server"
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Server build failed!" -ForegroundColor Red
    throw "Server build failed"
}
Write-Host "Server build complete." -ForegroundColor Green
Write-Host ""

# --- 6. Frontend Tests ---
Write-Host "[6/6] Running frontend tests (including stress tests)..." -ForegroundColor Yellow
Set-Location $ProjectRoot
npm run test:run
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Frontend tests failed!" -ForegroundColor Red
    throw "Frontend tests failed"
}
Write-Host "Frontend tests complete." -ForegroundColor Green
Write-Host ""

# --- 7. Server Tests ---
Write-Host "[7/7] Running server tests (including stress tests)..." -ForegroundColor Yellow
Set-Location "$ProjectRoot\server"
npm run test:run
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Server tests failed!" -ForegroundColor Red
    throw "Server tests failed"
}
Write-Host "Server tests complete." -ForegroundColor Green
Write-Host ""

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " ALL DONE - Build and Tests Passed" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
}
finally {
    Set-Location $OriginalLocation
}
