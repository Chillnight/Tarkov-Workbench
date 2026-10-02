// Author: CA
const { contextBridge, ipcRenderer } = require('electron');
async function invoke(action) {
  const response = await ipcRenderer.invoke(`app-update:${action}`);
  if (!response.ok) throw new Error(response.error);
  return response.value;
}
contextBridge.exposeInMainWorld('workbenchUpdates', {
  check: () => invoke('check'),
  install: () => invoke('install'),
  cancel: () => invoke('cancel'),
  onProgress: callback => {
    const listener = (_event, message) => callback(message);
    ipcRenderer.on('app-update:progress', listener);
    return () => ipcRenderer.removeListener('app-update:progress', listener);
  }
});
