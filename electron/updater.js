// 自动在线升级 — 改用 electron-updater（electron-builder 官方配套）
// 比手写 fetch 更稳定：自动重试、可靠进度、静默安装
// 配置读取 package.json 的 build.publish（GitHub）
//
// 注意：electron-updater 底层用 Chromium net.request()，在中国访问 GitHub
// 经常断连且不带超时。所以加一层快速探活：原生 https.get（5s 超时）先确认
// GitHub 可达，再调 electron-updater 做正式检查。

import { ipcMain } from 'electron'
import pkg from 'electron-updater'
const { autoUpdater } = pkg
import { appendFileSync } from 'fs'
import { join } from 'path'
import https from 'https'

autoUpdater.autoDownload = false
autoUpdater.autoInstallOnAppQuit = false
autoUpdater.forceDevUpdateConfig = true  // 开发版也可用（需 dev-app-update.yml）

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

// ── electron-updater 事件监听 ──

autoUpdater.on('checking-for-update', () => {
  log('正在检查更新...')
  send({ status: 'checking' })
})

autoUpdater.on('update-available', (info) => {
  log(`发现新版本: ${info.version}`)
  _downloadStarted = false
  send({ status: 'available', version: info.version, releaseDate: info.releaseDate })
  // 立即开始下载（electron-updater 处理重试和断点续传）
  autoUpdater.downloadUpdate()
})

autoUpdater.on('update-not-available', () => {
  log('已是最新版本')
  send({ status: 'not-available' })
})

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
  log(`更新错误: ${err.message || err}`)
  // 用户主动取消的不报错
  if (err.message && err.message.includes('Cancelled')) return
  send({ status: 'error', message: `更新失败: ${err.message || '未知错误'}` })
})

// ── 对外接口 ──

// GitHub 可达性缓存
let _reachableCache = null  // { ok, time }

// 快速探活：原生 https.get 判断 GitHub 能否连上
// 关键：DNS 解析也可能被墙卡死，所以加一层 setTimeout 绝对兜底
function checkGithubReachable(timeoutMs = 8000) {
  return new Promise((resolve) => {
    if (_reachableCache && Date.now() - _reachableCache.time < 180000) {
      return resolve(_reachableCache.ok)
    }
    let settled = false
    const done = (ok) => {
      if (settled) return
      settled = true
      _reachableCache = { ok, time: Date.now() }
      resolve(ok)
    }
    // 绝对兜底：DNS 卡死也能在 timeoutMs 内返回
    setTimeout(() => done(false), timeoutMs)
    const req = https.get('https://github.com', { timeout: 5000 }, (res) => {
      done(res.statusCode >= 200 && res.statusCode < 500)
      res.resume()
    })
    req.on('timeout', () => { req.destroy(); done(false) })
    req.on('error', () => done(false))
  })
}

export async function checkForUpdates() {
  log('checkForUpdates 被调用')

  // 第一步：快速探活 GitHub（5s 超时）
  const reachable = await checkGithubReachable(5000)
  if (!reachable) {
    log('GitHub 不可达，跳过更新检查')
    send({ status: 'error', message: '检查更新失败：无法连接到 GitHub，请检查网络后重试' })
    return { status: 'error', message: 'GitHub 不可达' }
  }

  // 第二步：正式检查（带 10s 超时）
  try {
    await Promise.race([
      autoUpdater.checkForUpdates(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('检查更新超时 (10s)')), 10000)
      )
    ])
    return { status: 'checking' }
  } catch (e) {
    log(`checkForUpdates 失败: ${e.message}`)
    send({ status: 'error', message: '检查更新失败: ' + e.message })
    return { status: 'error', message: e.message }
  }
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

  // IPC: 检查更新
  ipcMain.handle('check-update', async () => {
    log('IPC: 检查更新')
    try {
      await checkForUpdates()
    } catch (e) {
      log('IPC check-update 错误: ' + e.message)
    }
    return true
  })

  // IPC: 下载更新
  ipcMain.handle('download-update', async () => {
    return await downloadUpdate()
  })

  // IPC: 安装更新
  ipcMain.handle('install-update', async () => {
    return await installUpdate()
  })
}
