const { contextBridge, ipcRenderer } = require('electron');

// Expose APIs to renderer
contextBridge.exposeInMainWorld('electronAPI', {
  // Screen sharing
  getSources: () => ipcRenderer.invoke('get-sources'),
  isElectron: true,

  // Window controls
  windowMinimize: () => ipcRenderer.send('window-minimize'),
  windowMaximize: () => ipcRenderer.send('window-maximize'),
  windowClose: () => ipcRenderer.send('window-close'),
  windowIsMaximized: () => ipcRenderer.invoke('window-is-maximized'),

  // Fullscreen controls
  windowFullscreen: (enable) => ipcRenderer.send('window-fullscreen', enable),
  windowIsFullscreen: () => ipcRenderer.invoke('window-is-fullscreen'),

  // Window maximize state listener
  onWindowMaximized: (callback) => {
    const handler = (event, isMaximized) => callback(isMaximized);
    ipcRenderer.on('window-maximized', handler);
    return () => ipcRenderer.removeListener('window-maximized', handler);
  },

  // Titlebar title update
  setTitlebarTitle: (title) => {
    const el = document.getElementById('titlebar-text');
    if (el) el.textContent = title;
  },
});

// Inject custom titlebar when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
  const titlebar = document.createElement('div');
  titlebar.id = 'electron-titlebar';
  titlebar.innerHTML = `
    <div class="titlebar-drag"></div>
    <div class="titlebar-center">
      <svg class="titlebar-logo" width="16" height="16" viewBox="0 0 256 256">
        <rect width="256" height="256" rx="48" fill="#00C853"/>
        <circle cx="77" cy="90" r="26" fill="#0D0D0D"/>
        <circle cx="179" cy="90" r="26" fill="#0D0D0D"/>
        <circle cx="128" cy="179" r="26" fill="#0D0D0D"/>
        <line x1="77" y1="90" x2="179" y2="90" stroke="#0D0D0D" stroke-width="10"/>
        <line x1="77" y1="90" x2="128" y2="179" stroke="#0D0D0D" stroke-width="10"/>
        <line x1="179" y1="90" x2="128" y2="179" stroke="#0D0D0D" stroke-width="10"/>
      </svg>
      <span id="titlebar-text">RGConnect</span>
    </div>
    <div class="titlebar-controls">
      <button class="titlebar-btn" id="btn-minimize">
        <svg width="10" height="1" viewBox="0 0 10 1"><rect width="10" height="1" fill="currentColor"/></svg>
      </button>
      <button class="titlebar-btn" id="btn-maximize">
        <svg width="10" height="10" viewBox="0 0 10 10"><rect width="9" height="9" x="0.5" y="0.5" fill="none" stroke="currentColor" stroke-width="1"/></svg>
      </button>
      <button class="titlebar-btn titlebar-btn-close" id="btn-close">
        <svg width="10" height="10" viewBox="0 0 10 10"><path fill="currentColor" d="M1,0 L5,4 L9,0 L10,1 L6,5 L10,9 L9,10 L5,6 L1,10 L0,9 L4,5 L0,1 Z"/></svg>
      </button>
    </div>
  `;

  const style = document.createElement('style');
  style.textContent = `
    #electron-titlebar {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      height: 32px;
      background: #141819;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 99999;
      user-select: none;
    }
    .titlebar-drag {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      -webkit-app-region: drag;
    }
    .titlebar-center {
      display: flex;
      align-items: center;
      gap: 8px;
      pointer-events: none;
    }
    .titlebar-logo {
      flex-shrink: 0;
    }
    #titlebar-text {
      font-family: 'gg sans', 'Noto Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif;
      font-size: 12px;
      font-weight: 600;
      color: rgba(255,255,255,0.7);
      letter-spacing: 0.3px;
    }
    .titlebar-controls {
      position: absolute;
      right: 0;
      top: 0;
      display: flex;
      height: 32px;
      -webkit-app-region: no-drag;
    }
    .titlebar-btn {
      width: 46px;
      height: 32px;
      border: none;
      background: transparent;
      color: rgba(255,255,255,0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: background-color 0.1s;
    }
    .titlebar-btn:hover {
      background: rgba(255,255,255,0.1);
    }
    .titlebar-btn-close:hover {
      background: #e81123;
      color: white;
    }
    body {
      margin-top: 32px !important;
    }
  `;

  document.head.appendChild(style);
  document.body.prepend(titlebar);

  // Button listeners
  document.getElementById('btn-minimize').addEventListener('click', () => {
    ipcRenderer.send('window-minimize');
  });
  document.getElementById('btn-maximize').addEventListener('click', () => {
    ipcRenderer.send('window-maximize');
  });
  document.getElementById('btn-close').addEventListener('click', () => {
    ipcRenderer.send('window-close');
  });

  // Update maximize button icon on state change
  ipcRenderer.on('window-maximized', (event, isMaximized) => {
    const btn = document.getElementById('btn-maximize');
    if (isMaximized) {
      btn.innerHTML = '<svg width="10" height="10" viewBox="0 0 10 10"><path fill="none" stroke="currentColor" stroke-width="1" d="M2,3 L2,9 L8,9 L8,3 L2,3 M3,3 L3,1 L9,1 L9,7 L8,7"/></svg>';
    } else {
      btn.innerHTML = '<svg width="10" height="10" viewBox="0 0 10 10"><rect width="9" height="9" x="0.5" y="0.5" fill="none" stroke="currentColor" stroke-width="1"/></svg>';
    }
  });
});
