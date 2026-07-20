// 自动在线升级
//
// 版本检查：直接调 GitHub API（比 electron-updater 快，国内网络友好）
// 下载安装：仍用 electron-updater（自动处理校验、进度回调、静默安装）
//
// autoDownload: false — 检测到新版本只通知，下载由用户触发
// autoInstallOnAppQuit: true — 下载完成后退出时自动安装

import { createRequire } from 'module'
import { appendFileSync } from 'fs'
import https from 'https'
const _require = createRequire(import.meta.url)

let autoUpdater = null
let mainWindow = null
let initialized = false
let appVersion = ''

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
    LOG(`electron-updater loaded`)

    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true

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
      LOG(`EVENT: autoUpdater error - ${err.message}`)
    })

    LOG('initUpdater done')
  } catch (err) {
    LOG(`initUpdater CRASH: ${err.message}`)
  }
}

export function downloadUpdate() {
  if (autoUpdater) {
    LOG('calling autoUpdater.downloadUpdate()')
    autoUpdater.downloadUpdate()
  } else {
    mainWindow?.webContents.send('update:error', { message: '下载模块未就绪' })
  }
}

export function quitAndInstall() {
  if (autoUpdater) autoUpdater.quitAndInstall()
}

// 直接调 GitHub API 检查最新版本（比 electron-updater 快，国内网络更友好）
export function checkForUpdates() {
  LOG('checkForUpdates called')

  // 获取当前应用版本
  try {
    const pkg = _require('../package.json')
    appVersion = pkg.version || ''
  } catch {}
  LOG(`appVersion: ${appVersion}`)

  const GITHUB_API = 'https://api.github.com/repos/xiasummer740/crystal-price-system/releases/latest'
  const req = https.get(GITHUB_API, { headers: { 'User-Agent': 'crystal-price-system', Accept: 'application/json' }, timeout: 15000 }, (res) => {
    let data = ''
    res.on('data', (chunk) => { data += chunk })
    res.on('end', () => {
      try {
        const release = JSON.parse(data)
        const latestVer = (release.tag_name || '').replace(/^v/i, '')
        LOG(`GitHub latest: ${latestVer}, current: ${appVersion}`)

        if (!latestVer) {
          mainWindow?.webContents.send('update:error', { message: '无法获取版本信息' })
          return
        }

        // 对比版本号
        if (compareVersions(latestVer, appVersion) > 0) {
          // 有新版 → 通知前端
          mainWindow?.webContents.send('update:available', {
            version: latestVer,
            releaseDate: release.published_at || '',
            releaseNotes: release.body || '',
            releaseName: release.name || latestVer,
          })
          // 同时在后台启动 autoUpdater 检查，确保点下载时它能找到更新
          if (autoUpdater) {
            LOG('triggering autoUpdater.checkForUpdates() in background')
            autoUpdater.checkForUpdates().catch(err => {
              LOG(`autoUpdater.checkForUpdates background error: ${err.message}`)
            })
          }
        } else {
          mainWindow?.webContents.send('update:not-available')
        }
      } catch (e) {
        LOG(`checkForUpdates parse error: ${e.message}`)
        mainWindow?.webContents.send('update:error', { message: '版本信息解析失败' })
      }
    })
  })

  req.on('error', (err) => {
    LOG(`checkForUpdates http error: ${err.message}`)
    mainWindow?.webContents.send('update:error', { message: '检查更新失败，请检查网络' })
  })

  req.on('timeout', () => {
    req.destroy()
    mainWindow?.webContents.send('update:error', { message: '检查超时，请检查网络后重试' })
  })
}

// 版本号比较（'1.0.167' > '1.0.166'）
function compareVersions(a, b) {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0
    const nb = pb[i] || 0
    if (na > nb) return 1
    if (na < nb) return -1
  }
  return 0
}
