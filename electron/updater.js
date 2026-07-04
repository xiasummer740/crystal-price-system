// 自动在线升级 — 完全用原生 Node.js HTTPS，绕过 electron-updater 的 Chromium net.request
//
// 为什么不用 electron-updater 做下载？
// electron-updater 底层用 Chromium net.request()，在中国网络下连接 GitHub CDN
// 可能永久挂起或超时。原生 https.get + setTimeout 绝对超时保证可靠。
//
// 流程:
//   1. GitHub API 检查最新版本
//   2. 原生 HTTPS 下载安装包（支持断点续传，每 1% 节流推送进度）
//   3. 从 latest.yml 获取 SHA512 校验
//   4. 保存升级状态 → 静默安装 → 自动拉起新版本
//
// 断点续传:
//   下载中断后，下次启动或重试时自动从断点续传（Range + append）
//   状态保存在 %TEMP%/crystal-update/download-state.json
//
// 升级回滚:
//   安装前记录旧版本号到 userData/update-backup/upgrade-state.json
//   新版本启动后 30s 健康检查通过标记 healthy=true
//   可通过 settings 按钮一键回滚到旧版本

import { app, ipcMain } from 'electron'
import { appendFileSync, createWriteStream, createReadStream, mkdirSync, existsSync, unlinkSync, writeFileSync, readFileSync, statSync } from 'fs'
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
const DOWNLOAD_STATE_FILE = 'download-state.json'

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

// ── 更新目录 ──
function getUpdateDir() {
  const dir = join(process.env.TEMP || '.', 'crystal-update')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

// ── 下载状态持久化（断点续传用）──
function saveDownloadState(state) {
  try {
    writeFileSync(join(getUpdateDir(), DOWNLOAD_STATE_FILE), JSON.stringify(state))
    log('下载状态已保存: ' + JSON.stringify({ v: state.version, pct: state.totalBytes ? Math.round(state.downloadedBytes / state.totalBytes * 100) + '%' : '?' }))
  } catch (e) { log('保存下载状态失败: ' + e.message) }
}

function loadDownloadState() {
  try {
    const p = join(getUpdateDir(), DOWNLOAD_STATE_FILE)
    if (!existsSync(p)) return null
    return JSON.parse(readFileSync(p, 'utf-8'))
  } catch (e) { return null }
}

function clearDownloadState() {
  try {
    const p = join(getUpdateDir(), DOWNLOAD_STATE_FILE)
    if (existsSync(p)) unlinkSync(p)
  } catch {}
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
function parseSha512(yml) {
  const m = yml.match(/^sha512:\s*['"]?([A-Za-z0-9+/=]+)['"]?/m)
  return m ? m[1] : null
}

// ── 下载安装包（原生 HTTPS + 自动跟随重定向 + Range 续传 + 每 1% 节流推送进度）──
function downloadFile(url, destPath, onProgress, resumeBytes = 0) {
  return new Promise((resolve, reject) => {
    try {
      if (resumeBytes === 0 && existsSync(destPath)) unlinkSync(destPath)
    } catch {}

    const opts = {
      timeout: 120000,
      headers: { 'User-Agent': UA, 'Accept': 'application/octet-stream' }
    }
    if (resumeBytes > 0) {
      opts.headers['Range'] = `bytes=${resumeBytes}-`
    }

    const flags = resumeBytes > 0 ? 'a' : 'w'
    const file = createWriteStream(destPath, { flags })
    let received = resumeBytes
    let total = resumeBytes  // will be updated from Content-Range or Content-Length
    let lastPct = -1

    const doGet = (targetUrl) => {
      const req = https.get(targetUrl, opts, (res) => {
        // 跟随 302 重定向到 CDN
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          file.close()
          log(`跟随重定向: ${res.headers.location}`)
          return doGet(res.headers.location)
        }

        // 206 Partial Content = 服务器支持断点续传
        if (res.statusCode === 206) {
          const cr = res.headers['content-range']
          if (cr) {
            // Content-Range: bytes start-end/total
            const m = cr.match(/\/(\d+)/)
            if (m) total = parseInt(m[1], 10)
          }
          log(`续传: ${received}/${total} (${cr || '?'})`)
        } else if (res.statusCode === 200 && resumeBytes > 0) {
          // 服务器不支持 Range，从头下载
          log('服务器不支持续传，从头下载')
          try { if (existsSync(destPath)) unlinkSync(destPath) } catch {}
          received = 0
          total = 0
          resumeBytes = 0
          // 重新创建写入流（覆盖模式）
          file.close()
          const newFile = createWriteStream(destPath)
          // 继续用新流
          return setupStream(newFile, res)
        }

        if (res.statusCode !== 200 && res.statusCode !== 206) {
          file.close()
          return reject(new Error(`下载服务器返回 ${res.statusCode}`))
        }

        if (total <= resumeBytes) {
          total = parseInt(res.headers['content-length'] || '0', 10) + resumeBytes
        }

        log(`下载${resumeBytes > 0 ? '续传' : '开始'}, 总大小: ${total > 0 ? (total / 1024 / 1024).toFixed(1) + 'MB' : '未知'}`)

        setupStream(file, res)
      })
      req.on('timeout', () => { req.destroy(); file.close(); reject(new Error('下载超时')) })
      req.on('error', (e) => { file.close(); reject(e) })
    }

    function setupStream(stream, res) {
      res.on('data', (chunk) => {
        received += chunk.length
        stream.write(chunk)
        if (total > 0) {
          const pct = Math.min(100, Math.round(received / total * 100))
          if (pct !== lastPct) {
            lastPct = pct
            onProgress?.({ received, total, percent: pct })
          }
        } else {
          onProgress?.({ received, total: 0, percent: 0 })
        }
      })
      res.on('end', () => {
        stream.end()
        log(`下载完成: ${(received / 1024 / 1024).toFixed(1)}MB`)
        resolve()
      })
      res.on('error', (e) => { stream.close(); reject(e) })
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

// ── 升级状态管理（用于回滚）──
const UPGRADE_STATE_DIR = 'update-backup'
const UPGRADE_STATE_FILE_NAME = 'upgrade-state.json'

function getUpgradeStatePath() {
  try {
    const dir = join(app.getPath('userData'), UPGRADE_STATE_DIR)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    return join(dir, UPGRADE_STATE_FILE_NAME)
  } catch (e) {
    log('获取升级状态路径失败: ' + e.message)
    return null
  }
}

function saveUpgradeState(state) {
  const p = getUpgradeStatePath()
  if (!p) return
  try {
    writeFileSync(p, JSON.stringify(state, null, 2))
    log('升级状态已保存: ' + JSON.stringify({ old: state.oldVersion, new: state.newVersion }))
  } catch (e) { log('保存升级状态失败: ' + e.message) }
}

function loadUpgradeState() {
  const p = getUpgradeStatePath()
  if (!p || !existsSync(p)) return null
  try {
    return JSON.parse(readFileSync(p, 'utf-8'))
  } catch (e) { return null }
}

function clearUpgradeState() {
  const p = getUpgradeStatePath()
  if (!p) return
  try {
    if (existsSync(p)) unlinkSync(p)
    log('升级状态已清除')
  } catch {}
}

// ── 获取可回滚版本 ──
export function getUpgradeState() {
  const state = loadUpgradeState()
  if (!state || !state.oldVersion) return { canRollback: false }
  return {
    canRollback: true,
    oldVersion: state.oldVersion,
    newVersion: state.newVersion,
    healthy: !!state.healthy,
    timestamp: state.timestamp
  }
}

// ── 启动升级健康检查（新版本首次启动后 30s 标记健康）──
export function startUpgradeHealthCheck() {
  const state = loadUpgradeState()
  if (!state || state.healthy) return

  log('启动升级健康检查 (30s)...')
  const timeout = setTimeout(() => {
    state.healthy = true
    saveUpgradeState(state)
    log('升级健康检查通过，已标记 healthy')
  }, 30000)

  // 如果 app 提前退出，clearTimeout 不会执行，state 保持 healthy:false
  // 下次启动时判断：如果状态已超过 5 分钟且 !healthy，说明上次可能崩溃了
  app.on('before-quit', () => {
    clearTimeout(timeout)
  })
}

// ── 安装程序（等待退出 → 自动拉起新版本 → 退出旧版）──
function runInstaller(exePath) {
  log('启动安装程序: ' + exePath)
  send({ status: 'installing' })

  const proc = spawn(exePath, ['/S'], { stdio: 'ignore' })
  const timeout = setTimeout(() => {
    log('安装器超时 (30s)，强制退出')
    app.quit()
  }, 30000)

  proc.on('exit', (code) => {
    clearTimeout(timeout)
    log(`安装器退出 code=${code}`)

    // 从几个常见路径查找已安装的 exe 并自动拉起
    const candidates = [
      join(process.env.LOCALAPPDATA || '', 'Programs', '晶振报价管理系统', '晶振报价管理系统.exe'),
      join(process.env.USERPROFILE || '', 'AppData', 'Local', 'Programs', '晶振报价管理系统', '晶振报价管理系统.exe'),
      join('C:', 'ProgramData', '晶振报价管理系统', '晶振报价管理系统.exe'),
      join('C:', 'Program Files', '晶振报价管理系统', '晶振报价管理系统.exe'),
      join('C:', 'Program Files (x86)', '晶振报价管理系统', '晶振报价管理系统.exe'),
    ]
    let launched = false
    for (const p of candidates) {
      try {
        if (existsSync(p)) {
          spawn(p, [], { detached: true, stdio: 'ignore' }).unref()
          log('已自动启动新版本: ' + p)
          launched = true
          break
        }
      } catch (e) {
        log('尝试启动 ' + p + ' 失败: ' + e.message)
      }
    }
    if (!launched) log('未找到新版本可执行文件，需用户手动启动')

    // 给启动器一点时间，再退出旧版
    setTimeout(() => app.quit(), 1000)
  })

  proc.on('error', (e) => {
    clearTimeout(timeout)
    log('安装程序启动失败: ' + e.message)
    send({ status: 'error', message: '启动安装程序失败: ' + e.message })
    setTimeout(() => app.quit(), 1000)
  })
}

// ── 回滚到上一版本 ──
export async function rollbackToOldVersion() {
  log('rollbackToOldVersion 被调用')
  const state = loadUpgradeState()
  if (!state || !state.oldVersion) {
    log('没有可回滚的版本')
    return { success: false, msg: '没有可回滚的版本' }
  }

  const oldVer = state.oldVersion
  const url = `https://github.com/xiasummer740/crystal-price-system/releases/download/v${oldVer}/crystal-price-system-setup-${oldVer}.exe`

  const destDir = getUpdateDir()
  const exeName = `crystal-price-system-setup-${oldVer}.exe`
  const destPath = join(destDir, exeName)

  send({ status: 'rollback-downloading', percent: 0, version: oldVer })

  try {
    // 直接用下载进度回调
    let prevBytes = 0, prevTime = 0
    await downloadFile(url, destPath, (p) => {
      const now = Date.now()
      let speed = 0
      if (prevTime > 0) {
        const dt = (now - prevTime) / 1000
        if (dt > 0) speed = Math.round((p.received - prevBytes) / dt)
      }
      prevBytes = p.received
      prevTime = now
      send({ status: 'rollback-downloading', percent: p.percent, version: oldVer, speed })
    })

    log('回滚包下载完成，启动安装')
    send({ status: 'rollback-downloaded', version: oldVer })
    clearUpgradeState()
    runInstaller(destPath)
    return { success: true, filePath: destPath }
  } catch (e) {
    log('回滚下载失败: ' + e.message)
    send({ status: 'error', message: '回滚下载失败: ' + e.message })
    return { success: false, msg: e.message }
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

// ── 导出: 下载更新（支持断点续传）──
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

  const destDir = getUpdateDir()
  const exeName = `crystal-price-system-setup-${release.version}.exe`
  const destPath = join(destDir, exeName)

  // 检查是否存在未完成的下载（断点续传）
  let resumeBytes = 0
  const prevState = loadDownloadState()
  if (prevState && prevState.version === release.version && prevState.url === release.downloadUrl) {
    try {
      if (existsSync(destPath)) {
        const stats = statSync(destPath)
        if (stats.size > 0 && (!prevState.totalBytes || stats.size < prevState.totalBytes)) {
          resumeBytes = stats.size
          log(`发现未完成下载: ${(stats.size / 1024 / 1024).toFixed(1)}MB, 尝试续传`)
        } else if (stats.size > 0 && prevState.totalBytes && stats.size >= prevState.totalBytes) {
          // 文件已完整，直接校验
          log('文件似乎已完整，跳过下载')
          _downloadStarted = false
          return await verifyAndFinish(destPath, release, destDir)
        }
      }
    } catch (e) {
      log('检查下载状态失败: ' + e.message)
    }
  } else if (prevState) {
    // 版本或 URL 变了，清理旧文件
    log('下载状态版本不匹配，清理旧文件')
    clearDownloadState()
    try { if (existsSync(destPath)) unlinkSync(destPath) } catch {}
  }

  log(`下载${resumeBytes > 0 ? '续传' : '开始'}: ${destPath}`)

  // 先发 downloading 状态，让前端立即显示进度条（不等到 SHA512 取完）
  send({
    status: 'downloading',
    percent: resumeBytes > 0 && release.size ? Math.round(resumeBytes / release.size * 100) : 0,
    version: release.version
  })

  // 并行获取 SHA512（从 latest.yml）
  let sha512 = null
  const shaPromise = release.latestYmlUrl
    ? fetchText(release.latestYmlUrl).then(yml => { sha512 = parseSha512(yml); log(`SHA512: ${sha512 ? '已获取' : '未找到'}`) }).catch(e => log('获取 SHA512 失败（跳过）: ' + e.message))
    : Promise.resolve()

  // 保存下载状态（如果从零开始）
  if (resumeBytes === 0) {
    saveDownloadState({
      version: release.version,
      url: release.downloadUrl,
      destPath,
      totalBytes: release.size || 0,
      downloadedBytes: 0,
      timestamp: Date.now()
    })
  }

  try {
    // 等 SHA512 取完（不阻塞状态发送）
    await shaPromise
    let prevBytes = resumeBytes, prevTime = Date.now()

    await downloadFile(release.downloadUrl, destPath, (p) => {
      const now = Date.now()
      let speed = 0
      if (prevTime > 0) {
        const dt = (now - prevTime) / 1000
        if (dt > 0) speed = Math.round((p.received - prevBytes) / dt)
      }
      prevBytes = p.received
      prevTime = now

      // 保存中间状态（每 5% 或每秒存一次）
      const state = loadDownloadState() || {}
      state.downloadedBytes = p.received
      state.totalBytes = p.total
      state.timestamp = Date.now()
      saveDownloadState(state)

      send({ status: 'downloading', percent: p.percent, version: release.version, speed })
    })

    // 下载完成，清除状态
    clearDownloadState()
    _downloadStarted = false
    log('下载完成')
    send({ status: 'downloaded', version: release.version })

    // SHA512 校验（不阻塞状态反馈）
    if (sha512) {
      const ok = await verifySha512(destPath, sha512)
      if (!ok) {
        log('SHA512 校验失败，清理文件')
        try { unlinkSync(destPath) } catch {}
        send({ status: 'error', message: '文件校验失败，请重试或手动下载' })
        return { success: false, msg: '文件校验失败' }
      }
    }

    return { success: true, filePath: destPath }
  } catch (e) {
    log('下载失败: ' + e.message)
    // 不删除文件，保存状态供续传
    _downloadStarted = false
    send({ status: 'error', message: '下载失败: ' + (e.message || '未知错误') + '，下次自动续传' })
    return { success: false, msg: e.message }
  }
}

// ── 辅助: 校验并完成 ──
async function verifyAndFinish(destPath, release, destDir) {
  // 获取 SHA512
  let sha512 = null
  if (release.latestYmlUrl) {
    try {
      const yml = await fetchText(release.latestYmlUrl)
      sha512 = parseSha512(yml)
    } catch {}
  }

  if (sha512) {
    const ok = await verifySha512(destPath, sha512)
    if (!ok) {
      log('SHA512 校验失败，清理后重新下载')
      try { unlinkSync(destPath) } catch {}
      _downloadStarted = false
      send({ status: 'error', message: '文件校验失败' })
      return { success: false, msg: '文件校验失败' }
    }
  }

  send({ status: 'downloaded', version: release.version })
  return { success: true, filePath: destPath }
}

// ── 导出: 安装更新 ──
export async function installUpdate() {
  log('installUpdate 被调用')
  const release = _latestRelease
  if (!release || !release.version) {
    log('没有已下载的更新包')
    return { success: false, msg: '没有已下载的更新包' }
  }

  const destDir = getUpdateDir()
  const exeName = `crystal-price-system-setup-${release.version}.exe`
  const exePath = join(destDir, exeName)

  if (!existsSync(exePath)) {
    log('安装文件不存在: ' + exePath)
    send({ status: 'error', message: '安装文件不存在，请重新下载' })
    return { success: false, msg: '安装文件不存在' }
  }

  // 保存升级状态（用于回滚）
  const currentVer = app.getVersion()
  if (currentVer !== release.version) {
    saveUpgradeState({
      oldVersion: currentVer,
      newVersion: release.version,
      timestamp: Date.now(),
      healthy: false
    })
    log('升级状态已记录: ' + currentVer + ' → ' + release.version)
  }

  // 不自动安装（便携版/system 权限问题），打开目录让用户双击
  log('打开下载目录，让用户手动安装: ' + destDir)
  send({ status: 'downloaded', message: '安装包已下载，请关闭应用后双击安装' })
  try {
    const { execFile } = await import('child_process')
    execFile('explorer', [destDir])
  } catch {}
  return { success: true, msg: '请手动安装', filePath: exePath }
}

// ── 全局暴露，供 Express 路由调用 ──
global.__checkForUpdates = checkForUpdates
global.__downloadUpdate = downloadUpdate
global.__downloadProgress = { status: 'idle', percent: 0, version: '', speed: 0 }

// 下载进度回调里更新全局状态
const _origSend = send
send = function(data) {
  if (data.status === 'downloading' || data.status === 'downloaded' || data.status === 'error') {
    global.__downloadProgress = { ...global.__downloadProgress, ...data }
  }
  if (data.status === 'downloading') {
    global.__downloadProgress.status = 'downloading'
  }
  return _origSend(data)
}

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

  ipcMain.handle('get-upgrade-state', () => {
    return getUpgradeState()
  })

  ipcMain.handle('rollback-update', async () => {
    return await rollbackToOldVersion()
  })
}
