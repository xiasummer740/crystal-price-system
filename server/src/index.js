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
import { exportToExcel, importFromExcel, generateTemplate, generateSampleTemplate, generateNoteTemplate } from './utils/export.js'
import { initDb, saveNow } from './db.js'
import { triggerBackup, flushPending } from './utils/excelBackup.js'

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

const specUpload = multer({
  storage: multer.diskStorage({
    destination: specDir,
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname)
      let base = path.basename(file.originalname, ext)
      // 安全防护：移除路径遍历（递归清掉嵌套 bypass）、null 字节、NTFS 保留字符
      while (base.includes('..')) base = base.replace(/\.\.+/g, '')
      base = base.replace(/[\0<>:"|?*/\\]/g, '_').trim()
      if (!base) base = 'unnamed'
      let name = base + ext
      let n = 1
      while (fs.existsSync(path.join(specDir, name))) {
        name = `${safeBase} (${n})${ext}`
        n++
      }
      cb(null, name)
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
    const url = `/api/specs/${encodeURIComponent(req.file.filename)}`
    res.json({ code: 0, data: { url, filename: req.file.originalname } })
  })
})

// 打开数据文件夹（仅桌面端有效）
app.get('/api/open-data-folder', (_req, res) => {
  const dataDir = process.env.DATA_DIR
  if (dataDir && process.platform === 'win32') execFile('explorer', [dataDir])
  res.json({ code: 0 })
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
