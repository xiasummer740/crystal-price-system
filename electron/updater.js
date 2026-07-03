// 自动在线升级
// 版本检查：直接调 GitHub API（原生 https.get + 绝对超时），不依赖 electron-updater 的 HTTP
// 下载/安装：仍然用 electron-updater（负责进度回调、校验、静默安装）
//
// 为什么绕过 electron-updater 做检查？
// electron-updater 底层用 Chromium net.request()，在中国网络下 DNS 解析
// 可能永久挂起，且其自身的超时机制不可靠。原生 https.get + setTimeout
// 绝对兜底保证无论什么网络状况都能在时限内返回结果。

import { app, ipcMain } from 'electron'
import pkg from 'electron-updater'
const { autoUpdater } = pkg
import { appendFileSync } from 'fs'
import { join } from 'path'
import https from 'https'

autoUpdater.autoDownload = false
autoUpdater.autoInstallOnAppQuit = false

let mainWindow = null
let _downloadStarted = false

// ── 日志 ──
function log(msg) {
  try {
    const logPath = join(process.env.TEMP || __dirname, 'crystal-update.log')
    appendFileSync(logPath, `[${new Date().toISOString()}] ${msg}\n`)
  } catch {}
}

// ── 给渲染进程发事件 ──
function send(data) {
  if (!mainWindow || mainWindow.webContents.isDestroyed()) {
    log('webContents已销毁: ' + JSON.stringify(data))
    return
  }
  mainWindow.webContents.send('update-status', data)
}

// ── electron-updater 仅用于下载进度和安装 ──

autoUpdater.on('download-progress', (progress) => {
  const percent = Math.round(progress.percent)
  const speed = progress.bytesPerSecond
  let speedStr = ''
  if (speed > 1024 * 1024) speedStr = (speed / 1024 / 1024).toFixed(1) + 'MB/s'
  else if (speed > 1024) speedStr = Math.round(speed / 1024) + 'KB/s'
  else speedStr = Math.round(speed) + 'B/s'
  log(`下载中 ${percent}% (${speedStr})`)
  send({ status: 'downloading', percent, version: autoUpdater.currentVersion?.version })
  _downloadStarted = true
})

autoUpdater.on('update-downloaded', (info) => {
  log(`下载完成: ${info.version}`)
  send({ status: 'downloaded', version: info.version })
})

autoUpdater.on('error', (err) => {
  log(`下载错误: ${err.message || err}`)
  if (err.message && err.message.includes('Cancelled')) return
  send({ status: 'error', message: `更新失败: ${err.message || '未知错误'}` })
})

// ── 对外接口 ──

// 直接调 GitHub API 查最新版本
// 用 setTimeout 绝对兜底，不管 DNS 还是 TCP 都不会死等
function fetchLatestVersion(timeoutMs = 10000) {
  return new Promise((resolve) => {
    let settled = false
    const done = (err, version) => {
      if (settled) return
      settled = true
      if (err) resolve({ err })  // { err: '错误信息' }
      else resolve({ version })  // { version: '1.0.xx' }
    }
    // 绝对兜底超时
    setTimeout(() => done(new Error('请求超时')), timeoutMs)

    const url = 'https://api.github.com/repos/xiasummer740/crystal-price-system/releases/latest'
    const req = https.get(url, {
      timeout: 8000,
      headers: { 'User-Agent': 'crystal-price-system', 'Accept': 'application/json' }
    }, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        try {
          const info = JSON.parse(data)
          const tag = (info.tag_name || '').replace(/^v/, '')
          if (!tag) return done(new Error('无法解析版本号'))
          done(null, tag)
        } catch (e) {
          done(new Error('解析 GitHub 响应失败'))
        }
      })
    })
    req.on('timeout', () => { req.destroy(); done(new Error('连接超时')) })
    req.on('error', (e) => done(new Error('网络错误: ' + (e.message || e.code || '未知'))))
  })
}

export async function checkForUpdates() {
  log('checkForUpdates 被调用')

  const result = await fetchLatestVersion(10000)

  if (result.err) {
    log(`检查更新失败: ${result.err}`)
    send({ status: 'error', message: '检查更新失败: ' + result.err })
    return { status: 'error', message: result.err }
  }

  const latest = result.version
  const current = app.getVersion()

  log(`远端版本: ${latest}, 当前版本: ${current}`)

  // 简单版本比较（逐段比较数字）
  const curParts = current.split('.').map(Number)
  const latParts = latest.split('.').map(Number)
  let isNewer = false
  for (let i = 0; i < Math.max(curParts.length, latParts.length); i++) {
    const c = curParts[i] || 0
    const l = latParts[i] || 0
    if (l > c) { isNewer = true; break }
    if (l < c) break
  }

  if (!isNewer) {
    log('已是最新版本')
    send({ status: 'not-available' })
    return { status: 'not-available' }
  }

  log(`发现新版本: ${latest}`)
  _downloadStarted = false
  send({ status: 'available', version: latest })
  // 自动开始下载（复用 electron-updater 的下载能力）
  try {
    autoUpdater.downloadUpdate()
  } catch (e) {
    log(`自动下载失败: ${e.message}`)
  }
  return { status: 'available', version: latest }
}

export async function downloadUpdate() {
  log('downloadUpdate 被调用')
  if (_downloadStarted) {
    log('已在下载中，跳过')
    return { success: false, msg: '已在下载中' }
  }
  try {
    autoUpdater.downloadUpdate()
    return { success: true }
  } catch (e) {
    log(`downloadUpdate 失败: ${e.message}`)
    return { success: false, msg: e.message }
  }
}

export async function installUpdate() {
  log('installUpdate 被调用')
  try {
    setImmediate(() => {
      autoUpdater.quitAndInstall()
    })
    return { success: true }
  } catch (e) {
    log(`installUpdate 失败: ${e.message}`)
    return { success: false, msg: e.message }
  }
}

// ── 全局暴露，供 Express 路由调用 ──
global.__checkForUpdates = checkForUpdates

// ── 初始化：注册 IPC ──
let _initialized = false
export function initUpdater(win) {
  if (_initialized) {
    log('initUpdater 重复调用，跳过')
    mainWindow = win
    return
  }
  _initialized = true
  mainWindow = win
  log('initUpdater 完成')

  ipcMain.handle('check-update', async () => {
    log('IPC: 检查更新')
    try {
      await checkForUpdates()
    } catch (e) {
      log('IPC check-update 错误: ' + e.message)
    }
    return true
  })

  ipcMain.handle('download-update', async () => {
    return await downloadUpdate()
  })

  ipcMain.handle('install-update', async () => {
    return await installUpdate()
  })
}
