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

  // Window maximize state listener
  onWindowMaximized: (callback) => {
    const handler = (event, isMaximized) => callback(isMaximized);
    ipcRenderer.on('window-maximized', handler);
    return () => ipcRenderer.removeListener('window-maximized', handler);
  },
});

// Inject native titlebar controls when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
  // Create titlebar
  const titlebar = document.createElement('div');
  titlebar.id = 'electron-titlebar';
  titlebar.innerHTML = `
    <div class="titlebar-drag"></div>
    <div class="titlebar-title">R1Gate Voice</div>
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

  // Add styles
  const style = document.createElement('style');
  style.textContent = `
    #electron-titlebar {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      height: 32px;
      background: #1a1a2e;
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
    .titlebar-title {
      font-size: 12px;
      font-weight: 500;
      color: rgba(255,255,255,0.6);
      pointer-events: none;
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

  // Add event listeners
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
