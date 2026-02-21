# ============================================================
# Unweave — Windows One-Click Installer
# Run: Right-click → "Run with PowerShell"
# Or:  powershell -ExecutionPolicy Bypass -File scripts\install.ps1
# ============================================================

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Unweave — One-Click Installer (Windows)  " -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# -----------------------------------------------------------
# Helper: Check if a command exists
# -----------------------------------------------------------
function Test-Command($cmd) {
    return [bool](Get-Command $cmd -ErrorAction SilentlyContinue)
}

# -----------------------------------------------------------
# 1. Check / Install Node.js
# -----------------------------------------------------------
Write-Host "[1/6] Checking Node.js..." -ForegroundColor Yellow
if (Test-Command "node") {
    $nodeVer = node --version
    Write-Host "  ✅ Node.js $nodeVer found" -ForegroundColor Green
} else {
    Write-Host "  ❌ Node.js not found." -ForegroundColor Red
    Write-Host "  📦 Please install Node.js 18+ from: https://nodejs.org/" -ForegroundColor Yellow
    Write-Host "  After installing, restart this script." -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

# -----------------------------------------------------------
# 2. Check / Install Python 3.11+
# -----------------------------------------------------------
Write-Host "[2/6] Checking Python..." -ForegroundColor Yellow
$pythonCmd = $null
foreach ($cmd in @("python", "python3", "py")) {
    if (Test-Command $cmd) {
        $pyVer = & $cmd --version 2>&1
        if ($pyVer -match "3\.(1[1-9]|[2-9]\d)") {
            $pythonCmd = $cmd
            Write-Host "  ✅ $pyVer found" -ForegroundColor Green
            break
        }
    }
}
if (-not $pythonCmd) {
    Write-Host "  ❌ Python 3.11+ not found." -ForegroundColor Red
    Write-Host "  📦 Please install Python 3.11+ from: https://www.python.org/downloads/" -ForegroundColor Yellow
    Write-Host "  Make sure to check 'Add Python to PATH' during installation." -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

# -----------------------------------------------------------
# 3. Check Docker
# -----------------------------------------------------------
Write-Host "[3/6] Checking Docker..." -ForegroundColor Yellow
if (Test-Command "docker") {
    $dockerVer = docker --version
    Write-Host "  ✅ $dockerVer found" -ForegroundColor Green
} else {
    Write-Host "  ⚠️  Docker not found (optional — needed only for Docker deployment)" -ForegroundColor Yellow
    Write-Host "  📦 Install Docker Desktop from: https://www.docker.com/products/docker-desktop/" -ForegroundColor Yellow
}

# -----------------------------------------------------------
# 4. Detect GPU
# -----------------------------------------------------------
Write-Host "[4/6] Detecting GPU..." -ForegroundColor Yellow
$gpuType = "cpu"

# Check NVIDIA
if (Test-Command "nvidia-smi") {
    $nvidiaInfo = nvidia-smi --query-gpu=name --format=csv,noheader 2>$null
    if ($nvidiaInfo) {
        Write-Host "  🟢 NVIDIA GPU detected: $nvidiaInfo" -ForegroundColor Green
        $gpuType = "cuda"
    }
}

# Check AMD (via DirectX)
if ($gpuType -eq "cpu") {
    $amdGpu = Get-CimInstance Win32_VideoController | Where-Object { $_.Name -match "AMD|Radeon" }
    if ($amdGpu) {
        Write-Host "  🟢 AMD GPU detected: $($amdGpu.Name)" -ForegroundColor Green
        $gpuType = "directml"
    }
}

if ($gpuType -eq "cpu") {
    Write-Host "  ⚠️  No dedicated GPU detected — will use CPU" -ForegroundColor Yellow
}

# -----------------------------------------------------------
# 5. Install Backend Dependencies
# -----------------------------------------------------------
Write-Host "[5/6] Setting up backend..." -ForegroundColor Yellow

# Create virtual environment
$venvPath = "backend\.venv"
if (-not (Test-Path $venvPath)) {
    Write-Host "  📦 Creating Python virtual environment..." -ForegroundColor Cyan
    & $pythonCmd -m venv $venvPath
}

# Activate venv
$activateScript = "$venvPath\Scripts\Activate.ps1"
. $activateScript

# Install PyTorch based on GPU type
Write-Host "  📦 Installing PyTorch ($gpuType)..." -ForegroundColor Cyan
switch ($gpuType) {
    "cuda" {
        pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu121
    }
    "directml" {
        pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu
        pip install torch-directml
    }
    default {
        pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu
    }
}

# Install other requirements
Write-Host "  📦 Installing backend dependencies..." -ForegroundColor Cyan
pip install -r backend\requirements.txt

# Install ffmpeg check
if (-not (Test-Command "ffmpeg")) {
    Write-Host "  ⚠️  FFmpeg not found. Please install it:" -ForegroundColor Yellow
    Write-Host "     winget install FFmpeg" -ForegroundColor Yellow
    Write-Host "     Or download from: https://ffmpeg.org/download.html" -ForegroundColor Yellow
}

# -----------------------------------------------------------
# 6. Install Frontend Dependencies
# -----------------------------------------------------------
Write-Host "[6/6] Setting up frontend..." -ForegroundColor Yellow
Push-Location frontend
npm install
Pop-Location

# Also install root concurrently runner
npm install

# -----------------------------------------------------------
# Create .env if not exists
# -----------------------------------------------------------
if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "  📝 Created .env from template" -ForegroundColor Cyan

    # Set device override
    if ($gpuType -ne "cpu") {
        (Get-Content ".env") -replace "DEVICE_OVERRIDE=", "DEVICE_OVERRIDE=$gpuType" | Set-Content ".env"
    }
}

# -----------------------------------------------------------
# Done!
# -----------------------------------------------------------
Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  ✅ Unweave installation complete!        " -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "GPU: $gpuType" -ForegroundColor Cyan
Write-Host ""
Write-Host "To start the app:" -ForegroundColor Yellow
Write-Host "  npm run dev         (frontend + Docker backend)" -ForegroundColor White
Write-Host ""
Write-Host "To run backend natively (without Docker):" -ForegroundColor Yellow
Write-Host "  backend\.venv\Scripts\Activate.ps1" -ForegroundColor White
Write-Host "  cd backend && python -m uvicorn main:app --reload" -ForegroundColor White
Write-Host ""
Read-Host "Press Enter to exit"
