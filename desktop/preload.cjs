const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  hide: () => ipcRenderer.send('window:hide'),
  minimize: () => ipcRenderer.send('window:minimize'),
  toggleMaximize: () => ipcRenderer.send('window:toggle-maximize'),
  resize: expanded => ipcRenderer.send('window:resize', Boolean(expanded)),
  copy: text => ipcRenderer.invoke('clipboard:copy', text),
  readNote: () => ipcRenderer.invoke('note:read'),
  writeNote: text => ipcRenderer.invoke('note:write', text),
  saveJson: text => ipcRenderer.invoke('json:save', text),
  status: () => ipcRenderer.invoke('app:status'),
  onWake: callback => { ipcRenderer.on('app:wake', (_event, payload) => callback(payload)); },
  onWindowState: callback => { ipcRenderer.on('window:state', (_event, payload) => callback(payload)); }
});
