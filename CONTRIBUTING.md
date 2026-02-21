# Contributing to Unweave

Thank you for your interest in contributing to Unweave! 🎵

## Getting Started

1. **Fork** the repository
2. **Clone** your fork:
   ```bash
   git clone https://github.com/Shlok-gupta08/unweave.git
   cd unweave
   ```
3. **Install dependencies** using the one-click installer for your OS (see [docs/INSTALLATION.md](docs/INSTALLATION.md))
4. **Create a branch** for your feature:
   ```bash
   git checkout -b feature/my-awesome-feature
   ```

## Development Workflow

### Running in Development
```bash
npm run dev
```
This starts both the frontend dev server (with hot reload) and the backend.

### Project Structure
```
unweave/
├── frontend/          # React + Vite + Tailwind frontend
│   └── src/
│       ├── components/  # UI components
│       ├── App.tsx      # Main app
│       └── types.ts     # TypeScript types
├── backend/           # Python + FastAPI backend
│   └── main.py        # API + separation logic
├── scripts/           # One-click installers
├── docs/              # Documentation
└── docker-compose*.yml  # Docker configurations
```

## Code Style

### Frontend (TypeScript/React)
- Use functional components with hooks
- Follow existing component patterns in `src/components/`
- Run `npm run lint` before committing

### Backend (Python)
- Follow PEP 8
- Use type hints
- Keep `main.py` focused — extract utilities to separate modules as needed

## Submitting Changes

1. **Commit** with clear messages:
   ```bash
   git commit -m "feat: add support for FLAC input files"
   ```
2. **Push** your branch:
   ```bash
   git push origin feature/my-awesome-feature
   ```
3. **Open a Pull Request** against `main`
4. Describe your changes and link any related issues

## Reporting Issues

- Use GitHub Issues
- Include: OS, GPU type, Python/Node versions, and error logs
- For audio processing bugs, mention the input file format and size

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
