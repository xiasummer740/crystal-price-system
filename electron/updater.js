// 自动在线升级模块 — 集成 electron-updater
// 使用 GitHub Releases 作为更新源 (owner: xiasummer740, repo: crystal-price-system)

import { autoUpdater } from 'electron-updater'
import { app, ipcMain } from 'electron'
import path from 'path'
import fs from 'fs'

// 日志
function log(msg) {
  try {
    const logPath = path.join(app.getPath('documents'), 'update.log')
    const line = `[${new Date().toISOString()}] ${msg}\n`
    fs.appendFileSync(logPath, line)
  } catch {}
}

autoUpdater.logger = {
  info: (m) => log('[info] ' + m),
  warn: (m) => log('[warn] ' + m),
  error: (m) => log('[error] ' + m)
}
autoUpdater.autoDownload = false
autoUpdater.autoInstallOnAppQuit = false

let mainWindow = null
let updateInfo = null

export function checkForUpdates() {
  autoUpdater.checkForUpdates()
}

export function initUpdater(win) {
  mainWindow = win

  autoUpdater.on('checking-for-update', () => {
    log('正在检查更新...')
    mainWindow?.webContents.send('update-status', { status: 'checking' })
  })

  autoUpdater.on('update-available', (info) => {
    log(`发现新版本: ${info.version}`)
    updateInfo = info
    mainWindow?.webContents.send('update-status', {
      status: 'available',
      version: info.version,
      releaseDate: info.releaseDate
    })
  })

  autoUpdater.on('update-not-available', () => {
    log('已是最新版本')
    mainWindow?.webContents.send('update-status', { status: 'not-available' })
  })

  autoUpdater.on('error', (err) => {
    log('更新检查出错: ' + (err?.message || err))
    mainWindow?.webContents.send('update-status', { status: 'error', message: err?.message || '未知错误' })
  })

  autoUpdater.on('download-progress', (progress) => {
    const pct = Math.round(progress.percent)
    mainWindow?.webContents.send('update-status', { status: 'downloading', percent: pct })
  })

  autoUpdater.on('update-downloaded', (info) => {
    log('下载完成，等待安装')
    mainWindow?.webContents.send('update-status', { status: 'downloaded', version: info.version })
  })

  // IPC 处理
  ipcMain.handle('check-update', async () => {
    log('IPC: 检查更新')
    try {
      autoUpdater.checkForUpdates()
    } catch (e) {
      log('checkForUpdates 失败: ' + e.message)
    }
    return true
  })

  ipcMain.handle('download-update', async () => {
    if (!updateInfo) return { success: false, msg: '没有可用更新' }
    log('IPC: 开始下载更新')
    try {
      autoUpdater.downloadUpdate()
      return { success: true }
    } catch (e) {
      log('downloadUpdate 失败: ' + e.message)
      return { success: false, msg: e.message }
    }
  })

  ipcMain.handle('install-update', async () => {
    log('IPC: 安装更新')
    setImmediate(() => { autoUpdater.quitAndInstall(false, true) })
    return { success: true }
  })
}
