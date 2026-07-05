// 自动在线升级 — 与 xnowpost 完全一致的实现
//
// autoDownload: false — 检测到新版本只通知，下载由用户触发
// autoInstallOnAppQuit: true — 下载完成后退出时自动安装

import { ipcMain } from 'electron'

let autoUpdater = null
let mainWindow = null
let initialized = false

const downloadProgress = { status: 'idle', percent: 0, version: '' }

export function initUpdater(window) {
  if (initialized) return
  mainWindow = window
  initialized = true

  ipcMain.handle('update:check', () => {
    checkForUpdates()
    return true
  })
  ipcMain.handle('update:download', () => { downloadUpdate() })
  ipcMain.handle('update:install', () => { quitAndInstall() })

  import('electron-updater').then(mod => {
    const pkg = mod.default || mod
    autoUpdater = pkg.autoUpdater
    if (!autoUpdater) { console.error('electron-updater: autoUpdater not found'); return }

    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true

    autoUpdater.checkForUpdates().catch(() => {})

    autoUpdater.on('update-available', (info) => {
      downloadProgress.status = 'available'
      downloadProgress.version = info.version
      mainWindow?.webContents.send('update:available', {
        version: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: info.releaseNotes,
        releaseName: info.releaseName,
      })
    })

    autoUpdater.on('update-not-available', () => {
      downloadProgress.status = 'not-available'
      mainWindow?.webContents.send('update:not-available')
    })

    autoUpdater.on('download-progress', (progress) => {
      downloadProgress.status = 'downloading'
      downloadProgress.percent = Math.round(progress.percent)
      mainWindow?.webContents.send('update:progress', {
        percent: Math.round(progress.percent),
        bytesPerSecond: progress.bytesPerSecond,
        total: progress.total,
        transferred: progress.transferred,
      })
    })

    autoUpdater.on('update-downloaded', () => {
      downloadProgress.status = 'downloaded'
      downloadProgress.percent = 100
      mainWindow?.webContents.send('update:downloaded')
    })

    autoUpdater.on('error', (err) => {
      console.error('自动更新错误:', err.message)
      downloadProgress.status = 'error'
      mainWindow?.webContents.send('update:error', { message: err.message })
    })
  }).catch(err => {
    console.error('electron-updater 加载失败:', err.message)
  })
}

function checkForUpdates() {
  if (!autoUpdater) return
  // 30s 超时兜底：electron-updater 在国内网络可能永久挂起
  const timer = setTimeout(() => {
    mainWindow?.webContents.send('update:error', { message: '检查超时，请检查网络' })
  }, 30000)
  autoUpdater.checkForUpdates()
    .catch(() => {})
    .finally(() => clearTimeout(timer))
}

function downloadUpdate() {
  if (autoUpdater) autoUpdater.downloadUpdate()
}

function quitAndInstall() {
  if (autoUpdater) autoUpdater.quitAndInstall()
}

// 全局暴露，供 Express 路由调用
global.__downloadProgress = downloadProgress
