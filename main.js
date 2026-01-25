const { app, BrowserWindow, Tray, Menu, shell, ipcMain, desktopCapturer, session } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { spawn } = require('child_process');

// Version check URL
const VERSION_URL = 'https://r1gate.ru/download/version.json';

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
log(`Current version: ${app.getVersion()}`);

// Single instance lock - prevent duplicate processes
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.exit(0);
}

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

  splashWindow.webContents.on('did-finish-load', () => {
    sendStatusToSplash('version', app.getVersion());
    checkForUpdates();
  });
}

// Simple HTTP GET with redirect support
function httpGet(url) {
  return new Promise((resolve, reject) => {
    const makeRequest = (requestUrl) => {
      const protocol = requestUrl.startsWith('https') ? https : require('http');
      protocol.get(requestUrl, (res) => {
        // Handle redirects
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          log(`Redirect to: ${res.headers.location}`);
          makeRequest(res.headers.location);
          return;
        }

        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }

        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
        res.on('error', reject);
      }).on('error', reject);
    };
    makeRequest(url);
  });
}

// Download file with progress
function downloadFile(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    const makeRequest = (requestUrl) => {
      const protocol = requestUrl.startsWith('https') ? https : require('http');
      protocol.get(requestUrl, (res) => {
        // Handle redirects
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          log(`Download redirect to: ${res.headers.location}`);
          makeRequest(res.headers.location);
          return;
        }

        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }

        const totalSize = parseInt(res.headers['content-length'], 10) || 0;
        let downloadedSize = 0;

        const file = fs.createWriteStream(destPath);

        res.on('data', (chunk) => {
          downloadedSize += chunk.length;
          if (totalSize > 0 && onProgress) {
            onProgress(downloadedSize, totalSize);
          }
        });

        res.pipe(file);

        file.on('finish', () => {
          file.close();
          resolve(destPath);
        });

        file.on('error', (err) => {
          fs.unlink(destPath, () => {});
          reject(err);
        });

        res.on('error', (err) => {
          fs.unlink(destPath, () => {});
          reject(err);
        });
      }).on('error', reject);
    };
    makeRequest(url);
  });
}

// Compare versions: returns true if serverVersion > currentVersion
function isNewerVersion(serverVersion, currentVersion) {
  const server = serverVersion.split('.').map(Number);
  const current = currentVersion.split('.').map(Number);

  for (let i = 0; i < Math.max(server.length, current.length); i++) {
    const s = server[i] || 0;
    const c = current[i] || 0;
    if (s > c) return true;
    if (s < c) return false;
  }
  return false;
}

async function checkForUpdates() {
  const currentVersion = app.getVersion();
  log(`Checking for updates... Current: ${currentVersion}`);

  // In development, skip update check
  if (!app.isPackaged) {
    log('Development mode - skipping update check');
    sendStatusToSplash('not-available');
    setTimeout(() => createMainWindow(), 500);
    return;
  }

  sendStatusToSplash('checking');

  try {
    // Fetch version.json from server
    log(`Fetching ${VERSION_URL}`);
    const versionData = await httpGet(VERSION_URL);
    const versionInfo = JSON.parse(versionData);
    log(`Server version: ${versionInfo.version}`);

    if (isNewerVersion(versionInfo.version, currentVersion)) {
      log(`Update available: ${versionInfo.version}`);
      sendStatusToSplash('available', { version: versionInfo.version });

      // Determine platform
      const isWindows = process.platform === 'win32';
      const platformInfo = isWindows ? versionInfo.windows : versionInfo.linux;

      if (!platformInfo) {
        log(`No update available for platform: ${process.platform}`);
        sendStatusToSplash('not-available');
        setTimeout(() => createMainWindow(), 500);
        return;
      }

      // Download update
      const downloadDir = app.getPath('temp');
      const downloadPath = path.join(downloadDir, platformInfo.filename);

      log(`Downloading: ${platformInfo.url} -> ${downloadPath}`);
      sendStatusToSplash('downloading', { percent: 0 });

      await downloadFile(platformInfo.url, downloadPath, (downloaded, total) => {
        const percent = Math.round((downloaded / total) * 100);
        sendStatusToSplash('downloading', {
          percent,
          transferred: downloaded,
          total
        });
      });

      log(`Download complete: ${downloadPath}`);
      sendStatusToSplash('downloaded');

      // Run installer
      setTimeout(() => {
        log('Launching installer and quitting...');

        if (isWindows) {
          // Run NSIS installer
          spawn(downloadPath, ['/S'], {
            detached: true,
            stdio: 'ignore'
          }).unref();
        } else {
          // Make AppImage executable and run
          fs.chmodSync(downloadPath, '755');
          spawn(downloadPath, [], {
            detached: true,
            stdio: 'ignore'
          }).unref();
        }

        app.quit();
      }, 1500);

    } else {
      log('No update needed - already on latest version');
      sendStatusToSplash('not-available');
      setTimeout(() => createMainWindow(), 500);
    }

  } catch (err) {
    log(`Update check failed: ${err.message}`);
    log(`Stack: ${err.stack}`);
    sendStatusToSplash('error');
    // Continue to main window even on error
    setTimeout(() => createMainWindow(), 2000);
  }
}

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
      webSecurity: false,
      preload: path.join(__dirname, 'preload.js'),
    },
    autoHideMenuBar: true,
  });

  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    const levels = ['verbose', 'info', 'warning', 'error'];
    log(`[Renderer ${levels[level] || level}] ${message}`);
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    log(`[Renderer] Failed to load: ${errorCode} - ${errorDescription}`);
  });

  sendStatusToSplash('loading');

  const indexPath = path.join(__dirname, 'web', 'index.html');
  log(`Loading: ${indexPath}`);
  mainWindow.loadFile(indexPath);

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
          checkForUpdates();
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
