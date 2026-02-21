# Installation Guide

Complete setup instructions for Unweave on all platforms.

## Prerequisites

| Dependency | Version | Required | Notes |
|-----------|---------|----------|-------|
| Node.js | 18+ | ✅ | Frontend + dev runner |
| Python | 3.11+ | ✅ | Backend (native mode) |
| FFmpeg | Latest | ✅ | Audio processing |
| Docker | Latest | ⬜ Optional | Containerized deployment |
| Git | Latest | ⬜ Optional | Cloning the repo |

---

## Quick Install (One-Click)

### Windows
```powershell
git clone https://github.com/Shlok-gupta08/unweave.git
cd unweave
powershell -ExecutionPolicy Bypass -File scripts\install.ps1
```

### Linux
```bash
git clone https://github.com/Shlok-gupta08/unweave.git
cd unweave
chmod +x scripts/install.sh && ./scripts/install.sh
```

### macOS (Intel + Apple Silicon)
```bash
git clone https://github.com/Shlok-gupta08/unweave.git
cd unweave
chmod +x scripts/install-mac.sh && ./scripts/install-mac.sh
```

The installer will automatically:
- ✅ Detect your GPU (NVIDIA, AMD, Apple Silicon)
- ✅ Install the correct PyTorch build
- ✅ Set up a Python virtual environment
- ✅ Install all frontend and backend dependencies
- ✅ Create a `.env` configuration file

---

## Manual Installation

### Windows

1. **Install Node.js 18+**
   - Download from [nodejs.org](https://nodejs.org/)

2. **Install Python 3.11+**
   - Download from [python.org](https://www.python.org/downloads/)
   - ⚠️ Check **"Add Python to PATH"** during installation

3. **Install FFmpeg**
   ```powershell
   winget install FFmpeg
   ```

4. **Clone and set up**
   ```powershell
   git clone https://github.com/Shlok-gupta08/unweave.git
   cd unweave
   
   # Create Python venv
   python -m venv backend\.venv
   backend\.venv\Scripts\Activate.ps1
   
   # Install PyTorch (pick one):
   # NVIDIA GPU:
   pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu121
   # AMD GPU:
   pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu
   pip install torch-directml
   # CPU only:
   pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu
   
   # Install backend deps
   pip install -r backend\requirements.txt
   
   # Install frontend deps
   cd frontend && npm install && cd ..
   npm install
   
   # Create config
   copy .env.example .env
   ```

### Linux (Ubuntu/Debian)

1. **Install system dependencies**
   ```bash
   sudo apt update
   sudo apt install -y nodejs npm python3.11 python3.11-venv ffmpeg
   ```

2. **Clone and set up**
   ```bash
   git clone https://github.com/Shlok-gupta08/unweave.git
   cd unweave
   
   python3.11 -m venv backend/.venv
   source backend/.venv/bin/activate
   
   # Install PyTorch (pick one):
   # NVIDIA GPU:
   pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu121
   # AMD GPU (ROCm):
   pip install torch torchaudio --index-url https://download.pytorch.org/whl/rocm6.0
   # CPU only:
   pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu
   
   pip install -r backend/requirements.txt
   deactivate
   
   cd frontend && npm install && cd ..
   npm install
   cp .env.example .env
   ```

### macOS

1. **Install via Homebrew**
   ```bash
   brew install node python@3.11 ffmpeg
   ```

2. **Clone and set up**
   ```bash
   git clone https://github.com/Shlok-gupta08/unweave.git
   cd unweave
   
   python3.11 -m venv backend/.venv
   source backend/.venv/bin/activate
   
   # Apple Silicon (M1/M2/M3/M4) — MPS acceleration built-in:
   pip install torch torchaudio
   # Intel Mac:
   pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu
   
   pip install -r backend/requirements.txt
   deactivate
   
   cd frontend && npm install && cd ..
   npm install
   cp .env.example .env
   ```

---

## Docker Installation

If you prefer Docker (no Python/FFmpeg needed locally):

1. Install [Docker Desktop](https://www.docker.com/products/docker-desktop/)
2. For NVIDIA GPU: Install the [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html)
3. Run:
   ```bash
   # NVIDIA GPU
   docker-compose up --build
   
   # CPU only
   docker-compose -f docker-compose.yml -f docker-compose.cpu.yml up --build
   
   # AMD ROCm (Linux only)
   docker-compose -f docker-compose.yml -f docker-compose.rocm.yml up --build
   ```

---

## Running the App

### Development Mode (recommended)
```bash
npm run dev
```
This starts both frontend (`http://localhost:5173`) and backend (`http://localhost:8000`).

### Native Backend (no Docker)
```bash
# Windows
backend\.venv\Scripts\Activate.ps1
cd backend && python -m uvicorn main:app --reload

# Linux/macOS
source backend/.venv/bin/activate
cd backend && python -m uvicorn main:app --reload
```

### Verify it's working
Visit `http://localhost:8000/health` — you should see your GPU status.

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `torch not found` | Activate the venv first: `source backend/.venv/bin/activate` |
| `ffmpeg not found` | Install FFmpeg and ensure it's in PATH |
| CUDA out of memory | Close other GPU apps, or set `DEVICE_OVERRIDE=cpu` in `.env` |
| Docker GPU not detected | Install NVIDIA Container Toolkit and restart Docker |
| Port 8000 in use | Change `PORT` in `.env` or stop the conflicting service |
| `ModuleNotFoundError` | Re-run `pip install -r backend/requirements.txt` in the venv |
