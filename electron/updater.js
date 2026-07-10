// 自动在线升级 — 与 xnowpost 完全一致的实现
//
// autoDownload: false — 检测到新版本只通知，下载由用户触发
// autoInstallOnAppQuit: true — 下载完成后退出时自动安装

import { createRequire } from 'module'
import { appendFileSync } from 'fs'
const _require = createRequire(import.meta.url)

let autoUpdater = null
let mainWindow = null
let initialized = false

const LOG = (msg) => {
  try { appendFileSync('C:\\Users\\Administrator\\AppData\\Local\\Temp\\crystal-updater-debug.log', `[${new Date().toISOString()}] ${msg}\n`) } catch {}
}

export function initUpdater(window) {
  if (initialized) return
  mainWindow = window
  initialized = true

  LOG('initUpdater called')

  try {
    const mod = _require('electron-updater')
    autoUpdater = mod.autoUpdater
    if (!autoUpdater) { LOG('autoUpdater not found'); return }
    LOG(`electron-updater loaded, isPackaged=${globalThis?.process?.versions?.electron ? 'yes' : 'no'}`)
    const isDev = !require('electron').app.isPackaged
    LOG(`isPackaged=${!isDev}, forceDevUpdateConfig=${isDev}`)

    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.forceDevUpdateConfig = isDev

    autoUpdater.on('update-available', (info) => {
      LOG(`EVENT: update-available v${info.version}`)
      mainWindow?.webContents.send('update:available', {
        version: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: info.releaseNotes,
        releaseName: info.releaseName,
      })
    })

    autoUpdater.on('update-not-available', () => {
      LOG('EVENT: update-not-available')
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
      LOG(`EVENT: error - ${err.message}`)
    })

    LOG('initUpdater done, listeners registered')
  } catch (err) {
    LOG(`initUpdater CRASH: ${err.message}`)
  }
}

export function downloadUpdate() {
  if (autoUpdater) autoUpdater.downloadUpdate()
}

export function quitAndInstall() {
  if (autoUpdater) autoUpdater.quitAndInstall()
}

export function checkForUpdates() {
  LOG(`checkForUpdates called, autoUpdater=${!!autoUpdater}`)
  if (!autoUpdater) {
    mainWindow?.webContents.send('update:error', { message: '更新模块未就绪' })
    return
  }
  LOG('calling autoUpdater.checkForUpdates()...')
  autoUpdater.checkForUpdates().then(result => {
    LOG(`checkForUpdates resolved: ${JSON.stringify(result?.updateInfo?.version || 'null')}`)
  }).catch(err => {
    const msg = err?.message || String(err)
    LOG(`checkForUpdates ERROR: ${msg}`)
    mainWindow?.webContents.send('update:error', { message: msg })
  })
}
