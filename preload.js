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
});
