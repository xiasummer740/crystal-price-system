// 自动在线升级（微信式：后台静默下载，不打断；关软件时自动装上）
//
// 版本检查：直接调 GitHub API（比 electron-updater 快，国内网络友好）
// 下载安装：先用 autoUpdater 尝试下载，失败则直连 GitHub 用 https 下载
//
// autoDownload: false — 库自己的自动下载关掉，改由我们在检测到新版本后触发
//   （这样下载时机、静默与否、去重都由我们说了算）
// autoInstallOnAppQuit: 库里这个开关**在本应用里不生效** —— 它挂在 `app.onQuit` 上，
//   而 main.js 的 before-quit 是 preventDefault + process.exit(0) 强杀的，'quit' 事件
//   根本不会发。所以「退出时装上」由下面的 installOnQuit() 显式负责。

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
let readyToInstall = null      // null | 'direct' | 'updater' —— 装好了、等退出时安装
let readyVersion = null        // 就绪的那个包**是哪个版本**。文件名带版本号，但标志不带 ——
                               // 用户开着软件好几天、期间又发了一版时，必须能分辨「手上这个包
                               // 是不是当前要的那个」，否则会拿旧包装上去。
let downloading = false        // 防并发：自动下载和用户手点「下载更新」可能撞上
// 用户在**本次下载进行中**又点过一次「下载更新」。前端点按钮是无条件先把界面置成
// 「正在下载」再调这里的，若在飞的那次是静默的后台下载、它失败时按约定不发事件，
// 界面就永远停在「连接中...」。记一笔，让那次下载无论如何都回报一声。
let userAskedDownload = false

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
      downloading = false
      readyToInstall = 'updater'
      readyVersion = appVersion
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

/**
 * 下载更新：先用 autoUpdater，失败则自己直连 GitHub 下载。
 *
 * @param {{ silent?: boolean }} [opts] silent=true 时失败**不通知前端** ——
 *   后台自动下载是用户没点过的事，弹个红字吓人不如安静地退回去让他手动点。
 *   日志照记，出问题时查得到。
 */
export async function downloadUpdate(opts = {}) {
  const { silent = false } = opts
  if (!autoUpdater) {
    if (!silent) mainWindow?.webContents.send('update:error', { message: '下载模块未就绪' })
    else LOG('下载模块未就绪（静默模式，不通知前端）')
    return
  }
  if (downloading) {
    LOG('已有下载在进行中，忽略本次请求')
    if (!silent) userAskedDownload = true   // 别让这次点击石沉大海，见 userAskedDownload 的说明
    return
  }
  if (readyToInstall) {
    if (readyVersion === appVersion) {
      // ⚠️ **必须回一个事件**。前端点「下载更新」时是**无条件**先把界面置成「正在下载」
      // 再调这里的（Dashboard.vue 的 onDownloadUpdate），静默 return 会让界面永远停在
      // 「连接中...」—— 本会话内再没有任何事件能救它。2026-09-28 对抗性复审实测踩到。
      LOG('安装包已就绪，无需重复下载（回报前端回到「已下载」态）')
      mainWindow?.webContents.send('update:downloaded')
      return
    }
    // 手上这个是**上一版**的包（用户开着软件几天没关，期间又发了一版）。留着它会装错版本，
    // 作废重下。磁盘上那份旧文件不删 —— 文件名带版本号，不会跟新包撞名。
    LOG(`已就绪的包是 ${readyVersion}，目标已是 ${appVersion}，作废重下`)
    readyToInstall = null
    readyVersion = null
    directDownloadPath = null
  }
  downloading = true
  userAskedDownload = !silent
  LOG(`downloadUpdate called (silent=${silent})`)

  try {
    // 1) 确保 autoUpdater 有更新信息
    if (!autoUpdater.updateInfoAndProvider) {
      LOG('updateInfoAndProvider is null, calling checkForUpdates() first')
      try {
        await autoUpdater.checkForUpdates()
      } catch (err) {
        LOG(`checkForUpdates before download failed: ${err.message}`)
        // autoUpdater 不行 → 改用直连下载
        await directDownload(silent)
        return
      }
    }

    // 2) autoUpdater 下载
    try {
      await autoUpdater.downloadUpdate()
    } catch (err) {
      LOG(`autoUpdater.downloadUpdate failed: ${err.message}`)
      // 回退到直连下载
      await directDownload(silent)
    }
  } finally {
    // 成功路径由 'update-downloaded' / directDownload 自己清（它们要置 readyToInstall），
    // 这里只在「异常逃逸、谁都没接住」时兜底复位，免得一次失败把后续下载永久锁死。
    if (!readyToInstall) downloading = false
    // 本次下载已了结，用户那声问询也随之作废 —— 留着会让下一个静默下载失败时凭空弹红字。
    userAskedDownload = false
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
async function directDownload(silent = false) {
  LOG(`directDownload called (silent=${silent})`)
  try {
    const { app } = _require('electron')
    const userDataPath = app.getPath('userData')
    const destDir = path.join(userDataPath, '__update__')
    const destFile = path.join(destDir, `crystal-price-system-setup-${appVersion}.exe`)

    // 确保目录存在
    const { mkdirSync } = _require('fs')
    if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true })

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

    // 上一轮已经下完了 → 直接用，别重下。
    // 两个理由：① 每次开机都发现同一个版本，重下等于白拉几十上百 MB；
    // ② 续传逻辑对「已经下满的文件」会发 `Range: bytes=<全长>-`，服务端回 416，
    //    被当成下载失败 —— 一个下好了的包反而永远装不上。
    // 文件名里带版本号，所以换了版本不会误命中上一版的产物。
    if (existsSync(destFile)) {
      let have = 0
      try { have = statSync(destFile).size } catch { have = 0 }
      if (assetInfo.size > 0 && have === assetInfo.size) {
        LOG(`已有完整安装包（${have} bytes），跳过下载`)
        directDownloadPath = destFile
        readyToInstall = 'direct'
        readyVersion = appVersion
        downloading = false   // 包已就绪，「正在下载中」这个状态到此结束
        mainWindow?.webContents.send('update:downloaded')
        return
      }
      LOG(`已有同名文件但大小不符（${have}/${assetInfo.size}），重新下载`)
      unlinkSync(destFile)
    }

    // 带断点续传 + 重试的下载（expectedSize 用于完整性校验）
    await downloadWithRetry(assetInfo.url, destFile, assetInfo.size)

    // 最终大小校验（防止续传误判为完成）
    const finalSize = statSync(destFile).size
    if (assetInfo.size > 0 && finalSize !== assetInfo.size) {
      throw new Error(`下载校验失败: ${finalSize}/${assetInfo.size}`)
    }

    // 下载完成
    directDownloadPath = destFile
    readyToInstall = 'direct'
    readyVersion = appVersion
    // 同上：包已就绪，别让 downloading 一直挂着 true —— 那样一旦后面派发安装失败
    // （readyToInstall 已被 quitAndInstall 消费掉），用户在本会话里就再也点不动「下载更新」了。
    downloading = false
    LOG(`download complete: ${destFile} (${finalSize} bytes)`)
    mainWindow?.webContents.send('update:downloaded')
  } catch (err) {
    LOG(`directDownload error: ${err.message}`)
    // 静默（后台自动下载）时失败不弹红字：用户压根没点过这件事，
    // 界面停在「发现新版本」让他随时能手动点是更好的落点。日志里有完整原因。
    // ⚠️ 但「本次下载进行中用户点过下载」算点过 —— 那时界面已经切到「正在下载」，
    // 再静默就把它永远晾在「连接中...」了（见 userAskedDownload 的说明）。
    if (!silent || userAskedDownload) {
      mainWindow?.webContents.send('update:error', { message: `下载失败: ${err.message}。请手动下载安装  https://github.com/xiasummer740/crystal-price-system/releases/latest` })
    }
    // 不往外抛：调用方（IPC / 后台自动下载）都不需要区分成败，
    // 抛出去只会变成一个没人接的 rejected promise。
  }
}

export function quitAndInstall() {
  if (!readyToInstall) { LOG('quitAndInstall: 没有就绪的安装包，忽略'); return }
  const kind = readyToInstall
  // 立刻消费掉。**不消费就会装两遍**：下面两条路都会再触发一次 app.quit()
  // （直连那条是我们自己调，updater 那条是库内部的 setImmediate(app.quit())），
  // 于是又进一遍 before-quit → installOnQuit() → 标志还在 → 再派一次安装程序。
  // 实测：点一次「立即重启安装」，起来的是两个安装器进程。
  readyToInstall = null
  LOG(`quitAndInstall: kind=${kind}`)
  if (kind === 'updater') {
    autoUpdater?.quitAndInstall()
    return
  }
  try {
    const { spawn } = _require('child_process')
    spawn(directDownloadPath, ['--updated'], { detached: true, stdio: 'ignore' })
    const { app } = _require('electron')
    app.quit()
  } catch (err) {
    LOG(`quitAndInstall spawn error: ${err.message}`)
  }
}

/**
 * 退出前顺手把更新装上（微信式：用户不用管，下次打开就是新版）。
 *
 * 由 main.js 的 before-quit 调用 —— **必须在那次强杀之前调**：
 * `quitAndInstall()` 内部是同步派安装程序（`BaseUpdater.install()`），
 * 提交后主进程立刻 `process.exit(0)` 不会打断已经 detach 的安装器。
 *
 * @returns {boolean} 是否已经把退出交给安装器（true 时调用方仍应正常强杀）
 */
export function installOnQuit() {
  if (!readyToInstall) return false
  const kind = readyToInstall
  // 立刻消费掉：库里那条 quitAndInstall 会再 app.quit() 一次、又进一遍 before-quit，
  // 留着标志会二次触发安装。下次启动会重新检测到（磁盘上的包还在，走「跳过下载」快路）。
  readyToInstall = null
  LOG(`退出时自动安装更新（kind=${kind}）`)
  try {
    if (kind === 'updater') {
      autoUpdater?.quitAndInstall(true, true)
      return true
    }
    const { spawn } = _require('child_process')
    spawn(directDownloadPath, ['--updated'], { detached: true, stdio: 'ignore' })
    return true
  } catch (err) {
    LOG(`installOnQuit error: ${err.message}`)
    return false
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
          // 这一版**已经下好了**：别再喊「发现新版本」—— 那会把界面从「已下载完成」
          // 打回「⬇ 下载更新」，看着像更新丢了；用户点下去还会撞上 downloadUpdate 的早退。
          if (readyToInstall && readyVersion === latestVer) {
            LOG(`v${latestVer} 的安装包已就绪，跳过 available 通知（回报「已下载」态）`)
            mainWindow?.webContents.send('update:downloaded')
            return
          }
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
          // 微信式：既然发现新版本，就直接在后台悄悄下，不等用户点。
          // 界面只多一个小红点，不弹窗、不挡操作；下完变成「重启即装」。
          // 失败保持静默（用户没点过），界面停在「发现新版本」，他随时能手动点。
          downloadUpdate({ silent: true }).catch(err => {
            LOG(`后台自动下载异常: ${err.message}`)
          })
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
