const { app, BrowserWindow, Tray, Menu, shell, ipcMain, desktopCapturer, session } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');

// Logger - writes to app directory
const logFile = path.join(app.getPath('userData'), 'r1gate-debug.log');
function log(message) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}\n`;
  console.log(line.trim());
  try {
    fs.appendFileSync(logFile, line);
  } catch (e) {
    console.error('Failed to write log:', e);
  }
}

log('App starting...');
log(`Log file: ${logFile}`);

// Single instance lock - prevent duplicate processes
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  // Another instance is running - quit immediately
  app.exit(0);
}

// Only continue if we got the lock
let mainWindow;
let splashWindow;
let tray;

// Handle second instance launch
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.show();
    mainWindow.focus();
  }
});

// Configure auto-updater
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.disableDifferentialDownload = true; // Force full download, not delta
autoUpdater.logger = {
  info: (msg) => log(`[AutoUpdater INFO] ${msg}`),
  warn: (msg) => log(`[AutoUpdater WARN] ${msg}`),
  error: (msg) => log(`[AutoUpdater ERROR] ${msg}`),
  debug: (msg) => log(`[AutoUpdater DEBUG] ${msg}`),
};
autoUpdater.logger.transports = { file: { level: 'debug' } };

function sendStatusToSplash(status, data = null) {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.webContents.send('update-status', status, data);
  }
}

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 300,
    height: 350,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'splashPreload.js'),
    },
  });

  splashWindow.loadFile(path.join(__dirname, 'splash.html'));
  splashWindow.center();

  // Send current version to splash
  splashWindow.webContents.on('did-finish-load', () => {
    sendStatusToSplash('version', app.getVersion());
    checkForUpdates();
  });
}

async function checkInternetConnection() {
  log('Checking internet connection...');
  const dns = require('dns').promises;
  try {
    const result = await dns.lookup('web.r1gate.ru');
    log(`DNS lookup web.r1gate.ru: ${JSON.stringify(result)}`);
    return true;
  } catch (err) {
    log(`DNS lookup web.r1gate.ru failed: ${err.message}`);
    // Fallback: try google
    try {
      await dns.lookup('google.com');
      log('Fallback DNS lookup google.com: success');
      return true;
    } catch (err2) {
      log(`Fallback DNS lookup google.com failed: ${err2.message}`);
      return false;
    }
  }
}

async function checkForUpdates() {
  log(`Current app version: ${app.getVersion()}`);
  log(`App is packaged: ${app.isPackaged}`);

  // Check internet connection first
  sendStatusToSplash('checking-connection');
  const hasInternet = await checkInternetConnection();

  if (!hasInternet) {
    log('No internet connection detected');
    sendStatusToSplash('no-internet');
    return; // Don't proceed without internet
  }

  // In development, skip update check
  if (!app.isPackaged) {
    log('Development mode - skipping update check');
    sendStatusToSplash('not-available');
    setTimeout(() => {
      createMainWindow();
    }, 1000);
    return;
  }

  // Check for updates
  log('Starting update check from GitHub...');
  sendStatusToSplash('checking');

  try {
    const result = await autoUpdater.checkForUpdates();
    log(`Update check result: ${JSON.stringify(result?.updateInfo?.version || 'no info')}`);
  } catch (err) {
    log(`Update check failed: ${err.message}`);
    log(`Error details: ${err.stack}`);
    sendStatusToSplash('error');
    setTimeout(() => {
      createMainWindow();
    }, 2000);
  }
}

// Auto-updater events
autoUpdater.on('checking-for-update', () => {
  log('Checking for update...');
  sendStatusToSplash('checking');
});

autoUpdater.on('update-available', (info) => {
  log(`Update available: ${info.version} (current: ${app.getVersion()})`);
  sendStatusToSplash('available', { version: info.version });
});

autoUpdater.on('update-not-available', (info) => {
  log(`No update available. Current version: ${app.getVersion()}, Latest: ${info?.version || 'unknown'}`);
  sendStatusToSplash('not-available');
  setTimeout(() => {
    createMainWindow();
  }, 500);
});

autoUpdater.on('download-progress', (progress) => {
  const percent = Math.round(progress.percent);
  log(`Download progress: ${percent}% (${Math.round(progress.transferred / 1024)}KB / ${Math.round(progress.total / 1024)}KB)`);
  sendStatusToSplash('downloading', {
    percent: progress.percent,
    bytesPerSecond: progress.bytesPerSecond,
    transferred: progress.transferred,
    total: progress.total,
  });
});

autoUpdater.on('update-downloaded', (info) => {
  log(`Update downloaded: ${info.version}. Installing...`);
  sendStatusToSplash('downloaded');
  setTimeout(() => {
    // Force quit all windows and install
    app.isQuitting = true;
    autoUpdater.quitAndInstall(true, true); // silent install, run after
  }, 1500);
});

autoUpdater.on('error', (err) => {
  log(`Auto-updater error: ${err.message}`);
  log(`Error stack: ${err.stack}`);
  sendStatusToSplash('error');
  setTimeout(() => {
    createMainWindow();
  }, 2000);
});

function createMainWindow() {
  if (mainWindow) return;

  log('Creating main window...');
  sendStatusToSplash('loading');

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'R1Gate Voice',
    icon: path.join(__dirname, 'icon.png'),
    frame: false,
    show: false,
    backgroundColor: '#0f0f23',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false, // Allow cross-origin requests from file://
      preload: path.join(__dirname, 'preload.js'),
    },
    autoHideMenuBar: true,
  });

  // Log renderer console messages
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    const levels = ['verbose', 'info', 'warning', 'error'];
    log(`[Renderer ${levels[level] || level}] ${message}`);
  });

  // Log renderer errors
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    log(`[Renderer] Failed to load: ${errorCode} - ${errorDescription}`);
  });

  // Show loading status in splash
  sendStatusToSplash('loading');

  // Load local frontend
  const indexPath = path.join(__dirname, 'web', 'index.html');
  log(`Loading: ${indexPath}`);
  mainWindow.loadFile(indexPath);

  // Wait until page is fully rendered
  let windowShown = false;

  const showMainWindow = () => {
    if (windowShown) return;
    windowShown = true;

    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
      splashWindow = null;
    }
    mainWindow.show();
  };

  mainWindow.once('ready-to-show', showMainWindow);

  // Fallback timeout in case ready-to-show doesn't fire
  setTimeout(showMainWindow, 15000);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.includes('web.r1gate.ru')) {
      return { action: 'allow' };
    }
    if (url.startsWith('http')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window-maximized', true);
  });

  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window-maximized', false);
  });
}

function createTray() {
  tray = new Tray(path.join(__dirname, 'icon.png'));

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open R1Gate',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Check for Updates',
      click: () => {
        if (app.isPackaged) {
          autoUpdater.checkForUpdates();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Exit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setToolTip('R1Gate Voice');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow) {
      mainWindow.show();
    }
  });
}

// IPC handlers
ipcMain.handle('get-sources', async () => {
  const sources = await desktopCapturer.getSources({
    types: ['window', 'screen'],
    thumbnailSize: { width: 320, height: 180 }
  });
  return sources.map(source => ({
    id: source.id,
    name: source.name,
    thumbnail: source.thumbnail.toDataURL()
  }));
});

ipcMain.on('window-minimize', () => {
  if (mainWindow) {
    mainWindow.minimize();
  }
});

ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on('window-close', () => {
  if (mainWindow) {
    mainWindow.close();
  }
});

ipcMain.handle('window-is-maximized', () => {
  if (mainWindow) {
    return mainWindow.isMaximized();
  }
  return false;
});

// Start the application
app.whenReady().then(() => {
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    desktopCapturer.getSources({ types: ['screen', 'window'] }).then((sources) => {
      if (sources.length > 0) {
        callback({ video: sources[0], audio: 'loopback' });
      } else {
        callback({});
      }
    });
  });

  createSplashWindow();
  createTray();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createSplashWindow();
  } else if (mainWindow) {
    mainWindow.show();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('web-contents-created', (event, contents) => {
  contents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowedPermissions = ['media', 'mediaKeySystem', 'notifications', 'display-capture'];
    if (allowedPermissions.includes(permission)) {
      callback(true);
    } else {
      callback(false);
    }
  });
});
