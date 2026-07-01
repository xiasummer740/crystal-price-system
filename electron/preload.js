const { contextBridge, ipcRenderer } = require('electron')
const os = require('os')

function getLanIp() {
  const interfaces = os.networkInterfaces()
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address
      }
    }
  }
  return '127.0.0.1'
}

contextBridge.exposeInMainWorld('electronAPI', {
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  getLanIp,
  platform: process.platform,
  openDataFolder: async () => { try { await fetch('/api/open-data-folder') } catch {} },
  openNotesWindow: () => ipcRenderer.invoke('open-notes-window'),
  closeNotesWindow: () => ipcRenderer.invoke('close-notes-window'),
  // 在线升级
  checkUpdate: () => ipcRenderer.invoke('check-update'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  onUpdateStatus: (cb) => ipcRenderer.on('update-status', (_event, data) => cb(data))
})
