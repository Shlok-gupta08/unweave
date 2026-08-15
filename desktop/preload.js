const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isDesktop: true,
  platform: process.platform,
  onMenuAction: (callback) => {
    const subscription = (_event, action, payload) => callback(action, payload);
    ipcRenderer.on('menu-action', subscription);
    return () => ipcRenderer.removeListener('menu-action', subscription);
  },
  sendAction: (channel, data) => {
    ipcRenderer.send(channel, data);
  },
  invokeAction: (channel, data) => {
    return ipcRenderer.invoke(channel, data);
  }
});
