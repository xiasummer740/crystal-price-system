import express from 'express'
import cors from 'cors'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { execFile } from 'child_process'
import crypto from 'crypto'
import { fileURLToPath } from 'url'
import pricesRouter from './routes/prices.js'
import samplesRouter from './routes/samples.js'
import translatorRouter from './routes/translator.js'
import notesRouter from './routes/notes.js'
import reportsRouter from './routes/reports.js'
import logsRouter from './routes/logs.js'
import mapRouter from './routes/map.js'
import performanceRouter from './routes/performance.js'
import materialsRouter from './routes/materials.js'
import { exportToExcel, importFromExcel, generateTemplate, generateSampleTemplate, generateNoteTemplate } from './utils/export.js'
import { initDb, saveNow, queryAll, execute } from './db.js'
import { triggerBackup, flushPending } from './utils/excelBackup.js'
import * as A from './utils/customerArchive.js'
import { syncArchive } from './utils/archiveSync.js'
import * as logger from './utils/logger.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3266

app.use(cors({
  origin: (origin, cb) => {
    // 允许无来源请求（同源、curl、Electron）
    if (!origin) return cb(null, true)
    // 允许局域网常见前缀
    const allowed = ['http://localhost', 'http://127.0.0.1', 'http://192.168.', 'http://10.', 'http://172.']
    if (allowed.some(p => origin.startsWith(p))) return cb(null, true)
    cb(null, false)
  }
}))
app.use(express.json())

// 简易鉴权：写操作需 token，读取操作开放
const AUTH_FILE = path.join(process.env.DATA_DIR || path.join(__dirname, '..'), '.auth_token')
let authToken = ''
if (fs.existsSync(AUTH_FILE)) { authToken = fs.readFileSync(AUTH_FILE, 'utf8').trim() }
if (!authToken) { authToken = 'crystal_' + crypto.randomBytes(24).toString('hex'); fs.writeFileSync(AUTH_FILE, authToken) }
app.use((req, res, next) => {
  if (req.method === 'GET' || req.path === '/api/auth/verify') return next()
  const token = req.headers['x-auth-token'] || ''
  if (token === authToken) return next()
  if (req.originalUrl?.includes('/api/')) return res.status(401).json({ code: 1, msg: '未授权，请刷新页面获取新token' })
  next()
})
app.get('/api/auth/token', (_req, res) => res.json({ code: 0, data: { token: authToken } }))
app.get('/api/auth/verify', (req, res) => { const t = req.query.token || ''; res.json({ code: t === authToken ? 0 : 1 }) })

// 请求日志中间件（记录非 GET 请求和慢请求）
app.use((req, res, next) => {
  const start = Date.now()
  res.on('finish', () => {
    const duration = Date.now() - start
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'
    if (res.statusCode >= 400 || duration > 3000 || req.method !== 'GET') {
      logger[level]('http', `${req.method} ${req.originalUrl} → ${res.statusCode} (${duration}ms)`)
    }
  })
  next()
})

// 写操作自动 Excel 备份（节流 30s，FIFO 保留 5 份）
app.use((req, res, next) => {
  if (/^(POST|PUT|DELETE|PATCH)$/.test(req.method)) {
    res.on('finish', () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        if (req.originalUrl.startsWith('/api/prices') || req.originalUrl === '/api/import') {
          triggerBackup('prices')
        } else if (req.originalUrl.startsWith('/api/samples')) {
          triggerBackup('samples')
        } else if (req.originalUrl.startsWith('/api/notes')) {
          triggerBackup('notes')
        } else if (req.originalUrl.startsWith('/api/map')) {
          triggerBackup('map')
        }
      }
    })
  }
  next()
})

// API routes
app.use('/api/prices', pricesRouter)
app.use('/api/samples', samplesRouter)
app.use('/api/translator', translatorRouter)
app.use('/api/notes', notesRouter)
app.use('/api/reports', reportsRouter)
app.use('/api/logs', logsRouter)
app.use('/api/map', mapRouter)
app.use('/api/performance', performanceRouter)
app.use('/api/materials', materialsRouter)

// 导出 Excel
app.get('/api/export', (req, res) => {
  try {
    const buffer = exportToExcel(req.query)
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    const fn = '报价记录.xlsx'
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fn)}"; filename*=UTF-8''${encodeURIComponent(fn)}`)
    res.send(buffer)
  } catch (e) {
    console.error('[export]', e)
    res.status(500).json({ code: 1, msg: '导出失败' })
  }
})

// 导入 Excel
const upload = multer({ storage: multer.memoryStorage() })
app.post('/api/import', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ code: 1, msg: '请选择文件' })
    const count = importFromExcel(req.file.buffer)
    res.json({ code: 0, data: { count }, msg: `成功导入 ${count} 条记录` })
  } catch (e) {
    console.error('[import]', e)
    res.status(500).json({ code: 1, msg: '导入失败，请检查文件格式' })
  }
})

// 下载导入模板
app.get('/api/template', (_req, res) => {
  try {
    const buffer = generateTemplate()
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    const fn = '报价导入模板.xlsx'
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fn)}"; filename*=UTF-8''${encodeURIComponent(fn)}`)
    res.send(buffer)
  } catch (e) {
    console.error('[template]', e)
    res.status(500).json({ code: 1, msg: '模板生成失败' })
  }
})

// 规格书上传
const specDir = path.join(process.env.DATA_DIR || path.join(__dirname, '..'), '规格书')
if (!fs.existsSync(specDir)) fs.mkdirSync(specDir, { recursive: true })
app.use('/api/specs', express.static(specDir))

// 记事便签图片上传
const notesUploadDir = path.join(process.env.DATA_DIR || path.join(__dirname, '..'), '记事图片库')
if (!fs.existsSync(notesUploadDir)) fs.mkdirSync(notesUploadDir, { recursive: true })
app.use('/api/uploads/notes', express.static(notesUploadDir))

// 报价备注图片上传（微信粘贴图片/文件，记录报价原始记录）
const pricesUploadDir = path.join(process.env.DATA_DIR || path.join(__dirname, '..'), '报价图片库')
if (!fs.existsSync(pricesUploadDir)) fs.mkdirSync(pricesUploadDir, { recursive: true })
app.use('/api/uploads/prices', express.static(pricesUploadDir))

// 客户物料备注图片上传（微信粘贴图片/文件，记录报价原始记录）
const materialsUploadDir = path.join(process.env.DATA_DIR || path.join(__dirname, '..'), '客户物料图片库')
if (!fs.existsSync(materialsUploadDir)) fs.mkdirSync(materialsUploadDir, { recursive: true })
app.use('/api/uploads/materials', express.static(materialsUploadDir))

// ===== 归档区（客户资料归档后的正式位置）=====
// 客户管理/<客户>/{规格书,物料图片,记事/<日期>}、报价规格书/<品类>、报价备注图
// 上面那 4 条旧路由保留只读兜底：没刷新的旧页面 / 老书签不至于立刻 404。
// 迁移完成后旧目录应为空，这几条自然失效。
for (const [mount, root] of [
  ['/api/cust', A.DIR.customers],
  ['/api/quote-specs', A.DIR.quoteSpec],
  ['/api/quote-images', A.DIR.quoteImage]
]) {
  app.use(mount, express.static(A.ensureDir(A.rootAbs(root))))
}

// 桌面端「用系统程序打开」用：URL → 磁盘绝对路径。
// 路径规则只在 A.resolveUrl 一处实现，主进程不重复写一份 —— 两套 sanitize 迟早漂移，
// 而这次的 404 就是「写入用一套规则、读取用另一套」造出来的。
app.get('/api/file-path', (req, res) => {
  const hit = A.resolveUrl(req.query?.url)
  if (!hit) return res.status(400).json({ code: 1, msg: '无法解析该文件路径' })
  if (!fs.existsSync(hit.abs)) return res.status(404).json({ code: 1, msg: '文件不存在' })
  res.json({ code: 0, data: { path: hit.abs } })
})

// 桌面端「📁 客户目录」用：客户名 → 该客户的归档总目录（不存在就建好再返回）。
// 与上传/搬迁共用 A.customerDirAbs —— 按钮打开的必须就是文件真正待的地方，
// 否则又是一个「写的是一处、找的是另一处」。
app.get('/api/customer-folder', (req, res) => {
  const customer = String(req.query?.customer || '').trim()
  try {
    res.json({ code: 0, data: { path: A.ensureDir(A.customerDirAbs(customer)), folder: A.customerFolder(customer) } })
  } catch (e) {
    res.status(500).json({ code: 1, msg: '定位客户目录失败: ' + e.message })
  }
})

// 规格书上传
// 落位由「原始客户名 / 品类名」决定（query 传，multer 的 destination 里 req.body 可能尚未就绪）：
//   customer=深圳市XX  → 客户管理/深圳市XX/规格书/     （客户物料规格书）
//   category=RTC       → 报价规格书/RTC/              （报价规格书，空→未分类）
// 客户端不传路径：路径一律由路径助手算，保证与搬迁/静态路由用的是同一套 sanitize 规则。
// 去重：目标目录已有同名文件 → 复用已有文件，不重复存储
const specUpload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const customer = String(req.query?.customer || '').trim()
      const category = String(req.query?.category || '').trim()
      let dir, urlOf
      if (customer) { dir = A.customerSpecDirAbs(customer); urlOf = fn => A.customerSpecUrl(customer, fn) }
      else if (category) { dir = A.quoteSpecDirAbs(category); urlOf = fn => A.quoteSpecUrl(category, fn) }
      else return cb(new Error('上传参数缺失：需带 customer（客户物料规格书）或 category（报价规格书）'))
      A.ensureDir(dir)
      req._specDir = dir
      req._specUrlOf = urlOf
      cb(null, dir)
    },
    filename: (req, file, cb) => {
      // 修复编码：Windows 下 busboy 可能把 UTF-8 当 Latin-1 读，导致中文乱码
      let originalName
      try { originalName = Buffer.from(file.originalname, 'binary').toString('utf8') } catch { originalName = file.originalname }
      const ext = path.extname(originalName)
      let base = path.basename(originalName, ext)
      while (base.includes('..')) base = base.replace(/\.\.+/g, '')
      base = base.replace(/[\0<>:"|?*/\\]/g, '_').trim()
      if (!base) base = 'unnamed'
      const dir = req._specDir
      const target = path.join(dir, base + ext)
      if (fs.existsSync(target)) {
        // 已存在同名规格书 → 去重复用：写临时文件，handler 里删除并返回已有 URL
        req._specDup = true
        req._specDupPath = target
        cb(null, `._dup_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`)
      } else {
        cb(null, base + ext)
      }
    }
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowedExts = ['.pdf', '.png', '.jpg', '.jpeg', '.gif', '.doc', '.docx', '.xlsx', '.xls', '.zip', '.rar']
    const ext = path.extname(file.originalname).toLowerCase()
    if (allowedExts.includes(ext)) return cb(null, true)
    cb(new Error('不支持的文件类型，仅允许: PDF/图片/Office/Zip'))
  }
})
app.post('/api/upload-spec', (req, res) => {
  specUpload.single('file')(req, res, (err) => {
    if (err) {
      console.error('[specUpload]', err)
      return res.status(400).json({ code: 1, msg: err instanceof multer.MulterError ? '文件上传失败: ' + err.message : err.message })
    }
    if (!req.file) return res.status(400).json({ code: 1, msg: '请选择文件' })
    // 去重：删除临时文件，返回已存在的规格书 URL
    if (req._specDup && req.file.filename.startsWith('._dup_')) {
      try { fs.unlinkSync(path.join(req._specDir, req.file.filename)) } catch {}
      let displayName
      try { displayName = Buffer.from(req.file.originalname, 'binary').toString('utf8') } catch { displayName = req.file.originalname }
      return res.json({ code: 0, data: { url: req._specUrlOf(path.basename(req._specDupPath)), filename: displayName, reused: true } })
    }
    const url = req._specUrlOf(req.file.filename)
    // 返回 decode 后的原始文件名给前端显示
    let displayName
    try { displayName = Buffer.from(req.file.originalname, 'binary').toString('utf8') } catch { displayName = req.file.originalname }
    res.json({ code: 0, data: { url, filename: displayName } })
  })
})

// 打开数据文件夹（仅桌面端有效）
app.get('/api/open-data-folder', (_req, res) => {
  const dataDir = process.env.DATA_DIR
  if (dataDir && process.platform === 'win32') execFile('explorer', [dataDir])
  res.json({ code: 0 })
})

// 读取设置（Key-Value 持久化，跨升级保留）
app.get('/api/settings', (_req, res) => {
  const rows = queryAll('SELECT key, value FROM app_settings')
  const data = {}
  for (const r of rows) data[r.key] = r.value
  res.json({ code: 0, data })
})
// 保存设置
app.post('/api/settings', (req, res) => {
  const entries = req.body || {}
  for (const [key, value] of Object.entries(entries)) {
    execute("INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)", [key, String(value)])
  }
  res.json({ code: 0 })
})

// 全局错误捕获中间件（必须在所有路由之后）
app.use((err, req, res, _next) => {
  logger.error('uncaught', `${req.method} ${req.originalUrl} — ${err.stack || err.message}`)
  if (!res.headersSent) {
    res.status(500).json({ code: 1, msg: '服务器内部错误，请查看日志' })
  }
})

// 生产环境托管前端静态文件
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist')
app.use(express.static(clientDist))
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ code: 1, msg: '接口不存在' })
  res.sendFile(path.join(clientDist, 'index.html'))
})

// 初始化数据库
await initDb()

// ===== 规格书去重清理（启动时执行一次）=====
// 旧版本上传同名规格书会生成 "name (1).pdf"、"name (2).pdf" 等重复副本
// 此处合并为一份：保留原始名文件，删除 (N) 副本，并更新数据库引用
function cleanupDuplicateSpecs() {
  if (!fs.existsSync(specDir)) return
  const files = []
  const walk = (dir, rel) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      const r = rel ? `${rel}/${entry.name}` : entry.name
      if (entry.isDirectory()) walk(full, r)
      else files.push({ rel: r, full })
    }
  }
  walk(specDir, '')

  // 按基础名分组（去掉 " (N)" 后缀）
  const groups = new Map()
  for (const f of files) {
    const base = f.rel.replace(/ \(\d+\)(?=\.[^/.]+$)/, '')
    if (!groups.has(base)) groups.set(base, [])
    groups.get(base).push(f)
  }

  let deleted = 0
  for (const list of groups.values()) {
    if (list.length <= 1) continue
    // 保留无 " (N)" 后缀的原始文件；若全是 (N)，保留 N 最小的
    const keep = list.find(f => !/ \(\d+\)(?=\.[^.]+$)/.test(f.rel))
      || list.sort((a, b) => {
        const na = Number((a.rel.match(/\((\d+)\)/) || [0, 0])[1]) || 0
        const nb = Number((b.rel.match(/\((\d+)\)/) || [0, 0])[1]) || 0
        return na - nb
      })[0]
    for (const f of list) {
      if (f.rel === keep.rel) continue
      try { fs.unlinkSync(f.full); deleted++ } catch {}
      // 更新数据库引用：指向被删副本的 spec_document 改为指向保留文件
      const oldPath = f.rel.split('/').map(encodeURIComponent).join('/')
      const newPath = keep.rel.split('/').map(encodeURIComponent).join('/')
      try {
        execute(
          "UPDATE customer_materials SET spec_document = replace(spec_document, ?, ?) WHERE spec_document LIKE ?",
          ['/api/specs/' + oldPath, '/api/specs/' + newPath, '%' + oldPath + '%']
        )
      } catch {}
    }
  }
  if (deleted > 0) {
    try { saveNow() } catch {}
    console.log(`[spec-cleanup] 清理重复规格书 ${deleted} 份，保留 ${groups.size} 组`)
  } else {
    console.log('[spec-cleanup] 无重复规格书')
  }
}
try { cleanupDuplicateSpecs() } catch (e) { console.warn('[spec-cleanup] 清理失败:', e.message) }

// ===== 记事迁移：去掉「进行中」状态，已有进行中归到待办 =====
// v1.0.208 起全局移除 in_progress，升级后一次性迁移历史数据
function migrateNotesDropInProgress() {
  const r = execute(`UPDATE notes SET status = 'todo' WHERE status = 'in_progress' AND is_deleted = 0`)
  if (r.changes > 0) {
    try { saveNow() } catch {}
    console.log(`[notes-migrate] 已将 ${r.changes} 条「进行中」记事归到「待办」`)
  }
}
try { migrateNotesDropInProgress() } catch (e) { console.warn('[notes-migrate] 迁移失败:', e.message) }

// ===== 客户资料归档：把归档区对齐到数据库（取代旧的两个「规格书迁移」）=====
// 旧迁移有个致命缺陷：靠「根目录还有没有源文件」决定要不要修，文件一旦搬走就永远跳过 ——
// 它自己造成的错位永远修不回来，生产上 21 条<客户A>规格书 404 就是这么来的。
// 新迁移以「数据库引用能不能落到真实文件」为准，所以能修自己的历史错误。
// 幂等：已经搬过的，第二次启动是零成本空跑。另一台电脑装完自动整理走的就是这条路径。
try {
  const rep = syncArchive()
  const moved = Object.values(rep.migrated).reduce((a, b) => a + b, 0)
  if (moved || rep.deletedSources) {
    console.log(`[archive-sync] 归档 ${moved} 个文件，清理旧位置重复 ${rep.deletedSources} 个，详见 客户资料归档报告.txt`)
  }
  if (rep.broken.length) console.warn(`[archive-sync] ${rep.broken.length} 条引用找不到文件，见 客户资料归档报告.txt`)
  if (rep.skipped) console.warn(`[archive-sync] ${rep.skipped} 条因客户名撞车被跳过（需人工决定），见 客户资料归档报告.txt`)
} catch (e) {
  // 归档失败不能拖垮整个服务：搬迁是「先复制、确认后才删源」，源文件都还在，下次启动重试即可
  console.warn('[archive-sync] 归档失败:', e.message)
}

// 预生成导入模板到模板文件夹
const templateDir = path.join(process.env.DATA_DIR || path.join(__dirname, '..'), '模板')
if (!fs.existsSync(templateDir)) fs.mkdirSync(templateDir, { recursive: true })
try { fs.writeFileSync(path.join(templateDir, '报价导入模板.xlsx'), generateTemplate()) } catch {}
try { fs.writeFileSync(path.join(templateDir, '样品导入模板.xlsx'), generateSampleTemplate()) } catch {}
try { fs.writeFileSync(path.join(templateDir, '记事导入模板.xlsx'), generateNoteTemplate()) } catch {}

// 导出 app 供 Electron 主进程使用
export default app

// 直接运行时启动监听（非 Electron 模式）
const isElectron = process.env.ELECTRON_MODE === 'true' || process.argv[1]?.includes('electron')
if (!isElectron) {
  app.listen(PORT, () => {
    console.log(`晶振报价系统已启动: http://localhost:${PORT}`)
  })
}

// 退出时保存数据库
process.on('SIGINT', () => { flushPending(); saveNow(); process.exit() })
process.on('SIGTERM', () => { flushPending(); saveNow(); process.exit() })
