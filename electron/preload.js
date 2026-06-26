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
  getLanIp,
  platform: process.platform,
  openDataFolder: async () => { try { await fetch('/api/open-data-folder') } catch {} },
  openNotesWindow: () => ipcRenderer.invoke('open-notes-window'),
  closeNotesWindow: () => ipcRenderer.invoke('close-notes-window'),
  toggleNotesPin: () => ipcRenderer.invoke('toggle-notes-pin')
})
