<p align="center">
  <img src="frontend/public/logo.png" alt="Unweave Logo" width="180" />
</p>

<h1 align="center">Unweave Studio</h1>

<p align="center">
  <strong>Visualize the layers. Isolate the sound. Produce without limits.</strong><br/>
  AI Audio Stem Separation • Multi-Track DAW Timeline • Live Studio Mixer • 360° 8D Binaural Spatial Soundstage
</p>

<p align="center">
  <a href="#-quick-start"><img src="https://img.shields.io/badge/Quick_Start-blue?style=for-the-badge" alt="Quick Start"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="MIT License"></a>
  <a href="#-hardware-acceleration"><img src="https://img.shields.io/badge/GPU-Accelerated-orange?style=for-the-badge" alt="GPU Accelerated"></a>
  <a href="#-native-macos-desktop-app--dmg"><img src="https://img.shields.io/badge/macOS-DMG_Ready-purple?style=for-the-badge" alt="macOS DMG Ready"></a>
</p>

<p align="center">
  Upload any audio track and isolate <strong>Bass, Drums, Other, Vocals, Guitar & Piano</strong>.<br/>
  Full-featured standalone DAW workspace with Multi-Track Timeline Sequencing, Studio Mixer Console, 360° 8D Spatial Audio Mixer, and Master Mixdown Export.
</p>

---

## ✨ Major Features

### 🧠 6-Stem AI Separation Engine & Quality Presets
- 🧬 **6-Stem AI Separation** — Powered by `htdemucs_6s` (Hybrid Transformer Demucs) for studio-grade isolation of **Bass, Drums, Other, Vocals, Guitar, and Piano**.
- 🎚️ **Separation Quality Presets** —
  - **Good Quality** *(Fast & Efficient)*: Standard studio separation with clean stem isolation and balanced fidelity.
  - **Better Quality** *(High Detail)*: Enhanced multi-shift averaging, sharper frequency definition, and reduced vocal bleed.
  - **Best Quality** *(Studio Master)*: Maximum deep-learning shift averaging with pristine clarity and zero phase artifacts.
- 🛡️ **Memory-Curtailed Sequential Queue** — Single-worker execution pipeline processes multi-song batches sequentially with model caching to prevent RAM thrashing and OS freezes.
- 💾 **Persistent Source & Stem Caching** — Audio files and stems are cached directly in persistent IndexedDB and local disk storage, eliminating re-upload prompts on browser reload or application restart.
- ⚡ **Multi-Hardware Acceleration** — Instant acceleration on Apple Silicon (MPS), NVIDIA (CUDA), AMD (DirectML/ROCm), or CPU fallback.

### ⏱️ Multi-Track DAW Timeline Editor
- 🎹 **Multi-Track Audio Sequencing** — Add, arrange, trim, and split audio clips across independent color-coded tracks in canonical order (`Bass` $\rightarrow$ `Drums` $\rightarrow$ `Other` $\rightarrow$ `Vocals` $\rightarrow$ `Guitar` $\rightarrow$ `Piano`).
- 📌 **Persistent Track Headers** — Track titles, solo/mute buttons, and color badges stay permanently visible while scrolling horizontally across complex arrangements.
- 🧲 **Magnetic Snapping Grid** — Configurable snap intervals (`0.1s`, `0.5s`, `1.0s`, or `Free/Off`) for seamless clip positioning.
- ✂️ **Precision Audio Editing** — Clip trimming handles, playhead splitting (`S` / `⌘+K`), gain adjustment, and single-stem routing directly into timeline tracks.
- 🏊 **Media Pool** — Drag and drop stems from different library songs directly into active timeline arrangements with automatic buffer duration decoding and waveform precomputation.
- 📍 **Smart Playhead Auto-Follow** — Viewport smoothly tracks playback across long sessions without interfering with manual scrolling.

### 🎚️ Live Studio Mixer Console
- 🎛️ **Ergonomic Channel Strips** — Dedicated strips for Bass, Drums, Other, Vocals, Guitar, and Piano with high-visibility stem color badges.
- 🎚️ **Calibrated Decibel Faders** — Logarithmically calibrated volume sliders aligning precisely with standard studio decibel scales (`+3.5 dB` to `-\infty dB`).
- 📊 **60fps Real-Time Stereo VU Meters** — Live dynamic peak and RMS level metering powered by the Web Audio API.
- 🎛️ **3-Band Parametric EQ & Pan** — Independent High (10kHz), Mid (1kHz), Low (80Hz) gain controls ($\pm 12\text{ dB}$) and stereo balance.
- 🔇 **Mutually Exclusive Mute & Solo** — Smart soloing and muting workflows with master peak limiter protection.

### 🌐 360° 8D Binaural Spatial Audio Mixer & Visualizer
- 🎧 **Binaural Spatial Orbiting** — Transform isolated stems into an immersive 8D surround soundfield using real-time HRTF pan and delay modeling.
- 🧩 **4 Consolidated Spatial Modules** —
  1. **Bass & Drums (Rhythm)**: Low-end foundation, default locked to Mono Center.
  2. **Other & Ambience (Atmosphere)**: Ambient bed & background FX, default Clockwise 360° orbit.
  3. **Vocals & Lead (Voice)**: Surround lead vocals, default Counter-Clockwise 360° orbit (`direction: -1`, `radius: 2.2m`, `speed: 10s`).
  4. **Guitar & Piano (Harmonics)**: Melodic harmonics, default Clockwise 360° orbit.
- 🛰️ **360° Radar Canvas Visualizer** — Interactive radar map with all 4 quadrants (Front-Left, Front-Right, Back-Left, Back-Right) and glowing audio nodes.
- ☁️ **Dynamic Trailing Clouds** — Nodes cast smooth trailing streamer clouds while in motion that smoothly collapse into glowing aura blobs when paused.
- 🖐️ **Direct Drag-to-Adjust Interaction** — Click and drag any stem node in the visualizer to dynamically set its orbital radius, with auto-lock to centered mono.
- 🎛️ **Dual-Mode Audio Routing** — Pure original stereo routing in Timeline and Mixer, switching dynamically to real-time 8D HRTF binaural rendering with acoustic preprocessing in the Spatial Mixer.

### 🚀 Studio Export Hub
- 💾 **Multi-Format Export** — Studio-quality Lossless WAV (16/24/32-bit PCM) or High-Bitrate MP3 (128/192/256/320 kbps).
- 🎚️ **Custom Stem Mixdowns** — Selectively toggle which active tracks to include in the rendered master file.
- 📦 **Bulk ZIP Packaging** — Export all individual isolated stems in a clean `.zip` archive.
- 🔁 **Loop Region Render** — Export specific timeline loop bounds or complete master arrangements.

---

## 🏗️ Architecture & Audio Routing

```
┌────────────────────────────────────────────────────────────────────────┐
│                              User Interface                            │
│                  (Web Browser  •  Native macOS App)                    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTP (port 8010 / 5180)
┌───────────────────────────────────▼────────────────────────────────────┐
│                       Frontend (React 19 + Vite)                       │
│  • DAW Timeline Engine (Multi-clip, Snapping, Splitting, Auto-follow) │
│  • Studio Live Mixer (Web Audio API, 60fps VU Meters, 3-Band EQ)       │
│  • 360° 8D Spatial Audio Mixer & Interactive Orbit Radar Canvas       │
│  • Dual-Route Audio Engine:                                           │
│      ├─ Stereo Bus: Pure neutral stereo for Timeline & Mixer           │
│      └─ 8D Spatial Bus: HRTF orbital panner + Acoustic Preprocessing   │
│  • Media Pool & Self-Healing Persistent Storage (IndexedDB + Storage) │
│  • Lossless WAV PCM Encoder & High-Bitrate MP3 Export Pipeline        │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ REST API / Subprocess IPC
┌───────────────────────────────────▼────────────────────────────────────┐
│                         Backend (FastAPI + Python)                     │
│  • Hardware Acceleration Detection (Apple Silicon MPS / CUDA / CPU)    │
│  • Serial Execution Queue (Memory-safe Demucs Model Caching)           │
│  • Hybrid Transformer Demucs (htdemucs_6s 6-Stem Isolation Engine)    │
│  • Subprocess Worker with Multi-Pass Shifts & Live Tqdm Parsing        │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 📂 Project Structure

```
Unweave/
├── backend/                        # Python FastAPI Backend
│   ├── main.py                     # API routes, health check, job supervisor
│   ├── worker.py                   # Sequential Demucs execution & stem extraction
│   ├── requirements.txt            # Python dependencies (PyTorch, Demucs, FastAPI)
│   ├── run_embedded_backend.sh     # Embedded runtime launcher for desktop bundle
│   ├── Dockerfile                  # CUDA/GPU Container definition
│   ├── Dockerfile.cpu              # CPU-only Container definition
│   └── Dockerfile.rocm             # AMD ROCm Container definition
│
├── frontend/                       # React 19 + TypeScript + Vite Frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── separator/          # Audio upload, separation queue & stem preview
│   │   │   ├── timeline/           # DAW Timeline, Track lanes, Clips & MediaPool
│   │   │   ├── mixer/              # Live Mixer Console, dB Faders & VU Meters
│   │   │   ├── spatial/            # 360° 8D Spatial Mixer & Radar Canvas
│   │   │   ├── export/             # Lossless WAV & MP3 mixdown / ZIP export
│   │   │   ├── modals/             # Project Manager & Recovery dialogs
│   │   │   └── navigation/         # Responsive bottom tabs & header
│   │   ├── context/
│   │   │   ├── TimelineContext.tsx # DAW state, tracks, clips, history & shortcuts
│   │   │   ├── SongLibraryContext.tsx # Stem library, batch queue & self-healing
│   │   │   └── ProcessingModeContext.tsx # GPU/CPU device state & health check
│   │   ├── services/
│   │   │   ├── audioEngine.ts      # Web Audio API engine (Stereo & 8D HRTF buses)
│   │   │   └── projectStorage.ts   # Persistent IndexedDB & Electron storage layer
│   │   ├── utils/
│   │   │   ├── db.ts               # IndexedDB raw blob cache
│   │   │   ├── waveform.ts         # AudioBuffer peak precomputation & rendering
│   │   │   └── spatial8DRenderer.ts# 8D acoustic sculpting & EQ filters
│   │   ├── App.tsx                 # Main application layout & mode coordination
│   │   └── types.ts                # Unified DAW & Audio TypeScript interfaces
│   ├── package.json
│   └── vite.config.ts
│
├── desktop/                        # Electron Desktop Application
│   ├── main.js                     # Electron lifecycle, native macOS menu & IPC
│   ├── preload.js                  # Secure context bridge for storage & menus
│   └── package.json                # Desktop runtime configuration
│
├── scripts/                        # Build & Packaging Utilities
│   ├── package-mac.sh              # Standalone macOS .app & .dmg packaging script
│   ├── install-mac.sh              # 1-click macOS setup script
│   ├── install.sh                  # 1-click Linux setup script
│   └── install.ps1                 # 1-click Windows setup script
│
├── .github/
│   └── workflows/
│       └── deploy.yml              # CI/CD deployment workflow (paused / on-demand)
│
├── dist-desktop/                   # Packaged Desktop Artifacts (ignored by git)
│   ├── Unweave.app                 # macOS Application bundle
│   └── Unweave.dmg                 # macOS Installer disk image
│
├── docker-compose.yml              # Multi-container orchestration (GPU / CPU)
├── package.json                    # Workspace root scripts
└── README.md                       # Project documentation
```

---

## ⚡ Hardware Acceleration

| Device / GPU | Backend | Supported OS | Processing Speed |
|--------------|---------|--------------|------------------|
| Apple Silicon (MPS) | `mps` | macOS | ⚡⚡⚡ (Fastest on Mac) |
| NVIDIA (CUDA) | `cuda` | Windows, Linux | ⚡⚡⚡ (Ultra Fast) |
| AMD (DirectML / ROCm) | `directml` / `rocm` | Windows, Linux | ⚡⚡ (Fast) |
| CPU Fallback | `cpu` | All platforms | 🐢 (Reliable) |

---

## 🚀 Quick Start

### 1. Web Application

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
- 💚 **Health Check:** `http://localhost:8010/api/health`

---

## 📦 Native macOS Desktop App & DMG

Build the standalone macOS App bundle and custom `.dmg` installer with embedded Python AI runtime:

```bash
# Build macOS .app and .dmg installer
bash scripts/package-mac.sh
```

**Output:**
- `dist-desktop/Unweave.app` (Standalone macOS App Bundle)
- `dist-desktop/Unweave.dmg` (Installer Disk Image)

---

## ⌨️ Keyboard Shortcuts

| Shortcut (macOS) | Shortcut (Win/Linux) | Action |
|------------------|----------------------|--------|
| `Space` | `Space` | Play / Pause playback |
| `S` or `⌘ + K` / `⌘ + B` | `S` or `Ctrl + K` / `Ctrl + B` | Split clip at playhead |
| `⌘ + M` | `Ctrl + M` | Quick-merge selected layers |
| `⌘ + Z` | `Ctrl + Z` | Undo |
| `⌘ + ⇧ + Z` / `⌘ + Y` | `Ctrl + ⇧ + Z` / `Ctrl + Y` | Redo |
| `⌘ + A` | `Ctrl + A` | Select all clips |
| `Delete` / `Backspace` | `Delete` / `Backspace` | Remove selected clip(s) |
| `Escape` | `Escape` | Deselect all |
| `←` / `→` | `←` / `→` | Seek 1s backward / forward (5s with `Shift`) |
| `0` / `Home` | `0` / `Home` | Rewind to start (`0:00.00`) |
| `L` | `L` | Toggle Loop playback |
| `⌘ + 1..5` | `Ctrl + 1..5` | Switch workspace tabs |

---

## 📄 License

Distributed under the MIT License. See [LICENSE](LICENSE) for more details.
