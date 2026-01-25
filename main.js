const { app, BrowserWindow, Tray, Menu, shell, ipcMain, desktopCapturer, session } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');

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
  const https = require('https');
  return new Promise((resolve) => {
    const req = https.get('https://web.r1gate.ru', { timeout: 10000 }, (res) => {
      resolve(res.statusCode === 200 || res.statusCode === 301 || res.statusCode === 302);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function checkForUpdates() {
  // Check internet connection first
  sendStatusToSplash('checking-connection');
  const hasInternet = await checkInternetConnection();

  if (!hasInternet) {
    sendStatusToSplash('no-internet');
    return; // Don't proceed without internet
  }

  // In development, skip update check
  if (!app.isPackaged) {
    sendStatusToSplash('not-available');
    setTimeout(() => {
      createMainWindow();
    }, 1000);
    return;
  }

  // Check for updates
  sendStatusToSplash('checking');
  autoUpdater.checkForUpdates().catch((err) => {
    console.error('Update check failed:', err);
    sendStatusToSplash('error');
    createMainWindow();
  });
}

// Auto-updater events
autoUpdater.on('checking-for-update', () => {
  sendStatusToSplash('checking');
});

autoUpdater.on('update-available', (info) => {
  sendStatusToSplash('available', { version: info.version });
});

autoUpdater.on('update-not-available', () => {
  sendStatusToSplash('not-available');
  setTimeout(() => {
    createMainWindow();
  }, 500);
});

autoUpdater.on('download-progress', (progress) => {
  sendStatusToSplash('downloading', {
    percent: progress.percent,
    bytesPerSecond: progress.bytesPerSecond,
    transferred: progress.transferred,
    total: progress.total,
  });
});

autoUpdater.on('update-downloaded', () => {
  sendStatusToSplash('downloaded');
  setTimeout(() => {
    // Force quit all windows and install
    app.isQuitting = true;
    autoUpdater.quitAndInstall(true, true); // silent install, run after
  }, 1500);
});

autoUpdater.on('error', (err) => {
  console.error('Auto-updater error:', err);
  sendStatusToSplash('error');
  setTimeout(() => {
    createMainWindow();
  }, 500);
});

function createMainWindow() {
  if (mainWindow) return;

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
      preload: path.join(__dirname, 'preload.js'),
    },
    autoHideMenuBar: true,
  });

  // Show loading status in splash
  sendStatusToSplash('loading');

  // Load local frontend
  mainWindow.loadFile(path.join(__dirname, 'web', 'index.html'));

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
