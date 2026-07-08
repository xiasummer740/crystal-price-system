import { app, BrowserWindow, shell, dialog, Menu, Notification, ipcMain } from 'electron'
import path from 'path'
import fs from 'fs'
import http from 'http'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'
import { loadUserConfig, saveUserConfig, loadFullConfig, saveFullConfig } from './config.js'
import { initUpdater, downloadUpdate, quitAndInstall, checkForUpdates } from './updater.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BASE_PORT = 3266

// 强制禁用 GPU 硬件加速（解决此 Windows 预览版 GPU 崩溃问题）
app.disableHardwareAcceleration()

// 清理端口占用
function freePort(port) {
  try {
    const out = execSync(`cmd /c "netstat -ano | findstr :${port}"`, { encoding: 'utf8', timeout: 5000 })
    if (!out.trim()) return
    const pids = new Set()
    for (const line of out.trim().split('\n')) {
      const parts = line.trim().split(/\s+/)
      const pid = parts[parts.length - 1]
      if (pid && /^\d+$/.test(pid)) pids.add(pid)
    }
    for (const pid of pids) {
      try { execSync(`cmd /c "taskkill /F /PID ${pid}"`, { timeout: 5000 }) } catch {}
    }
    log(`freePort done, killed ${pids.size} process(es)`)
  } catch (e) {
    log(`freePort error: ${e.message}`)
  }
}

// 复制目录（递归，目标已存在的文件跳过不覆盖）
function copyDirRecursive(src, dst) {
  if (!fs.existsSync(dst)) fs.mkdirSync(dst, { recursive: true })
  for (const entry of fs.readdirSync(src)) {
    const sp = path.join(src, entry)
    const dp = path.join(dst, entry)
    const stat = fs.statSync(sp)
    if (stat.isDirectory()) {
      copyDirRecursive(sp, dp)
    } else if (!fs.existsSync(dp)) {
      fs.copyFileSync(sp, dp)
    }
  }
}
// 覆盖模式复制（用于从便携版迁移数据，保证数据不丢失）
function copyDirRecursiveOverwrite(src, dst) {
  if (!fs.existsSync(dst)) fs.mkdirSync(dst, { recursive: true })
  for (const entry of fs.readdirSync(src)) {
    const sp = path.join(src, entry)
    const dp = path.join(dst, entry)
    const stat = fs.statSync(sp)
    if (stat.isDirectory()) {
      copyDirRecursiveOverwrite(sp, dp)
    } else {
      fs.copyFileSync(sp, dp)
    }
  }
}

// 用户主动切换数据目录：弹选择器 → 落盘 → 拷贝 → 写新配置 → 提示重启
async function switchDataDir() {
  const current = process.env.DATA_DIR
  if (!current) {
    dialog.showErrorBox('切换失败', '当前数据目录未初始化，无法切换')
    return
  }
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: '选择新的数据保存位置',
    message: `当前位置：${current}\n\n请选择一个新位置（建议放在 D 盘或 E 盘以避免 C 盘占用）`,
    defaultPath: path.dirname(current),
    properties: ['openDirectory', 'createDirectory']
  })
  if (canceled || !filePaths?.[0]) return
  const target = path.join(filePaths[0], '晶振报价管理系统')
  if (path.resolve(target) === path.resolve(current)) {
    dialog.showMessageBox({ type: 'info', title: '位置未变', message: '所选位置与当前位置相同，无需切换' })
    return
  }
  // 写权限测试
  try {
    if (!fs.existsSync(target)) fs.mkdirSync(target, { recursive: true })
    const probe = path.join(target, '.write-test')
    fs.writeFileSync(probe, '')
    fs.unlinkSync(probe)
  } catch (e) {
    dialog.showErrorBox('权限不足', `所选目录无写入权限：${target}\n\n${e.message}`)
    return
  }
  // 二次确认
  const confirm = await dialog.showMessageBox({
    type: 'question',
    buttons: ['取消', '迁移并重启'],
    defaultId: 1,
    cancelId: 0,
    title: '确认切换数据目录',
    message: `即将把数据从${current}迁移到${target}\n\n迁移完成后应用将自动重启以加载新位置。继续吗？`
  })
  if (confirm.response !== 1) return
  // 先落盘
  try {
    if (doFlushBackupPending) doFlushBackupPending()
    if (dbSaveNow) dbSaveNow()
    log(`switchDataDir: 落盘完成，开始拷贝 ${current} → ${target}`)
    copyDirRecursive(current, target)
    fs.writeFileSync(path.join(current, 'MIGRATED.txt'),
      `已于 ${new Date().toISOString()} 迁移到 ${target}\n（此目录可安全删除）`, 'utf8')
    saveUserConfig(target)
    log(`switchDataDir: 迁移完成，重启应用`)
    app.relaunch()
    app.exit(0)
  } catch (e) {
    log(`switchDataDir 失败: ${e.stack || e.message}`)
    dialog.showErrorBox('迁移失败', `数据迁移过程中出错：\n\n${e.message}\n\n旧位置数据未被破坏，请检查日志后重试`)
  }
}

// 检测路径下是否存在有效的数据库文件
function hasDb(dir) {
  return fs.existsSync(path.join(dir, '数据库', 'data.db')) ||
         fs.existsSync(path.join(dir, 'data.db'))
}

// 读 NSIS 安装时写入的 data-dir.txt (UTF-16 LE + BOM)
function readDataDirTxt() {
  const txtPath = path.join(app.getPath('appData'), 'crystal-price-system', 'data-dir.txt')
  if (!fs.existsSync(txtPath)) return null
  try {
    const buf = fs.readFileSync(txtPath)
    let str
    if (buf.length >= 2 && buf[0] === 0xFF && buf[1] === 0xFE) {
      str = buf.slice(2).toString('utf16le')
    } else if (buf.length >= 2 && buf[1] === 0x00) {
      str = buf.toString('utf16le')
    } else {
      str = buf.toString('utf8')
    }
    const clean = str.replace(/[\r\n\0]+$/g, '').trim()
    // 合法性校验：必须以盘符开头 (X:\... 或 \\...)，避免历史乱码文件污染
    if (!clean || clean.length < 3) return null
    if (!/^[A-Za-z]:[\\\/]/.test(clean) && !/^\\\\/.test(clean)) {
      log(`data-dir.txt 内容不像合法路径，忽略: "${clean.slice(0, 40)}"`)
      try { fs.unlinkSync(txtPath) } catch {}
      return null
    }
    return clean
  } catch (e) {
    log(`读 data-dir.txt 失败: ${e.message}`)
    return null
  }
}

// 解析数据目录：优先配置 → NSIS 写的 data-dir.txt → 自动迁移 legacy → 弹选择器
async function resolveDataDir() {
  // 1. 读已保存的用户配置（用户用菜单切换过）
  const cfg = loadUserConfig()
  if (cfg?.dataDir && fs.existsSync(cfg.dataDir)) {
    log(`resolveDataDir: 使用配置目录 ${cfg.dataDir}`)
    return cfg.dataDir
  }

  // 1.5 读 NSIS 安装时写入的 data-dir.txt
  const fromInstaller = readDataDirTxt()
  if (fromInstaller) {
    log(`resolveDataDir: 使用安装时选择的目录 ${fromInstaller}`)
    if (!fs.existsSync(fromInstaller)) fs.mkdirSync(fromInstaller, { recursive: true })
    saveUserConfig(fromInstaller)
    return fromInstaller
  }

  // 2. 探测 legacy 路径（升级后丢失数据时扩大搜索范围）
  const exeDir = process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(app.getPath('exe'))
  const legacyDirs = [
    path.join(exeDir, '晶振报价管理系统'),                    // 便携版 exe 同目录
    path.join(app.getPath('documents'), '晶振报价管理系统'),   // 我的文档
    path.join(app.getPath('desktop'), '晶振报价管理系统'),     // 桌面（便携版常见位置）
    path.join(app.getPath('home'), 'Downloads', '晶振报价管理系统'), // 下载文件夹
    path.join(app.getPath('userData'), 'data'),
    path.join(process.env.LOCALAPPDATA || '', 'crystal-price-system', 'data')
  ]
  let found = legacyDirs.find(d => fs.existsSync(d) && hasDb(d))

  if (found) {
    const target = path.join(app.getPath('documents'), '晶振报价管理系统')
    if (found !== target) {
      log(`resolveDataDir: 迁移 ${found} → ${target}`)
      try {
        copyDirRecursiveOverwrite(found, target) // 覆盖模式，保证数据不丢失
        // 在旧位置写迁移标记
        fs.writeFileSync(
          path.join(found, 'MIGRATED.txt'),
          `已于 ${new Date().toISOString()} 迁移到 ${target}\n（此目录可安全删除）`,
          'utf8'
        )
      } catch (e) {
        log(`迁移失败：${e.message}，仍使用原位置`)
        saveUserConfig(found)
        return found
      }
    }
    saveUserConfig(target)
    return target
  }

  // 3. 弹选择器
  const def = path.join(app.getPath('documents'), '晶振报价管理系统')
  log('resolveDataDir: 全新用户，弹选择器')
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: '请选择数据保存位置',
    message: '请选择晶振报价管理系统的数据保存位置（推荐 D 盘或 E 盘以避免占用 C 盘）',
    defaultPath: def,
    properties: ['openDirectory', 'createDirectory']
  })
  const chosen = (canceled || !filePaths?.[0]) ? def : filePaths[0]
  if (!fs.existsSync(chosen)) fs.mkdirSync(chosen, { recursive: true })

  // 写权限测试
  try {
    const probe = path.join(chosen, '.write-test')
    fs.writeFileSync(probe, '')
    fs.unlinkSync(probe)
  } catch (e) {
    log(`目录无写权限：${chosen}，尝试回退 ${def}`)
    if (!fs.existsSync(def)) fs.mkdirSync(def, { recursive: true })
    try {
      const probe = path.join(def, '.write-test')
      fs.writeFileSync(probe, ''); fs.unlinkSync(probe)
    } catch (e) {
      log(`回退目录也无写权限：${def}`)
      dialog.showErrorBox('权限不足', `选定的目录和默认位置均无写入权限，应用将无法正常运行。\n\n选定: ${chosen}\n默认: ${def}\n\n请以管理员身份运行或更换安装位置后重试。`)
    }
    saveUserConfig(def)
    return def
  }

  saveUserConfig(chosen)
  return chosen
}

let mainWindow = null
let serverPort = BASE_PORT
let dbSaveNow = null
let doFlushBackupPending = null
let reminderInterval = null

// 启动日志（两阶段: DATA_DIR 未就绪时写 startup.log，就绪后写 DATA_DIR/logs/）
let _logToDir = null
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`
  // 写入 DATA_DIR/logs/startup.log（如果已就绪）
  if (_logToDir) {
    try { fs.appendFileSync(path.join(_logToDir, 'startup.log'), line, 'utf8') } catch {}
  }
  // 兜底写入 documents/startup.log
  const fallback = path.join(app.getPath('documents'), 'startup.log')
  try { fs.appendFileSync(fallback, line) } catch {}
}

// DATA_DIR 就绪后调用：切换到 logs 目录
function switchLogTo(dir) {
  const logDir = path.join(dir, 'logs')
  try {
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true })
    _logToDir = logDir
    log('日志目录已切换: ' + logDir)
  } catch (e) {
    log('日志目录切换失败: ' + e.message)
  }
}

log('=== App starting ===')
log(`__dirname: ${__dirname}`)
log(`app.isPackaged: ${app.isPackaged}`)

// 防止重复启动
const gotLock = app.requestSingleInstanceLock()
log(`requestSingleInstanceLock: ${gotLock}`)

if (!gotLock) {
  // 已有实例在运行，直接退出
  app.quit()
  process.exit(0)
}

// 第二实例启动时，激活已有窗口
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
})

async function startServer() {
  // 数据目录：用户配置 → legacy 探测+迁移 → 弹选择器
  const dataDir = await resolveDataDir()
  log(`dataDir: ${dataDir}`)
  const subdirs = ['数据库', '规格书', '模板', '备份', 'Excel备份', '记事图片库']
  for (const sd of subdirs) {
    const p = path.join(dataDir, sd)
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true })
  }
  process.env.DATA_DIR = dataDir
  switchLogTo(dataDir)
  log(`DATA_DIR: ${dataDir}`)

  log('Starting server import...')
  let expressApp
  try {
    const mod = await import('../server/src/index.js')
    expressApp = mod.default
    const { saveNow } = await import('../server/src/db.js')
    const { flushPending } = await import('../server/src/utils/excelBackup.js')
    dbSaveNow = saveNow
    doFlushBackupPending = flushPending
  } catch (e) {
    log(`Server import failed: ${e.stack || e.message}`)
    throw new Error('服务模块加载失败: ' + e.message)
  }
  log('Server module imported')

  let retryCount = 0
  const MAX_RETRIES = 30
  return new Promise((resolve, reject) => {
    const tryListen = (port) => {
      log(`Trying port ${port}... (attempt ${retryCount + 1}/${MAX_RETRIES})`)
      const server = expressApp.listen(port, () => {
        log(`Server started on port ${port}`)
        resolve({ server, port })
      })
      server.on('error', (err) => {
        log(`Port ${port} error: ${err.code} - ${err.message}`)
        server.close()
        retryCount++
        if (retryCount >= MAX_RETRIES) {
          log('Max retries reached, giving up')
          reject(new Error('端口无法绑定，达到最大重试次数'))
          return
        }
        if (err.code === 'EADDRINUSE' && port - BASE_PORT < 20) {
          setTimeout(() => tryListen(port + 1), 500)
        } else {
          log('Port conflict, retrying BASE_PORT in 2s...')
          setTimeout(() => tryListen(BASE_PORT), 2000)
        }
      })
    }
    tryListen(BASE_PORT)
  })
}

function createWindow(port) {
  log(`Creating window, loading port ${port}`)
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: '晶振报价管理系统 v' + app.getVersion(),
    icon: path.join(__dirname, '..', 'client', 'dist', 'SJK-256.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, 'preload.cjs')
    }
  })

  // 清除所有缓存和 Service Worker，确保加载最新版本
  const ses = mainWindow.webContents.session
  Promise.all([
    ses.clearCache(),
    ses.clearStorageData({ storages: ['serviceworkers', 'cachestorage', 'localstorage', 'indexdb', 'shadercache'] })
  ]).then(() => {
    log('Cache cleared')
  }).catch(e => {
    log('Cache clear error: ' + e.message)
  })

  mainWindow.setMenuBarVisibility(false)
  mainWindow.once('ready-to-show', () => {
    log('Window ready to show')
    mainWindow.show()
  })

  mainWindow.webContents.on('did-fail-load', (_, code, desc) => {
    log(`Page load failed: ${code} - ${desc}`)
  })
  mainWindow.webContents.on('did-navigate', (_, url) => {
    log(`Navigated to: ${url}`)
  })
  mainWindow.webContents.on('will-navigate', (_, url) => {
    log(`Will navigate to: ${url}`)
  })

  mainWindow.webContents.on('did-finish-load', () => {
    log('Page loaded successfully')
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // 地图地址窗口（优先匹配，避免 standalone=1 被记事拦截）
    if (url.includes('/#/map-addresses')) {
      openMapWindow(serverPort)
      return { action: 'deny' }
    }
    // 拦截记事浮窗请求，创建桌面窗口
    if (url.includes('/#/notes') && url.includes('?standalone=1')) {
      openNotesWindow(serverPort)
      return { action: 'deny' }
    }
    // 仅允许 http/https 外部链接通过系统浏览器打开
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  const url = `http://localhost:${port}?v=${app.getVersion()}&packaged=${app.isPackaged}`
  log(`Loading URL: ${url}`)
  mainWindow.loadURL(url)
}

// 启动动画闪屏
function showSplash() {
  const splash = new BrowserWindow({
    width: 420,
    height: 340,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    center: true
  })
  const logoPath = path.join(__dirname, '..', 'client', 'dist', 'SJK-256.png')
  // 打包后用 base64 内嵌（asar 内 file:// 不可访问）
  let logoSrc = ''
  try { logoSrc = 'data:image/png;base64,' + fs.readFileSync(logoPath).toString('base64') } catch { logoSrc = '' }
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    *{margin:0;padding:0}body{display:flex;align-items:center;justify-content:center;height:100vh;background:transparent;font-family:'Microsoft YaHei',sans-serif}
    .wrap{text-align:center}
    .card{background:linear-gradient(135deg,#1a1a2e,#16213e);border-radius:24px;padding:40px 48px;box-shadow:0 16px 48px rgba(0,0,0,.5);animation:fadeIn .8s cubic-bezier(.4,0,.2,1)}
    img{width:96px;height:96px;border-radius:20px;box-shadow:0 6px 24px rgba(0,0,0,.3);margin-bottom:18px;animation:logoIn 1s cubic-bezier(.4,0,.2,1)}
    h2{color:#e8e8e8;font-size:18px;font-weight:500;letter-spacing:3px;margin-bottom:14px;animation:textIn 1s cubic-bezier(.4,0,.2,1) .2s both}
    .bar{width:180px;height:3px;background:rgba(255,255,255,.08);border-radius:2px;margin:0 auto;overflow:hidden;animation:barIn 1s ease .4s both}
    .bar-inner{width:40%;height:100%;background:#4fc3f7;border-radius:2px;animation:load 1.8s ease .6s infinite}
    @keyframes fadeIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
    @keyframes logoIn{0%{opacity:0;transform:scale(.8)}50%{opacity:1;transform:scale(1.05)}100%{opacity:1;transform:scale(1)}}
    @keyframes textIn{from{opacity:0;letter-spacing:8px}to{opacity:1;letter-spacing:3px}}
    @keyframes barIn{from{opacity:0;width:0}to{opacity:1;width:180px}}
    @keyframes load{0%{width:0;margin-left:0}40%{width:70%;margin-left:15%}70%{width:30%;margin-left:60%}100%{width:0;margin-left:100%}}
  </style></head><body><div class="wrap"><div class="card">
    <img src="${logoSrc}">
    <h2>晶振报价管理系统</h2>
    <div class="bar"><div class="bar-inner"></div></div>
  </div></div></body></html>`
  splash.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  return splash
}

// 记事便签独立浮窗
let notesWindow = null
let _notesSaveTimer = null
function saveNotesBounds() {
  if (!notesWindow || notesWindow.isDestroyed()) return
  try {
    const bounds = notesWindow.getBounds()
    const cfg = loadFullConfig()
    saveFullConfig({ notesWindow: { ...cfg.notesWindow, ...bounds } })
  } catch (e) { log('saveNotesBounds error: ' + e.message) }
}
function openNotesWindow(port) {
  if (notesWindow && !notesWindow.isDestroyed()) { notesWindow.focus(); return }
  const cfg = loadFullConfig()
  const saved = cfg?.notesWindow || {}
  const mainPos = mainWindow?.getBounds()
  notesWindow = new BrowserWindow({
    width: saved.width || 860,
    height: saved.height || 640,
    minWidth: 480, minHeight: 400,
    x: saved.x ?? (mainPos ? mainPos.x + 60 : undefined),
    y: saved.y ?? (mainPos ? mainPos.y + 60 : undefined),
    title: '记事便签',
    frame: true,
    icon: path.join(__dirname, '..', 'client', 'dist', 'SJK-256.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, 'preload.cjs')
    }
  })
  notesWindow.setMenuBarVisibility(false)
  // 监听大小/位置变化 → 节流保存
  const debounceSave = () => {
    if (_notesSaveTimer) clearTimeout(_notesSaveTimer)
    _notesSaveTimer = setTimeout(saveNotesBounds, 500)
  }
  notesWindow.on('resize', debounceSave)
  notesWindow.on('move', debounceSave)
  const url = `http://localhost:${port}/#/notes?standalone=1&v=${app.getVersion()}&packaged=${app.isPackaged}`
  notesWindow.loadURL(url)
  notesWindow.on('closed', () => {
    notesWindow = null
    if (_notesSaveTimer) { clearTimeout(_notesSaveTimer); _notesSaveTimer = null }
  })
}

// IPC：渲染进程请求打开/关闭记事窗口
ipcMain.handle('open-notes-window', () => {
  openNotesWindow(serverPort)
})
ipcMain.handle('close-notes-window', () => {
  if (notesWindow && !notesWindow.isDestroyed()) {
    notesWindow.close()
  }
})
// 记事提醒轮询（每60秒检查到期提醒）
function startReminderPolling(port) {
  const checkReminders = () => {
    http.get(`http://localhost:${port}/api/notes/reminders`, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          const result = JSON.parse(data)
          if (result.code !== 0 || !result.data?.length) return
          for (const note of result.data) {
            // 弹出系统通知
            const notif = new Notification({
              title: '⏰ 记事提醒：' + (note.title || '未命名'),
              body: (note.customer ? '客户: ' + note.customer + '\n' : '') + (note.content ? note.content.slice(0, 100) : '暂无内容'),
              silent: false,
              icon: path.join(__dirname, '..', 'client', 'dist', 'SJK-256.png')
            })
            notif.show()
            notif.on('click', () => {
              if (mainWindow) {
                if (mainWindow.isMinimized()) mainWindow.restore()
                mainWindow.focus()
                mainWindow.webContents.executeJavaScript(
                  `window.location.hash = '#/notes/${Number(note.id)}'`
                )
              }
            })
            // 标记已提醒
            const req = http.request(`http://localhost:${port}/api/notes/${note.id}/reminded`, { method: 'POST' })
            req.on('error', (e) => log('Reminded POST error: ' + e.message))
            req.end()
          }
        } catch (e) { log('Reminder poll error: ' + e.message) }
      })
    }).on('error', (e) => { log('Reminder poll HTTP error: ' + e.message) })
  }
  // 首次延迟 10 秒等应用启动完成，之后每 60 秒
  setTimeout(() => {
    checkReminders()
    reminderInterval = setInterval(checkReminders, 60000)
  }, 10000)
  log('Reminder polling started (interval: 60s)')
}

// ====== 地图地址独立窗口 ======
let mapWindow = null
let _mapSaveTimer = null
function saveMapBounds() {
  if (!mapWindow || mapWindow.isDestroyed()) return
  try {
    const bounds = mapWindow.getBounds()
    const cfg = loadFullConfig()
    saveFullConfig({ mapWindow: { ...cfg.mapWindow, ...bounds } })
  } catch (e) { log('saveMapBounds error: ' + e.message) }
}
function openMapWindow(port) {
  if (mapWindow && !mapWindow.isDestroyed()) { mapWindow.focus(); return }
  const cfg = loadFullConfig()
  const saved = cfg?.mapWindow || {}
  const mainPos = mainWindow?.getBounds()
  mapWindow = new BrowserWindow({
    width: saved.width || 1100,
    height: saved.height || 720,
    minWidth: 800, minHeight: 500,
    x: saved.x ?? (mainPos ? mainPos.x + 40 : undefined),
    y: saved.y ?? (mainPos ? mainPos.y + 40 : undefined),
    title: '🗺️ 地图地址',
    frame: true,
    icon: path.join(__dirname, '..', 'client', 'dist', 'SJK-256.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, 'preload.cjs')
    }
  })
  mapWindow.setMenuBarVisibility(false)
  const debounceSave = () => {
    if (_mapSaveTimer) clearTimeout(_mapSaveTimer)
    _mapSaveTimer = setTimeout(saveMapBounds, 500)
  }
  mapWindow.on('resize', debounceSave)
  mapWindow.on('move', debounceSave)
  const url = `http://localhost:${port}/#/map-addresses?standalone=1&v=${app.getVersion()}&packaged=${app.isPackaged}`
  mapWindow.loadURL(url)
  mapWindow.on('closed', () => {
    mapWindow = null
    if (_mapSaveTimer) { clearTimeout(_mapSaveTimer); _mapSaveTimer = null }
  })
}

// IPC：渲染进程请求打开地图窗口
ipcMain.handle('open-map-window', () => {
  openMapWindow(serverPort)
})

// 浏览器打开外部链接（供渲染进程调用）
ipcMain.handle('open-external', (_, url) => { shell.openExternal(url) })

// === 自动更新 IPC（与 xnowpost 一致） ===
ipcMain.handle('update:check', () => { checkForUpdates(); return true })
ipcMain.handle('update:download', () => { downloadUpdate() })
ipcMain.handle('update:install', () => {
  // 升级前保存当前数据目录路径，确保新版本能找到旧数据
  if (process.env.DATA_DIR) saveUserConfig(process.env.DATA_DIR)
  quitAndInstall()
})
ipcMain.handle('update:diagnose', () => {
  try {
    const pkg = require('electron-updater/package.json')
    return { loaded: true, version: pkg.version, appVersion: app.getVersion() }
  } catch {
    return { loaded: false, error: 'electron-updater module not found' }
  }
})

app.whenReady().then(async () => {
  log('App ready')
  const splash = showSplash()
  try {
    // tryListen 自动处理 EADDRINUSE，不预先强杀旧进程以防打断退出保存
    const { port } = await startServer()
    serverPort = port
    const menu = Menu.buildFromTemplate([
      { label: '文件', submenu: [
        { label: '打开数据文件夹', click: () => shell.openPath(process.env.DATA_DIR) },
        { label: '切换数据目录...', click: () => switchDataDir() },
        { type: 'separator' },
        { role: 'quit', label: '退出' }
      ]},
      { label: '帮助', submenu: [
        { label: '检查更新', click: () => { if (mainWindow) { mainWindow.webContents.executeJavaScript('window.__checkUpdate?.()') } } },
        { type: 'separator' },
        { label: '关于', click: () => dialog.showMessageBox({ type: 'info', title: '关于', message: '晶振报价管理系统 v' + app.getVersion(), detail: '晶振公司内部报价管理与查询系统' }) }
      ]}
    ])
    Menu.setApplicationMenu(menu)
    createWindow(port)
    // 窗口就绪后关闪屏
    mainWindow.once('ready-to-show', () => {
      setTimeout(() => { splash.close() }, 400)
    })
    // 初始化升级（必须在 ready-to-show 外，和 xnowpost 一致）
    initUpdater(mainWindow)
    // 启动记事提醒轮询
    startReminderPolling(port)
  } catch (e) {
    log(`FATAL ERROR: ${e.stack || e.message}`)
    // EADDRINUSE: 自动杀掉旧进程后重试
    if (e.message && e.message.includes('EADDRINUSE')) {
      log('EADDRINUSE detected, killing old process and retrying...')
      freePort(BASE_PORT)
      setTimeout(async () => {
        try {
          const { port } = await startServer()
          serverPort = port
          createWindow(port)
          mainWindow.once('ready-to-show', () => {
            splash.close()
          })
          initUpdater(mainWindow)
        } catch (e2) {
          splash.close()
          dialog.showErrorBox('启动失败', '端口被占用，请关闭所有晶振报价系统窗口后重试')
          app.quit()
        }
      }, 2000)
      return
    }
    splash.close()
    dialog.showErrorBox('启动失败', e.message)
    app.quit()
  }
})

// 关闭前保存数据库 + 强制退出（安装器需要进程立即消失，不能等事件循环）
app.on('before-quit', (e) => {
  try {
    if (reminderInterval) { clearInterval(reminderInterval); reminderInterval = null }
    if (dbSaveNow) {
      if (doFlushBackupPending) {
        try { doFlushBackupPending() } catch (e) { log('flushPending error: ' + e.message) }
      }
      dbSaveNow()
    }
    log('before-quit: 数据库已保存')
  } catch (e) {
    log('before-quit error: ' + (e.stack || e.message))
  }
  // 取消默认退出序列，用 setImmediate + process.exit 直接强杀
  // （不依赖事件循环，NSIS 安装器等不了窗口渐变动画）
  e.preventDefault()
  setImmediate(() => { process.exit(0) })
})

app.on('window-all-closed', () => {
  log('All windows closed, quitting')
  app.quit()
})
