# Contributing to Unweave

Thank you for your interest in contributing to Unweave.

## Getting Started

1. **Fork** the repository on GitHub.
2. **Clone** your fork:
   ```bash
   git clone https://github.com/Shlok-gupta08/unweave.git
   cd unweave
   ```
3. **Install dependencies** using the one-click installer for your OS — see [docs/INSTALLATION.md](docs/INSTALLATION.md).
4. **Create a feature branch**:
   ```bash
   git checkout -b feature/my-feature
   ```

---

## Development Workflow

### Running in Development

```bash
npm run dev
```

This concurrently starts:

- **Frontend** dev server at `http://localhost:5180` (or `http://localhost:5173` with Vite + HMR)
- **Backend** API server at `http://localhost:8010` (FastAPI + Uvicorn)

### Project Structure

```
unweave/
├── frontend/                  # React 19 + Vite + TypeScript DAW Application
│   ├── public/                # Static icons, logos, and runtime config
│   └── src/
│       ├── components/
│       │   ├── separator/     # AI stem separation workspace & batch queue
│       │   ├── timeline/      # Multi-track DAW timeline, tracks, clips & MediaPool
│       │   ├── mixer/         # Live mixer console, log dB faders & 60fps VU meters
│       │   ├── spatial/       # 360° 8D spatial audio mixer & radar visualizer
│       │   ├── export/        # Lossless WAV & high-bitrate MP3 export hub
│       │   ├── modals/        # Project manager, recovery, & modal dialogs
│       │   └── navigation/    # Bottom navigation tabs and top app header
│       ├── context/           # TimelineContext, SongLibraryContext, ProcessingModeContext
│       ├── services/          # Web Audio API engine (audioEngine.ts) & projectStorage.ts
│       ├── utils/             # IndexedDB cache (db.ts), waveform.ts, spatial8DRenderer.ts
│       ├── App.tsx            # Main workspace orchestrator & mode coordination
│       ├── main.tsx           # React DOM entry point
│       └── types.ts           # Unified DAW TypeScript interfaces
├── backend/                   # Python 3.11 + FastAPI + Demucs AI Engine
│   ├── main.py                # REST API, health checker & job supervisor
│   ├── worker.py              # Sequential Demucs execution queue worker
│   ├── requirements.txt       # Python dependencies (PyTorch, Demucs, FastAPI)
│   ├── Dockerfile             # NVIDIA CUDA container image
│   ├── Dockerfile.cpu         # Lightweight CPU container image
│   └── Dockerfile.rocm        # AMD ROCm container image
├── desktop/                   # Electron Desktop Application (macOS & Windows)
│   ├── main.js                # Process lifecycle, native menu bar & IPC bridge
│   ├── preload.js             # Context bridge for persistent project storage
│   └── package.json           # Electron application manifest
├── scripts/                   # Automated OS installers & desktop packagers
│   ├── package-mac.sh         # Standalone macOS .app & .dmg packaging script
│   ├── package-win.sh         # Standalone Windows .exe & portable zip packager
│   ├── install-mac.sh         # One-click macOS setup script
│   ├── install.sh             # One-click Linux setup script
│   └── install.ps1            # One-click Windows setup script
├── .github/
│   └── workflows/
│       ├── deploy.yml         # Azure CI/CD deployment workflow (paused)
│       └── release-dmg.yml    # Automated macOS & Windows Release Packager
├── dist-desktop/              # Packaged macOS & Windows binaries (git-ignored)
├── docker-compose.yml         # Multi-container orchestration (GPU / CPU)
├── package.json               # Root workspace scripts
├── CONTRIBUTING.md            # Contribution guidelines
└── LICENSE                    # MIT License
```

---

## Code Style

### Frontend (TypeScript / React)

- Use functional components with React hooks — no class components.
- Follow existing patterns in `src/components/`.
- All UI must be responsive — test your changes on both desktop and mobile viewport widths.
- Run `npm run lint` before committing.

### Backend (Python)

- Follow **PEP 8** code style.
- Use type hints throughout.
- Keep `main.py` focused; extract utilities to separate modules as needed.
- Mark CPU-intensive operations as background tasks and use the worker process pattern already in place.

---

## Submitting Changes

1. **Commit** with clear, conventional commit messages:
   ```bash
   git commit -m "feat: add support for FLAC input files"
   git commit -m "fix: resolve track desync on seek"
   git commit -m "docs: update GPU setup guide for ROCm 6"
   ```
2. **Push** your branch:
   ```bash
   git push origin feature/my-feature
   ```
3. **Open a Pull Request** targeting `main`.
4. Describe your changes clearly and link any related issues.

---

## Reporting Issues

Use [GitHub Issues](https://github.com/Shlok-gupta08/unweave/issues) and include:

- OS and GPU type
- Python and Node versions
- Error logs from the terminal
- For audio processing bugs: input file format, size, and approximate duration

---

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
