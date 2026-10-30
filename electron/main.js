import { app, BrowserWindow, shell, dialog, Menu, Notification, ipcMain, screen, nativeImage, clipboard } from 'electron'
import path from 'path'
import fs from 'fs'
import http from 'http'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'
import { loadUserConfig, saveUserConfig, loadFullConfig, saveFullConfig, setEphemeralConfig } from './config.js'
import { computeSplashPosition } from './splashPosition.js'
import { initUpdater, downloadUpdate, quitAndInstall, checkForUpdates, installOnQuit } from './updater.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BASE_PORT = 3266
// 闪屏兜底超时：正常就绪是一两秒的事。超过这么久还没就绪 = 出事了，
// 宁可收掉动画让用户看到窗口（或至少能正常关闭），也别让人对着转圈干瞪眼。
//
// 为什么是 45 秒（v1.0.232 从 90 秒降下来）：
//   · 历史冷启动基线 26.6 秒（2026-09-27 沙箱实测，文件缓存全冷），45 秒仍有 1.7 倍余量；
//   · 2026-10-20 祥哥机器上真实发生了一次 141 秒启动（2 核赛扬 + 火绒/GameViewer/微信
//     把 CPU 占满），90 秒兜底等于让人对着动画干等 90 秒 —— 现在闪屏上有「直接进入」按钮，
//     所以把兜底压到 45 秒：到点就把主窗口亮出来，别再让动画挡着。
const SPLASH_TIMEOUT_MS = 45000

// 进程启动时刻。只用来在日志里标「这一趟启动到底花了多久」——
// 2026-10-14 排查「偶尔卡在启动动画」时，靠它把 196 次启动的耗时拉出来对比：
// 常态 4~20 秒，但 17 次超过 30 秒、最慢一次 164 秒（见下文 did-finish-load 那条日志）。
const APP_START_TS = Date.now()
const sinceStart = () => `${Date.now() - APP_START_TS}ms`

// ===== 启动阶段标点（v1.0.232）=====
// 只记「时刻」，摘要时再算差值。任何新阶段要诊断，加一行 mark('xxx') 即可。
const startupMarks = { processStart: APP_START_TS }
function mark(name) { startupMarks[name] = Date.now() }
function fmtMs(ms) {
  if (ms == null || !Number.isFinite(ms)) return '—'
  return ms >= 1000 ? (ms / 1000).toFixed(1) + 's' : Math.round(ms) + 'ms'
}
// 服务模块（server/src/index.js）导出的内部阶段计时 + 延后维护入口
let getServerStartupPhases = null
let runDeferredMaintenanceFn = null
let _startupSummaryDone = false

/** 阶段摘要追加到 logs/startup-phases.jsonl（一行一次启动，方便前后对比） */
function appendStartupPhases(payload) {
  if (!_logToDir) return
  try {
    fs.appendFileSync(path.join(_logToDir, 'startup-phases.jsonl'), JSON.stringify(payload) + '\n', 'utf8')
  } catch (e) {
    log('[startup] 阶段日志写入失败: ' + e.message)
  }
}

/**
 * 把这一趟启动的耗时按阶段打进日志（v1.0.232）。
 * 下次祥哥问「为什么慢」，看 `[startup]` 那两行就知道卡在哪一段，不用再靠猜。
 */
function logStartupSummary(reason, complete = true) {
  if (complete) {
    if (_startupSummaryDone) return
    _startupSummaryDone = true
  }
  const m = startupMarks
  const seg = (a, b) => (m[a] != null && m[b] != null) ? Math.max(0, m[b] - m[a]) : null
  const total = seg('processStart', 'pageLoaded') ?? (Date.now() - APP_START_TS)
  const segments = {
    electron_init: seg('processStart', 'appReady'),
    data_dir: seg('appReady', 'dataDir'),
    server_module: seg('dataDir', 'serverImported'),
    http_listen: seg('serverImported', 'serverListening'),
    window_create: seg('serverListening', 'windowCreated'),
    first_page: seg('windowCreated', 'pageLoaded'),
    splash_closed_at: m.splashClosed ? m.splashClosed - APP_START_TS : null
  }
  let server = {}
  try { server = getServerStartupPhases?.() || {} } catch { /* 计时读不到不影响启动 */ }
  const line = `[startup] ${reason} | 总计 ${fmtMs(total)}`
    + ` | Electron初始化 ${fmtMs(segments.electron_init)}`
    + ` | 数据目录 ${fmtMs(segments.data_dir)}`
    + ` | 服务模块 ${fmtMs(segments.server_module)}`
    + ` | 监听 ${fmtMs(segments.http_listen)}`
    + ` | 建窗 ${fmtMs(segments.window_create)}`
    + ` | 首屏 ${fmtMs(segments.first_page)}`
    + ` | 闪屏关闭于 ${fmtMs(segments.splash_closed_at)}`
  log(line)
  log(`[startup] 服务内部 ${JSON.stringify(server)}`)
  // 直接点名最慢的一段（≥5 秒才提，免得热启动也刷一行）
  const worst = Object.entries(segments)
    .filter(([k, v]) => k !== 'splash_closed_at' && typeof v === 'number' && v > 0)
    .sort((a, b) => b[1] - a[1])[0]
  if (worst && worst[1] >= 5000) log(`[startup] ⚠️ 最慢一段：${worst[0]} ${fmtMs(worst[1])}`)
  appendStartupPhases({
    ts: new Date().toISOString(),
    version: app.getVersion(),
    reason,
    complete,
    total_ms: total,
    segments,
    server
  })
}

/**
 * 主窗口显示后再跑「延后维护」（每日 DB 备份写盘 + 规格书去重清理）。
 * 三条触发路径取最先到的：窗口就绪 / 页面载入 / 建窗后 15 秒兜底（防止页面永远不载入时备份丢掉）。
 */
let _deferredMaintenanceScheduled = false
function scheduleDeferredMaintenance(why) {
  if (_deferredMaintenanceScheduled) return
  _deferredMaintenanceScheduled = true
  setTimeout(() => {
    if (!runDeferredMaintenanceFn) {
      log(`[startup] 延后维护未执行（${why}）：服务模块没有提供入口`)
      return
    }
    const t = Date.now()
    try {
      const r = runDeferredMaintenanceFn()
      log(`[startup] 延后维护已执行（触发：${why}）${JSON.stringify(r || {})} 主进程等待 ${Date.now() - t}ms`)
    } catch (e) {
      log('[startup] 延后维护失败: ' + (e.stack || e.message))
    }
  }, 1200)
}

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
    // 重启出来的子进程会继承父进程的环境变量。启动时 process.env.DATA_DIR 已经被设成
    // 旧目录了，不清掉的话子进程 resolveDataDir() 第 0 步会直接采用那个旧值 —— 切换等于没切。
    delete process.env.DATA_DIR
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

// 数据目录是不是「启动时显式传进来的」。解析完之后 process.env.DATA_DIR 一定被填上，
// 光看那个变量已经分不清来源 —— 而这两者后续的处置完全不同（见 update:install 那条）。
let dataDirFromEnv = false

// 解析数据目录：显式 DATA_DIR → 用户配置 → NSIS 写的 data-dir.txt → 自动迁移 legacy → 弹选择器
async function resolveDataDir() {
  // 0. 启动时显式指定了 DATA_DIR 就直接采用，优先级高于一切（连用户配置也不许盖过它）。
  //    开发/验证靠它把程序指向沙箱 —— 从前这里不认这个变量，结果是「明明设了 DATA_DIR，
  //    程序照样打开正式数据目录」，脚本里的写库和清理会直接落到真实数据上。
  //    普通用户双击启动时没有这个变量，走下面的老路，行为不变。
  const explicit = process.env.DATA_DIR
  if (explicit) {
    dataDirFromEnv = true
    // 沙箱/开发跑：窗口布局之类的配置一律不落盘到用户的真实 user-config.json
    // （那个文件是固定路径，DATA_DIR 管不着它 —— 见 config.js 的说明）
    setEphemeralConfig(true)
    log(`resolveDataDir: 使用显式指定的 DATA_DIR ${explicit}`)
    if (!fs.existsSync(explicit)) fs.mkdirSync(explicit, { recursive: true })
    return explicit
  }

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
    // 路径先归一再比。`G:\...\晶振报价管理系统` 和带尾斜杠、大小写不同的写法指的是同一个
    // 目录，光比字符串会判成「不等」→ 于是把目录拷到它自己身上。
    if (path.resolve(found) === path.resolve(target)) {
      saveUserConfig(target)
      return target
    }
    // 目标里已经有一份数据库时，**绝不自动迁移**：拷贝会把目标里（可能更新的）数据
    // 换成探测到的旧副本，而且不可撤销。此时以目标为准，原目录一个字节都不动，只留日志。
    if (hasDb(target)) {
      log(`resolveDataDir: ${found} 与 ${target} 都有数据库，保留现有 ${target}，不自动迁移`)
      saveUserConfig(target)
      return target
    }
    log(`resolveDataDir: 迁移 ${found} → ${target}`)
    try {
      // 用不覆盖的拷贝：迁移只允许「往里添」，不允许「拿旧的盖掉已有的」。
      // 目标里但凡有同名文件（模板、Excel备份等），一律保留目标那份。
      copyDirRecursive(found, target)
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
let splashWindow = null   // 提到模块级：second-instance 要用它给「启动中再点一次」的用户一个反馈
let _mainSaveTimer = null
let serverPort = BASE_PORT
let dbSaveNow = null
let doFlushBackupPending = null
let reminderInterval = null
// 闪屏上的「直接进入」：按钮在闪屏自己的渲染进程里，通过 preload 发 IPC 过来。
// 主进程被同步 import 堵住时，这个请求会排队，等主进程一空就跑。
let _splashSkipRequested = false
let _closeSplash = null   // whenReady 里赋值；ipcMain 处理器在模块级，够不着闭包里的 closeSplash
ipcMain.on('splash:skip', () => {
  _splashSkipRequested = true
  log('用户点击「直接进入（跳过动画）」')
  if (mainWindow && !mainWindow.isDestroyed()) {
    try { mainWindow.show() } catch (e) { log('跳过动画时 show() 失败: ' + e.message) }
    if (_closeSplash) _closeSplash('用户跳过动画')
  } else {
    // 还没建窗：记下请求，createWindow 之后 armSplashWatchdog 会立刻兑现
    log('主窗口尚未创建，已记下跳过请求（建窗后立即进入）')
  }
})

// 启动日志（两阶段: DATA_DIR 未就绪时写 startup.log，就绪后写 DATA_DIR/logs/）
let _logToDir = null
let _logDeadSig = null   // 上一次「哪几个落点写不进去」的签名，用来去重（见 log()）
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`
  const dead = []
  const errs = []
  // 写入 DATA_DIR/logs/startup.log（如果已就绪）
  if (_logToDir) {
    try { fs.appendFileSync(path.join(_logToDir, 'startup.log'), line, 'utf8') } catch (e) { dead.push('logs 目录'); errs.push(e.message) }
  }
  // 兜底写入 documents/startup.log
  try { fs.appendFileSync(path.join(app.getPath('documents'), 'startup.log'), line) } catch (e) { dead.push('文档目录'); errs.push(e.message) }
  if (!dead.length) { _logDeadSig = null; return }
  // 一个都没写进去 = 日志系统自己瞎了，往后记什么都是白记。
  // 这里不能再调 log()（会递归），只走 stderr —— 开发/命令行启动时看得见；
  // 打包版没有接收方，但那时也确实没别的出路了。
  // 按「哪几个落点哑了」而不是「第几次失败」去重：启动最开头只有兜底那一个落点在用，
  // 那个时刻就把它锁死的话，后面 DATA_DIR 也哑了也不会再出声，人就只修一半。
  const sig = dead.join('+')
  if (sig !== _logDeadSig) {
    _logDeadSig = sig
    try { process.stderr.write(`[log] 日志写入失败（${sig}）：${errs.join('；')}\n`) } catch {}
  }
}

/** 日志参数转成一行文本（Error 要带栈，否则等于只说「出错了」） */
function fmtLogArg(a) {
  if (a instanceof Error) return a.stack || a.message
  if (typeof a === 'string') return a
  try { return JSON.stringify(a) } catch { try { return String(a) } catch { return '[无法序列化的值]' } }
}

/**
 * 把 console 镜像进 log()。
 *
 * 打包版主进程的 stdout **没有接收方**，console.log/warn 打出来就没了 —— 而
 * server/src/index.js 的启动结论（归档了多少文件、物料清单改名几份、报告写没写出去、
 * 哪几个接口报错）全是 console 打出来的 ⇒ 客户机上装完根本没法核对。
 * 镜像后「开发机终端看到的」和「客户机 logs/startup.log 留下的」是同一份。
 */
function mirrorConsoleToLog() {
  for (const level of ['log', 'info', 'warn', 'error']) {
    const orig = console[level].bind(console)
    console[level] = (...args) => {
      try { orig(...args) } catch { /* 终端那路失败不影响落盘 */ }
      try { log(`[console.${level}] ${args.map(fmtLogArg).join(' ')}`) } catch { /* log() 自身失败会走 stderr 兜底 */ }
    }
  }
}
mirrorConsoleToLog()

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
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
    return
  }
  // 主窗口还没建出来 = 上一个实例仍卡在启动阶段。
  // 从前这里什么都不做，于是「再点一次图标」毫无反应，用户只能去任务管理器强杀
  // （2026-09-27 那台电脑正是这样）。至少要给点反馈，并留下「用户试过重开」的痕迹。
  log('second-instance: 主窗口尚未创建，把闪屏提到前台')
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.show()
    splashWindow.focus()
  }
})

async function startServer() {
  // 数据目录：用户配置 → legacy 探测+迁移 → 弹选择器
  const dataDir = await resolveDataDir()
  log(`dataDir: ${dataDir}`)
  const subdirs = [
    '数据库', '模板', '备份', 'Excel备份',
    // 归档区（正式位置）
    '客户管理', '_未分配客户', '报价规格书', '报价备注图',
    // 旧目录：老书签只读兜底；记事导入的图片也先落这里，下次启动自动归档
    '规格书', '记事图片库'
  ]
  for (const sd of subdirs) {
    const p = path.join(dataDir, sd)
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true })
  }
  process.env.DATA_DIR = dataDir
  switchLogTo(dataDir)
  log(`DATA_DIR: ${dataDir}`)
  mark('dataDir')

  log('Starting server import...')
  // 必须在 import 之前设：index.js 靠它判断自己是不是被 Electron 托管。
  // 不设的话 index.js 会自己 listen(3266)，和下面的 startServer() 抢端口 ——
  // 轻则每次启动都 EADDRINUSE 退到 3267（多起一个端口），
  // 重则 3266 被别的进程占用时 index.js 抛未捕获异常，应用卡死在闪屏、主窗口不出现。
  process.env.ELECTRON_MODE = 'true'
  // v1.0.232：把「每日数据库备份写盘」和「规格书去重清理」挪出启动阻塞路径。
  // 这两件事在慢机器上一次要 3~4 秒（备份 897KB + 扫整个规格书目录），而它们不影响
  // 服务能不能起来 —— 现在只登记/跳过，等主窗口显示后再跑（见 scheduleDeferredMaintenance）。
  process.env.DEFER_STARTUP_BACKUP = '1'
  process.env.DEFER_STARTUP_MAINTENANCE = '1'
  let expressApp
  try {
    const mod = await import('../server/src/index.js')
    expressApp = mod.default
    getServerStartupPhases = mod.getStartupPhases || null
    runDeferredMaintenanceFn = mod.runDeferredMaintenance || null
    const { saveNow } = await import('../server/src/db.js')
    const { flushPending } = await import('../server/src/utils/excelBackup.js')
    dbSaveNow = saveNow
    doFlushBackupPending = flushPending
  } catch (e) {
    log(`Server import failed: ${e.stack || e.message}`)
    throw new Error('服务模块加载失败: ' + e.message)
  }
  log('Server module imported')
  mark('serverImported')

  let retryCount = 0
  const MAX_RETRIES = 30
  return new Promise((resolve, reject) => {
    const tryListen = (port) => {
      log(`Trying port ${port}... (attempt ${retryCount + 1}/${MAX_RETRIES})`)
      const server = expressApp.listen(port, '0.0.0.0', () => {
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

/**
 * 保存的窗口坐标可能已经失效：换过显示器 / 改过分辨率或缩放 / 上次是在已拔掉的副屏上关的。
 * 直接拿去建窗口，窗口会落在所有显示器之外 —— 不绘制、不触发 ready-to-show，
 * 用户只看到一个永远转圈的闪屏。落不到任何显示器上就丢弃坐标，让系统居中。
 */
function sanitizeBounds(saved) {
  const b = { ...(saved || {}) }
  if (b.x === undefined || b.y === undefined) return b
  const w = b.width || 1400
  const h = b.height || 900
  let visible = false
  try {
    for (const d of screen.getAllDisplays()) {
      const a = d.workArea
      const ox = Math.min(b.x + w, a.x + a.width) - Math.max(b.x, a.x)
      const oy = Math.min(b.y + h, a.y + a.height) - Math.max(b.y, a.y)
      if (ox >= 100 && oy >= 40) { visible = true; break }   // 至少露出够点到标题栏的一块
    }
  } catch (e) { log('读显示器信息失败，窗口坐标未校验: ' + e.message); return b }
  if (visible) return b
  log(`窗口保存位置 ${b.x},${b.y} 不在任何显示器内，已丢弃改为居中`)
  delete b.x
  delete b.y
  return b
}

function createWindow(port) {
  log(`Creating window, loading port ${port}`)
  try {
    log(`Displays: ${JSON.stringify(screen.getAllDisplays().map(d => ({ id: d.id, workArea: d.workArea, scale: d.scaleFactor })))}`)
  } catch (e) { log('读屏幕信息失败: ' + e.message) }
  const cfg = loadFullConfig()
  const saved = sanitizeBounds(cfg?.mainWindow)
  log(`Window bounds: ${saved.x ?? '居中'},${saved.y ?? '居中'} ${saved.width || 1400}x${saved.height || 900}`)
  mainWindow = new BrowserWindow({
    width: saved.width || 1400,
    height: saved.height || 900,
    x: saved.x,
    y: saved.y,
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

  mainWindow.setMenuBarVisibility(false)
  // 监听大小/位置变化 → 节流保存
  const debounceSave = () => {
    if (_mainSaveTimer) clearTimeout(_mainSaveTimer)
    _mainSaveTimer = setTimeout(saveMainBounds, 500)
  }
  mainWindow.on('resize', debounceSave)
  mainWindow.on('move', debounceSave)
  mainWindow.once('ready-to-show', () => {
    mark('readyToShow')
    log('Window ready to show')
    mainWindow.show()
  })

  mainWindow.webContents.on('did-fail-load', (_, code, desc) => {
    log(`Page load failed: ${code} - ${desc}`)
    logStartupSummary('页面加载失败', false)
  })
  mainWindow.webContents.on('did-navigate', (_, url) => {
    log(`Navigated to: ${url}`)
  })
  mainWindow.webContents.on('will-navigate', (_, url) => {
    log(`Will navigate to: ${url}`)
  })

  mainWindow.webContents.on('did-finish-load', () => {
    mark('pageLoaded')
    log(`Page loaded successfully（启动总耗时 ${sinceStart()}）`)
    // v1.0.232：一行看全各阶段耗时（同时写 logs/startup-phases.jsonl）
    logStartupSummary('页面加载完成', true)
    // 窗口/页面都好了，再做「延后维护」（每日备份写盘 + 规格书去重清理）
    scheduleDeferredMaintenance('页面载入')
  })
  attachCrashRecovery(mainWindow, '主窗口')
  attachWindowOpenHandler(mainWindow)

  const url = `http://localhost:${port}?v=${app.getVersion()}&packaged=${app.isPackaged}`
  log(`Loading URL: ${url}`)
  // loadURL 的 promise 以前没人接 —— 它 reject 时是静默的，日志里什么都不留
  mainWindow.loadURL(url).catch(e => log(`⚠️ loadURL 失败: ${e.message}`))
}

// 启动动画闪屏
function showSplash() {
  const SPLASH_W = 420
  // v1.0.233：卡片加高到 320（原 276）。闪屏底部要同时容下「启动较慢」的 3 行提示 + 「直接进入」按钮，
  // 原尺寸下提示文字会压到按钮上（祥哥 2026-10-20 截图指出）。
  const SPLASH_H = 384
  // 闪屏出现的**位置**：主界面窗口将要出现的那块地方的正中间（祥哥 2026-10-14 要求）。
  // 以前写的是 center:true ⇒ 永远钉在屏幕正中；用户把软件拖到别处/副屏时，
  // 闪屏与软件窗口差出两三百像素，看着割裂。这里复用 createWindow 同一套坐标判据
  // （save bounds + sanitizeBounds），保证「闪屏中心」= 「主窗口中心」。
  let splashPos = {}
  try {
    splashPos = computeSplashPosition({
      savedBounds: sanitizeBounds(loadFullConfig()?.mainWindow),
      splashSize: { w: SPLASH_W, h: SPLASH_H },
      primaryWorkArea: screen.getPrimaryDisplay().workArea
    })
    log(`闪屏位置: ${splashPos.x ?? '居中'},${splashPos.y ?? '居中'} ${SPLASH_W}x${SPLASH_H}`)
  } catch (e) {
    log('⚠️ 计算闪屏位置失败，交给 Electron 居中: ' + e.message)
  }
  const splash = new BrowserWindow({
    width: SPLASH_W,
    height: SPLASH_H,
    x: splashPos.x,
    y: splashPos.y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      // 只为了让「直接进入」按钮能把点击发回主进程（v1.0.232）
      preload: path.join(__dirname, 'splash-preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    }
  })
  // logo 优先用**透明字标** SJK.png（815×254，品牌字标）。
  // 原先用的是 SJK-256.png：那是给 exe 图标用的 256×256 方块，alpha 全是 255（**完全不透明**），
  // 塞进深色卡片里就是一个白色方块、里面的字标还很小。字标文件本来就在 client/public 下，
  // 只是没人用它（2026-10-14 祥哥指出）。
  // 打包后用 base64 内嵌（asar 内 file:// 不可访问）。两个都取不到就留空，别让闪屏崩掉。
  const distDir = path.join(__dirname, '..', 'client', 'dist')
  let logoSrc = ''
  for (const name of ['SJK.png', 'SJK-256.png']) {
    try {
      logoSrc = 'data:image/png;base64,' + fs.readFileSync(path.join(distDir, name)).toString('base64')
      break
    } catch { /* 换下一个候选 */ }
  }
  if (!logoSrc) log('⚠️ 闪屏 logo 读取失败（SJK.png / SJK-256.png 都取不到），闪屏将只显示文字')
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    *{margin:0;padding:0}
    /* overflow:hidden 是为了「窗口比卡片还小时」也不出现滚动条 ——
       实测（2026-10-14，480×260 窗口）：溢出产生的垂直滚动条会把内容挤偏 8.5px，
       logo 就不在正中了。裁掉比挤偏好。（闪屏窗口实际是 420×384 > 卡片 324×320，本来溢不出） */
    html,body{overflow:hidden;display:flex;align-items:center;justify-content:center;height:100vh;background:transparent;font-family:'Microsoft YaHei',sans-serif}
    /* 卡片在窗口里居中 ⇒ 卡片的 50% 处就是窗口正中，logo 钉在这里才能「严格居中」。 */
    .card{position:relative;width:324px;height:320px;background:linear-gradient(135deg,#1a1a2e,#16213e);border-radius:24px;box-shadow:0 16px 48px rgba(0,0,0,.5);animation:fadeIn .8s cubic-bezier(.4,0,.2,1)}
    /* ⚠️ logo **必须严格居中于窗口**（祥哥 2026-10-14 明确要求）。
       踩过的坑：原来是流式布局（img → h2 → 进度条 → 提示行），logo 会被下方那 141px 内容
       顶到卡片偏上 50px（实测：logo 中心 y=120，窗口中心 y=170）。
       改用绝对定位钉在卡片 50%/50%，上下都不再受其它元素高度影响。
       又因为标题移到了 logo **上方**，上下内容才配平（否则卡片要么偏沉、要么上方留一大片空白）。 */
    img{position:absolute;top:50%;left:50%;width:224px;height:auto;transform:translate(-50%,-50%);animation:logoIn 1s cubic-bezier(.4,0,.2,1)}
    h2{position:absolute;top:56px;left:0;right:0;text-align:center;color:#e8e8e8;font-size:17px;font-weight:500;letter-spacing:3px;animation:textIn 1s cubic-bezier(.4,0,.2,1) .2s both}
    .bar{position:absolute;top:50%;left:50%;width:180px;height:3px;background:rgba(255,255,255,.08);border-radius:2px;overflow:hidden;transform:translate(-50%,-50%) translateY(46px);animation:barIn 1s ease .4s both}
    .bar-inner{width:40%;height:100%;background:#4fc3f7;border-radius:2px;animation:load 1.8s ease .6s infinite}
    /* 提示行：从卡片中线往下 60px 起，最多 3 行（文案已控制在 3 行内）；
       按钮钉在卡片底部 12px。两者之间留出 20px 左右空隙，不会再叠在一起。 */
    .hint{position:absolute;top:50%;left:0;right:0;padding:0 18px;box-sizing:border-box;transform:translateY(60px);text-align:center;color:#8b93a7;font-size:10.5px;line-height:1.5;white-space:pre-line}
    /* 只淡入、**不做位移**：原来带 translateY(10px)，那 0.8 秒里整卡下沉、logo 会偏下 10px
       （2026-10-14 用居中验证器量出来的，偏差正好 10.00px）。祥哥要的是「logo 始终在正中」，
       所以入场也不许位移。 */
    @keyframes fadeIn{from{opacity:0}to{opacity:1}}
    /* 关键帧里必须带上 translate(-50%,-50%) —— 缩放动画会**整条覆盖** transform，
       漏了这句，logo 在动画那 1 秒里会跳到「以左上角对齐窗口中心」的错位状态。 */
    @keyframes logoIn{0%{opacity:0;transform:translate(-50%,-50%) scale(.8)}50%{opacity:1;transform:translate(-50%,-50%) scale(1.05)}100%{opacity:1;transform:translate(-50%,-50%) scale(1)}}
    @keyframes textIn{from{opacity:0;letter-spacing:8px}to{opacity:1;letter-spacing:3px}}
    @keyframes barIn{from{opacity:0;width:0}to{opacity:1;width:180px}}
    @keyframes load{0%{width:0;margin-left:0}40%{width:70%;margin-left:15%}70%{width:30%;margin-left:60%}100%{width:0;margin-left:100%}}
    /* 「直接进入」按钮：默认淡入，别在 1 秒就启动完的热启动里闪一下。
       bottom 12px，和上面的提示行（最多 3 行）分开，别再叠字（v1.0.233 修）。 */
    #skip{position:absolute;left:50%;bottom:12px;transform:translateX(-50%);background:transparent;
      border:1px solid rgba(255,255,255,.22);color:#8b93a7;font-size:10.5px;padding:3px 11px;
      border-radius:11px;cursor:pointer;font-family:inherit;white-space:nowrap;transition:all .2s;
      opacity:0;animation:skipIn .4s ease 2s forwards}
    #skip:hover{color:#fff;border-color:#4fc3f7;background:rgba(79,195,247,.12)}
    @keyframes skipIn{to{opacity:1}}
  </style></head><body><div class="wrap"><div class="card">
    <h2>晶振报价管理系统</h2>
    <img src="${logoSrc}">
    <div class="bar"><div class="bar-inner"></div></div>
    <div class="hint" id="hint">正在启动…</div>
    <button id="skip" type="button">直接进入（跳过动画）</button>
  </div></div>
  <script>
    // 计时器**跑在闪屏自己的渲染进程里**，所以主进程被同步任务堵住时它照样在走。
    // 这正是「卡在启动动画」最需要的东西：2026-10-14 那次启动，主进程从 2.2 秒起被堵了
    // 近 18 秒、页面 164 秒才出来，主进程的兜底定时器跟着一起停摆 ——
    // 用户面对的是一个一动不动、也看不出「还活着」的动画，只能强杀碰运气。
    var t0 = Date.now();
    var el = document.getElementById('hint');
    setInterval(function () {
      var s = Math.round((Date.now() - t0) / 1000);
      if (s < 6) { el.textContent = '正在启动…'; return; }
      if (s < 20) { el.textContent = '启动较慢（已 ' + s + ' 秒）…请稍候'; return; }
      el.textContent = '启动较慢（已 ' + s + ' 秒），不是死机，可能在等安全软件扫描。\\n点「直接进入」可先打开窗口；一直停着请把 logs/startup.log 发给技术。';
    }, 500);
    // 「直接进入（跳过动画）」→ preload 暴露的 splashAPI → 主进程收到后亮窗口、收闪屏
    var skipBtn = document.getElementById('skip');
    skipBtn.addEventListener('click', function () {
      try { if (window.splashAPI && window.splashAPI.skip) window.splashAPI.skip(); } catch (e) {}
      el.textContent = '正在进入主界面…（窗口还在加载）';
    });
  </script></body></html>`
  splash.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  splashWindow = splash
  return splash
}

// 记事便签独立浮窗
let notesWindow = null
let _notesSaveTimer = null
function saveMainBounds() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  try {
    const bounds = mainWindow.getBounds()
    const cfg = loadFullConfig()
    saveFullConfig({ mainWindow: { ...cfg.mainWindow, ...bounds } })
  } catch (e) { log('saveMainBounds error: ' + e.message) }
}
function saveNotesBounds() {
  if (!notesWindow || notesWindow.isDestroyed()) return
  try {
    const bounds = notesWindow.getBounds()
    const cfg = loadFullConfig()
    saveFullConfig({ notesWindow: { ...cfg.notesWindow, ...bounds } })
  } catch (e) { log('saveNotesBounds error: ' + e.message) }
}
// 窗口卡死/崩溃时的可观测性与自恢复。
//
// 为什么要抽成函数：**5 个窗口都要挂**。只挂主窗口的话，记事/地图/绩效/客户物料崩掉时
// 没有日志、没有重载、没有提示，窗口停在白屏 —— 跟没修一模一样，而代码里建立的心智
// 却是「崩溃会自愈」（2026-09-28 对抗性复审反例 3）。
//
// 护栏：无脑重载会变成崩溃循环（重载→又崩→再重载），比白屏更耗机器。60 秒滑动窗口内
// 连崩 3 次就停手并说清楚。计数是**每个窗口各自一份**（闭包变量），副窗崩不会推高主窗的。
// 日志和弹窗都带窗口名：5 个窗口都可能崩，不写名就分不清是哪一个崩了。
function attachCrashRecovery(win, label) {
  // 从前这条没记 —— 渲染进程卡了时日志里一片空白，只能靠猜。
  // 2026-09-27 那台电脑「首次启动永远卡闪屏」就是栽在这个盲区上。
  win.on('unresponsive', () => log(`⚠️ ${label}无响应`))
  let crashCount = 0
  let lastCrashAt = 0
  win.webContents.on('render-process-gone', (_, d) => {
    log(`⚠️ ${label}渲染进程退出: reason=${d.reason} exitCode=${d.exitCode}`)
    if (d.reason === 'clean-exit' || win.isDestroyed()) return   // 正常退出不算崩溃
    const now = Date.now()
    if (now - lastCrashAt > 60000) crashCount = 0     // 隔一分钟以上 = 换了新问题，重新计数
    lastCrashAt = now
    crashCount++
    if (crashCount > 2) {
      log(`${label}渲染进程连续崩溃 3 次，停止自动重载`)
      try {
        dialog.showMessageBox({
          type: 'error',
          title: '界面异常',
          message: `${label}反复崩溃，已停止自动恢复。`,
          detail: `请关闭软件后重新打开。\n\n诊断日志：数据目录\\logs\\startup.log`
        })
      } catch (e) { log('崩溃提示弹窗失败: ' + e.message) }
      return
    }
    log(`${label}渲染进程已崩溃，1 秒后自动重载（第 ${crashCount} 次）`)
    setTimeout(() => {
      if (win.isDestroyed()) return
      try { win.reload() } catch (e) { log('崩溃后自动重载失败: ' + e.message) }
    }, 1000)
  })
}

// 把 window.open 的子窗口请求转成正经 BrowserWindow。
// 注意 setWindowOpenHandler 是「每个 webContents 各注册一份」的 —— 只在主窗口注册，
// 从子窗口（物料/记事/地图/绩效）里再点开子窗口就会落到 Chromium 原生弹窗：
// 没有 preload，window.electronAPI 是 undefined，页面上 v-if="isElectron" 的按钮全部消失。
// 所以 5 个窗口都要挂。
function attachWindowOpenHandler(win) {
  win.webContents.setWindowOpenHandler(({ url }) => {
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
    // 绩效明细窗口
    if (url.includes('/#/performance') && url.includes('?standalone=1')) {
      openPerfWindow(serverPort)
      return { action: 'deny' }
    }
    // 客户物料窗口
    if (url.includes('/#/materials') && url.includes('?standalone=1')) {
      openMaterialsWindow(serverPort)
      return { action: 'deny' }
    }
    // 仅允许 http/https 外部链接通过系统浏览器打开
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })
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
  attachCrashRecovery(notesWindow, '记事窗口')
  attachWindowOpenHandler(notesWindow)
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
              if (mainWindow && !mainWindow.isDestroyed()) {
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
  attachCrashRecovery(mapWindow, '地图窗口')
  attachWindowOpenHandler(mapWindow)
  const url = `http://localhost:${port}/#/map-addresses?standalone=1&v=${app.getVersion()}&packaged=${app.isPackaged}`
  mapWindow.loadURL(url)
  mapWindow.on('closed', () => {
    mapWindow = null
    if (_mapSaveTimer) { clearTimeout(_mapSaveTimer); _mapSaveTimer = null }
  })
}

let perfWindow = null
let _perfSaveTimer = null
function savePerfBounds() {
  if (!perfWindow || perfWindow.isDestroyed()) return
  try {
    const bounds = perfWindow.getBounds()
    const cfg = loadFullConfig()
    saveFullConfig({ perfWindow: { ...cfg.perfWindow, ...bounds } })
  } catch (e) { log('savePerfBounds error: ' + e.message) }
}
function openPerfWindow(port) {
  if (perfWindow && !perfWindow.isDestroyed()) { perfWindow.focus(); return }
  const cfg = loadFullConfig()
  const saved = cfg?.perfWindow || {}
  const mainPos = mainWindow?.getBounds()
  perfWindow = new BrowserWindow({
    width: saved.width || 960,
    height: saved.height || 720,
    minWidth: 640, minHeight: 500,
    x: saved.x ?? (mainPos ? mainPos.x + 80 : undefined),
    y: saved.y ?? (mainPos ? mainPos.y + 60 : undefined),
    title: '绩效明细',
    icon: path.join(__dirname, '..', 'client', 'dist', 'SJK-256.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, 'preload.cjs')
    }
  })
  perfWindow.setMenuBarVisibility(false)
  const debounceSave = () => {
    if (_perfSaveTimer) clearTimeout(_perfSaveTimer)
    _perfSaveTimer = setTimeout(savePerfBounds, 500)
  }
  perfWindow.on('resize', debounceSave)
  perfWindow.on('move', debounceSave)
  attachCrashRecovery(perfWindow, '绩效窗口')
  attachWindowOpenHandler(perfWindow)
  const url = `http://localhost:${port}/#/performance?standalone=1&v=${app.getVersion()}&packaged=${app.isPackaged}`
  perfWindow.loadURL(url)
  perfWindow.on('closed', () => {
    perfWindow = null
    if (_perfSaveTimer) { clearTimeout(_perfSaveTimer); _perfSaveTimer = null }
  })
}

// 客户物料独立浮窗
let materialsWindow = null
let _materialsSaveTimer = null
function saveMaterialsBounds() {
  if (!materialsWindow || materialsWindow.isDestroyed()) return
  try {
    const bounds = materialsWindow.getBounds()
    const cfg = loadFullConfig()
    saveFullConfig({ materialsWindow: { ...cfg.materialsWindow, ...bounds } })
  } catch (e) { log('saveMaterialsBounds error: ' + e.message) }
}
function openMaterialsWindow(port) {
  if (materialsWindow && !materialsWindow.isDestroyed()) { materialsWindow.focus(); return }
  const cfg = loadFullConfig()
  const saved = cfg?.materialsWindow || {}
  const mainPos = mainWindow?.getBounds()
  materialsWindow = new BrowserWindow({
    width: saved.width || 1100,
    height: saved.height || 680,
    minWidth: 800, minHeight: 480,
    x: saved.x ?? (mainPos ? mainPos.x + 70 : undefined),
    y: saved.y ?? (mainPos ? mainPos.y + 50 : undefined),
    title: '客户物料',
    frame: true,
    icon: path.join(__dirname, '..', 'client', 'dist', 'SJK-256.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, 'preload.cjs')
    }
  })
  materialsWindow.setMenuBarVisibility(false)
  const debounceSave = () => {
    if (_materialsSaveTimer) clearTimeout(_materialsSaveTimer)
    _materialsSaveTimer = setTimeout(saveMaterialsBounds, 500)
  }
  materialsWindow.on('resize', debounceSave)
  materialsWindow.on('move', debounceSave)
  attachCrashRecovery(materialsWindow, '客户物料窗口')
  attachWindowOpenHandler(materialsWindow)
  const url = `http://localhost:${port}/#/materials?standalone=1&v=${app.getVersion()}&packaged=${app.isPackaged}`
  materialsWindow.loadURL(url)
  materialsWindow.on('closed', () => {
    materialsWindow = null
    if (_materialsSaveTimer) { clearTimeout(_materialsSaveTimer); _materialsSaveTimer = null }
  })
}

// IPC：渲染进程请求打开/关闭物料窗口
ipcMain.handle('open-materials-window', () => {
  openMaterialsWindow(serverPort)
})
ipcMain.handle('close-materials-window', () => {
  if (materialsWindow && !materialsWindow.isDestroyed()) {
    materialsWindow.close()
  }
})

// IPC：渲染进程请求打开地图窗口
ipcMain.handle('open-map-window', () => {
  openMapWindow(serverPort)
})

// 浏览器打开外部链接（供渲染进程调用）
ipcMain.handle('open-external', (_, url) => { shell.openExternal(url) })

// === 复制图片到系统剪贴板 ===
// 放主进程的理由：渲染进程在 Electron 里写图片剪贴板要过 secure-context 与权限两道，
// 而 clipboard.writeImage(nativeImage) 是官方路径、没有这些限制。
// 约定：渲染进程先把图片取成 dataURL，主进程只负责「落到剪贴板」。
function bufferFromDataUrl(dataUrl) {
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(String(dataUrl || ''))
  if (!m) throw new Error('不是合法的 dataURL')
  return m[2]
    ? Buffer.from(m[3], 'base64')
    : Buffer.from(decodeURIComponent(m[3]), 'utf8')
}

ipcMain.handle('image:copy', async (_, { dataUrl, name } = {}) => {
  try {
    const img = nativeImage.createFromBuffer(bufferFromDataUrl(dataUrl))
    if (img.isEmpty()) return { ok: false, msg: '图片内容为空，无法复制' }
    clipboard.writeImage(img)
    log(`image:copy 成功（${name || '未命名'}，${img.getSize().width}x${img.getSize().height}）`)
    return { ok: true }
  } catch (err) {
    log(`image:copy 失败: ${err.message}`)
    return { ok: false, msg: err.message }
  }
})

// 规格书：问服务端要磁盘路径，再用系统默认程序打开（像双击文件夹一样）。
// 归档后规格书散在 客户管理/<客户>/规格书/、报价规格书/<品类>/ 下，主进程不再自己拼路径，
// 一律交给服务端的 A.resolveUrl（与上传/搬迁用的是同一套规则）。
ipcMain.handle('open-spec', async (_, specUrl) => {
  try {
    const r = await fetch(`http://127.0.0.1:${serverPort}/api/file-path?url=${encodeURIComponent(specUrl)}`)
    const j = await r.json()
    if (j.code !== 0) return log(`open-spec 失败: ${j.msg} (${specUrl})`)
    log(`open-spec: ${j.data.path}`)
    shell.openPath(j.data.path)
  } catch (err) { log(`open-spec error: ${err.message}`) }
})

// 「📁 客户目录」：问服务端要该客户的归档目录路径（走同一套 customerDirAbs），再用资源管理器打开
ipcMain.handle('open-customer-folder', async (_, customer) => {
  try {
    const r = await fetch(`http://127.0.0.1:${serverPort}/api/customer-folder?customer=${encodeURIComponent(customer || '')}`)
    const j = await r.json()
    if (j.code !== 0) return log(`open-customer-folder 失败: ${j.msg}`)
    log(`open-customer-folder: ${j.data.path}`)
    const err = await shell.openPath(j.data.path)
    if (err) log(`open-customer-folder openPath: ${err}`)
  } catch (err) { log(`open-customer-folder error: ${err.message}`) }
})

// === 自动更新 IPC（与 xnowpost 一致） ===
ipcMain.handle('update:check', () => { checkForUpdates(); return true })
ipcMain.handle('update:download', () => { downloadUpdate() })
ipcMain.handle('update:install', () => {
  // 升级前保存当前数据目录路径，确保新版本能找到旧数据。
  // ⚠️ 只在「这个目录是从配置/安装记录里解析出来的」时才存。
  // DATA_DIR 是启动时显式传进来的（开发、验证、沙箱）时**绝不能存** —— 存下去等于
  // 把用户配置里的真实数据目录**永久改写**成那个临时路径，他下次双击打开软件就会
  // 指向沙箱/测试目录（2026-09-28 实测踩到：沙箱跑一轮 + 点一次「立即重启安装」，
  // 祥哥的真实 user-config.json 里 dataDir 变成了 G:/Temp/v220-sandbox）。
  if (process.env.DATA_DIR && !dataDirFromEnv) saveUserConfig(process.env.DATA_DIR)
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
  mark('appReady')
  const splash = showSplash()
  // 闪屏只从这里关。以前三处各调一次 splash.close()，先关的那次之后
  // 再调就是「访问已销毁的窗口」抛错。统一走 closeSplash + 幂等开关。
  let splashClosed = false
  const closeSplash = (why) => {
    if (splashClosed) return
    splashClosed = true
    mark('splashClosed')
    log(`关闭闪屏（${why}）`)
    try { if (!splash.isDestroyed()) splash.close() } catch (e) { log('splash.close 失败: ' + e.message) }
  }
  _closeSplash = closeSplash
  // 就绪 → 关闪屏；超过 SPLASH_TIMEOUT_MS 还没就绪 → 也关。
  // 2026-09-27 那台电脑就是卡在这：窗口没就绪，闪屏永不关，用户只能强杀碰运气。
  //
  // ⚠️ 但它**武装得太晚**：下面这段要等 startServer() 返回、主窗口建好才跑。
  // 而 startServer() 里是同步 import 服务模块 + 同步跑 syncArchive 迁移，全程堵死主进程 ——
  // 2026-10-14 那次真机上这段堵了近 18 秒（见 startup.log：Loading URL → Reminder polling
  // started 之间）。真要是卡在这一段，下面这些定时器**压根没被注册**，闪屏永远没人关。
  // 所以再加一道从闪屏出现就开始计时的 earlyFallback（就绪后立刻 clearTimeout 让位）。
  let earlyFallback = null
  // 从闪屏出现就开始计时的那道兜底（见上面注释）。就绪后由 armSplashWatchdog 清掉。
  earlyFallback = setTimeout(() => {
    if (splashClosed) return
    logStartupSummary('服务就绪前超时', false)
    log(`⚠️ 启动超时：${SPLASH_TIMEOUT_MS}ms 内服务模块仍未就绪（启动总耗时 ${sinceStart()}）`)
    closeSplash('服务就绪前超时')
    dialog.showMessageBox({
      type: 'warning',
      title: '启动较慢',
      message: `软件启动超过 ${SPLASH_TIMEOUT_MS / 1000} 秒仍未完成，已先关掉启动动画。`,
      detail: '请再稍等；若始终看不到主界面，请关闭软件后重新打开。\n若多次如此，请把「数据目录 / logs / startup.log」发给技术。'
    })
  }, SPLASH_TIMEOUT_MS)
  const armSplashWatchdog = () => {
    if (earlyFallback) { clearTimeout(earlyFallback); earlyFallback = null }
    if (!mainWindow) { log('⚠️ 主窗口不存在，闪屏兜底未武装（闪屏将无人关闭）'); return }
    // 用户在闪屏上点过「直接进入」：不再等 ready-to-show，立刻把窗口亮出来收掉动画
    if (_splashSkipRequested) {
      try { mainWindow.show() } catch (e) { log('⚠️ 跳过动画 show() 失败: ' + e.message) }
      closeSplash('用户已请求跳过')
    }
    mainWindow.once('ready-to-show', () => setTimeout(() => {
      closeSplash('窗口就绪')
      // 窗口出来了就可以做延后维护了（每日备份写盘 + 规格书清理）
      scheduleDeferredMaintenance('窗口就绪')
    }, 400))
    // 第二条出口：页面载入完成。
    // 2026-09-27 复现：ready-to-show 会**永远不触发** —— 同一台机器上写个 12 行的
    // Electron 小程序（只 loadURL 一段 data:text/html），did-finish-load 267ms 就到，
    // ready-to-show 30 秒都不来。此时闪屏的唯一出口只剩下面那条 90 秒兜底，
    // 用户看到的就是「卡在启动动画页，一直进不去」—— 正是客户机 9/27 报的毛病。
    // did-finish-load 则每次都准点（本机各次启动均在 1 秒内）。
    // 留 600ms 让首帧画完再收闪屏，避免露出一片白。
    mainWindow.webContents.once('did-finish-load', () => setTimeout(() => {
      if (splashClosed) return
      log('页面已载入，直接进主界面（不等 ready-to-show）')
      // show() 不是多余的：卡住时正是它逼出首帧（实测 show() 后 30~80ms 才来 ready-to-show）
      try { if (!mainWindow.isDestroyed()) mainWindow.show() } catch (e) { log('⚠️ 载入后 show() 失败: ' + e.message) }
      closeSplash('页面已载入')
    }, 600))
    setTimeout(() => {
      if (splashClosed) return
      logStartupSummary('闪屏兜底超时', false)
      log(`⚠️ 闪屏兜底超时：主窗口 ${SPLASH_TIMEOUT_MS}ms 内未就绪，强制收掉闪屏`)
      // 这是最后一道兜底 —— 它要是也失败，窗口就永远不出现。别空 catch，
      // 否则复盘的人会以为「窗口显示了只是白屏」，方向整个跑偏。
      try { if (!mainWindow.isDestroyed()) mainWindow.show() } catch (e) { log('⚠️ 兜底 show() 失败: ' + e.message) }
      closeSplash('兜底超时')
      dialog.showMessageBox({
        type: 'warning',
        title: '界面加载异常',
        message: '主窗口迟迟没有加载出来，已先关掉启动动画。',
        detail: '稍等一下；若窗口仍是一片空白，请关闭软件再重新打开。\n\n诊断日志：数据目录\\logs\\startup.log'
      })
    }, SPLASH_TIMEOUT_MS)
  }
  try {
    // 这一段（解析数据目录 + import 服务模块，内含同步执行的归档迁移 syncArchive）
    // 全程堵在主进程 JS 线程上：闪屏的另一条渲染进程照转，但这里一行日志都不写、
    // 连兜底定时器都轮不到执行 —— 是「卡在启动动画页」最难查的一段盲区。
    // 记个耗时，至少下次能一眼看出时间花在哪。
    const t0 = Date.now()
    log('开始解析数据目录并加载服务模块…')
    // tryListen 自动处理 EADDRINUSE，不预先强杀旧进程以防打断退出保存
    const { port } = await startServer()
    serverPort = port
    mark('serverListening')
    log(`服务就绪，用时 ${Date.now() - t0}ms`)
    const menu = Menu.buildFromTemplate([
      { label: '文件', submenu: [
        { label: '打开数据文件夹', click: () => shell.openPath(process.env.DATA_DIR) },
        { label: '切换数据目录...', click: () => switchDataDir() },
        { type: 'separator' },
        { role: 'quit', label: '退出' }
      ]},
      { label: '帮助', submenu: [
        { label: '检查更新', click: () => { if (mainWindow && !mainWindow.isDestroyed()) { mainWindow.webContents.executeJavaScript('window.__checkUpdate?.()') } } },
        { type: 'separator' },
        { label: '关于', click: () => dialog.showMessageBox({ type: 'info', title: '关于', message: '晶振报价管理系统 v' + app.getVersion(), detail: '晶振公司内部报价管理与查询系统' }) }
      ]}
    ])
    Menu.setApplicationMenu(menu)
    createWindow(port)
    mark('windowCreated')
    armSplashWatchdog()
    // 延后维护的兜底：页面若一直载不进来（CPU 被安全软件占满），备份也不能丢
    setTimeout(() => scheduleDeferredMaintenance('建窗后 15 秒兜底'), 15000)
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
          armSplashWatchdog()
          initUpdater(mainWindow)
        } catch (e2) {
          closeSplash('EADDRINUSE 重试失败')
          dialog.showErrorBox('启动失败', '端口被占用，请关闭所有晶振报价系统窗口后重试')
          app.quit()
        }
      }, 2000)
      return
    }
    closeSplash('启动失败')
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
    // 微信式：更新包已经在后台下好了，关软件时顺手装上，用户下次打开就是新版。
    // 必须在这里（强杀之前）调 —— 它内部是同步派安装程序，之后我们 exit 不影响它。
    if (installOnQuit()) log('before-quit: 更新已交给安装程序')
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
