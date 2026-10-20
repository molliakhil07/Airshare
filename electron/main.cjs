
const { app, BrowserWindow, dialog } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const PORT = Number(process.env.AIRBRIDGE_PORT || 3456);
const BASE_URL = `http://127.0.0.1:${PORT}`;

let mainWindow = null;
let serverProcess = null;
let isQuitting = false;

function getRuntimePaths() {
  if (app.isPackaged) {
    return {
      serverEntry: path.join(
        process.resourcesPath,
        'server',
        'dist',
        'index.js'
      ),
      serverCwd: path.join(process.resourcesPath, 'server'),
      clientDist: path.join(process.resourcesPath, 'client', 'dist'),
    };
  }

  const root = path.resolve(__dirname, '..');

  return {
    serverEntry: path.join(root, 'server', 'dist', 'index.js'),
    serverCwd: path.join(root, 'server'),
    clientDist: path.join(root, 'client', 'dist'),
  };
}

function startServer() {
  const paths = getRuntimePaths();

  if (!fs.existsSync(paths.serverEntry)) {
    throw new Error(`Backend build not found:\n${paths.serverEntry}`);
  }

  if (!fs.existsSync(paths.clientDist, { withFileTypes: false })) {
    throw new Error(`Frontend build not found:\n${paths.clientDist}`);
  }

  const storageDir = path.join(app.getPath('userData'), 'storage');
  fs.mkdirSync(storageDir, { recursive: true });

  serverProcess = spawn(process.execPath, [paths.serverEntry], {
    cwd: paths.serverCwd,
    windowsHide: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      AIRBRIDGE_PORT: String(PORT),
      AIRBRIDGE_HOST: '0.0.0.0',
      AIRBRIDGE_STORAGE: storageDir,
      AIRBRIDGE_CLIENT_DIST: paths.clientDist,
      NODE_ENV: 'production',
    },
  });

  serverProcess.once('error', (error) => {
    console.error('AirShare backend failed to start:', error);
  });
}

async function waitForServer(timeoutMs = 30000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (serverProcess && serverProcess.exitCode !== null) {
      throw new Error(
        `The AirShare backend stopped unexpectedly (exit code ${serverProcess.exitCode}).`
      );
    }

    try {
      const response = await fetch(`${BASE_URL}/api/health`);

      if (response.ok) {
        const result = await response.json();

        if (result.status === 'ok') return;
      }
    } catch {
      // The backend may still be starting.
    }

    await new Promise((resolve) => setTimeout(resolve, 400));
  }

  throw new Error(
    `AirShare did not start within ${timeoutMs / 1000} seconds. Port ${PORT} may already be in use.`
  );
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 620,
    show: false,
    backgroundColor: '#09090b',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.loadURL(BASE_URL);
}

app.whenReady().then(async () => {
  try {
    startServer();
    await waitForServer();
    createWindow();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown startup error';

    dialog.showErrorBox(
      'Unable to start AirShare',
      `${message}\n\nClose any other AirShare server and try again.`
    );

    app.quit();
  }
});

app.on('before-quit', () => {
  isQuitting = true;

  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null && serverProcess && !isQuitting) {
    createWindow();
  }
});
