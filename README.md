<p align="center">
  <img src="frontend/public/logo.png" alt="Unweave Logo" width="180" />
</p>

<h1 align="center">Unweave</h1>

<p align="center">
  <strong>Visualize the layers. Isolate the sound.</strong>
</p>

<p align="center">
  <a href="#-quick-start"><img src="https://img.shields.io/badge/Quick_Start-blue?style=for-the-badge" alt="Quick Start"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="MIT License"></a>
  <a href="#-gpu-support"><img src="https://img.shields.io/badge/GPU-Accelerated-orange?style=for-the-badge" alt="GPU Accelerated"></a>
  <a href="docs/cloud-guide.html"><img src="https://img.shields.io/badge/Cloud-Ready-purple?style=for-the-badge" alt="Cloud Ready"></a>
</p>

<p align="center">
  Upload any audio track and instantly isolate <strong>Vocals, Drums, Bass, Guitar, Piano & Other</strong>.<br/>
  Studio-grade 6-stem separation powered by AI.
</p>

---

## ✨ Features

### AI Separation Engine
- 🧠 **6-Stem AI Separation** — Powered by `htdemucs_6s` (Hybrid Transformer Demucs) for studio-grade isolation of Vocals, Drums, Bass, Guitar, Piano, and Other
- ⚡ **Multi-GPU Support** — NVIDIA CUDA, Apple Silicon MPS, AMD ROCm/DirectML, and CPU fallback
- 📊 **Real-Time Progress** — Live progress bar with ETA, powered by tqdm parsing from a subprocess worker
- 🔄 **Background Processing** — Separation runs in a subprocess so the API stays responsive
- 🛑 **Cancel Anytime** — Instantly terminate a running separation job with process-level cancellation

### Interactive Mixer
- 🎵 **Play / Pause All** — Global transport control that plays or pauses all tracks in perfect sync without altering mute states
- 🎧 **Solo Play** — Click the play button on any individual track to solo it (mutes all others and starts synced playback)
- 🔇 **Mute / Unmute** — Toggle mute on individual tracks; muted tracks stay silent even during global play
- 🔊 **Unmute All** — Dedicated button to unmute all tracks at once
- 🔀 **Volume Control** — Per-track volume slider for precise mixing
- ⏹️ **Reset Position** — Jump all tracks back to the start
- 📍 **Markers** — Drop up to 3 time markers for quick navigation to specific positions
- ↩️ **Undo / Redo** — Full undo/redo history for mute states and markers (Ctrl+Z / Ctrl+Y)
- 🔗 **Merge to MP3** — Select multiple stems and merge them into a single MP3 track, added as a new layer
- 📥 **Download All** — Export all separated stems as a ZIP archive with native file picker support
- 🗑️ **Remove Merged Tracks** — Delete merged layers you no longer need
- 🎯 **Drift Correction** — Automatic sync correction every 200ms to keep all tracks perfectly aligned

### Waveform Visualization
- 📈 **Real-Time Waveforms** — Powered by WaveSurfer.js with color-coded tracks per stem type
- 🖱️ **Click-to-Seek** — Click anywhere on any waveform to seek all tracks to that position
- 📍 **Marker Overlays** — Visual dashed-line overlays spanning all tracks at marker positions

### UI & UX
- 🎨 **True Black Premium Design** — Glassmorphism effects, ambient glow, backdrop blur throughout
- 📱 **Fully Responsive** — Calibrated for desktop, tablet, and phone screens
- 🎚️ **Custom Dialogs** — No browser `confirm()` or `alert()` — all dialogs are styled in-app
- 💾 **Session Persistence** — Stems saved to IndexedDB so they survive page refreshes
- 🧭 **Drag & Drop Upload** — Intuitive file upload with drag-and-drop support and file type validation

### Infrastructure
- 🐳 **Production Dockerized** — Multi-stage frontend build (Node → Nginx), GPU-accelerated backend
- ☁️ **Cloud-Ready** — Optimized for Azure Container Instances and GCP Cloud Run with GPU
- 🔁 **GitHub CI/CD** — Auto-deploy on push via GitHub Actions (no local rebuilds needed)
- 🧹 **Auto Cleanup** — Background thread that periodically cleans up old stems and expired job entries
- 💚 **Health Checks** — Both frontend (`/nginx-health`) and backend (`/health`) expose health endpoints

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      User Browser                        │
└──────────────────────────┬──────────────────────────────┘
                           │ HTTP (port 80)
┌──────────────────────────▼──────────────────────────────┐
│              Frontend Container (Nginx)                   │
│        React 19 · Vite · Tailwind CSS v4 · WaveSurfer     │
│   Serves SPA · Proxies /api/* and /stems/* to backend     │
└──────────────────────────┬──────────────────────────────┘
                           │ reverse proxy
┌──────────────────────────▼──────────────────────────────┐
│              Backend Container (FastAPI)                   │
│        Python 3.11 · PyTorch · Demucs · FFmpeg            │
│                                                           │
│   GPU: CUDA → MPS → DirectML → CPU (auto-detect)         │
│   Worker: subprocess-based separation with tqdm parsing   │
└─────────────────────────────────────────────────────────┘
```

| Layer | Technologies |
|-------|-------------|
| **Frontend** | React 19, Vite 7, Tailwind CSS v4, WaveSurfer.js 7, Lucide React, JSZip, lamejs |
| **Backend** | Python 3.11, FastAPI, PyTorch, Demucs (htdemucs_6s), audio-separator, FFmpeg |
| **Infra** | Docker (multi-stage), Nginx, Docker Compose (NVIDIA / CPU / ROCm / Cloud) |

---

## ⚡ GPU Support

| GPU | Backend | OS | Docker | Speed |
|-----|---------|------|--------|-------|
| NVIDIA (CUDA) | `cuda` | Win, Linux | ✅ | ⚡⚡⚡ |
| Apple Silicon (MPS) | `mps` | macOS | ❌ Native | ⚡⚡ |
| AMD (ROCm) | `rocm` | Linux | ✅ | ⚡⚡ |
| AMD (DirectML) | `directml` | Windows | ❌ Native | ⚡ |
| CPU | `cpu` | All | ✅ | 🐢 |

> **Tip:** Set `DEVICE_OVERRIDE` in `.env` to force a specific device. See the [Environment Variables](#-environment-variables) section below.

---

## 🚀 Quick Start

### One-Click Install

**Windows:**
```powershell
git clone https://github.com/Shlok-gupta08/unweave.git
cd unweave
powershell -ExecutionPolicy Bypass -File scripts\install.ps1
```

**Linux:**
```bash
git clone https://github.com/Shlok-gupta08/unweave.git
cd unweave
chmod +x scripts/install.sh && ./scripts/install.sh
```

**macOS (Apple Silicon & Intel):**
```bash
git clone https://github.com/Shlok-gupta08/unweave.git
cd unweave
chmod +x scripts/install-mac.sh && ./scripts/install-mac.sh
```

The installer automatically detects your GPU and installs the correct PyTorch build.

### Start the App

```bash
npm run dev
```

- 🎨 **UI:** http://localhost:5173
- 🔧 **API:** http://localhost:8000
- 💚 **Health:** http://localhost:8000/health

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl + Z` | Undo (mute state / markers) |
| `Ctrl + Y` / `Ctrl + Shift + Z` | Redo |

---

## 🐳 Docker

All containers are production-ready with multi-stage builds and health checks.

```bash
# NVIDIA GPU (default) — frontend on port 80, backend on port 8000
docker-compose up --build

# CPU only (no GPU required)
docker-compose -f docker-compose.yml -f docker-compose.cpu.yml up --build

# AMD ROCm (Linux)
docker-compose -f docker-compose.yml -f docker-compose.rocm.yml up --build

# Cloud-optimized (memory limits, logging, restart policies)
docker-compose -f docker-compose.yml -f docker-compose.cloud.yml up --build
```

| Container | Image | Port | Base |
|-----------|-------|------|------|
| Frontend | `unweave-frontend` | 80 | Nginx Alpine (multi-stage build) |
| Backend (CUDA) | `unweave-backend:cuda` | 8000 | NVIDIA CUDA 12.1 + Python 3.11 |
| Backend (CPU) | `unweave-backend:cpu` | 8000 | Python 3.11-slim |
| Backend (ROCm) | `unweave-backend:rocm` | 8000 | ROCm 6.0 |

---

## 📁 Project Structure

```
unweave/
├── frontend/                  # React SPA
│   ├── public/                # Static assets (logos, lame.min.js)
│   ├── src/
│   │   ├── components/        # UI (Mixer, Track, Uploader, MergeDialog)
│   │   ├── utils/             # Audio utilities, IndexedDB helpers
│   │   ├── types/             # TypeScript declarations
│   │   ├── App.tsx            # Root component with session persistence
│   │   ├── main.tsx           # React entry point
│   │   └── types.ts           # Shared TypeScript interfaces
│   ├── Dockerfile             # Multi-stage: Node build → Nginx serve
│   ├── nginx.conf             # Nginx config with API reverse proxy
│   └── .dockerignore
├── backend/                   # FastAPI + AI Engine
│   ├── main.py                # API server, GPU detection, job management
│   ├── worker.py              # Subprocess worker for stem separation
│   ├── Dockerfile             # NVIDIA CUDA 12.1 image
│   ├── Dockerfile.cpu         # Lightweight CPU image
│   ├── Dockerfile.rocm        # AMD ROCm image
│   ├── requirements.txt
│   └── .dockerignore
├── scripts/                   # One-click installers
│   ├── install.ps1            # Windows (PowerShell)
│   ├── install.sh             # Linux (Bash)
│   └── install-mac.sh         # macOS (Bash)
├── docs/                      # Documentation
│   └── cloud-guide.html       # Interactive cloud deployment guide (HTML)
├── docker-compose.yml         # Default (NVIDIA GPU)
├── docker-compose.cpu.yml     # CPU override
├── docker-compose.rocm.yml    # AMD ROCm override
├── docker-compose.cloud.yml   # Cloud optimization override
├── .env.example               # Environment template
├── .github/                   # CI/CD
│   └── workflows/deploy.yml   # GitHub Actions deployment
├── CONTRIBUTING.md            # Contribution guide
└── LICENSE                    # MIT License
```

---

## ☁️ Cloud Deployment

Deploy the backend as a GPU container and frontend as a static Nginx container:

| Platform | Backend | Frontend | Guide |
|----------|---------|----------|-------|
| **Azure** | Container Instances (GPU) | Container Instances (Nginx) | [→ Interactive Guide](docs/cloud-guide.html) |
| **GCP** | Cloud Run with GPU | Cloud Run (Nginx) | [→ Interactive Guide](docs/cloud-guide.html) |

### GitHub CI/CD

Push to `main` and let GitHub Actions build + deploy automatically — no local Docker rebuilds needed. See the [Cloud Guide](docs/cloud-guide.html#github-actions) for workflow YAML templates.

See [Cloud Deployment Guide (HTML)](docs/cloud-guide.html) for full step-by-step instructions with copy-to-clipboard commands, cost estimates, and architecture diagrams.

---

## 🔧 Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DEVICE_OVERRIDE` | *auto* | Force GPU: `cuda`, `mps`, `directml`, `cpu` |
| `CLOUD_MODE` | `false` | Enable cloud optimizations |
| `MAX_FILE_SIZE_MB` | `50` | Max upload size |
| `CLEANUP_INTERVAL_SECONDS` | `3600` | Stem cleanup interval |
| `WORKERS` | `1` | Uvicorn workers (keep 1 for GPU) |

---

## 📖 Documentation

| Document | Description |
|----------|-------------|
| [Cloud Guide (Interactive)](docs/cloud-guide.html) | Azure, GCP, GitHub Actions — step-by-step |
| [Contributing](CONTRIBUTING.md) | How to contribute |

---

## 🤝 Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.
