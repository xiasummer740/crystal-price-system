import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { queryAll, queryOne, execute } from '../db.js'
import { exportNotesPackage, generateNoteTemplate, importNotesFromZip } from '../utils/export.js'

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

// 返回已有客户名列表（去重、非空、按使用次数排序）
router.get('/customers/list', (_req, res) => {
  const rows = queryAll(`
    SELECT customer, COUNT(*) as cnt FROM notes
    WHERE is_deleted = 0 AND customer IS NOT NULL AND customer != ''
    GROUP BY customer ORDER BY cnt DESC LIMIT 200
  `)
  res.json({ code: 0, data: rows.map(r => r.customer) })
})

// 列表 + 搜索 + 分页
router.get('/', (req, res) => {
  const { page = 1, pageSize = 50, keyword, customer, category_id, status, priority, reminder } = req.query
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

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const total = queryOne(`SELECT COUNT(*) as total FROM notes n ${where}`, params)?.total ?? 0
  const offset = (Number(page) - 1) * Number(pageSize)

  const rows = queryAll(`
    SELECT n.*, c.name as category_name, c.color as category_color
    FROM notes n
    LEFT JOIN note_categories c ON n.category_id = c.id AND c.is_deleted = 0
    ${where}
    ORDER BY n.is_pinned DESC,
      CASE n.status WHEN 'todo' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'done' THEN 2 ELSE 3 END,
      n.updated_at DESC
    LIMIT ? OFFSET ?
  `, [...params, Number(pageSize), offset])

  res.json({ code: 0, data: { list: rows, total, page: Number(page), pageSize: Number(pageSize) } })
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
  res.json({ code: 0, data: rows })
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
  res.json({ code: 0, data: row })
})

// 新增
router.post('/', (req, res) => {
  const b = req.body
  const r = execute(`
    INSERT INTO notes (title, content, customer, category_id, images, reminder_at, priority, status, is_pinned)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    b.title || '未命名',
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
  execute(`
    UPDATE notes SET title=?, content=?, customer=?, category_id=?, images=?, reminder_at=?, priority=?, status=?, is_pinned=?, updated_at=datetime('now','localtime')
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
