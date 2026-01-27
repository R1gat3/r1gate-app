const { app, BrowserWindow, Tray, Menu, shell, ipcMain, desktopCapturer, session } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { spawn } = require('child_process');

// Configuration
const VERSION_URL = 'https://r1gate.ru/downloads/version.json';
const CHECK_UPDATES = process.argv.includes('--check-updates') || app.isPackaged;

// Logger
const logFile = path.join(app.getPath('userData'), 'r1gate.log');

function log(message) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}\n`;
  console.log(line.trim());
  try {
    fs.appendFileSync(logFile, line);
  } catch (e) {}
}

// Clear old log on start
try {
  if (fs.existsSync(logFile) && fs.statSync(logFile).size > 1024 * 1024) {
    fs.unlinkSync(logFile);
  }
} catch (e) {}

log('='.repeat(50));
log(`App starting. Version: ${app.getVersion()}`);
log(`Check updates: ${CHECK_UPDATES}`);

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  log('Another instance running, exiting');
  app.exit(0);
}

let mainWindow;
let splashWindow;
let tray;

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

// HTTP GET with redirects
function httpGet(url) {
  log(`HTTP GET: ${url}`);
  return new Promise((resolve, reject) => {
    const doRequest = (requestUrl, redirectCount = 0) => {
      if (redirectCount > 5) {
        reject(new Error('Too many redirects'));
        return;
      }

      const urlObj = new URL(requestUrl);
      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || 443,
        path: urlObj.pathname + urlObj.search,
        method: 'GET',
        headers: { 'User-Agent': 'R1Gate/1.0' }
      };

      const req = https.request(options, (res) => {
        log(`Response: ${res.statusCode}`);

        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          doRequest(res.headers.location, redirectCount + 1);
          return;
        }

        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }

        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
      });

      req.on('error', reject);
      req.setTimeout(15000, () => {
        req.destroy();
        reject(new Error('Timeout'));
      });
      req.end();
    };

    doRequest(url);
  });
}

// Download file with progress
function downloadFile(url, destPath, onProgress) {
  log(`Downloading: ${url} -> ${destPath}`);
  return new Promise((resolve, reject) => {
    try {
      if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
    } catch (e) {}

    const doRequest = (requestUrl, redirectCount = 0) => {
      if (redirectCount > 5) {
        reject(new Error('Too many redirects'));
        return;
      }

      const urlObj = new URL(requestUrl);
      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || 443,
        path: urlObj.pathname + urlObj.search,
        method: 'GET',
        headers: { 'User-Agent': 'R1Gate/1.0' }
      };

      const req = https.request(options, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          doRequest(res.headers.location, redirectCount + 1);
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
            onProgress(Math.round((downloadedSize / totalSize) * 100), downloadedSize, totalSize);
          }
        });

        res.pipe(file);
        file.on('finish', () => {
          file.close();
          log(`Download complete: ${downloadedSize} bytes`);
          resolve(destPath);
        });
        file.on('error', (err) => {
          fs.unlink(destPath, () => {});
          reject(err);
        });
      });

      req.on('error', reject);
      req.setTimeout(300000, () => {
        req.destroy();
        reject(new Error('Download timeout'));
      });
      req.end();
    };

    doRequest(url);
  });
}

// Compare versions
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

// Send to splash window
function sendToSplash(status, data = {}) {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.webContents.send('update-status', status, data);
  }
}

// Create splash window
function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 350,
    height: 400,
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
    sendToSplash('version', app.getVersion());
    if (CHECK_UPDATES) {
      checkForUpdates();
    } else {
      sendToSplash('not-available');
      setTimeout(createMainWindow, 500);
    }
  });
}

// Check for updates
async function checkForUpdates() {
  const currentVersion = app.getVersion();
  log(`Checking updates. Current: ${currentVersion}`);
  sendToSplash('checking');

  try {
    const response = await httpGet(VERSION_URL);
    log(`Version response: ${response}`);
    const versionInfo = JSON.parse(response);
    const serverVersion = versionInfo.version;
    log(`Server version: ${serverVersion}`);

    if (isNewerVersion(serverVersion, currentVersion)) {
      log(`Update available: ${currentVersion} -> ${serverVersion}`);
      sendToSplash('available', { version: serverVersion });

      const downloadUrl = process.platform === 'win32'
        ? versionInfo.windows?.url
        : versionInfo.linux?.url;

      if (!downloadUrl) throw new Error('No download URL for platform');

      const filename = process.platform === 'win32' ? 'R1Gate-Voice-Setup.exe' : 'R1Gate-Voice.AppImage';
      const downloadPath = path.join(app.getPath('temp'), filename);

      sendToSplash('downloading', { percent: 0 });

      await downloadFile(downloadUrl, downloadPath, (percent, downloaded, total) => {
        sendToSplash('downloading', { percent, downloaded, total });
      });

      log('Download complete, launching installer');
      sendToSplash('downloaded');

      if (process.platform === 'win32') {
        spawn(downloadPath, ['/S'], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
      } else {
        fs.chmodSync(downloadPath, '755');
        spawn(downloadPath, [], { detached: true, stdio: 'ignore' }).unref();
      }

      setTimeout(() => {
        log('Quitting for update');
        app.quit();
      }, 2000);
    } else {
      log('No update needed');
      sendToSplash('not-available');
      setTimeout(createMainWindow, 500);
    }
  } catch (err) {
    log(`Update check error: ${err.message}`);
    sendToSplash('error', { message: err.message });
    setTimeout(createMainWindow, 2000);
  }
}

// Create main window
function createMainWindow() {
  if (mainWindow) return;
  log('Creating main window');

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'R1Gate Voice',
    icon: path.join(__dirname, 'icon.png'),
    frame: false,
    show: false,
    backgroundColor: '#141819',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      preload: path.join(__dirname, 'preload.js'),
      // Включаем GPU ускорение для видео
      enableWebRTC: true,
      webgl: true,
    },
    autoHideMenuBar: true,
  });

  const indexPath = path.join(__dirname, 'web', 'index.html');
  mainWindow.loadFile(indexPath);

  let shown = false;
  const showWindow = () => {
    if (shown) return;
    shown = true;
    log('Showing main window');
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
      splashWindow = null;
    }
    mainWindow.show();
  };

  mainWindow.once('ready-to-show', showWindow);
  setTimeout(showWindow, 10000); // Fallback

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http') && !url.includes('r1gate.ru')) {
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

// Create tray
function createTray() {
  tray = new Tray(path.join(__dirname, 'icon.png'));

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open R1Gate', click: () => mainWindow?.show() },
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
  tray.on('click', () => mainWindow?.show());
}

// IPC handlers
ipcMain.handle('get-sources', async () => {
  const sources = await desktopCapturer.getSources({
    types: ['window', 'screen'],
    thumbnailSize: { width: 320, height: 180 }
  });
  return sources.map(s => ({
    id: s.id,
    name: s.name,
    thumbnail: s.thumbnail.toDataURL()
  }));
});

ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});
ipcMain.on('window-close', () => mainWindow?.close());
ipcMain.handle('window-is-maximized', () => mainWindow?.isMaximized() || false);

// Fullscreen control for screen sharing
ipcMain.on('window-fullscreen', (event, enable) => {
  if (mainWindow) {
    mainWindow.setFullScreen(enable);
  }
});
ipcMain.handle('window-is-fullscreen', () => mainWindow?.isFullScreen() || false);

// App ready
app.whenReady().then(() => {
  log('App ready');

  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    desktopCapturer.getSources({ types: ['screen', 'window'] }).then((sources) => {
      callback({ video: sources[0] || null, audio: 'loopback' });
    });
  });

  createSplashWindow();
  createTray();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createSplashWindow();
  } else {
    mainWindow?.show();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('web-contents-created', (event, contents) => {
  contents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowed = ['media', 'mediaKeySystem', 'notifications', 'display-capture'];
    callback(allowed.includes(permission));
  });
});
