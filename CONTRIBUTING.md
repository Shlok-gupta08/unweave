# Contributing to Unweave

Thank you for your interest in contributing to Unweave! 🎵

## Getting Started

1. **Fork** the repository on GitHub
2. **Clone** your fork:
   ```bash
   git clone https://github.com/Shlok-gupta08/unweave.git
   cd unweave
   ```
3. **Install dependencies** using the one-click installer for your OS — see [docs/INSTALLATION.md](docs/INSTALLATION.md)
4. **Create a feature branch**:
   ```bash
   git checkout -b feature/my-awesome-feature
   ```

## Development Workflow

### Running in Development

```bash
npm run dev
```

This concurrently starts:
- **Frontend** dev server at `http://localhost:5173` (Vite + HMR)
- **Backend** API server at `http://localhost:8000` (FastAPI + Uvicorn)

### Project Structure

```
unweave/
├── frontend/              # React + Vite + Tailwind CSS v4 SPA
│   ├── public/            # Static assets (logos, icons)
│   └── src/
│       ├── components/    # UI components (Mixer, Track, Uploader, MergeDialog)
│       ├── utils/         # Audio processing utilities (audioUtils, db)
│       ├── types/         # TypeScript type declarations
│       ├── App.tsx        # Root application component
│       ├── main.tsx       # React entry point
│       └── types.ts       # Shared TypeScript interfaces
├── backend/               # Python + FastAPI + Demucs
│   ├── main.py            # API server + GPU detection + separation worker
│   ├── Dockerfile         # NVIDIA CUDA image
│   ├── Dockerfile.cpu     # Lightweight CPU image
│   ├── Dockerfile.rocm    # AMD ROCm image
│   └── requirements.txt
├── scripts/               # One-click OS installers
│   ├── install.ps1        # Windows (PowerShell)
│   ├── install.sh         # Linux (Bash)
│   └── install-mac.sh     # macOS (Bash)
├── docs/                  # Documentation
│   ├── INSTALLATION.md
│   ├── GPU_SETUP.md
│   └── CLOUD_DEPLOYMENT.md
├── docker-compose.yml         # NVIDIA GPU (default)
├── docker-compose.cpu.yml     # CPU override
├── docker-compose.rocm.yml    # AMD ROCm override
├── docker-compose.cloud.yml   # Cloud optimized
├── .env.example               # Environment template
├── CONTRIBUTING.md            # This file
└── LICENSE                    # MIT License
```

## Code Style

### Frontend (TypeScript / React)
- Use **functional components** with React hooks — no class components
- Follow existing patterns in `src/components/`
- All UI must be responsive — test your changes on both desktop and **mobile viewport widths** (e.g., iPhone 14 in Chrome DevTools)
- Run `npm run lint` before committing

### Backend (Python)
- Follow **PEP 8** code style
- Use type hints throughout
- Keep `main.py` focused; extract utilities to separate modules as needed
- Mark CPU-intensive operations as background tasks and use the worker process pattern already in place

## Submitting Changes

1. **Commit** with clear, conventional commit messages:
   ```bash
   git commit -m "feat: add support for FLAC input files"
   git commit -m "fix: resolve track desync on seek"
   git commit -m "docs: update GPU setup guide for ROCm 6"
   ```
2. **Push** your branch:
   ```bash
   git push origin feature/my-awesome-feature
   ```
3. **Open a Pull Request** targeting `main`
4. Describe your changes clearly and link any related issues

## Reporting Issues

Use [GitHub Issues](https://github.com/Shlok-gupta08/unweave/issues) and include:
- **OS** and GPU type
- **Python** and **Node** versions
- **Error logs** from the terminal
- For audio processing bugs: input file format, size, and approximate duration

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
