const { app, BrowserWindow, ipcMain, Notification, shell, dialog } = require('electron');
const path  = require('path');
const https = require('https');
const http  = require('http');
const fs    = require('fs');
const { autoUpdater } = require('electron-updater');

// ─── Auto-updater setup ──────────────────────────────────────────────────────
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.logger = console;

function setupAutoUpdater() {
  // Don't check for updates in dev mode (running from source with START.bat)
  if (!app.isPackaged) {
    console.log('[Updater] Skipping — running in dev mode (not packaged)');
    return;
  }

  autoUpdater.on('checking-for-update', () => {
    console.log('[Updater] Checking for updates...');
    sendToRenderer('updater:status', 'checking');
  });

  autoUpdater.on('update-available', (info) => {
    console.log('[Updater] Update available:', info.version);
    sendToRenderer('updater:status', 'available', info.version);
    if (Notification.isSupported()) {
      new Notification({
        title: 'CS2 Vault Update Available',
        body: `Version ${info.version} is downloading...`,
        icon: path.join(__dirname, '..', 'assets', 'icon.png')
      }).show();
    }
  });

  autoUpdater.on('update-not-available', () => {
    console.log('[Updater] App is up to date');
    sendToRenderer('updater:status', 'up-to-date');
  });

  autoUpdater.on('download-progress', (progress) => {
    console.log(`[Updater] Download: ${Math.round(progress.percent)}%`);
    sendToRenderer('updater:progress', Math.round(progress.percent));
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[Updater] Update downloaded:', info.version);
    sendToRenderer('updater:status', 'ready', info.version);
    if (Notification.isSupported()) {
      new Notification({
        title: 'CS2 Vault Update Ready',
        body: `Version ${info.version} downloaded — restart to install`,
        icon: path.join(__dirname, '..', 'assets', 'icon.png')
      }).show();
    }
  });

  autoUpdater.on('error', (err) => {
    console.error('[Updater] Error:', err.message);
    sendToRenderer('updater:status', 'error', err.message);
  });

  // Check for updates after a short delay (let the app load first)
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(e => console.warn('[Updater] Check failed:', e.message));
  }, 5000);
}

function sendToRenderer(channel, ...args) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args);
  }
}

// ─── Storage setup (electron-store — pure JS, no native compilation needed) ───
let store;
function initDB() {
  const Store = require('electron-store');
  store = new Store({ name: 'cs2vault-data' });
  console.log('[Store] Initialised at', store.path);
}

function dbGet(key) {
  return store.has(key) ? store.get(key) : null;
}

function dbSet(key, value) {
  store.set(key, value);
}

// ─── Window ───────────────────────────────────────────────────────────────────
let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width:  1400,
    height: 900,
    minWidth:  1100,
    minHeight: 700,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#080c08',
    show: false,
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
      webSecurity:      true,   // No --disable-web-security needed!
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (process.argv.includes('--dev')) mainWindow.webContents.openDevTools();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  initDB();
  createWindow();
  setupAutoUpdater();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// Ensure all store writes are flushed before quit
app.on('before-quit', (e) => {
  console.log('[App] Closing - store path:', store ? store.path : 'not initialised');
});

// ─── IPC: Auto-updater controls ──────────────────────────────────────────────
ipcMain.handle('updater:check', async () => {
  if (!app.isPackaged) return { status: 'dev-mode' };
  try {
    const result = await autoUpdater.checkForUpdates();
    return { status: 'ok', version: result?.updateInfo?.version };
  } catch(e) {
    return { status: 'error', message: e.message };
  }
});

ipcMain.handle('updater:install', () => {
  autoUpdater.quitAndInstall(false, true);
});

// ─── IPC: Storage (replaces localStorage) ────────────────────────────────────
ipcMain.handle('store:get', (_e, key) => {
  const val = dbGet(key);
  return val !== undefined ? val : null;
});

ipcMain.handle('store:set', (_e, key, value) => {
  dbSet(key, value);
  return true;
});

ipcMain.handle('store:delete', (_e, key) => {
  store.delete(key);
  return true;
});

// ─── IPC: HTTP fetch (replaces renderer fetch for external APIs) ──────────────
const zlib = require('zlib');

function doFetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed   = new URL(url);
    const isHttps  = parsed.protocol === 'https:';
    const lib      = isHttps ? https : http;

    const reqOpts = {
      hostname: parsed.hostname,
      port:     parsed.port || (isHttps ? 443 : 80),
      path:     parsed.pathname + parsed.search,
      method:   options.method || 'GET',
      headers:  options.headers || {},
      timeout:  12000,
    };

    // Always accept compressed responses
    if (!reqOpts.headers['Accept-Encoding'] && !reqOpts.headers['accept-encoding']) {
      reqOpts.headers['Accept-Encoding'] = 'br, gzip, deflate';
    }

    const req = lib.request(reqOpts, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const encoding = (res.headers['content-encoding'] || '').toLowerCase();

        const done = (decoded) => {
          resolve({ status: res.statusCode, body: decoded.toString('utf8'), headers: res.headers });
        };

        if (encoding === 'br') {
          zlib.brotliDecompress(buffer, (err, result) => {
            if (err) { console.warn('[Fetch] Brotli decompress failed:', err.message); done(buffer); }
            else done(result);
          });
        } else if (encoding === 'gzip') {
          zlib.gunzip(buffer, (err, result) => {
            if (err) { console.warn('[Fetch] Gzip decompress failed:', err.message); done(buffer); }
            else done(result);
          });
        } else if (encoding === 'deflate') {
          zlib.inflate(buffer, (err, result) => {
            if (err) { console.warn('[Fetch] Deflate decompress failed:', err.message); done(buffer); }
            else done(result);
          });
        } else {
          done(buffer);
        }
      });
    });

    req.on('error',   reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    req.end();
  });
}

ipcMain.handle('fetch:get', async (_e, url, headers) => {
  try {
    const result = await doFetch(url, { headers: headers || {} });
    return { ok: result.status >= 200 && result.status < 300, status: result.status, body: result.body };
  } catch (e) {
    return { ok: false, status: 0, body: '', error: e.message };
  }
});

// ─── IPC: Native notifications ────────────────────────────────────────────────
ipcMain.handle('notify', (_e, title, body) => {
  if (Notification.isSupported()) {
    new Notification({ title, body, icon: path.join(__dirname, '..', 'assets', 'icon.png') }).show();
  }
});

// ─── IPC: App info ────────────────────────────────────────────────────────────
ipcMain.handle('app:version', () => app.getVersion());
ipcMain.handle('app:userData', () => app.getPath('userData'));

// ─── IPC: Export file dialog ──────────────────────────────────────────────────
ipcMain.handle('export:save', async (_e, filename, content) => {
  const { filePath } = await dialog.showSaveDialog(mainWindow, {
    defaultPath: path.join(app.getPath('downloads'), filename),
    filters: [
      { name: 'CSV Files', extensions: ['csv'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  if (filePath) {
    fs.writeFileSync(filePath, content, 'utf8');
    return { saved: true, filePath };
  }
  return { saved: false };
});

// ─── IPC: Import file dialog ─────────────────────────────────────────────────
ipcMain.handle('import:open', async (_e) => {
  const { filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'CSV Files', extensions: ['csv'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  if (filePaths && filePaths.length > 0) {
    const content = fs.readFileSync(filePaths[0], 'utf8');
    return { opened: true, content, filePath: filePaths[0] };
  }
  return { opened: false };
});
