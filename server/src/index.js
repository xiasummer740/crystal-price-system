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

// 规格书上传
// folder 字段：可选子目录（如 "客户物料/深圳市XX"），报价系统不传则存根目录
// 去重：目标目录已有同名文件 → 复用已有文件，不重复存储
const specUpload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      // folder 通过 query 参数传入（multer 解析 file 时 req.body 可能尚未就绪）
      const folder = String(req.query?.folder || '').replace(/[<>:"|?*\\]/g, '_').trim()
      const dir = folder ? path.join(specDir, folder) : specDir
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      req._specDir = dir
      req._specFolder = folder
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
      const rel = req._specFolder ? `${req._specFolder}/${path.basename(req._specDupPath)}` : path.basename(req._specDupPath)
      let displayName
      try { displayName = Buffer.from(req.file.originalname, 'binary').toString('utf8') } catch { displayName = req.file.originalname }
      return res.json({ code: 0, data: { url: `/api/specs/${encodeURIComponent(rel)}`, filename: displayName, reused: true } })
    }
    const rel = req._specFolder ? `${req._specFolder}/${req.file.filename}` : req.file.filename
    const url = `/api/specs/${rel.split('/').map(encodeURIComponent).join('/')}`
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

// ===== 规格书迁移：历史客户物料规格书按客户名分文件夹 =====
// 旧版客户物料规格书都存根目录，迁移到 规格书/客户物料/{客户名}/ 并更新引用
// 若同一文件被报价系统引用，保留根目录副本（不破坏报价系统）
function specFilenameFromUrl(url) {
  if (!url) return ''
  let p = url.replace('/api/specs/', '')
  p = p.split('?')[0]
  try { p = decodeURIComponent(p) } catch {}
  // 若是子目录路径，取最后一段文件名
  return p.split('/').pop() || ''
}
function migrateSpecsToCustomerFolders() {
  // 找旧格式（根目录引用）的客户物料规格书
  const mats = queryAll(
    "SELECT id, customer, spec_document FROM customer_materials WHERE is_deleted = 0 AND spec_document != '' AND spec_document NOT LIKE '/api/specs/客户物料/%'"
  )
  if (!mats.length) { console.log('[spec-migrate] 无需要迁移的规格书'); return }

  // 报价系统引用的根目录文件名（这些文件不能删除，保留根目录副本）
  const priceRefs = new Set()
  const prices = queryAll("SELECT spec_document FROM material_prices WHERE is_deleted = 0 AND spec_document != ''")
  for (const p of prices) {
    const fn = specFilenameFromUrl(p.spec_document)
    if (fn) priceRefs.add(fn)
  }

  let moved = 0
  for (const m of mats) {
    const fn = specFilenameFromUrl(m.spec_document)
    if (!fn) continue
    const customer = (m.customer || '未命名客户').replace(/[<>:"|?*\\/]/g, '_').trim() || '未命名客户'
    const destDir = path.join(specDir, '客户物料', customer)
    const srcPath = path.join(specDir, fn)
    if (!fs.existsSync(srcPath)) continue
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true })
    const destPath = path.join(destDir, fn)
    if (!fs.existsSync(destPath)) {
      fs.copyFileSync(srcPath, destPath)
    }
    // 更新数据库引用（保留 ?name= 显示名）
    const newPath = ['客户物料', customer, fn].map(encodeURIComponent).join('/')
    const queryStr = m.spec_document.includes('?name=') ? m.spec_document.substring(m.spec_document.indexOf('?name=')) : ''
    execute("UPDATE customer_materials SET spec_document = ? WHERE id = ?", ['/api/specs/' + newPath + queryStr, m.id])
    moved++
    // 若此文件不被报价系统引用，删除根目录副本（避免孤儿文件）
    if (!priceRefs.has(fn)) {
      try { fs.unlinkSync(srcPath) } catch {}
    }
  }
  if (moved > 0) {
    try { saveNow() } catch {}
    console.log(`[spec-migrate] 已迁移 ${moved} 个客户物料规格书到客户文件夹`)
  }
}
try { migrateSpecsToCustomerFolders() } catch (e) { console.warn('[spec-migrate] 迁移失败:', e.message) }

// ===== 规格书迁移：报价系统规格书按品类分文件夹 =====
// 旧版报价系统规格书存根目录，迁移到 规格书/报价/{品类}/（品类空 → 未分类）并更新引用
function migrateQuoteSpecsToCategoryFolders() {
  const prices = queryAll(
    "SELECT id, category, spec_document FROM material_prices WHERE is_deleted = 0 AND spec_document != '' AND spec_document NOT LIKE '/api/specs/报价/%'"
  )
  if (!prices.length) { console.log('[spec-migrate-quote] 无需要迁移的报价规格书'); return }

  let moved = 0
  for (const p of prices) {
    const fn = specFilenameFromUrl(p.spec_document)
    if (!fn) continue
    const category = (p.category || '').replace(/[<>:"|?*\\/]/g, '_').trim() || '未分类'
    const destDir = path.join(specDir, '报价', category)
    const srcPath = path.join(specDir, fn)
    if (!fs.existsSync(srcPath)) continue
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true })
    const destPath = path.join(destDir, fn)
    if (fs.existsSync(destPath)) {
      // 目标已存在 → 复用，删除根目录文件
      try { fs.unlinkSync(srcPath) } catch {}
    } else {
      fs.renameSync(srcPath, destPath)
    }
    // 更新数据库引用（保留 ?name= 显示名）
    const newPath = ['报价', category, fn].map(encodeURIComponent).join('/')
    const queryStr = p.spec_document.includes('?name=') ? p.spec_document.substring(p.spec_document.indexOf('?name=')) : ''
    execute("UPDATE material_prices SET spec_document = ? WHERE id = ?", ['/api/specs/' + newPath + queryStr, p.id])
    moved++
  }
  if (moved > 0) {
    try { saveNow() } catch {}
    console.log(`[spec-migrate-quote] 已迁移 ${moved} 个报价规格书到品类文件夹`)
  }
}
try { migrateQuoteSpecsToCategoryFolders() } catch (e) { console.warn('[spec-migrate-quote] 迁移失败:', e.message) }

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
