#Requires -Version 5.1
$ErrorActionPreference = "Stop"

$RequiredNodeMajor = 22
$OpenwindDir = Join-Path $env:USERPROFILE ".openwind"
$Subdirs = @("logs", "tmp", "exports", "vault")

function Write-Log {
    param([string]$Message)
    Write-Host "`n[openwind] $Message" -ForegroundColor Cyan
}

function Write-LogError {
    param([string]$Message)
    Write-Host "`n[openwind] ERROR: $Message" -ForegroundColor Red
}

function Test-NodeVersion {
    $nodePath = Get-Command node -ErrorAction SilentlyContinue
    if (-not $nodePath) {
        Write-LogError "Node.js is not installed. Please install Node.js >= $RequiredNodeMajor first."
        Write-LogError "Visit https://nodejs.org/ or use a version manager like fnm/nvm."
        exit 1
    }

    $nodeVersion = & node --version
    $major = [int]($nodeVersion -replace "v", "" -split "\.")[0]

    if ($major -lt $RequiredNodeMajor) {
        Write-LogError "Node.js >= $RequiredNodeMajor is required. Found $nodeVersion."
        Write-LogError "Please upgrade Node.js and try again."
        exit 1
    }

    Write-Log "Node.js $nodeVersion detected."
}

function Install-Openwind {
    Write-Log "Installing openwind globally via npm..."
    & npm install -g openwind
    if ($LASTEXITCODE -ne 0) {
        Write-LogError "npm install failed with exit code $LASTEXITCODE."
        exit 1
    }
    Write-Log "openwind installed successfully."
}

function New-OpenwindDirectories {
    Write-Log "Creating openwind data directory at $OpenwindDir..."

    if (-not (Test-Path $OpenwindDir)) {
        New-Item -ItemType Directory -Path $OpenwindDir -Force | Out-Null
    }

    foreach ($subdir in $Subdirs) {
        $path = Join-Path $OpenwindDir $subdir
        if (-not (Test-Path $path)) {
            New-Item -ItemType Directory -Path $path -Force | Out-Null
        }
    }

    Write-Log "Directory structure created:"
    foreach ($subdir in $Subdirs) {
        Write-Host "  $OpenwindDir\$subdir"
    }
}

function Write-Success {
    Write-Host ""
    Write-Host "============================================" -ForegroundColor Green
    Write-Host "  openwind installed successfully" -ForegroundColor Green
    Write-Host "============================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Data directory: $OpenwindDir"
    Write-Host ""
    Write-Host "  Next steps:"
    Write-Host "    1. Run 'openwind onboard' to complete setup"
    Write-Host "    2. Configure your AI provider API key"
    Write-Host "    3. Start ingesting your data"
    Write-Host ""
    Write-Host "  Documentation: https://github.com/openwind-dev/openwind"
    Write-Host ""
}

function Main {
    Write-Log "Starting openwind installation..."
    Test-NodeVersion
    Install-Openwind
    New-OpenwindDirectories
    Write-Success
}

Main
