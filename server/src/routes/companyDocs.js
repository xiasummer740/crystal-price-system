/**
 * 公司资料 / 开票资料库（祥哥 2026-10-15 需求）
 *
 * 用途：存放 **客户发来的开票资料/证照**（对方发来的多半是图片、PDF、Word/Excel），
 *       以及**自己公司的**营业执照、开票资料（支持多家抬头）。
 * 典型场景：要开票时不用再去微信里翻「XX公司的开票信息.jpg」。
 *
 * 存哪：
 *   文件 → `<数据目录>/公司资料/客户/<客户名>/…` 与 `…/自己公司/<主体名>/…`
 *          （分目录是为了他直接打开文件夹时能看懂；`备份/` 会把整个数据目录备走）
 *   元数据 → `company_docs` 表（归属、分类、标题、原名、大小、时间）
 *   自己公司的开票字段 → `company_profiles` 表（一家一行，支持多抬头）
 *
 * 几个刻意的选择：
 *   · **归属信息走 query 而不是 body**：multer 的 diskStorage 在决定目录/文件名时
 *     就要知道归属，而 text 字段若排在 file 之后，那时 req.body 还是空的
 *     （现有 notes/materials 的上传路由也是这么处理的）。走 query 最稳。
 *   · **扩展名白名单**：客户发来的文件不能什么都收（exe/脚本），只放图片/PDF/Word/Excel/文本；
 *     按**扩展名**判断而不是客户端给的 mime（mime 是客户端说了算的）。
 *   · **文件名保留原名 + 前缀时间戳与随机串**：他要靠文件名认人（「XX公司开票资料.jpg」），
 *     但同名文件不能互相覆盖，所以加前缀而不是整名重编号。
 *   · 删除时**先删库再删文件**，文件删失败只在日志里记 —— 库里没了界面上就看不到了，
 *     反过来（文件删了库还在）才会出现点开 404。
 */
import { Router } from 'express'
import multer from 'multer'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { queryAll, queryOne, execute, saveNow } from '../db.js'

const router = Router()

// 数据根目录：与 db.js / index.js 保持**同一套回退口径**（DATA_DIR 优先，否则 server/），
// 否则开发模式下「公司资料」会落到仓库根，和生产布局不一致
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_ROOT = process.env.DATA_DIR || path.join(__dirname, '..', '..')
export const DOCS_ROOT = path.join(DATA_ROOT, '公司资料')

/** 分类预设（可自填） */
export const DOC_CATEGORIES = ['开票资料', '营业执照', '开户许可证', '一般纳税人证明', '合同', '其它']

/**
 * 允许的扩展名（祥哥 2026-10-15 追加要求后放宽）。
 *
 * 覆盖真实来源：
 *   · 微信截图 / 手机拍照 → jpg png gif webp bmp **heic heif**（iPhone 默认就是 HEIC）
 *   · 扫描件 / 电子发票 → **pdf**、**ofd**（国内电子发票常见格式）
 *   · 办公文档 → doc docx xls xlsx **wps et dps**（WPS 三件套，国内办公室很多）
 *   · 纯文本 → txt csv
 *
 * ⚠️ **故意不收 svg / html**：这两类会被 express.static 以同源方式打开，
 * 里面的脚本能拿到页面同源的 localStorage（含接口 token）⇒ 客户发来的文件可变成 XSS 跳板。
 * 图片/PDF 没有这个问题（PDF 由浏览器沙箱化查看器打开）。
 */
const ALLOWED_EXT = new Set([
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'heic', 'heif', 'tif', 'tiff',
  'pdf', 'ofd',
  'doc', 'docx', 'xls', 'xlsx', 'wps', 'et', 'dps', 'wpt',
  'txt', 'csv'
])

/** 能在页面上**直接预览**的图片格式（HEIC/TIFF 浏览器解不了，只能存 + 交给系统程序打开） */
const PREVIEWABLE_IMAGE = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'])
const MAX_SIZE = 20 * 1024 * 1024      // 20MB：开票资料/扫描件足够，再大就是拿错文件了

/**
 * 把名字变成安全的目录/文件名片段：去掉路径分隔符与 ..（防目录穿越），
 * 去掉控制字符与 Windows 非法字符；保留中文（他要靠中文认客户）。
 */
export function safeName(s, maxLen = 60) {
  return String(s || '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/\.{2,}/g, '.')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .trim()
    .slice(0, maxLen) || '未命名'
}

export const extOf = (name) => {
  const m = /\.([A-Za-z0-9]+)$/.exec(String(name || ''))
  return m ? m[1].toLowerCase() : ''
}

/**
 * 修正 multer 给的原始文件名里的**中文乱码**。
 *
 * 浏览器把 `filename="甲方开票资料.png"` 按 UTF-8 原始字节塞进 multipart 头，
 * 而 busboy 默认按 **latin1** 解码 ⇒ 拿到的是「ç”²æ–¹å¼€ç¥¨èµ„æ–™.png」这种串。
 * 别的上传功能看不出来，是因为它们把文件**重命名成序号**（图片1.png）就不管原名了；
 * 这份资料要**靠原名认人**（「XX公司开票资料.jpg」），所以必须还原。
 * 判据：latin1→utf8 重解后不含替换字符 U+FFFD 才算还原成功，否则保持原样（宁可留怪名也不能弄坏）。
 */
export function fixFileName(name) {
  const raw = String(name || '')
  if (!raw || /^[\x20-\x7e]*$/.test(raw)) return raw        // 纯 ASCII，不涉及
  const utf8 = Buffer.from(raw, 'latin1').toString('utf8')
  return utf8.includes('\uFFFD') ? raw : utf8
}

/** 归属目录：客户 → 公司资料/客户/<客户名>；自己公司 → 公司资料/自己公司/<主体名> */
export function ownerDir(ownerType, ownerName) {
  const sub = ownerType === 'self' ? '自己公司' : '客户'
  return path.join(DOCS_ROOT, sub, safeName(ownerName))
}

/** 库里的 file_path 存**相对于 DOCS_ROOT 的路径**（换机/换目录后仍然有效） */
const relOf = (abs) => path.relative(DOCS_ROOT, abs).split(path.sep).join('/')
const absOf = (rel) => path.join(DOCS_ROOT, ...String(rel || '').split('/'))

const stamp = () => {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const ownerType = req.query?.owner_type === 'self' ? 'self' : 'customer'
      // ⚠️ 清洗后的名字要**同时**用于目录和入库：只清洗目录会让库里存着 `../../x` 而文件夹叫别的，
      //    之后按库里的名字去查/删就对不上了（两套规则迟早漂移）。真实客户名不受影响（中文不会被改）。
      const ownerName = safeName(String(req.query?.owner_name || '').trim())
      const dir = ownerDir(ownerType, ownerName)
      try { fs.mkdirSync(dir, { recursive: true }) } catch {}
      req._docType = ownerType
      req._docOwner = ownerName
      req._docDir = dir
      cb(null, dir)
    },
    filename: (req, file, cb) => {
      const original = fixFileName(file.originalname)   // 中文文件名要还原（见 fixFileName 注释）
      const ext = extOf(original)
      const base = safeName(original.replace(/\.[^.]+$/, ''), 60)
      // 时间戳 + 4 位随机，避免同名覆盖；原名保留在前缀之后，方便肉眼认人
      const rnd = Math.random().toString(36).slice(2, 6)
      cb(null, `${stamp()}-${rnd}-${base}${ext ? '.' + ext : ''}`)
    }
  }),
  limits: { fileSize: MAX_SIZE, files: 9 },
  fileFilter: (_req, file, cb) => {
    const ext = extOf(fixFileName(file.originalname))
    if (!ALLOWED_EXT.has(ext)) {
      return cb(new Error(`不支持的文件类型 .${ext || '(无扩展名)'} —— 只收图片、PDF、Word、Excel、txt/csv`))
    }
    cb(null, true)
  }
})

const shape = (r) => ({
  id: r.id,
  owner_type: r.owner_type,
  owner_name: r.owner_name,
  category: r.category || '',
  title: r.title || r.file_name || '',
  file_name: r.file_name || '',
  file_path: r.file_path || '',
  ext: r.ext || '',
  size: r.size || 0,
  url: `/api/company-docs/file/${String(r.file_path || '').split('/').map(encodeURIComponent).join('/')}`,
  note: r.note || '',
  created_at: r.created_at || '',
  // is_image 只对**浏览器能直接渲染**的图片为真：HEIC/TIFF 也允许上传（iPhone 拍照/扫描件常见），
  // 但它们解不出来，界面要走「文件图标 + 用系统程序打开」，否则会显示成破图
  is_image: PREVIEWABLE_IMAGE.has(String(r.ext || '').toLowerCase())
})

// ===== 列表：某归属下的所有资料 =====
router.get('/docs', (req, res) => {
  const ownerType = req.query.owner_type === 'self' ? 'self' : 'customer'
  const ownerName = String(req.query.owner_name || '').trim()
  if (!ownerName) return res.status(400).json({ code: 1, msg: '缺少归属名（客户名或主体名）' })
  const rows = queryAll(
    `SELECT * FROM company_docs WHERE owner_type = ? AND owner_name = ? ORDER BY created_at DESC, id DESC`,
    [ownerType, ownerName]
  )
  res.json({ code: 0, data: rows.map(shape), categories: DOC_CATEGORIES })
})

// ===== 上传（可多文件；归属与分类走 query）=====
router.post('/upload', upload.array('files', 9), (req, res) => {
  if (!req.files || !req.files.length) return res.status(400).json({ code: 1, msg: '请选择文件' })
  const category = safeName(req.query?.category || '', 20)
  const note = String(req.query?.note || '').slice(0, 200)
  const out = []
  for (const f of req.files) {
    const original = fixFileName(f.originalname)   // 中文文件名还原（同上）
    const ext = extOf(original)
    const r = execute(
      `INSERT INTO company_docs (owner_type, owner_name, category, title, file_name, file_path, ext, size, mime, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req._docType, req._docOwner, category, original.slice(0, 200), original.slice(0, 200),
       relOf(f.path), ext, f.size || 0, f.mimetype || '', note]
    )
    out.push(shape(queryOne('SELECT * FROM company_docs WHERE id = ?', [r.lastInsertRowid])))
  }
  saveNow()
  res.json({ code: 0, data: out, msg: `已上传 ${out.length} 个文件` })
})

// ===== 删除（先删库、再删文件）=====
router.delete('/docs/:id', (req, res) => {
  const id = Number(req.params.id)
  const row = queryOne('SELECT * FROM company_docs WHERE id = ?', [id])
  if (!row) return res.status(404).json({ code: 1, msg: '资料不存在' })
  execute('DELETE FROM company_docs WHERE id = ?', [id])
  saveNow()
  // 文件删不掉（被占用/已手工删）不算失败：库里已经没有它了，界面不会再显示
  try { fs.unlinkSync(absOf(row.file_path)) } catch (e) { console.warn('[company-docs] 文件删除失败（不影响列表）:', e.message) }
  res.json({ code: 0, msg: '已删除' })
})

// ===== 汇总：自己公司主体（含各自资料数）+ 有哪些客户存过资料 =====
router.get('/summary', (_req, res) => {
  const companies = queryAll(`SELECT * FROM company_profiles ORDER BY is_default DESC, id`)
  const selfCounts = new Map(
    queryAll(`SELECT owner_name, COUNT(*) AS c FROM company_docs WHERE owner_type = 'self' GROUP BY owner_name`)
      .map(r => [r.owner_name, r.c])
  )
  const customers = queryAll(
    `SELECT owner_name, COUNT(*) AS c, MAX(created_at) AS latest_at FROM company_docs
      WHERE owner_type = 'customer' GROUP BY owner_name ORDER BY latest_at DESC`
  )
  res.json({
    code: 0,
    data: {
      companies: companies.map(c => ({ ...c, doc_count: selfCounts.get(c.name) || 0 })),
      customers: customers.map(r => ({ name: r.owner_name, doc_count: r.c, latest_at: r.latest_at || '' })),
      total: queryOne('SELECT COUNT(*) AS c FROM company_docs')?.c || 0,
      categories: DOC_CATEGORIES,
      allowed_ext: [...ALLOWED_EXT],      max_size_mb: Math.round(MAX_SIZE / 1024 / 1024)
    }
  })
})

// ===== 自己公司主体（多家抬头）=====
function normalizeCompany(b = {}) {
  const name = String(b.name || '').trim().slice(0, 60)
  if (!name) return { error: '主体名称不能为空' }
  return {
    data: {
      name,
      tax_no: String(b.tax_no || '').trim().slice(0, 40),
      address: String(b.address || '').trim().slice(0, 120),
      phone: String(b.phone || '').trim().slice(0, 60),
      bank: String(b.bank || '').trim().slice(0, 80),
      account: String(b.account || '').trim().slice(0, 60),
      remark: String(b.remark || '').trim().slice(0, 300),
      is_default: b.is_default ? 1 : 0
    }
  }
}

router.get('/companies', (_req, res) => {
  res.json({ code: 0, data: queryAll('SELECT * FROM company_profiles ORDER BY is_default DESC, id') })
})

router.post('/companies', (req, res) => {
  const { data, error } = normalizeCompany(req.body || {})
  if (error) return res.status(400).json({ code: 1, msg: error })
  // 设为默认时把别的取消掉（「默认」只能有一个，否则开票时不知道该用哪套）
  if (data.is_default) execute('UPDATE company_profiles SET is_default = 0')
  execute(
    `INSERT INTO company_profiles (name, tax_no, address, phone, bank, account, remark, is_default, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'))
     ON CONFLICT(name) DO UPDATE SET
       tax_no = excluded.tax_no, address = excluded.address, phone = excluded.phone,
       bank = excluded.bank, account = excluded.account, remark = excluded.remark,
       is_default = excluded.is_default, updated_at = excluded.updated_at`,
    [data.name, data.tax_no, data.address, data.phone, data.bank, data.account, data.remark, data.is_default]
  )
  saveNow()
  res.json({ code: 0, data: queryOne('SELECT * FROM company_profiles WHERE name = ?', [data.name]), msg: '已保存' })
})

router.delete('/companies/:id', (req, res) => {
  const id = Number(req.params.id)
  const row = queryOne('SELECT * FROM company_profiles WHERE id = ?', [id])
  if (!row) return res.status(404).json({ code: 1, msg: '主体不存在' })
  // 有资料就拦住：删主体不会删资料，会留下一堆没主的文件（界面上再也找不到）
  const c = queryOne(`SELECT COUNT(*) AS c FROM company_docs WHERE owner_type = 'self' AND owner_name = ?`, [row.name])?.c || 0
  if (c > 0) return res.status(409).json({ code: 1, msg: `「${row.name}」名下还有 ${c} 份资料，请先删掉资料再删主体（否则文件会变成没人认领的孤儿）` })
  execute('DELETE FROM company_profiles WHERE id = ?', [id])
  saveNow()
  res.json({ code: 0, msg: '已删除' })
})

export default router
