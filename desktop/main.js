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
// Backend Process Supervisor
// ──────────────────────────────────────────────
async function startBackendSupervisor() {
  const isRunning = await checkBackendHealth();
  if (isRunning) {
    console.log('[Unweave Desktop] Backend is already running on port', BACKEND_PORT);
    return;
  }

  const backendDir = isDev
    ? path.join(__dirname, '..', 'backend')
    : path.join(process.resourcesPath, 'backend');

  const embeddedScript = path.join(backendDir, 'run_embedded_backend.sh');
  const localVenvPy = path.join(backendDir, '.venv', 'bin', 'python');
  const devWorkspacePy = path.join(process.env.HOME || '', 'Workspace', 'Projects', 'Unweave', 'backend', '.venv', 'bin', 'python');

  let launchCmd = null;
  let launchArgs = [];

  if (fs.existsSync(embeddedScript)) {
    launchCmd = '/bin/bash';
    launchArgs = [embeddedScript];
  } else if (fs.existsSync(localVenvPy)) {
    launchCmd = localVenvPy;
    launchArgs = ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', String(BACKEND_PORT)];
  } else if (fs.existsSync(devWorkspacePy)) {
    launchCmd = devWorkspacePy;
    launchArgs = ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', String(BACKEND_PORT)];
  }

  if (!launchCmd) {
    console.log('[Unweave Desktop] No local or embedded backend runtime found.');
    return;
  }

  console.log(`[Unweave Desktop] Starting AI Backend process: ${launchCmd} in ${backendDir}...`);

  try {
    backendProcess = spawn(launchCmd, launchArgs, {
      cwd: backendDir,
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    backendProcess.on('error', (err) => {
      console.warn('[Unweave Desktop] Backend spawn error:', err.message);
      backendProcess = null;
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
