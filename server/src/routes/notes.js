import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { queryAll, queryOne, execute } from '../db.js'

// 统一处理：将「未命名」标题转为空，前端自行决定如何显示
function cleanNote(row) {
  if (row && row.title === '未命名') row.title = ''
  return row
}
import { exportNotesPackage, generateNoteTemplate, importNotesFromZip } from '../utils/export.js'
import XLSX from 'xlsx'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const router = Router()

// ========== 附件上传（图片+文件） ==========
const notesUploadDir = path.join(process.env.DATA_DIR || path.join(__dirname, '..', '..'), '记事图片库')
if (!fs.existsSync(notesUploadDir)) fs.mkdirSync(notesUploadDir, { recursive: true })

const fileUpload = multer({
  storage: multer.diskStorage({
    destination: notesUploadDir,
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || ''
      const base = path.basename(file.originalname, ext)
      // 保留原始文件名（防止中文/特殊字符丢失），前缀时间戳+随机串防冲突
      const safeBase = base.replace(/[<>:"/\\|?*]/g, '_').slice(0, 80)
      const name = Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '-' + safeBase + ext
      cb(null, name)
    }
  }),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
})

router.post('/upload', fileUpload.array('files', 9), (req, res) => {
  if (!req.files || !req.files.length) return res.status(400).json({ code: 1, msg: '请选择文件' })
  const urls = req.files.map(f => `/api/uploads/notes/${encodeURIComponent(f.filename)}`)
  res.json({ code: 0, data: urls })
})

// 删除已上传的附件
router.delete('/upload/:filename', (req, res) => {
  // 文件名可能被双重 URL 编码（服务端存中文 + 客户端 encodeURIComponent），解码还原
  let filename = decodeURIComponent(req.params.filename)
  // 防止路径遍历：只允许删除 uploads/notes 目录下的文件
  if (filename.includes('/') || filename.includes('\\') || filename === '' || filename === '.') {
    return res.status(400).json({ code: 1, msg: '非法的文件名' })
  }
  const filePath = path.join(notesUploadDir, filename)
  if (!fs.existsSync(filePath)) return res.status(404).json({ code: 1, msg: '文件不存在' })
  try { fs.unlinkSync(filePath); res.json({ code: 0, msg: '已删除' }) }
  catch (e) { res.status(500).json({ code: 1, msg: '删除失败' }) }
})

// ========== 导入导出 ==========

// 导出记事（含图片的 ZIP 包）
router.get('/export', async (req, res) => {
  try {
    const buffer = await exportNotesPackage(req.query)
    res.setHeader('Content-Type', 'application/zip')
    const fn = '记事便签导出.zip'
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fn)}"; filename*=UTF-8''${encodeURIComponent(fn)}`)
    res.send(buffer)
  } catch (e) {
    console.error('[notes-export]', e)
    res.status(500).json({ code: 1, msg: '导出失败: ' + e.message })
  }
})

// 下载导入模板
router.get('/template', (_req, res) => {
  try {
    const buffer = generateNoteTemplate()
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    const fn = '记事导入模板.xlsx'
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fn)}"; filename*=UTF-8''${encodeURIComponent(fn)}`)
    res.send(buffer)
  } catch (e) {
    console.error('[notes-template]', e)
    res.status(500).json({ code: 1, msg: '模板生成失败' })
  }
})

// 导入记事 ZIP
const importUpload = multer({ storage: multer.memoryStorage() })
router.post('/import', importUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ code: 1, msg: '请选择文件' })
    const count = await importNotesFromZip(req.file.buffer, notesUploadDir)
    res.json({ code: 0, data: { count }, msg: `成功导入 ${count} 条记事` })
  } catch (e) {
    console.error('[notes-import]', e)
    res.status(500).json({ code: 1, msg: '导入失败: ' + e.message })
  }
})

// ========== 记事 CRUD ==========

// 返回客户名列表（customers 表 + notes 表已有客户，去重合并）
router.get('/customers/list', (_req, res) => {
  const rows = queryAll(`
    SELECT name FROM customers WHERE name != ''
    UNION
    SELECT DISTINCT customer FROM notes WHERE is_deleted = 0 AND customer IS NOT NULL AND customer != ''
    ORDER BY name ASC LIMIT 500
  `)
  res.json({ code: 0, data: rows.map(r => r.name) })
})

// 搜索客户名（模糊搜索，附该客户的记事数）
router.get('/customers/search', (req, res) => {
  const keyword = (req.query.keyword || '').trim()
  if (!keyword) return res.json({ code: 0, data: [] })
  const kw = `%${keyword}%`
  const rows = queryAll(`
    SELECT c.name, COALESCE(n.cnt, 0) as note_count
    FROM (
      SELECT name FROM customers WHERE name != '' AND name LIKE ?
      UNION
      SELECT DISTINCT customer as name FROM notes WHERE is_deleted = 0 AND customer IS NOT NULL AND customer != '' AND customer LIKE ?
    ) c
    LEFT JOIN (
      SELECT customer, COUNT(*) as cnt FROM notes WHERE is_deleted = 0 AND customer IS NOT NULL AND customer != '' GROUP BY customer
    ) n ON c.name = n.customer
    ORDER BY n.cnt DESC, c.name ASC
    LIMIT 10
  `, [kw, kw])
  res.json({ code: 0, data: rows })
})

// 从 Excel 导入客户名（只导入"客户"列，去重）
const excelUpload = multer({ storage: multer.memoryStorage() })
router.post('/customers/import-excel', excelUpload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ code: 1, msg: '请选择文件' })
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const json = XLSX.utils.sheet_to_json(ws, { defval: '' })
    if (!json.length) return res.status(400).json({ code: 1, msg: '文件为空' })

    // 找客户列（优先 "客户" 列名，否则第一个文本列）
    const keys = Object.keys(json[0])
    const custKey = keys.find(k => k.includes('客户')) || keys[0]
    const names = [...new Set(json.map(r => String(r[custKey]).trim()).filter(Boolean))]

    let imported = 0
    for (const name of names) {
      try { execute('INSERT OR IGNORE INTO customers (name, source) VALUES (?, ?)', [name, 'excel']); imported++ }
      catch {}
    }
    res.json({ code: 0, data: { total: names.length, imported }, msg: `共 ${names.length} 个客户，导入 ${imported} 个` })
  } catch (e) {
    console.error('[import-customers]', e)
    res.status(500).json({ code: 1, msg: '导入失败: ' + e.message })
  }
})

// 列表 + 搜索 + 分页
router.get('/', (req, res) => {
  const { page = 1, pageSize = 50, keyword, customer, category_id, status, priority, reminder, start, end } = req.query
  const conditions = ['n.is_deleted = 0']
  const params = []

  if (keyword) {
    conditions.push('(n.title LIKE ? OR n.content LIKE ? OR n.customer LIKE ?)')
    const kw = `%${keyword}%`
    params.push(kw, kw, kw)
  }
  if (customer) { conditions.push('n.customer = ?'); params.push(customer) }
  if (category_id) { conditions.push('n.category_id = ?'); params.push(Number(category_id)) }
  if (status) { conditions.push('n.status = ?'); params.push(status) }
  if (priority) { conditions.push('n.priority = ?'); params.push(Number(priority)) }
  if (reminder === 'pending') { conditions.push('n.reminder_at IS NOT NULL AND n.is_reminded = 0') }
  if (start) { conditions.push('n.created_at >= ?'); params.push(start + ' 00:00:00') }
  if (end) { conditions.push('n.created_at <= ?'); params.push(end + ' 23:59:59') }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const total = queryOne(`SELECT COUNT(*) as total FROM notes n ${where}`, params)?.total ?? 0
  const offset = (Number(page) - 1) * Number(pageSize)

  const rows = queryAll(`
    SELECT n.*, c.name as category_name, c.color as category_color
    FROM notes n
    LEFT JOIN note_categories c ON n.category_id = c.id AND c.is_deleted = 0
    ${where}
    ORDER BY n.is_pinned DESC,
      CASE n.status WHEN 'todo' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'done' THEN 2 WHEN 'follow_up' THEN 3 ELSE 4 END,
      n.updated_at DESC
    LIMIT ? OFFSET ?
  `, [...params, Number(pageSize), offset])

  res.json({ code: 0, data: { list: rows.map(cleanNote), total, page: Number(page), pageSize: Number(pageSize) } })
})

// 查询到期提醒（供 Electron 轮询）
router.get('/reminders', (_req, res) => {
  const rows = queryAll(`
    SELECT n.*, c.name as category_name, c.color as category_color
    FROM notes n
    LEFT JOIN note_categories c ON n.category_id = c.id AND c.is_deleted = 0
    WHERE n.is_deleted = 0 AND n.is_reminded = 0
      AND n.reminder_at IS NOT NULL
      AND n.reminder_at <= datetime('now','localtime')
    ORDER BY n.reminder_at ASC
  `)
  res.json({ code: 0, data: rows.map(cleanNote) })
})

// 标记已提醒
router.post('/:id/reminded', (req, res) => {
  execute('UPDATE notes SET is_reminded = 1, updated_at = datetime(\'now\',\'localtime\') WHERE id = ?', [Number(req.params.id)])
  res.json({ code: 0, msg: '已标记提醒' })
})

// 详情
router.get('/:id', (req, res) => {
  const row = queryOne(`
    SELECT n.*, c.name as category_name, c.color as category_color
    FROM notes n
    LEFT JOIN note_categories c ON n.category_id = c.id AND c.is_deleted = 0
    WHERE n.id = ? AND n.is_deleted = 0
  `, [Number(req.params.id)])
  if (!row) return res.status(404).json({ code: 1, msg: '记录不存在' })
  res.json({ code: 0, data: cleanNote(row) })
})

// 新增
router.post('/', (req, res) => {
  const b = req.body
  const r = execute(`
    INSERT INTO notes (title, content, customer, category_id, images, reminder_at, priority, status, is_pinned)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    b.title || '',
    b.content || '',
    b.customer || '',
    b.category_id || 0,
    JSON.stringify(b.images || []),
    b.reminder_at || null,
    b.priority ?? 2,
    b.status || 'todo',
    b.is_pinned ? 1 : 0
  ])
  res.json({ code: 0, data: { id: r.lastInsertRowid } })
})

// 编辑
router.put('/:id', (req, res) => {
  const existing = queryOne('SELECT * FROM notes WHERE id = ? AND is_deleted = 0', [Number(req.params.id)])
  if (!existing) return res.status(404).json({ code: 1, msg: '记录不存在' })

  const b = req.body
  // 内容或状态有变化 → 保存旧版本到 updates 历史
  // _updatesOverride: 前端已修改 updates 数组（如编辑历史记录），直接使用不做额外推送
  if (b._updatesOverride !== undefined) {
    b._updates = b._updatesOverride
  } else {
    const contentChanged = b.content !== undefined && b.content !== existing.content
    const statusChanged = b.status !== undefined && b.status !== existing.status
    if (contentChanged || statusChanged) {
      let updates = []
      try { updates = JSON.parse(existing.updates || '[]') } catch {}
      updates.push({
        time: existing.updated_at,
        content: existing.content || '',
        status: existing.status || 'todo'
      })
      // 只保留最近 50 条，防止无限增长
      if (updates.length > 50) updates = updates.slice(-50)
      b._updates = JSON.stringify(updates)
    }
  }

  execute(`
    UPDATE notes SET title=?, content=?, customer=?, category_id=?, images=?, reminder_at=?, priority=?, status=?, is_pinned=?, updates=?, updated_at=datetime('now','localtime')
    WHERE id=?
  `, [
    b.title ?? existing.title,
    b.content ?? existing.content,
    b.customer ?? existing.customer,
    b.category_id ?? existing.category_id,
    b.images ? JSON.stringify(b.images) : existing.images,
    b.reminder_at !== undefined ? b.reminder_at : existing.reminder_at,
    b.priority ?? existing.priority,
    b.status ?? existing.status,
    b.is_pinned !== undefined ? (b.is_pinned ? 1 : 0) : existing.is_pinned,
    b._updates ?? existing.updates ?? '[]',
    Number(req.params.id)
  ])
  res.json({ code: 0, msg: '更新成功' })
})

// 软删除
router.delete('/:id', (req, res) => {
  execute("UPDATE notes SET is_deleted = 1, updated_at = datetime('now','localtime') WHERE id = ?", [Number(req.params.id)])
  res.json({ code: 0, msg: '删除成功' })
})

// 批量删除
router.post('/batch-delete', (req, res) => {
  const { ids } = req.body || {}
  if (ids && Array.isArray(ids) && ids.length) {
    const placeholders = ids.map(() => '?').join(',')
    execute(`UPDATE notes SET is_deleted = 1, updated_at = datetime('now','localtime') WHERE id IN (${placeholders})`, ids)
    return res.json({ code: 0, msg: `已删除 ${ids.length} 条` })
  }
  res.json({ code: 1, msg: '参数错误' })
})

// ========== 事项类型 CRUD ==========

router.get('/categories/list', (_req, res) => {
  const rows = queryAll('SELECT * FROM note_categories WHERE is_deleted = 0 ORDER BY sort_order ASC, id ASC')
  res.json({ code: 0, data: rows })
})

router.post('/categories', (req, res) => {
  const b = req.body
  if (!b.name) return res.status(400).json({ code: 1, msg: '名称不能为空' })
  const r = execute('INSERT INTO note_categories (name, color, sort_order) VALUES (?, ?, ?)', [
    b.name, b.color || '#1989fa', b.sort_order ?? 0
  ])
  res.json({ code: 0, data: { id: r.lastInsertRowid } })
})

router.put('/categories/:id', (req, res) => {
  const existing = queryOne('SELECT * FROM note_categories WHERE id = ? AND is_deleted = 0', [Number(req.params.id)])
  if (!existing) return res.status(404).json({ code: 1, msg: '类型不存在' })
  const b = req.body
  execute('UPDATE note_categories SET name=?, color=?, sort_order=? WHERE id=?', [
    b.name ?? existing.name,
    b.color ?? existing.color,
    b.sort_order ?? existing.sort_order,
    Number(req.params.id)
  ])
  res.json({ code: 0, msg: '更新成功' })
})

router.delete('/categories/:id', (req, res) => {
  const id = Number(req.params.id)
  // 将使用该类型的记事设为未分类
  execute('UPDATE notes SET category_id = 0 WHERE category_id = ?', [id])
  execute('UPDATE note_categories SET is_deleted = 1 WHERE id = ?', [id])
  res.json({ code: 0, msg: '删除成功' })
})

export default router
