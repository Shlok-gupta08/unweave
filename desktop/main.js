const { app, BrowserWindow, Menu, shell, dialog, ipcMain } = require('electron');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

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
// Backend Process Supervisor
// ──────────────────────────────────────────────
async function startBackendSupervisor() {
  const isRunning = await checkBackendHealth();
  if (isRunning) {
    console.log('[Unweave Desktop] Backend is already running on port', BACKEND_PORT);
    return;
  }

  console.log('[Unweave Desktop] Starting AI Backend process...');
  const backendDir = isDev
    ? path.join(__dirname, '..', 'backend')
    : path.join(process.resourcesPath, 'backend');

  const pythonExec = isDev
    ? path.join(backendDir, '.venv', 'bin', 'python')
    : path.join(backendDir, '.venv', 'bin', 'python');

  try {
    backendProcess = spawn(pythonExec, ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', String(BACKEND_PORT)], {
      cwd: backendDir,
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
      stdio: ['ignore', 'pipe', 'pipe']
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
  } catch (err) {
    console.warn('[Unweave Desktop] Could not start local Python backend:', err.message);
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
          label: 'Export Hub',
          accelerator: 'CmdOrCtrl+4',
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
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 700,
    title: 'Unweave Studio',
    backgroundColor: '#09090b',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 14 },
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true
    }
  });

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
// App Lifecycle
// ──────────────────────────────────────────────
app.whenReady().then(async () => {
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
