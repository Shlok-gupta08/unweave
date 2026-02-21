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
  <a href="docs/GPU_SETUP.md"><img src="https://img.shields.io/badge/GPU-Accelerated-orange?style=for-the-badge" alt="GPU Accelerated"></a>
  <a href="docs/CLOUD_DEPLOYMENT.md"><img src="https://img.shields.io/badge/Cloud-Ready-purple?style=for-the-badge" alt="Cloud Ready"></a>
</p>

<p align="center">
  Upload any audio track and instantly isolate <strong>Vocals, Drums, Bass, Guitar, Piano & Other</strong>.<br/>
  Studio-grade 6-stem separation powered by AI.
</p>

---

## ✨ Features

- 🧠 **AI-Powered Separation** — `htdemucs_6s` (Hybrid Transformer Demucs) for unparalleled 6-stem isolation
- ⚡ **Multi-GPU Support** — NVIDIA CUDA, Apple Silicon MPS, AMD ROCm/DirectML
- 🎨 **True Black Premium UI** — Glassmorphism, ambient glow effects, dynamic waveforms
- 🎛️ **Interactive Mixer** — Real-time waveform rendering with individual volume, solo, and mute controls
- 🐳 **Dockerized** — One-command deployment with GPU passthrough
- ☁️ **Cloud-Optimized** — Ready for Azure, AWS, and GCP GPU instances

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                        Frontend                          │
│        React 19 · Vite · Tailwind CSS v4 · WaveSurfer    │
│                  http://localhost:5173                    │
└──────────────────────────┬──────────────────────────────┘
                           │ REST API
┌──────────────────────────▼──────────────────────────────┐
│                        Backend                           │
│           FastAPI · PyTorch · Demucs · FFmpeg             │
│                  http://localhost:8000                    │
│                                                          │
│   GPU Detection: CUDA → MPS → DirectML → CPU            │
└─────────────────────────────────────────────────────────┘
```

| Layer | Technologies |
|-------|-------------|
| **Frontend** | React 19, Vite, Tailwind CSS v4, WaveSurfer.js, Lucide React |
| **Backend** | Python 3.11, FastAPI, PyTorch, Demucs (htdemucs_6s), FFmpeg |
| **Infra** | Docker, Docker Compose (NVIDIA/CPU/ROCm/Cloud configs) |

---

## ⚡ GPU Support

| GPU | Backend | OS | Docker | Speed |
|-----|---------|------|--------|-------|
| NVIDIA (CUDA) | `cuda` | Win, Linux | ✅ | ⚡⚡⚡ |
| Apple Silicon (MPS) | `mps` | macOS | ❌ Native | ⚡⚡ |
| AMD (ROCm) | `rocm` | Linux | ✅ | ⚡⚡ |
| AMD (DirectML) | `directml` | Windows | ❌ Native | ⚡ |
| CPU | `cpu` | All | ✅ | 🐢 |

> **Tip:** Set `DEVICE_OVERRIDE` in `.env` to force a specific device. See [GPU Setup Guide](docs/GPU_SETUP.md).

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

## 🐳 Docker

```bash
# NVIDIA GPU (default)
docker-compose up --build

# CPU only (no GPU required)
docker-compose -f docker-compose.yml -f docker-compose.cpu.yml up --build

# AMD ROCm (Linux)
docker-compose -f docker-compose.yml -f docker-compose.rocm.yml up --build

# Cloud-optimized
docker-compose -f docker-compose.yml -f docker-compose.cloud.yml up --build
```

---

## 📁 Project Structure

```
unweave/
├── frontend/                # React SPA
│   ├── src/
│   │   ├── components/      # UI components (Mixer, Waveform, etc.)
│   │   ├── App.tsx           # Main application
│   │   └── types.ts          # TypeScript types
│   ├── Dockerfile            # Frontend container
│   └── package.json
├── backend/                  # FastAPI + AI
│   ├── main.py               # API server + GPU detection
│   ├── Dockerfile             # NVIDIA CUDA image
│   ├── Dockerfile.cpu         # Lightweight CPU image
│   ├── Dockerfile.rocm        # AMD ROCm image
│   └── requirements.txt
├── scripts/                   # One-click installers
│   ├── install.ps1            # Windows
│   ├── install.sh             # Linux
│   └── install-mac.sh         # macOS
├── docs/                      # Documentation
│   ├── INSTALLATION.md        # Full install guide
│   ├── GPU_SETUP.md           # GPU acceleration guide
│   └── CLOUD_DEPLOYMENT.md    # Cloud deploy guide
├── docker-compose.yml         # NVIDIA GPU (default)
├── docker-compose.cpu.yml     # CPU override
├── docker-compose.rocm.yml    # AMD ROCm override
├── docker-compose.cloud.yml   # Cloud optimization
├── .env.example               # Environment template
├── CONTRIBUTING.md            # Contribution guide
└── LICENSE                    # MIT License
```

---

## ☁️ Cloud Deployment

Deploy the backend as a GPU container and frontend as a static site:

| Platform | Backend | Frontend | Guide |
|----------|---------|----------|-------|
| **Azure** | Container Instances (GPU) | Static Web Apps | [→ Guide](docs/CLOUD_DEPLOYMENT.md#azure) |
| **AWS** | ECS with GPU instances | Amplify | [→ Guide](docs/CLOUD_DEPLOYMENT.md#aws) |
| **GCP** | Cloud Run with GPU | Firebase Hosting | [→ Guide](docs/CLOUD_DEPLOYMENT.md#google-cloud-platform) |

See [Cloud Deployment Guide](docs/CLOUD_DEPLOYMENT.md) for full instructions and cost optimization.

---

## 📖 Documentation

| Document | Description |
|----------|-------------|
| [Installation Guide](docs/INSTALLATION.md) | Setup for Windows, Linux, macOS |
| [GPU Setup](docs/GPU_SETUP.md) | NVIDIA, AMD, Apple Silicon configuration |
| [Cloud Deployment](docs/CLOUD_DEPLOYMENT.md) | Azure, AWS, GCP deployment |
| [Contributing](CONTRIBUTING.md) | How to contribute |

---

## 🤝 Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.
