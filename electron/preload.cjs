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
  openSpec: (url) => ipcRenderer.invoke('open-spec', url),
  getLanIp,
  platform: process.platform,
  openDataFolder: async () => { try { await fetch('/api/open-data-folder') } catch {} },
  openNotesWindow: () => ipcRenderer.invoke('open-notes-window'),
  closeNotesWindow: () => ipcRenderer.invoke('close-notes-window'),
  // 在线升级（xnowpost 方式）
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  updaterDiagnose: () => ipcRenderer.invoke('update:diagnose'),
  onUpdateAvailable: (callback) => {
    const listener = (_event, info) => callback(info)
    ipcRenderer.on('update:available', listener)
    return () => ipcRenderer.removeListener('update:available', listener)
  },
  onUpdateNotAvailable: (callback) => {
    const listener = () => callback()
    ipcRenderer.on('update:not-available', listener)
    return () => ipcRenderer.removeListener('update:not-available', listener)
  },
  onUpdateProgress: (callback) => {
    const listener = (_event, progress) => callback(progress)
    ipcRenderer.on('update:progress', listener)
    return () => ipcRenderer.removeListener('update:progress', listener)
  },
  onUpdateDownloaded: (callback) => {
    const listener = () => callback()
    ipcRenderer.on('update:downloaded', listener)
    return () => ipcRenderer.removeListener('update:downloaded', listener)
  },
  onUpdateError: (callback) => {
    const listener = (_event, err) => callback(err)
    ipcRenderer.on('update:error', listener)
    return () => ipcRenderer.removeListener('update:error', listener)
  }
})
