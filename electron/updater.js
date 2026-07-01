// 自动在线升级 — 去掉 electron-updater，改用原生 fetch
// fetch 自动跟随跨域跳转，不走 GitHub API，避免在中国大陆被干扰
// 正式版如果 fetch 失败则用 https.get 重试（ASAR 打包后 fetch 可能不稳定）

import { app, ipcMain } from 'electron'
import { createWriteStream, unlinkSync, appendFileSync, createReadStream } from 'fs'
import { join } from 'path'
import { spawn } from 'child_process'
import { createHash } from 'crypto'
import https from 'https'

const REPO = 'xiasummer740/crystal-price-system'
const BASE_URL = `https://github.com/${REPO}/releases`
const TIMEOUT_MS = 15000

let mainWindow = null
let updateInfo = null // { version, fileName, sha512, downloadUrl }
let downloadPath = null

// ── 日志（userData 目录，避免权限问题） ──
function log(msg) {
  try {
    const logPath = join(process.env.TEMP || __dirname, 'crystal-update.log')
    const line = `[${new Date().toISOString()}] ${msg}\n`
    appendFileSync(logPath, line)
  } catch {}
}

// ── 给渲染进程发事件 ──
function send(data) {
  if (!mainWindow || mainWindow.webContents.isDestroyed()) {
    log('webContents已销毁，无法发送事件: ' + JSON.stringify(data))
    return
  }
  mainWindow.webContents.send('update-status', data)
}

// ── 版本号比较：大于返回 true ──
function isNewer(latest, current) {
  const pa = latest.split('.').map(Number)
  const pb = current.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return true
    if ((pa[i] || 0) < (pb[i] || 0)) return false
  }
  return false
}

// ── 带超时的 fetch（Node.js 18+ 内置，Electron 33 可用） ──
async function fetchWithTimeout(url, timeout = TIMEOUT_MS) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: 'follow' })
    return res
  } finally {
    clearTimeout(timer)
  }
}

// ── https.get 后备方案（ASAR 打包后 fetch 可能不稳，用原生模块兜底） ──
function httpsGet(url, timeout = TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout }, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => resolve(data))
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('HTTPS 超时')) })
  })
}

// ── 下载文件（带进度回调，fetch 方式） ──
async function downloadFile(url, destPath, onProgress) {
  const controller = new AbortController()
  // 119MB 安装包给 10 分钟超时
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS * 40)
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: 'follow' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const total = parseInt(res.headers.get('content-length') || '0', 10)
    let downloaded = 0
    const reader = res.body.getReader()
    const writer = createWriteStream(destPath)
    const pump = async () => {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        writer.write(Buffer.from(value))
        downloaded += value.length
        // 即使没有 content-length 也发进度（显示已下载 MB）
        if (onProgress) {
          if (total) onProgress(Math.round(downloaded / total * 100))
          else onProgress(-Math.round(downloaded / 1024 / 1024)) // 负数表示 MB
        }
      }
      writer.end()
    }
    await pump()
    await new Promise((resolve, reject) => {
      writer.on('finish', resolve)
      writer.on('error', reject)
    })
    return destPath
  } finally {
    clearTimeout(timer)
  }
}

// ── 计算文件 SHA512 ──
function computeSha512(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha512')
    const stream = createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('base64')))
    stream.on('error', reject)
  })
}

// ── 解析 latest.yml（极简 YAML 解析） ──
function parseLatestYml(text) {
  const version = (text.match(/^version:\s*([\d.]+)/m) || [])[1]
  // url 在 files: 子项中（带缩进），改用顶层的 path 字段
  const fileName = (text.match(/^path:\s*(.+)/m) || [])[1]?.trim()
  const sha512 = (text.match(/^sha512:\s*(\S+)/m) || [])[1]
  if (!version || !fileName) throw new Error('无法解析更新信息')
  return { version, fileName, sha512 }
}

// ── 主流程：检查更新（fetch → https.get 兜底） ──
const UPDATE_YML_URL = `${BASE_URL}/latest/download/latest.yml`

export async function checkForUpdates() {
  send({ status: 'checking' })
  log('正在检查更新...')

  // 尝试两次：fetch → https.get 兜底
  let ymlText = null
  let lastErr = null
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      if (attempt === 0) {
        // 第一轮：fetch
        const res = await fetchWithTimeout(UPDATE_YML_URL)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        ymlText = await res.text()
      } else {
        // 第二轮：https.get 兜底（更长超时）
        ymlText = await httpsGet(UPDATE_YML_URL, TIMEOUT_MS * 2)
      }
      break // 成功则跳出循环
    } catch (e) {
      lastErr = e
      log(`尝试 ${attempt + 1}/2 失败: ${e.message || e}`)
    }
  }

  if (!ymlText) {
    const msg = lastErr?.message || String(lastErr || '未知错误')
    log('检查更新最终失败: ' + msg)
    const friendly = msg.includes('超时') || msg.includes('timeout') || lastErr?.name === 'AbortError'
      ? '检查超时，请检查网络连接后重试'
      : '无法连接到 GitHub，请确认网络可访问 github.com'
    send({ status: 'error', message: friendly })
    return { status: 'error', message: msg }
  }

  try {
    const remote = parseLatestYml(ymlText)
    log(`远端版本: ${remote.version}, 当前版本: ${app.getVersion()}`)

    if (!isNewer(remote.version, app.getVersion())) {
      send({ status: 'not-available' })
      log('已是最新版本')
      return { status: 'not-available', version: app.getVersion() }
    }

    updateInfo = {
      version: remote.version,
      fileName: remote.fileName,
      sha512: remote.sha512,
      downloadUrl: `${BASE_URL}/download/v${remote.version}/${remote.fileName}`
    }
    log(`发现新版本: ${remote.version}`)
    send({ status: 'available', version: remote.version, releaseDate: new Date().toISOString() })
    return { status: 'available', version: remote.version }
  } catch (e) {
    const msg = e.message || String(e)
    log('解析更新信息失败: ' + msg)
    send({ status: 'error', message: '解析更新信息失败: ' + msg })
    return { status: 'error', message: msg }
  }
}

// ── 初始化：注册 IPC ──
// 全局暴露更新函数，供 Express 路由直接调用
global.__checkForUpdates = checkForUpdates

let _initialized = false
export function initUpdater(win) {
  if (_initialized) {
    log('initUpdater 重复调用，跳过')
    mainWindow = win // 更新窗口引用
    return
  }
  _initialized = true
  mainWindow = win
  log('initUpdater 完成')

  // IPC: 检查更新
  ipcMain.handle('check-update', async () => {
    log('IPC: 检查更新')
    checkForUpdates()
    return true
  })

  // IPC: 下载更新
  ipcMain.handle('download-update', async () => {
    if (!updateInfo) return { success: false, msg: '没有可用更新' }
    log('IPC: 开始下载更新')

    if (downloadPath) { try { unlinkSync(downloadPath) } catch {} }

    const destPath = join(app.getPath('temp'), `crystal-update-${Date.now()}.exe`)
    downloadPath = destPath

    try {
      await downloadFile(updateInfo.downloadUrl, destPath, (percent) => {
        send({ status: 'downloading', percent })
      })
      log('下载完成')

      if (updateInfo.sha512) {
        const actual = await computeSha512(destPath)
        if (actual !== updateInfo.sha512) {
          log(`SHA512 不匹配: 期望 ${updateInfo.sha512}，实际 ${actual}`)
          try { unlinkSync(destPath) } catch {}
          send({ status: 'error', message: '文件校验失败，请重试' })
          return { success: false, msg: 'SHA512 mismatch' }
        }
        log('SHA512 校验通过')
      }

      send({ status: 'downloaded', version: updateInfo.version })
      return { success: true }
    } catch (e) {
      log('下载更新失败: ' + (e.message || e))
      try { unlinkSync(destPath) } catch {}
      send({ status: 'error', message: '下载失败: ' + (e.message || '未知错误') })
      return { success: false, msg: e.message }
    }
  })

  // IPC: 安装更新
  ipcMain.handle('install-update', async () => {
    if (!downloadPath) return { success: false, msg: '没有已下载的安装包' }
    log('IPC: 安装更新')

    try {
      spawn(downloadPath, ['--updated'], {
        detached: true,
        stdio: 'ignore'
      }).unref()
      app.quit()
      return { success: true }
    } catch (e) {
      log('安装更新失败: ' + e.message)
      return { success: false, msg: e.message }
    }
  })
}
