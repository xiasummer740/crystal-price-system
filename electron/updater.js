// 自动在线升级
//
// 版本检查：直接调 GitHub API（比 electron-updater 快，国内网络友好）
// 下载安装：先用 autoUpdater 尝试下载，失败则直连 GitHub 用 https 下载
//
// autoDownload: false — 检测到新版本只通知，下载由用户触发
// autoInstallOnAppQuit: true — 下载完成后退出时自动安装

import { createRequire } from 'module'
import { appendFileSync, createWriteStream, unlinkSync, existsSync, statSync } from 'fs'
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

// 通过 GitHub API 获取安装包下载信息（URL + 大小，用于断点续传校验）
function getAssetDownloadInfo(release) {
  const assetName = `crystal-price-system-setup-${appVersion}.exe`
  const asset = (release.assets || []).find(a => a.name === assetName)
  if (!asset?.browser_download_url) return null
  return { url: asset.browser_download_url, size: Number(asset.size) || 0 }
}

// 直连下载核心（带断点续传 + 重试）
// 中断后重试会带上 Range 头从已下载位置续传，不从头再来
async function downloadWithRetry(url, destFile, expectedSize = 0, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      LOG(`downloading (attempt ${attempt}/${retries})`)
      await new Promise((resolve, reject) => {
        // 统计已下载的部分文件大小（用于断点续传）
        let resumeFrom = 0
        if (existsSync(destFile)) {
          try { resumeFrom = statSync(destFile).size || 0 } catch { resumeFrom = 0 }
        }
        const headers = { 'User-Agent': 'crystal-price-system' }
        if (resumeFrom > 0) headers['Range'] = `bytes=${resumeFrom}-`

        const req = https.get(url, { headers, timeout: 600000 }, (res) => {
          // 跟随重定向（递归会重新计算 resumeFrom，续传不受影响）
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            req.destroy()
            LOG(`redirect (${res.statusCode}) → ${res.headers.location}`)
            return downloadWithRetry(res.headers.location, destFile, expectedSize, retries - attempt + 1)
              .then(resolve).catch(reject)
          }
          // 206 = 服务器支持断点续传；200 = 不支持（从头重新下）
          const supportsResume = res.statusCode === 206
          if (res.statusCode !== 200 && res.statusCode !== 206) {
            reject(new Error(`HTTP ${res.statusCode}`))
            return
          }
          const contentRange = res.headers['content-range'] || ''
          const fullSize = parseInt(contentRange.split('/')[1] || '0', 10) || parseInt(res.headers['content-length'] || '0', 10) || expectedSize
          let downloaded = supportsResume ? resumeFrom : 0
          let lastTime = Date.now()
          let lastBytes = downloaded
          const fileStream = createWriteStream(destFile, { flags: supportsResume ? 'a' : 'w' })
          res.on('data', (chunk) => {
            downloaded += chunk.length
            if (fullSize > 0) {
              const now = Date.now()
              const elapsed = (now - lastTime) / 1000
              let bytesPerSecond = 0
              if (elapsed >= 1) {
                bytesPerSecond = Math.round((downloaded - lastBytes) / elapsed)
                lastTime = now
                lastBytes = downloaded
              }
              mainWindow?.webContents.send('update:progress', {
                percent: Math.round(downloaded / fullSize * 100),
                bytesPerSecond,
                total: fullSize,
                transferred: downloaded,
              })
            }
          })
          res.on('end', () => {
            fileStream.end()
            if (expectedSize > 0 && downloaded < expectedSize) {
              reject(new Error(`下载不完整: ${downloaded}/${expectedSize}，将续传重试`))
            } else {
              resolve()
            }
          })
          res.on('error', reject)
          fileStream.on('error', reject)
          res.pipe(fileStream)
        })
        req.on('error', reject)
        req.on('timeout', () => { req.destroy(); reject(new Error('连接服务器超时')) })
      })
      return // 成功，跳出重试
    } catch (err) {
      LOG(`attempt ${attempt} failed: ${err.message}（已下载部分将续传）`)
      if (attempt < retries) {
        // 短暂等待后重试（续传）
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

    const assetInfo = getAssetDownloadInfo(releaseData)
    if (!assetInfo) {
      throw new Error(`未找到 ${appVersion} 版本的安装包，请手动下载`)
    }
    LOG(`browser_download_url: ${assetInfo.url} (${assetInfo.size} bytes)`)

    // 带断点续传 + 重试的下载（expectedSize 用于完整性校验）
    await downloadWithRetry(assetInfo.url, destFile, assetInfo.size)

    // 最终大小校验（防止续传误判为完成）
    const finalSize = statSync(destFile).size
    if (assetInfo.size > 0 && finalSize !== assetInfo.size) {
      throw new Error(`下载校验失败: ${finalSize}/${assetInfo.size}`)
    }

    // 下载完成
    directDownloadPath = destFile
    LOG(`download complete: ${destFile} (${finalSize} bytes)`)
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
