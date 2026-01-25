const { contextBridge, ipcRenderer } = require('electron');

// Expose update status API to splash window
contextBridge.exposeInMainWorld('splashAPI', {
  onUpdateStatus: (callback) => {
    ipcRenderer.on('update-status', (event, status, data) => {
      callback(status, data);
    });
  }
});
