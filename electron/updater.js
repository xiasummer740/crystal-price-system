// 自动在线升级 — 手动 HTTP 请求 + 下载，不依赖 electron-updater 的 provider
// 2026-07-01: 重写为直接使用 https 模块，避免 electron-updater 网络请求问题

import { app, ipcMain } from 'electron'
import path from 'path'
import fs from 'fs'
import https from 'https'
import { execSync } from 'child_process'

const UPDATE_URL = 'https://github.com/xiasummer740/crystal-price-system/releases/latest/download/latest.yml'
const DOWNLOAD_BASE = 'https://github.com/xiasummer740/crystal-price-system/releases/latest/download'

let mainWindow = null
let updateInfo = null

function log(msg) {
  try {
    const logPath = path.join(app.getPath('documents'), 'update.log')
    const line = `[${new Date().toISOString()}] ${msg}\n`
    fs.appendFileSync(logPath, line)
  } catch {}
}

function send(data) {
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-status', data)
    }
  } catch {}
}

// 从 URL 获取文本内容（支持重定向）
function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'crystal-price-system-updater/1.0' },
      timeout: 15000
    }, (res) => {
      // 处理重定向
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirectUrl = new URL(res.headers.location, url).href
        log(`重定向: ${redirectUrl}`)
        res.resume()
        httpsGet(redirectUrl).then(resolve).catch(reject)
        return
      }
      if (res.statusCode !== 200) {
        res.resume()
        reject(new Error(`HTTP ${res.statusCode}`))
        return
      }
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('请求超时')) })
  })
}

// 下载文件到临时路径（支持重定向）
function httpsDownload(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest)
    const req = https.get(url, {
      headers: { 'User-Agent': 'crystal-price-system-updater/1.0' },
      timeout: 120000
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirectUrl = new URL(res.headers.location, url).href
        log(`下载重定向: ${redirectUrl}`)
        res.resume()
        file.close()
        fs.unlinkSync(dest)
        httpsDownload(redirectUrl, dest).then(resolve).catch(reject)
        return
      }
      if (res.statusCode !== 200) {
        res.resume()
        file.close()
        fs.unlinkSync(dest)
        reject(new Error(`HTTP ${res.statusCode}`))
        return
      }
      res.pipe(file)
      file.on('finish', () => {
        file.close()
        resolve()
      })
    })
    req.on('error', (e) => { file.close(); fs.unlinkSync(dest); reject(e) })
    req.on('timeout', () => { req.destroy(); file.close(); fs.unlinkSync(dest); reject(new Error('下载超时')) })
  })
}

export function initUpdater(win) {
  mainWindow = win

  ipcMain.handle('check-update', async () => {
    log('IPC: 手动检查更新')
    send({ status: 'checking' })

    try {
      const currentVersion = app.getVersion()
      log(`当前版本: v${currentVersion}`)

      // 获取 latest.yml
      const ymlText = await httpsGet(UPDATE_URL)
      log('latest.yml 获取成功')

      // 解析 YAML（简易解析，只取需要的字段）
      const versionMatch = ymlText.match(/^version:\s*(.+)$/m)
      const pathMatch = ymlText.match(/^path:\s*(.+)$/m)
      const remoteVersion = versionMatch?.[1]?.trim()
      const remotePath = pathMatch?.[1]?.trim()

      if (!remoteVersion || !remotePath) {
        throw new Error('无法解析 latest.yml')
      }
      log(`远程版本: v${remoteVersion}, 路径: ${remotePath}`)

      // 比较版本
      if (remoteVersion === currentVersion) {
        log('已是最新版本')
        send({ status: 'not-available' })
        return true
      }

      // 发现新版本
      log(`发现新版本: v${remoteVersion}`)
      updateInfo = { version: remoteVersion, path: remotePath }
      send({ status: 'available', version: remoteVersion })
      return true

    } catch (e) {
      log('检查更新失败: ' + e.message)
      send({ status: 'error', message: e.message })
      return true
    }
  })

  ipcMain.handle('download-update', async () => {
    if (!updateInfo) return { success: false, msg: '没有可用更新' }
    log('IPC: 开始下载更新')

    try {
      const exeName = updateInfo.path
      const downloadUrl = `${DOWNLOAD_BASE}/${exeName}`
      const downloadPath = path.join(app.getPath('temp'), exeName)
      log(`下载: ${downloadUrl} → ${downloadPath}`)

      send({ status: 'downloading', percent: 0 })

      await httpsDownload(downloadUrl, downloadPath)

      log('下载完成')
      updateInfo.downloadPath = downloadPath
      send({ status: 'downloaded', version: updateInfo.version })
      return { success: true }

    } catch (e) {
      log('下载失败: ' + e.message)
      return { success: false, msg: e.message }
    }
  })

  ipcMain.handle('install-update', async () => {
    if (!updateInfo?.downloadPath) return { success: false, msg: '安装包未下载' }
    log('IPC: 安装更新')
    try {
      const exePath = updateInfo.downloadPath
      // 静默安装（等待旧进程退出后新安装程序会自动启动）
      execSync(`"${exePath}" /S`, { timeout: 5000 })
      app.quit()
      return { success: true }
    } catch (e) {
      log('安装失败: ' + e.message)
      return { success: false, msg: e.message }
    }
  })
}

export function checkForUpdates() {
  // 启动 15 秒后自动检查一次
  setTimeout(() => {
    log('自动检查更新...')
    send({ status: 'checking' })

    const currentVersion = app.getVersion()
    httpsGet(UPDATE_URL).then(ymlText => {
      const versionMatch = ymlText.match(/^version:\s*(.+)$/m)
      const remoteVersion = versionMatch?.[1]?.trim()
      if (remoteVersion && remoteVersion !== currentVersion) {
        updateInfo = { version: remoteVersion }
        send({ status: 'available', version: remoteVersion })
      }
    }).catch(() => {})
  }, 15000)
}
