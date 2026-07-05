// 自动在线升级 — 使用 electron-updater，与 xnowpost 方式一致
//
// autoDownload: false — 检测到新版本只通知，下载由用户触发
// autoInstallOnAppQuit: true — 下载完成后退出时自动安装

import { ipcMain } from 'electron'

let autoUpdater = null
let mainWindow = null
let initialized = false

// 下载进度（供 Express HTTP 路由轮询）
const downloadProgress = { status: 'idle', percent: 0, version: '', bytesPerSecond: 0 }

export function initUpdater(window) {
  if (initialized) return
  mainWindow = window
  initialized = true

  // 注册 IPC 通道
  ipcMain.handle('update:check', checkForUpdates)
  ipcMain.handle('update:download', downloadUpdate)
  ipcMain.handle('update:install', quitAndInstall)

  import('electron-updater').then(mod => {
    const pkg = mod.default || mod
    autoUpdater = pkg.autoUpdater
    if (!autoUpdater) { console.error('electron-updater: autoUpdater not found'); return }

    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true

    // 启动时静默检查
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
      downloadProgress.bytesPerSecond = progress.bytesPerSecond
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

// IPC: 检查更新
export async function checkForUpdates() {
  if (!autoUpdater) return { status: 'error', message: '更新模块未就绪' }
  try {
    const result = await autoUpdater.checkForUpdates()
    return {
      status: 'available',
      version: result?.updateInfo?.version,
      releaseDate: result?.updateInfo?.releaseDate,
      releaseNotes: result?.updateInfo?.releaseNotes,
      releaseName: result?.updateInfo?.releaseName,
    }
  } catch (e) {
    return { status: 'error', message: e.message || '检查失败' }
  }
}

// IPC: 下载更新
export function downloadUpdate() {
  if (autoUpdater) autoUpdater.downloadUpdate()
}

// IPC: 退出并安装
export function quitAndInstall() {
  if (autoUpdater) autoUpdater.quitAndInstall()
}

// 全局暴露，供 Express 路由调用
global.__checkForUpdates = checkForUpdates
global.__downloadUpdate = downloadUpdate
global.__downloadProgress = downloadProgress
