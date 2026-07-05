// 自动在线升级 — 与 xnowpost 完全一致的实现
//
// autoDownload: false — 检测到新版本只通知，下载由用户触发
// autoInstallOnAppQuit: true — 下载完成后退出时自动安装

let autoUpdater = null
let mainWindow = null
let initialized = false

export function initUpdater(window) {
  if (initialized) return
  mainWindow = window
  initialized = true

  import('electron-updater').then(mod => {
    const pkg = mod.default || mod
    autoUpdater = pkg.autoUpdater
    if (!autoUpdater) { console.error('electron-updater: autoUpdater not found'); return }

    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true

    autoUpdater.checkForUpdates().catch(() => {})

    autoUpdater.on('update-available', (info) => {
      mainWindow?.webContents.send('update:available', {
        version: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: info.releaseNotes,
        releaseName: info.releaseName,
      })
    })

    autoUpdater.on('update-not-available', () => {
      mainWindow?.webContents.send('update:not-available')
    })

    autoUpdater.on('download-progress', (progress) => {
      mainWindow?.webContents.send('update:progress', {
        percent: Math.round(progress.percent),
        bytesPerSecond: progress.bytesPerSecond,
        total: progress.total,
        transferred: progress.transferred,
      })
    })

    autoUpdater.on('update-downloaded', () => {
      mainWindow?.webContents.send('update:downloaded')
    })

    autoUpdater.on('error', (err) => {
      console.error('自动更新错误:', err.message)
    })
  }).catch(err => {
    console.error('electron-updater 加载失败:', err.message)
  })
}

export function downloadUpdate() {
  if (autoUpdater) autoUpdater.downloadUpdate()
}

export function quitAndInstall() {
  if (autoUpdater) autoUpdater.quitAndInstall()
}

export function checkForUpdates() {
  if (autoUpdater) autoUpdater.checkForUpdates().catch(() => {})
}
