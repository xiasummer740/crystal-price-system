const { contextBridge, ipcRenderer } = require('electron')
const os = require('os')

function lanIpScore(name, ip) {
  let score = 0
  if (/wi-?fi|wlan|wireless|无线/i.test(name)) score += 50
  if (/ethernet|以太网|本地连接/i.test(name)) score += 40
  if (/vethernet|vmware|virtualbox|hyper-v|docker|wsl|tap|tailscale|zerotier|vpn|loopback/i.test(name)) score -= 100
  if (/^192\.168\./.test(ip)) score += 30
  else if (/^10\./.test(ip)) score += 20
  else if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) score += 10
  return score
}
function getLanIps() {
  const interfaces = os.networkInterfaces()
  const list = []
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family !== 'IPv4' || iface.internal) continue
      list.push({ name, address: iface.address, score: lanIpScore(name, iface.address) })
    }
  }
  list.sort((a, b) => b.score - a.score)
  return list.map(({ name, address }) => ({ name, address }))
}
function getLanIp() {
  return getLanIps()[0]?.address || '127.0.0.1'
}

contextBridge.exposeInMainWorld('electronAPI', {
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  // 把图片写进系统剪贴板（渲染进程里做要过安全上下文，交主进程最稳）
  copyImage: (payload) => ipcRenderer.invoke('image:copy', payload),
  openSpec: (url) => ipcRenderer.invoke('open-spec', url),
  openCustomerFolder: (customer) => ipcRenderer.invoke('open-customer-folder', customer),
  getLanIp,
  getLanIps,
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
