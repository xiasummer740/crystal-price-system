// 自动在线升级
//
// 版本检查：直接调 GitHub API（比 electron-updater 快，国内网络友好）
// 下载安装：先用 autoUpdater 尝试下载，失败则直连 GitHub 用 https 下载
//
// autoDownload: false — 检测到新版本只通知，下载由用户触发
// autoInstallOnAppQuit: true — 下载完成后退出时自动安装

import { createRequire } from 'module'
import { appendFileSync, createWriteStream, unlinkSync, existsSync } from 'fs'
import https from 'https'
import path from 'path'
const _require = createRequire(import.meta.url)

let autoUpdater = null
let mainWindow = null
let initialized = false
let appVersion = ''
let directDownloadPath = null  // 直连下载的文件路径，用于安装

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

// 下载更新：先用 autoUpdater，失败则自己直连 GitHub 下载
export async function downloadUpdate() {
  if (!autoUpdater) {
    mainWindow?.webContents.send('update:error', { message: '下载模块未就绪' })
    return
  }
  LOG('downloadUpdate called')

  // 1) 确保 autoUpdater 有更新信息
  if (!autoUpdater.updateInfoAndProvider) {
    LOG('updateInfoAndProvider is null, calling checkForUpdates() first')
    try {
      await autoUpdater.checkForUpdates()
    } catch (err) {
      LOG(`checkForUpdates before download failed: ${err.message}`)
      // autoUpdater 不行 → 改用直连下载
      await directDownload()
      return
    }
  }

  // 2) autoUpdater 下载
  try {
    await autoUpdater.downloadUpdate()
  } catch (err) {
    LOG(`autoUpdater.downloadUpdate failed: ${err.message}`)
    // 回退到直连下载
    await directDownload()
  }
}

// 通过 GitHub API 获取安装包下载 URL
function getAssetDownloadUrl(release) {
  const assetName = `crystal-price-system-setup-${appVersion}.exe`
  const asset = (release.assets || []).find(a => a.name === assetName)
  return asset?.browser_download_url || null
}

// 直连下载核心（带重试）
async function downloadWithRetry(url, destFile, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      LOG(`downloading (attempt ${attempt}/${retries})`)
      await new Promise((resolve, reject) => {
        const req = https.get(url, { headers: { 'User-Agent': 'crystal-price-system' }, timeout: 300000 }, (res) => {
          // 跟随重定向（最多 5 级）
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            req.destroy()
            LOG(`redirect (${res.statusCode}) → ${res.headers.location}`)
            // 递归跟随
            return downloadWithRetry(res.headers.location, destFile, retries - attempt + 1)
              .then(resolve).catch(reject)
          }
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode}`))
            return
          }
          const total = parseInt(res.headers['content-length'] || '0', 10)
          let downloaded = 0
          let lastTime = Date.now()
          let lastBytes = 0
          const fileStream = createWriteStream(destFile)
          res.pipe(fileStream)
          res.on('data', (chunk) => {
            downloaded += chunk.length
            if (total > 0) {
              const now = Date.now()
              const elapsed = (now - lastTime) / 1000
              let bytesPerSecond = 0
              if (elapsed >= 1) {
                bytesPerSecond = Math.round((downloaded - lastBytes) / elapsed)
                lastTime = now
                lastBytes = downloaded
              }
              mainWindow?.webContents.send('update:progress', {
                percent: Math.round(downloaded / total * 100),
                bytesPerSecond,
                total,
                transferred: downloaded,
              })
            }
          })
          res.on('end', () => { fileStream.end(); resolve() })
          res.on('error', reject)
          fileStream.on('error', reject)
        })
        req.on('error', reject)
        req.on('timeout', () => { req.destroy(); reject(new Error('连接服务器超时')) })
      })
      return // 成功，跳出重试
    } catch (err) {
      LOG(`attempt ${attempt} failed: ${err.message}`)
      if (attempt < retries) {
        // 短暂等待后重试
        await new Promise(r => setTimeout(r, 2000 * attempt))
      } else {
        throw err
      }
    }
  }
}

// 直连 GitHub 下载（不依赖 autoUpdater）
async function directDownload() {
  LOG('directDownload called')
  try {
    const { app } = _require('electron')
    const userDataPath = app.getPath('userData')
    const destDir = path.join(userDataPath, '__update__')
    const destFile = path.join(destDir, `crystal-price-system-setup-${appVersion}.exe`)

    // 确保目录存在
    const { mkdirSync } = _require('fs')
    if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true })

    // 删除旧文件
    if (existsSync(destFile)) unlinkSync(destFile)

    // 先通过 API 获取 release 信息，拿到 CDN 直链
    const releaseUrl = 'https://api.github.com/repos/xiasummer740/crystal-price-system/releases/latest'
    LOG(`fetching release info from ${releaseUrl}`)
    const releaseData = await new Promise((resolve, reject) => {
      const req = https.get(releaseUrl, { headers: { 'User-Agent': 'crystal-price-system', Accept: 'application/json' }, timeout: 15000 }, (res) => {
        let data = ''
        res.on('data', chunk => data += chunk)
        res.on('end', () => {
          if (res.statusCode !== 200) return reject(new Error(`release API HTTP ${res.statusCode}`))
          try { resolve(JSON.parse(data)) } catch (e) { reject(new Error('release info parse failed')) }
        })
        res.on('error', reject)
      })
      req.on('error', reject)
      req.on('timeout', () => { req.destroy(); reject(new Error('获取版本信息超时')) })
    })

    // 确保 appVersion 是最新版（可能未经过 checkForUpdates）
    const tagVersion = (releaseData.tag_name || '').replace(/^v/i, '')
    if (tagVersion) appVersion = tagVersion

    const downloadUrl = getAssetDownloadUrl(releaseData)
    if (!downloadUrl) {
      throw new Error(`未找到 ${appVersion} 版本的安装包，请手动下载`)
    }
    LOG(`browser_download_url: ${downloadUrl}`)

    // 带重试的下载
    await downloadWithRetry(downloadUrl, destFile)

    // 下载完成
    directDownloadPath = destFile
    LOG(`download complete: ${destFile}`)
    mainWindow?.webContents.send('update:downloaded')
  } catch (err) {
    LOG(`directDownload error: ${err.message}`)
    mainWindow?.webContents.send('update:error', { message: `下载失败: ${err.message}。请手动下载安装  https://github.com/xiasummer740/crystal-price-system/releases/latest` })
  }
}

export function quitAndInstall() {
  if (autoUpdater && autoUpdater.updateInfoAndProvider) {
    autoUpdater.quitAndInstall()
  } else if (directDownloadPath) {
    // 直连下载的文件，直接跑安装程序
    LOG(`quitAndInstall: running ${directDownloadPath}`)
    try {
      const { spawn } = _require('child_process')
      const { app } = _require('electron')
      spawn(directDownloadPath, ['--updated'], { detached: true, stdio: 'ignore' })
      app.quit()
    } catch (err) {
      LOG(`quitAndInstall spawn error: ${err.message}`)
    }
  }
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
          // 有新版 → 更新 appVersion 为目标版本，用于直连下载拼 URL
          appVersion = latestVer
          // 通知前端
          mainWindow?.webContents.send('update:available', {
            version: latestVer,
            releaseDate: release.published_at || '',
            releaseNotes: release.body || '',
            releaseName: release.name || latestVer,
          })
          // 后台启动 autoUpdater 检查，下载时优先用它
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
