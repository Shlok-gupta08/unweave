const { app, BrowserWindow, Menu, shell, dialog, ipcMain } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');
const { spawn } = require('child_process');

// Global safety against unhandled process crashes
process.on('uncaughtException', (err) => {
  console.warn('[Unweave Desktop] Handled uncaught exception:', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.warn('[Unweave Desktop] Handled unhandled rejection:', reason);
});

let mainWindow = null;
let backendProcess = null;
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
const BACKEND_PORT = 8010;
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`;

// ──────────────────────────────────────────────
// Backend Health Checker
// ──────────────────────────────────────────────
function checkBackendHealth() {
  return new Promise((resolve) => {
    const req = http.get(`${BACKEND_URL}/health`, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(800, () => {
      req.destroy();
      resolve(false);
    });
  });
}

// ──────────────────────────────────────────────
// Runtime & Environment Paths
// ──────────────────────────────────────────────
const RUNTIME_DIR = path.join(app.getPath('userData'), 'runtime');
const VENV_DIR = path.join(RUNTIME_DIR, 'venv');
const VENV_PYTHON = process.platform === 'win32'
  ? path.join(VENV_DIR, 'Scripts', 'python.exe')
  : path.join(VENV_DIR, 'bin', 'python');

let engineState = {
  status: 'checking', // 'ready' | 'needs-setup' | 'installing' | 'error'
  progress: 0,
  step: 'Checking AI Engine...',
  detail: '',
  logs: []
};

function broadcastEngineStatus(updates = {}) {
  Object.assign(engineState, updates);
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('engine:status-update', engineState);
  }
}

function findSystemPython() {
  const isWin = process.platform === 'win32';
  const candidates = isWin
    ? [
        'py',
        'python',
        'python3',
        path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python311', 'python.exe'),
        path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python312', 'python.exe'),
        path.join(process.env.ProgramFiles || '', 'Python311', 'python.exe'),
        path.join(process.env.ProgramFiles || '', 'Python312', 'python.exe')
      ]
    : [
        'python3',
        '/opt/homebrew/bin/python3',
        '/usr/local/bin/python3',
        '/usr/bin/python3',
        'python'
      ];

  for (const cmd of candidates) {
    try {
      const args = cmd === 'py' ? ['-3', '--version'] : ['--version'];
      const res = require('child_process').spawnSync(cmd, args, {
        encoding: 'utf8',
        windowsHide: true
      });
      if (res.status === 0) {
        return cmd === 'py' ? 'py -3' : cmd;
      }
    } catch {
      // Continue searching
    }
  }
  return isWin ? 'python' : 'python3';
}

function runCommand(cmd, args, onData) {
  return new Promise((resolve, reject) => {
    let actualCmd = cmd;
    let actualArgs = args;
    if (cmd === 'py -3') {
      actualCmd = 'py';
      actualArgs = ['-3', ...args];
    }
    console.log(`[Runtime Manager] Running: ${actualCmd} ${actualArgs.join(' ')}`);
    const proc = spawn(actualCmd, actualArgs, {
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
      windowsHide: true,
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe']
    });

    proc.stdout.on('data', (data) => {
      const text = data.toString();
      console.log(`[Setup stdout] ${text.trim()}`);
      if (onData) onData(text);
      engineState.logs.push(text.trim());
      if (engineState.logs.length > 200) engineState.logs.shift();
      broadcastEngineStatus();
    });

    proc.stderr.on('data', (data) => {
      const text = data.toString();
      console.log(`[Setup stderr] ${text.trim()}`);
      if (onData) onData(text);
      engineState.logs.push(text.trim());
      if (engineState.logs.length > 200) engineState.logs.shift();
      broadcastEngineStatus();
    });

    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Command ${cmd} exited with code ${code}`));
    });

    proc.on('error', (err) => reject(err));
  });
}

async function verifyVenvHealth() {
  // On packaged builds use the managed venv; in dev also accept the project-local venv.
  const devVenvPy = path.join(__dirname, '..', 'backend', '.venv', 'bin', 'python');
  const pyToTest = (isDev && fs.existsSync(devVenvPy)) ? devVenvPy : VENV_PYTHON;

  if (!fs.existsSync(pyToTest)) {
    console.log('[Verifier] Python binary not found at:', pyToTest);
    return false;
  }

  // Only verify the packages we directly control. Demucs internals are tested
  // indirectly via torch + torchaudio which it depends on.
  // PyTorch cold-import on a fresh machine can take 15-30s — timeout is generous.
  const CHECK_TIMEOUT_MS = 30000;
  const verifyScript = [
    'import sys',
    'import torch',
    'import fastapi',
    'import uvicorn',
    'print("OK")',
  ].join('; ');

  return new Promise((resolve) => {
    const proc = spawn(pyToTest, ['-c', verifyScript], {
      windowsHide: true,
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let out = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { out += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      const ok = code === 0 && out.includes('OK');
      if (!ok) {
        console.warn('[Verifier] Health check failed. exit:', code, '| stderr:', stderr.slice(0, 400));
      }
      resolve(ok);
    });
    proc.on('error', (err) => {
      console.warn('[Verifier] Spawn error:', err.message);
      resolve(false);
    });
    const killer = setTimeout(() => {
      console.warn('[Verifier] Health check timed out after', CHECK_TIMEOUT_MS, 'ms — killing proc');
      try { proc.kill(); } catch {}
      resolve(false);
    }, CHECK_TIMEOUT_MS);
    proc.on('close', () => clearTimeout(killer));
  });
}

// ──────────────────────────────────────────────
// Automated AI Runtime Provisioner
// ──────────────────────────────────────────────
async function installRuntime() {
  if (engineState.status === 'installing') return;

  broadcastEngineStatus({
    status: 'installing',
    progress: 5,
    step: 'Initializing AI Engine...',
    detail: 'Setting up dedicated environment in Application Support...',
    logs: ['[Setup] Starting AI Engine initialization...']
  });

  try {
    if (!fs.existsSync(RUNTIME_DIR)) fs.mkdirSync(RUNTIME_DIR, { recursive: true });

    const systemPython = findSystemPython();
    broadcastEngineStatus({
      progress: 15,
      step: 'Creating Python virtual environment...',
      detail: `Setting up isolated environment (${systemPython})...`,
      logs: [...engineState.logs, `[Setup] Creating virtual environment at ${VENV_DIR}...`]
    });

    // 1. Create Virtualenv if missing
    if (!fs.existsSync(VENV_PYTHON)) {
      try {
        await runCommand(systemPython, ['-m', 'venv', VENV_DIR]);
      } catch (venvErr) {
        console.warn('[Setup] Standard venv creation failed, trying with ensurepip fallback...', venvErr);
        await runCommand(systemPython, ['-m', 'venv', '--without-pip', VENV_DIR]);
        try {
          await runCommand(systemPython, ['-m', 'ensurepip', '--upgrade']);
        } catch {
          // Continue — pip may already be present
        }
      }
    }

    // 2. Upgrade pip
    broadcastEngineStatus({
      progress: 25,
      step: 'Updating package installer (pip)...',
      detail: 'Configuring package manager...',
      logs: [...engineState.logs, '[Setup] Upgrading pip...']
    });
    try {
      await runCommand(VENV_PYTHON, [
        '-m', 'pip', 'install', '--upgrade', 'pip',
        '--no-warn-script-location', '--quiet'
      ]);
    } catch {
      // Continue — a slightly older pip is fine
    }

    // 3. Pre-install PyTorch with the official index URL so the correct platform
    //    wheel is selected (MPS for Apple Silicon, CUDA for NVIDIA, CPU otherwise).
    //    This MUST happen before requirements.txt because requirements.txt does
    //    not specify an index URL and pip may resolve the wrong wheel.
    broadcastEngineStatus({
      progress: 40,
      step: 'Installing PyTorch AI Engine...',
      detail: 'Downloading PyTorch with hardware acceleration support (~1-2 minutes)...',
      logs: [...engineState.logs, '[Setup] Installing PyTorch & torchaudio...']
    });

    const torchIndexUrl = 'https://download.pytorch.org/whl/cpu';
    try {
      await runCommand(VENV_PYTHON, [
        '-m', 'pip', 'install',
        'torch', 'torchaudio',
        '--extra-index-url', torchIndexUrl,
        '--prefer-binary',
        '--no-warn-script-location'
      ]);
    } catch (torchErr) {
      console.warn('[Setup] PyTorch install with index URL failed, falling back to default PyPI...', torchErr.message);
      // Fallback: try without index URL (may still work on many systems)
      await runCommand(VENV_PYTHON, [
        '-m', 'pip', 'install',
        'torch', 'torchaudio',
        '--prefer-binary',
        '--no-warn-script-location'
      ]);
    }

    // 4. Install remaining requirements
    const backendDir = isDev
      ? path.join(__dirname, '..', 'backend')
      : path.join(process.resourcesPath, 'backend');

    const reqFile = path.join(backendDir, 'requirements.txt');

    broadcastEngineStatus({
      progress: 60,
      step: 'Installing Demucs & Backend Dependencies...',
      detail: 'Installing AI model library and API server packages...',
      logs: [...engineState.logs, '[Setup] Installing backend packages...']
    });

    if (fs.existsSync(reqFile)) {
      try {
        await runCommand(VENV_PYTHON, [
          '-m', 'pip', 'install', '-r', reqFile,
          '--prefer-binary',
          '--no-warn-script-location'
        ]);
      } catch (reqErr) {
        console.warn('[Setup] requirements.txt install failed, trying minimal fallback...', reqErr.message);
        broadcastEngineStatus({
          progress: 65,
          step: 'Retrying with minimal package set...',
          detail: 'Some optional packages failed — installing core dependencies only...',
          logs: [...engineState.logs, '[Setup] Retrying minimal install...']
        });
        // Minimal fallback that will definitely work on all platforms
        await runCommand(VENV_PYTHON, [
          '-m', 'pip', 'install',
          'fastapi', 'uvicorn[standard]', 'python-multipart', 'aiofiles',
          'numpy<2', 'scipy', 'demucs', 'imageio-ffmpeg',
          '--prefer-binary', '--no-warn-script-location'
        ]);
      }
    } else {
      await runCommand(VENV_PYTHON, [
        '-m', 'pip', 'install',
        'fastapi', 'uvicorn[standard]', 'python-multipart', 'aiofiles',
        'numpy<2', 'scipy', 'demucs', 'imageio-ffmpeg',
        '--prefer-binary', '--no-warn-script-location'
      ]);
    }

    // 5. Verify installation — give extra time for PyTorch first-launch JIT caching
    broadcastEngineStatus({
      progress: 85,
      step: 'Verifying AI Engine health & hardware acceleration...',
      detail: 'Checking Apple Silicon Metal (MPS) / CUDA / CPU acceleration (may take ~30s)...',
      logs: [...engineState.logs, '[Setup] Running health verification...']
    });

    const isHealthy = await verifyVenvHealth();
    if (!isHealthy) {
      throw new Error(
        'AI Engine verification failed. Please check your Python version (3.9–3.12 required) ' +
        'and internet connection, then click "Rebuild Runtime" to try again.'
      );
    }

    // 6. Start Backend
    broadcastEngineStatus({
      progress: 95,
      step: 'Starting local backend server...',
      detail: 'Launching API daemon on port 8010...',
      logs: [...engineState.logs, '[Setup] Starting backend daemon...']
    });

    await startBackendSupervisor();

    broadcastEngineStatus({
      status: 'ready',
      progress: 100,
      step: 'AI Engine Ready!',
      detail: 'Unweave Studio is ready to separate stems.',
      logs: [...engineState.logs, '[Setup] Setup completed successfully!']
    });
  } catch (err) {
    console.error('[Unweave Desktop] Installation error:', err);
    broadcastEngineStatus({
      status: 'error',
      progress: 0,
      step: 'Setup encountered an issue',
      detail: err.message || 'Failed to install AI Engine dependencies.',
      logs: [...engineState.logs, `[Error] ${err.message}`]
    });
  }
}

// ──────────────────────────────────────────────
// Backend Process Supervisor
// ──────────────────────────────────────────────
async function startBackendSupervisor() {
  const isRunning = await checkBackendHealth();
  if (isRunning) {
    console.log('[Unweave Desktop] Backend is already running on port', BACKEND_PORT);
    broadcastEngineStatus({ status: 'ready', progress: 100, step: 'AI Engine Ready' });
    return;
  }

  const backendDir = isDev
    ? path.join(__dirname, '..', 'backend')
    : path.join(process.resourcesPath, 'backend');

  const devVenvPy = path.join(backendDir, '.venv', 'bin', 'python');
  const devWorkspacePy = path.join(process.env.HOME || '', 'Workspace', 'Projects', 'Unweave', 'backend', '.venv', 'bin', 'python');

  let launchCmd = null;

  if (isDev && fs.existsSync(devVenvPy)) {
    launchCmd = devVenvPy;
  } else if (isDev && fs.existsSync(devWorkspacePy)) {
    launchCmd = devWorkspacePy;
  } else if (fs.existsSync(VENV_PYTHON)) {
    launchCmd = VENV_PYTHON;
  }

  if (!launchCmd) {
    console.log('[Unweave Desktop] No verified virtual environment found. Requesting setup...');
    broadcastEngineStatus({
      status: 'needs-setup',
      progress: 0,
      step: 'First-Launch Setup Required',
      detail: 'Click "Initialize AI Engine" to set up Python and Demucs.'
    });
    // Auto-trigger setup on first launch
    setTimeout(() => {
      installRuntime().catch(() => {});
    }, 1200);
    return;
  }

  console.log(`[Unweave Desktop] Starting AI Backend process: ${launchCmd} in ${backendDir}...`);

  try {
    backendProcess = spawn(launchCmd, ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', String(BACKEND_PORT)], {
      cwd: backendDir,
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    backendProcess.on('error', (err) => {
      console.warn('[Unweave Desktop] Backend spawn error:', err.message);
      backendProcess = null;
      broadcastEngineStatus({ status: 'error', detail: err.message });
    });

    backendProcess.stdout.on('data', (data) => {
      console.log(`[Backend stdout] ${data.toString().trim()}`);
    });

    backendProcess.stderr.on('data', (data) => {
      console.log(`[Backend stderr] ${data.toString().trim()}`);
    });

    backendProcess.on('exit', (code, signal) => {
      console.log(`[Unweave Desktop] Backend process exited with code ${code} signal ${signal}`);
      backendProcess = null;
    });

    // Wait up to 25 seconds for backend to be fully online
    for (let i = 0; i < 50; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const ok = await checkBackendHealth();
      if (ok) {
        console.log('[Unweave Desktop] AI Backend is online and ready.');
        broadcastEngineStatus({ status: 'ready', progress: 100, step: 'AI Engine Ready' });
        break;
      }
    }
  } catch (err) {
    console.warn('[Unweave Desktop] Could not start local Python backend:', err.message);
    broadcastEngineStatus({ status: 'error', detail: err.message });
  }
}

function stopBackendProcess() {
  if (backendProcess) {
    console.log('[Unweave Desktop] Terminating backend daemon...');
    try {
      backendProcess.kill('SIGTERM');
      setTimeout(() => {
        if (backendProcess) {
          backendProcess.kill('SIGKILL');
          backendProcess = null;
        }
      }, 2000);
    } catch {
      // Ignored on exit
    }
  }
}

// ──────────────────────────────────────────────
// Dispatch Menu Action to Frontend
// ──────────────────────────────────────────────
function sendMenuAction(action, payload) {
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('menu-action', action, payload);
  }
}

// ──────────────────────────────────────────────
// Mac-Class Native Menu Bar
// ──────────────────────────────────────────────
function buildMacMenu() {
  const isMac = process.platform === 'darwin';

  const template = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        {
          label: `About ${app.name}`,
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About Unweave',
              message: 'Unweave Studio',
              detail: 'AI Audio Stem Separation & Studio DAW Suite\nVersion 1.0.0\nPowered by Hybrid Transformer Demucs & Web Audio Engine.\nCopyright © 2025-2026 Unweave.',
              buttons: ['OK']
            });
          }
        },
        { type: 'separator' },
        {
          label: 'Preferences...',
          accelerator: 'CmdOrCtrl+,',
          click: () => sendMenuAction('navigate', 'export')
        },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    }] : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'New Studio Project',
          accelerator: 'CmdOrCtrl+N',
          click: () => sendMenuAction('new-project')
        },
        {
          label: 'Save Project As...',
          accelerator: 'Shift+CmdOrCtrl+S',
          click: () => sendMenuAction('save-project-as')
        },
        {
          label: 'Open Project Manager...',
          accelerator: 'CmdOrCtrl+P',
          click: () => sendMenuAction('open-project-manager')
        },
        { type: 'separator' },
        {
          label: 'Import Audio Files...',
          accelerator: 'CmdOrCtrl+O',
          click: () => sendMenuAction('import-audio')
        },
        { type: 'separator' },
        {
          label: 'Export Master Mixdown...',
          accelerator: 'CmdOrCtrl+E',
          click: () => sendMenuAction('export-mixdown')
        },
        {
          label: 'Export All Stems (ZIP)...',
          accelerator: 'Shift+CmdOrCtrl+E',
          click: () => sendMenuAction('export-all-stems')
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        {
          label: 'Undo',
          accelerator: 'CmdOrCtrl+Z',
          click: () => sendMenuAction('undo')
        },
        {
          label: 'Redo',
          accelerator: 'Shift+CmdOrCtrl+Z',
          click: () => sendMenuAction('redo')
        },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'Transport',
      submenu: [
        {
          label: 'Play / Pause',
          accelerator: 'Space',
          click: () => sendMenuAction('toggle-play')
        },
        {
          label: 'Stop & Rewind to Start',
          accelerator: '0',
          click: () => sendMenuAction('stop-rewind')
        },
        { type: 'separator' },
        {
          label: 'Skip Forward 5 Seconds',
          accelerator: 'Right',
          click: () => sendMenuAction('seek-forward')
        },
        {
          label: 'Skip Backward 5 Seconds',
          accelerator: 'Left',
          click: () => sendMenuAction('seek-backward')
        }
      ]
    },
    {
      label: 'Track',
      submenu: [
        {
          label: 'Add Audio Track',
          accelerator: 'CmdOrCtrl+T',
          click: () => sendMenuAction('add-track')
        },
        {
          label: 'Split Clip at Playhead',
          accelerator: 'CmdOrCtrl+K',
          click: () => sendMenuAction('split-clip')
        },
        {
          label: 'Merge Selected Layers...',
          accelerator: 'CmdOrCtrl+M',
          click: () => sendMenuAction('open-merge-dialog')
        },
        { type: 'separator' },
        {
          label: 'Toggle Magnet Snap Grid',
          accelerator: 'CmdOrCtrl+G',
          click: () => sendMenuAction('toggle-snap')
        },
        {
          label: 'Reset All Tracks to Defaults',
          accelerator: 'Shift+CmdOrCtrl+R',
          click: () => sendMenuAction('reset-tracks')
        }
      ]
    },
    {
      label: 'Mixer',
      submenu: [
        {
          label: 'Reset Master Volume (0.0 dB)',
          accelerator: 'CmdOrCtrl+Alt+R',
          click: () => sendMenuAction('reset-master-volume')
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Separate Workspace',
          accelerator: 'CmdOrCtrl+1',
          click: () => sendMenuAction('navigate', 'separate')
        },
        {
          label: 'Timeline Editor',
          accelerator: 'CmdOrCtrl+2',
          click: () => sendMenuAction('navigate', 'editor')
        },
        {
          label: 'Live Mixer Console',
          accelerator: 'CmdOrCtrl+3',
          click: () => sendMenuAction('navigate', 'mixer')
        },
        {
          label: '8D Spatial Mixer',
          accelerator: 'CmdOrCtrl+4',
          click: () => sendMenuAction('navigate', 'spatial')
        },
        {
          label: 'Export Hub',
          accelerator: 'CmdOrCtrl+5',
          click: () => sendMenuAction('navigate', 'export')
        },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac ? [
          { type: 'separator' },
          { role: 'front' },
          { type: 'separator' },
          { role: 'window' }
        ] : [
          { role: 'close' }
        ])
      ]
    },
    {
      role: 'help',
      submenu: [
        {
          label: 'Setup / Repair AI Engine...',
          click: () => {
            sendMenuAction('open-engine-setup');
            installRuntime().catch(() => {});
          }
        },
        {
          label: 'Open Unweave Data Folder',
          click: async () => {
            await shell.openPath(app.getPath('userData'));
          }
        },
        { type: 'separator' },
        {
          label: 'Unweave Documentation',
          click: async () => {
            await shell.openExternal('https://github.com/Shlok-gupta08/unweave#readme');
          }
        },
        {
          label: 'GitHub Repository',
          click: async () => {
            await shell.openExternal('https://github.com/Shlok-gupta08/unweave');
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// ──────────────────────────────────────────────
// Create MainWindow
// ──────────────────────────────────────────────
async function createMainWindow() {
  const isMac = process.platform === 'darwin';
  const isWin = process.platform === 'win32';

  const windowOptions = {
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 700,
    title: 'Unweave Studio',
    backgroundColor: '#09090b',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true
    }
  };

  if (isMac) {
    windowOptions.titleBarStyle = 'hiddenInset';
    windowOptions.trafficLightPosition = { x: 16, y: 14 };
  } else if (isWin) {
    windowOptions.titleBarStyle = 'hidden';
    windowOptions.titleBarOverlay = {
      color: '#000000',
      symbolColor: '#e4e4e7',
      height: 42
    };
  }

  mainWindow = new BrowserWindow(windowOptions);

  buildMacMenu();

  // Load URL or static production build
  if (isDev) {
    // Try to load Vite dev server
    const viteUrl = 'http://localhost:5180';
    const fallbackViteUrl = 'http://localhost:5173';

    mainWindow.loadURL(viteUrl).catch(() => {
      mainWindow.loadURL(fallbackViteUrl).catch(() => {
        mainWindow.loadFile(path.join(__dirname, '..', 'frontend', 'dist', 'index.html'));
      });
    });
  } else {
    mainWindow.loadFile(path.join(__dirname, 'frontend', 'dist', 'index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ──────────────────────────────────────────────
// Dedicated Project & Auto-Save File System
// ──────────────────────────────────────────────
const PROJECTS_DIR = path.join(app.getPath('userData'), 'projects');
const AUTOSAVE_DIR = path.join(PROJECTS_DIR, 'autosave');
const AUTOSAVE_AUDIO_DIR = path.join(AUTOSAVE_DIR, 'audio');

function ensureProjectDirs() {
  try {
    if (!fs.existsSync(PROJECTS_DIR)) fs.mkdirSync(PROJECTS_DIR, { recursive: true });
    if (!fs.existsSync(AUTOSAVE_DIR)) fs.mkdirSync(AUTOSAVE_DIR, { recursive: true });
    if (!fs.existsSync(AUTOSAVE_AUDIO_DIR)) fs.mkdirSync(AUTOSAVE_AUDIO_DIR, { recursive: true });
  } catch (err) {
    console.warn('[Unweave Desktop] Failed to create project directories:', err.message);
  }
}

// Register IPC handlers for project storage
ipcMain.handle('project:get-autosave-info', async () => {
  ensureProjectDirs();
  const metaPath = path.join(AUTOSAVE_DIR, 'project_meta.json');
  const projectPath = path.join(AUTOSAVE_DIR, 'project.json');

  if (!fs.existsSync(projectPath)) {
    return { exists: false };
  }

  try {
    let meta = {};
    if (fs.existsSync(metaPath)) {
      meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    } else {
      const stats = fs.statSync(projectPath);
      meta = { lastSaved: stats.mtimeMs };
    }
    return { exists: true, meta };
  } catch (err) {
    console.warn('[Unweave Desktop] Error reading autosave info:', err.message);
    return { exists: false };
  }
});

ipcMain.handle('project:save-autosave-state', async (_event, payload) => {
  ensureProjectDirs();
  try {
    const projectPath = path.join(AUTOSAVE_DIR, 'project.json');
    const metaPath = path.join(AUTOSAVE_DIR, 'project_meta.json');

    const projectData = JSON.stringify(payload.data || payload, null, 2);
    fs.writeFileSync(projectPath, projectData, 'utf8');

    const meta = {
      songName: payload.meta?.songName || 'Untitled Session',
      stemCount: payload.meta?.stemCount || 0,
      trackCount: payload.meta?.trackCount || 0,
      lastSaved: Date.now(),
      songId: payload.meta?.songId || null,
    };
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');

    return { success: true };
  } catch (err) {
    console.error('[Unweave Desktop] Error saving autosave state:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('project:load-autosave-state', async () => {
  ensureProjectDirs();
  const projectPath = path.join(AUTOSAVE_DIR, 'project.json');
  if (!fs.existsSync(projectPath)) return null;

  try {
    const raw = fs.readFileSync(projectPath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('[Unweave Desktop] Error loading autosave state:', err);
    return null;
  }
});

ipcMain.handle('project:save-audio-file', async (_event, { filename, base64Data }) => {
  ensureProjectDirs();
  try {
    const filePath = path.join(AUTOSAVE_AUDIO_DIR, filename);
    const buffer = Buffer.from(base64Data, 'base64');
    fs.writeFileSync(filePath, buffer);
    return { success: true, filePath };
  } catch (err) {
    console.error('[Unweave Desktop] Error saving audio file:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('project:load-audio-file', async (_event, { filename }) => {
  ensureProjectDirs();
  try {
    const filePath = path.join(AUTOSAVE_AUDIO_DIR, filename);
    if (!fs.existsSync(filePath)) return null;

    const buffer = fs.readFileSync(filePath);
    return buffer.toString('base64');
  } catch (err) {
    console.error('[Unweave Desktop] Error loading audio file:', err);
    return null;
  }
});

ipcMain.handle('project:clear-autosave', async () => {
  ensureProjectDirs();
  try {
    const files = fs.readdirSync(AUTOSAVE_DIR);
    for (const f of files) {
      const fullPath = path.join(AUTOSAVE_DIR, f);
      if (f === 'audio') {
        const audioFiles = fs.readdirSync(fullPath);
        for (const af of audioFiles) {
          fs.unlinkSync(path.join(fullPath, af));
        }
      } else {
        fs.unlinkSync(fullPath);
      }
    }
    return { success: true };
  } catch (err) {
    console.error('[Unweave Desktop] Error clearing autosave:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('project:open-projects-folder', async () => {
  ensureProjectDirs();
  await shell.openPath(PROJECTS_DIR);
  return { success: true, path: PROJECTS_DIR };
});

ipcMain.handle('project:get-projects-path', async () => {
  ensureProjectDirs();
  return PROJECTS_DIR;
});

// Engine Runtime Setup IPC APIs
ipcMain.handle('engine:get-status', async () => {
  return engineState;
});

ipcMain.handle('engine:start-install', async () => {
  installRuntime().catch(() => {});
  return { success: true };
});

ipcMain.handle('engine:repair', async () => {
  try {
    fs.rmSync(VENV_DIR, { recursive: true, force: true });
  } catch (err) {
    console.warn('[Unweave Desktop] Could not clean venv:', err.message);
  }
  installRuntime().catch(() => {});
  return { success: true };
});

// ──────────────────────────────────────────────
// App Lifecycle
// ──────────────────────────────────────────────
app.whenReady().then(async () => {
  ensureProjectDirs();
  await startBackendSupervisor();
  await createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('before-quit', () => {
  stopBackendProcess();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
