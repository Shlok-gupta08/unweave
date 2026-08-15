<p align="center">
  <img src="frontend/public/logo.png" alt="Unweave Logo" width="180" />
</p>

<h1 align="center">Unweave</h1>

<p align="center">
  <strong>Visualize the layers. Isolate the sound. Produce without limits.</strong>
</p>

<p align="center">
  <a href="#-quick-start"><img src="https://img.shields.io/badge/Quick_Start-blue?style=for-the-badge" alt="Quick Start"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="MIT License"></a>
  <a href="#-gpu-support"><img src="https://img.shields.io/badge/GPU-Accelerated-orange?style=for-the-badge" alt="GPU Accelerated"></a>
  <a href="docs/cloud-guide.html"><img src="https://img.shields.io/badge/Cloud-Ready-purple?style=for-the-badge" alt="Cloud Ready"></a>
</p>

<p align="center">
  Upload any audio track and isolate <strong>Vocals, Drums, Bass, Guitar, Piano & Other</strong>.<br/>
  Full-featured in-browser DAW workspace with Multi-Track Timeline, Live Mixer Console, Stem Merging, and Studio Mixdown Export.
</p>

---

## ✨ Features

### 🧠 AI Separation Engine & Memory Management
- 🧬 **6-Stem AI Separation** — Powered by `htdemucs_6s` (Hybrid Transformer Demucs) for studio-grade isolation of Vocals, Drums, Bass, Guitar, Piano, and Other.
- 🛡️ **Memory-Curtailed Serial Execution** — Intelligent queue pipeline processes multi-song batches sequentially with model caching to prevent high RAM/swap exhaustion and OS lockups.
- ⚡ **Multi-Hardware Support** — Automatic hardware acceleration on NVIDIA CUDA, Apple Silicon MPS, AMD ROCm/DirectML, or CPU fallback.
- 📊 **Real-Time Progress & ETA** — Live percentage progress tracking with dynamic time estimation parsed directly from the separation subprocess.
- 🛑 **Instant Job Cancellation** — Process-level cancellation to immediately terminate active or queued jobs and free resources.

### ⏱️ DAW Multi-Track Timeline Workspace
- 🎹 **Multi-Track Audio Sequencing** — Add, arrange, trim, and split audio clips across independent color-coded tracks.
- 🧲 **Magnetic Snapping Grid** — Configurable snap increments (`0.1s`, `0.5s`, `1.0s`, or `Free/Off`) for seamless clip alignment.
- ✂️ **Precision Audio Trimming & Splitting** — Interactive clip trimming with drag handles and split-at-playhead functionality.
- 📍 **Intelligent Playhead Auto-Follow** — Viewport smoothly follows the playback needle across long arrangements without interrupting manual user scrolling.
- 🎛️ **Lossless Layer Merging** — Select any combination of timeline tracks and merge them instantly into a new lossless 16-bit PCM WAV layer, with destination Song Bucket assignment.
- 📂 **Collapsible Media Pool** — Browse ready stems across multiple song buckets, drag-and-drop into tracks, or import all stems in one click.

### 🎚️ Studio Live Mixer Console
- 🎛️ **Channel Strips** — Dedicated compact strips with bold stem identification (`VOCALS`, `DRUMS`, `BASS`, `GUITAR`, `PIANO`, `OTHER`, `MERGED`).
- 🎚️ **Mathematically Calibrated dB Faders** — Logarithmically calibrated volume sliders aligning precisely with standard studio decibel scales (`+3.5 dB` to `-\infty dB`).
- 📊 **60fps Real-Time Stereo VU Metering** — Live dynamic peak and RMS audio level beaming powered by Web Audio API `AnalyserNode`.
- 🔇 **Mutually Exclusive Mute & Solo** — Soloing a track automatically clears mute, and muting automatically clears solo for foolproof mixing workflows.
- 🎛️ **3-Band Parametric EQ & Stereo Pan** — Independent High (10kHz), Mid (1kHz), Low (80Hz) gain controls ($\pm 12\text{ dB}$) and stereo balance.
- 🛡️ **Master Bus & Limiter** — Streamlined master output strip with integrated peak limiter ($-1.0\text{ dBFS}$) and one-click Unity Gain reset.
- ⏱️ **Real-Time Overview Scrubber** — Synchronized master waveform mini-map with real-time 60fps playhead sweeping.

### 🚀 Export & Mixdown Hub
- 💾 **Multi-Format Export** — Studio-quality Lossless WAV (16/24/32-bit PCM) or High-Bitrate MP3 (128/192/256/320 kbps).
- 🎚️ **Custom Stem Mixdown** — Selectively toggle which active tracks to include in the rendered master file.
- 📦 **Bulk ZIP Packaging** — Export all individual isolated stems in a clean `.zip` archive.
- ⚡ **Turbo Cloud GPU Toggle** — Seamlessly switch between local processing and cloud RunPod serverless GPU infrastructure.

---

## 🏗️ Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                              User Browser                              │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTP (port 80 / 5180)
┌───────────────────────────────────▼────────────────────────────────────┐
│                       Frontend (React 19 + Vite)                       │
│  • DAW Timeline Engine (Multi-clip, Snapping, Splitting, Auto-follow) │
│  • Live Mixer Console (Web Audio API, 60fps VU Meters, 3-Band EQ)     │
│  • Media Pool & Song Bucket Library (IndexedDB Blob Store)             │
│  • Lossless WAV PCM Encoder & MP3 Export Pipeline                     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ REST API / Reverse Proxy
┌───────────────────────────────────▼────────────────────────────────────┐
│                         Backend (FastAPI + Python)                     │
│  • Hardware Acceleration Detection (CUDA / MPS / ROCm / CPU)          │
│  • Serial Worker Queue (Memory-safe Demucs Model Caching)              │
│  • Hybrid Transformer Demucs (htdemucs_6s 6-Stem Isolation)           │
│  • Async Audio Normalization, Resampling & Subprocess Worker           │
└────────────────────────────────────────────────────────────────────────┘
```

| Component | Technologies |
|-----------|--------------|
| **Frontend** | React 19, Vite 7, Tailwind CSS, Web Audio API, Canvas Waveforms, Lucide Icons, JSZip |
| **Backend** | Python 3.11, FastAPI, PyTorch, Demucs (`htdemucs_6s`), FFmpeg, Uvicorn |
| **Infrastructure** | Docker (multi-stage), Nginx, Docker Compose (CUDA / ROCm / CPU / Cloud) |

---

## ⚡ Hardware Acceleration

| Device / GPU | Backend | Supported OS | Docker | Processing Speed |
|--------------|---------|--------------|--------|------------------|
| NVIDIA (CUDA) | `cuda` | Windows, Linux | ✅ | ⚡⚡⚡ (Fastest) |
| Apple Silicon (MPS) | `mps` | macOS | Native | ⚡⚡ (Fast) |
| AMD (ROCm) | `rocm` | Linux | ✅ | ⚡⚡ (Fast) |
| AMD (DirectML) | `directml` | Windows | Native | ⚡ (Moderate) |
| CPU Fallback | `cpu` | All platforms | ✅ | 🐢 (Reliable) |

---

## 🚀 Quick Start

### One-Click Installer

**macOS (Apple Silicon & Intel):**
```bash
git clone https://github.com/Shlok-gupta08/unweave.git
cd unweave
chmod +x scripts/install-mac.sh && ./scripts/install-mac.sh
```

**Linux:**
```bash
git clone https://github.com/Shlok-gupta08/unweave.git
cd unweave
chmod +x scripts/install.sh && ./scripts/install.sh
```

**Windows:**
```powershell
git clone https://github.com/Shlok-gupta08/unweave.git
cd unweave
powershell -ExecutionPolicy Bypass -File scripts\install.ps1
```

### Manual Development Setup

1. **Backend:**
   ```bash
   cd backend
   python3 -m venv .venv
   source .venv/bin/activate   # On Windows: .venv\Scripts\activate
   pip install -r requirements.txt
   python -m uvicorn main:app --reload --port 8010
   ```

2. **Frontend:**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

- 🎨 **UI:** `http://localhost:5180` (or `http://localhost:5173`)
- 🔧 **API:** `http://localhost:8010`
- 💚 **Health Check:** `http://localhost:8010/health`

---

## 🐳 Docker Deployment

Multi-stage production containers with built-in health checks:

```bash
# NVIDIA GPU (Default)
docker-compose up --build

# CPU Only (No GPU needed)
docker-compose -f docker-compose.yml -f docker-compose.cpu.yml up --build

# AMD ROCm (Linux)
docker-compose -f docker-compose.yml -f docker-compose.rocm.yml up --build

# Cloud-Optimized
docker-compose -f docker-compose.yml -f docker-compose.cloud.yml up --build
```

---

## 📁 Repository Structure

```
unweave/
├── frontend/                  # React SPA DAW Client
│   ├── src/
│   │   ├── components/
│   │   │   ├── timeline/      # Multi-track Timeline, Ruler, Playhead, MediaPool
│   │   │   ├── mixer/         # Mixer Console, Channel Strips, 60fps VU Meters
│   │   │   ├── separator/     # AI Stem Uploader, Song Buckets, Stem Cards
│   │   │   ├── export/        # Export & Mixdown Hub, Format Selectors
│   │   │   ├── navigation/    # Header & Tab Navigation Bar
│   │   │   └── MergeDialog.tsx# Lossless Layer Merging Modal
│   │   ├── context/           # TimelineContext, SongLibraryContext, ProcessingModeContext
│   │   ├── services/          # Web Audio Engine, AnalyserNode, Playback Clocks
│   │   └── utils/             # Lossless WAV PCM Encoder, Waveform Canvas Renderer
│   ├── Dockerfile             # Multi-stage: Node build → Nginx serve
│   └── nginx.conf             # Nginx reverse proxy configuration
├── backend/                   # FastAPI Backend & AI Separation Worker
│   ├── main.py                # Job queue, device detection, serial pipeline manager
│   ├── worker.py              # Subprocess worker executing Demucs separation
│   ├── requirements.txt       # PyTorch, Demucs, FastAPI dependencies
│   ├── Dockerfile             # NVIDIA CUDA container image
│   ├── Dockerfile.cpu         # Lightweight CPU container image
│   └── Dockerfile.rocm        # AMD ROCm container image
├── scripts/                   # Automated cross-platform install scripts
├── docs/                      # Cloud deployment and architecture guides
├── docker-compose.yml         # Default GPU Compose file
├── .env.example               # Environment variable reference
├── CONTRIBUTING.md            # Contribution guidelines
└── LICENSE                    # MIT License
```

---

## 🔧 Configuration Reference

| Environment Variable | Default | Description |
|----------------------|---------|-------------|
| `HOST` | `0.0.0.0` | API bind address |
| `PORT` | `8010` | API port |
| `DEVICE_OVERRIDE` | *auto* | Force device: `cuda`, `mps`, `directml`, `cpu` |
| `VITE_API_URL` | `http://localhost:8010` | Frontend backend API URL |
| `VITE_GPU_BACKEND_URL` | *empty* | Optional RunPod / Cloud GPU backend endpoint |
| `CLOUD_MODE` | `false` | Enable aggressive cleanup & container memory limits |
| `MAX_FILE_SIZE_MB` | `50` | Maximum upload file size |
| `CLEANUP_INTERVAL_SECONDS`| `3600` | Stem temporary cache cleanup interval |

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

