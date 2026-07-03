// 自动在线升级 — 完全用原生 Node.js HTTPS，绕过 electron-updater 的 Chromium net.request
//
// 为什么不用 electron-updater 做下载？
// electron-updater 底层用 Chromium net.request()，在中国网络下连接 GitHub CDN
// 可能永久挂起或超时。原生 https.get + setTimeout 绝对超时保证可靠。
//
// 流程:
//   1. GitHub API 检查最新版本
//   2. 原生 HTTPS 下载安装包（每 1% 节流推送进度）
//   3. 从 latest.yml 获取 SHA512 校验
//   4. 退出 app → spawn NSIS 安装程序静默安装

import { app, ipcMain } from 'electron'
import { appendFileSync, createWriteStream, createReadStream, mkdirSync, existsSync, unlinkSync } from 'fs'
import { join } from 'path'
import https from 'https'
import { spawn } from 'child_process'
import { createHash } from 'crypto'

let mainWindow = null
let _downloadStarted = false
let _latestRelease = null
let _releaseCache = null
let _releaseCacheTime = 0

const CACHE_TTL = 15 * 60 * 1000 // GitHub API 限流 60次/h，缓存 15 分钟
const GITHUB_API = 'https://api.github.com/repos/xiasummer740/crystal-price-system/releases/latest'
const UA = 'crystal-price-system'

// ── 日志 ──
function log(msg) {
  try {
    const logPath = join(process.env.TEMP || '.', 'crystal-update.log')
    appendFileSync(logPath, `[${new Date().toISOString()}] ${msg}\n`)
  } catch {}
}

// ── 给渲染进程发事件 ──
function send(data) {
  if (!mainWindow || mainWindow.webContents.isDestroyed()) {
    log('webContents已销毁，丢弃事件: ' + JSON.stringify(data))
    return
  }
  mainWindow.webContents.send('update-status', data)
}

// ── 版本比较 ──
function isNewerVersion(current, latest) {
  const cur = current.split('.').map(Number)
  const lat = latest.split('.').map(Number)
  for (let i = 0; i < Math.max(cur.length, lat.length); i++) {
    const c = cur[i] || 0
    const l = lat[i] || 0
    if (l > c) return true
    if (l < c) return false
  }
  return false
}

// ── 从 GitHub API 获取最新 Release ──
async function fetchLatestRelease() {
  if (_releaseCache && Date.now() - _releaseCacheTime < CACHE_TTL) {
    log('fetchLatestRelease 使用缓存')
    return _releaseCache
  }

  log('fetchLatestRelease 请求 GitHub API...')
  const data = await new Promise((resolve) => {
    let settled = false
    const done = (err, result) => {
      if (settled) return; settled = true
      err ? resolve({ error: err.message }) : resolve(result)
    }
    setTimeout(() => done(new Error('GitHub API 请求超时')), 15000)

    const req = https.get(GITHUB_API, {
      timeout: 10000,
      headers: { 'User-Agent': UA, 'Accept': 'application/json' }
    }, (res) => {
      let body = ''
      res.on('data', c => body += c)
      res.on('end', () => {
        try {
          const json = JSON.parse(body)
          const tag = (json.tag_name || '').replace(/^v/, '')
          if (!tag) return done(new Error('无法解析版本号'))

          const exe = json.assets?.find(a => a.name.endsWith('.exe') && !a.name.includes('blockmap'))
          if (!exe) return done(new Error('Release 中未找到安装包'))

          const latestYml = json.assets?.find(a => a.name === 'latest.yml')

          const result = {
            version: tag,
            downloadUrl: exe.browser_download_url,
            size: exe.size,
            latestYmlUrl: latestYml?.browser_download_url || null
          }
          log(`GitHub API 返回: v${tag}, exe: ${(exe.size / 1024 / 1024).toFixed(1)}MB`)
          done(null, result)
        } catch (e) {
          done(new Error('解析 GitHub 响应失败: ' + e.message))
        }
      })
    })
    req.on('timeout', () => { req.destroy(); done(new Error('连接 GitHub 超时')) })
    req.on('error', e => done(new Error('网络错误: ' + (e.message || e.code || '未知'))))
  })

  if (!data.error) {
    _releaseCache = data
    _releaseCacheTime = Date.now()
  }
  return data
}

// ── 下载文本文件（如 latest.yml）──
function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 10000, headers: { 'User-Agent': UA } }, (res) => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => resolve(data))
    }).on('error', reject)
  })
}

// ── 从 latest.yml 解析 SHA512 ──
// latest.yml 格式: 顶级 sha512 和 files[0].sha512 相同
function parseSha512(yml) {
  const m = yml.match(/^sha512:\s*['"]?([A-Za-z0-9+/=]+)['"]?/m)
  return m ? m[1] : null
}

// ── 下载安装包（原生 HTTPS + 自动跟随重定向 + 每 1% 节流推送进度）──
function downloadFile(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    try { if (existsSync(destPath)) unlinkSync(destPath) } catch {}
    const file = createWriteStream(destPath)
    let received = 0
    let total = 0
    let lastPct = -1

    const doGet = (targetUrl) => {
      const req = https.get(targetUrl, {
        timeout: 120000,
        headers: { 'User-Agent': UA, 'Accept': 'application/octet-stream' }
      }, (res) => {
        // 跟随 302 重定向到 CDN
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          file.close()
          try { unlinkSync(destPath) } catch {}
          log(`跟随重定向: ${res.headers.location}`)
          return doGet(res.headers.location)
        }
        if (res.statusCode !== 200) {
          file.close()
          return reject(new Error(`下载服务器返回 ${res.statusCode}`))
        }
        total = parseInt(res.headers['content-length'] || '0', 10)
        log(`下载开始, 总大小: ${total > 0 ? (total / 1024 / 1024).toFixed(1) + 'MB' : '未知'}`)

        res.on('data', (chunk) => {
          received += chunk.length
          file.write(chunk)
          if (total > 0) {
            const pct = Math.round(received / total * 100)
            if (pct !== lastPct) {
              lastPct = pct
              onProgress?.({ received, total, percent: pct })
            }
          } else {
            onProgress?.({ received, total: 0, percent: 0 })
          }
        })
        res.on('end', () => {
          file.end()
          log(`下载完成: ${(received / 1024 / 1024).toFixed(1)}MB`)
          resolve()
        })
        res.on('error', (e) => { file.close(); reject(e) })
      })
      req.on('timeout', () => { req.destroy(); file.close(); reject(new Error('下载超时')) })
      req.on('error', (e) => { file.close(); reject(e) })
    }
    doGet(url)
  })
}

// ── 校验文件 SHA512 ──
function verifySha512(filePath, expectedBase64) {
  return new Promise((resolve) => {
    try {
      const hash = createHash('sha512')
      const stream = createReadStream(filePath)
      stream.on('data', c => hash.update(c))
      stream.on('end', () => {
        const ok = hash.digest('base64') === expectedBase64
        log(`SHA512 校验: ${ok ? '通过' : '失败'}`)
        resolve(ok)
      })
      stream.on('error', (e) => { log('SHA512 读文件失败: ' + e.message); resolve(false) })
    } catch (e) {
      log('SHA512 校验异常: ' + e.message)
      resolve(false)
    }
  })
}

// ── 启动安装程序 ──
function runInstaller(exePath) {
  try {
    log('启动安装程序: ' + exePath)
    // detached + unref 确保安装器在 app 退出后继续运行
    const proc = spawn(exePath, ['/S'], { detached: true, stdio: 'ignore' })
    proc.unref()
    // 给安装器一点时间启动，再退出当前应用
    setTimeout(() => { app.quit() }, 1500)
    return { success: true }
  } catch (e) {
    log('启动安装程序失败: ' + e.message)
    send({ status: 'error', message: '启动安装程序失败: ' + e.message })
    return { success: false, error: e.message }
  }
}

// ── 导出: 检查更新 ──
export async function checkForUpdates() {
  log('checkForUpdates 被调用')

  const release = await fetchLatestRelease()
  if (release.error) {
    log('检查更新失败: ' + release.error)
    send({ status: 'error', message: '检查更新失败: ' + release.error })
    return { status: 'error', message: release.error }
  }

  const current = app.getVersion()
  log(`远端: v${release.version}, 当前: v${current}`)

  if (!isNewerVersion(current, release.version)) {
    log('已是最新版本')
    send({ status: 'not-available' })
    return { status: 'not-available' }
  }

  log(`发现新版本: v${release.version}`)
  _latestRelease = release
  _downloadStarted = false
  send({ status: 'available', version: release.version, downloadUrl: release.downloadUrl })
  return { status: 'available', version: release.version, downloadUrl: release.downloadUrl }
}

// ── 导出: 下载更新 ──
export async function downloadUpdate() {
  log('downloadUpdate 被调用')
  if (_downloadStarted) {
    log('已在下载中，跳过')
    return { success: false, msg: '已在下载中' }
  }
  _downloadStarted = true

  const release = _latestRelease || await fetchLatestRelease()
  if (release.error) {
    _downloadStarted = false
    log('获取 Release 信息失败: ' + release.error)
    send({ status: 'error', message: '获取下载信息失败: ' + release.error })
    return { success: false, msg: release.error }
  }
  _latestRelease = release

  const destDir = join(app.getPath('temp'), 'crystal-update')
  if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true })
  const exeName = `crystal-price-system-setup-${release.version}.exe`
  const destPath = join(destDir, exeName)
  log(`下载目标: ${destPath}`)

  send({ status: 'downloading', percent: 0, version: release.version })

  try {
    // 获取 SHA512（从 latest.yml）
    let sha512 = null
    if (release.latestYmlUrl) {
      try {
        const yml = await fetchText(release.latestYmlUrl)
        sha512 = parseSha512(yml)
        log(`SHA512: ${sha512 ? '已获取' : '未找到校验值'}`)
      } catch (e) {
        log('获取 latest.yml 失败（跳过校验）: ' + e.message)
      }
    }

    // 下载安装包
    await downloadFile(release.downloadUrl, destPath, (p) => {
      send({ status: 'downloading', percent: p.percent, version: release.version })
    })

    // SHA512 校验
    if (sha512) {
      const ok = await verifySha512(destPath, sha512)
      if (!ok) {
        log('SHA512 校验失败，清理文件')
        try { unlinkSync(destPath) } catch {}
        _downloadStarted = false
        send({ status: 'error', message: '文件校验失败，请重试或手动下载' })
        return { success: false, msg: '文件校验失败' }
      }
    }

    _downloadStarted = false
    log('下载+校验全部完成')
    send({ status: 'downloaded', version: release.version })
    return { success: true, filePath: destPath }
  } catch (e) {
    log('下载失败: ' + e.message)
    try { if (existsSync(destPath)) unlinkSync(destPath) } catch {}
    _downloadStarted = false
    send({ status: 'error', message: '下载失败: ' + e.message })
    return { success: false, msg: e.message }
  }
}

// ── 导出: 安装更新 ──
export async function installUpdate() {
  log('installUpdate 被调用')
  const release = _latestRelease
  if (!release || !release.version) {
    log('没有已下载的更新包')
    return { success: false, msg: '没有已下载的更新包' }
  }
  const exePath = join(app.getPath('temp'), 'crystal-update', `crystal-price-system-setup-${release.version}.exe`)
  if (!existsSync(exePath)) {
    log('安装文件不存在: ' + exePath)
    send({ status: 'error', message: '安装文件不存在，请重新下载' })
    return { success: false, msg: '安装文件不存在' }
  }
  return runInstaller(exePath)
}

// ── 全局暴露，供 Express 路由调用 ──
global.__checkForUpdates = checkForUpdates

// ── 初始化: 注册 IPC ──
let _initialized = false
export function initUpdater(win) {
  mainWindow = win
  if (_initialized) {
    log('initUpdater 重复调用，更新 mainWindow')
    return
  }
  _initialized = true
  log('initUpdater OK')

  ipcMain.handle('check-update', async () => {
    log('IPC: 检查更新')
    try {
      const result = await checkForUpdates()
      if (result.status === 'available') {
        // 发现新版本 → 自动开始下载
        downloadUpdate().catch(e => log('自动下载错误: ' + e.message))
      }
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
