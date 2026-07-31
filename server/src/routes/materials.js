import { Router } from 'express'
import multer from 'multer'
import XLSX from 'xlsx'
import { queryAll, queryOne, execute } from '../db.js'

const router = Router()

// 状态列表（带颜色）
const STATUS_CONFIG = {
  '报价':   { color: '#e53935', order: 0 },
  '规格书': { color: '#fb8c00', order: 1 },
  '送样':   { color: '#7b1fa2', order: 2 },
  '下散单': { color: '#1565c0', order: 3 },
  '下批量': { color: '#2e7d32', order: 4 }
}

// ========== CRUD ==========

// 列表 + 搜索 + 分页
router.get('/', (req, res) => {
  const { page = 1, pageSize = 50, keyword, status } = req.query
  const conditions = ['is_deleted = 0']
  const params = []

  if (keyword) {
    conditions.push('(customer_code LIKE ? OR jkx_code LIKE ? OR material_code LIKE ? OR material_name LIKE ? OR customer_desc LIKE ? OR remark LIKE ?)')
    const kw = `%${keyword}%`
    params.push(kw, kw, kw, kw, kw, kw)
  }
  if (status) { conditions.push('status = ?'); params.push(status) }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const total = queryOne(`SELECT COUNT(*) as total FROM customer_materials ${where}`, params)?.total ?? 0
  const offset = (Number(page) - 1) * Number(pageSize)

  const rows = queryAll(`
    SELECT * FROM customer_materials ${where}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `, [...params, Number(pageSize), offset])

  res.json({ code: 0, data: { list: rows, total, page: Number(page), pageSize: Number(pageSize) } })
})

// 获取状态配置（前端查颜色）
router.get('/status-config', (_req, res) => {
  res.json({ code: 0, data: STATUS_CONFIG })
})

// ========== Excel 导入导出 ==========

// 导出 Excel（必须在 /:id 前注册，避免被匹配为 id）
router.get('/export', (_req, res) => {
  const rows = queryAll('SELECT * FROM customer_materials WHERE is_deleted = 0 ORDER BY created_at DESC')
  const data = rows.map(r => ({
    '日期': r.date || '',
    '客户物料编码': r.customer_code || '',
    '晶科鑫料号': r.jkx_code || '',
    '报价': r.price || '',
    '成本价': r.cost_price || '',
    '物料编码': r.material_code || '',
    '物料名称': r.material_name || '',
    '工厂': r.factory || '',
    '状态': r.status || '',
    '客户描述': r.customer_desc || '',
    '备注': r.remark || ''
  }))

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(data)
  ws['!cols'] = [
    { wch: 12 }, { wch: 18 }, { wch: 18 }, { wch: 12 },
    { wch: 12 }, { wch: 18 }, { wch: 20 }, { wch: 14 },
    { wch: 10 }, { wch: 30 }, { wch: 30 }
  ]
  XLSX.utils.book_append_sheet(wb, ws, '客户物料')
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  const fn = '客户物料备份.xlsx'
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fn)}"; filename*=UTF-8''${encodeURIComponent(fn)}`)
  res.send(buffer)
})

// 导入 Excel（必须在 /:id 前注册）
const excelUpload = multer({ storage: multer.memoryStorage() })
router.post('/import', excelUpload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ code: 1, msg: '请选择文件' })
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const json = XLSX.utils.sheet_to_json(ws, { defval: '' })
    if (!json.length) return res.status(400).json({ code: 1, msg: '文件为空' })

    let imported = 0
    for (const row of json) {
      const dateRaw = row['日期'] || ''
      let dateStr = ''
      if (typeof dateRaw === 'number' && dateRaw > 40000) {
        const d = XLSX.SSF.parse_date_code(dateRaw)
        if (d) dateStr = `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`
      } else {
        dateStr = String(dateRaw)
      }
      execute(`
        INSERT INTO customer_materials (date, customer_code, jkx_code, price, cost_price, material_code, material_name, factory, status, customer_desc, remark)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        dateStr,
        String(row['客户物料编码'] || ''),
        String(row['晶科鑫料号'] || ''),
        String(row['报价'] || ''),
        String(row['成本价'] || ''),
        String(row['物料编码'] || ''),
        String(row['物料名称'] || ''),
        String(row['工厂'] || ''),
        String(row['状态'] || '报价'),
        String(row['客户描述'] || ''),
        String(row['备注'] || '')
      ])
      imported++
    }
    res.json({ code: 0, data: { count: imported }, msg: `成功导入 ${imported} 条记录` })
  } catch (e) {
    console.error('[materials-import]', e)
    res.status(500).json({ code: 1, msg: '导入失败: ' + e.message })
  }
})

// 详情
router.get('/:id', (req, res) => {
  const row = queryOne('SELECT * FROM customer_materials WHERE id = ? AND is_deleted = 0', [Number(req.params.id)])
  if (!row) return res.status(404).json({ code: 1, msg: '记录不存在' })
  res.json({ code: 0, data: row })
})

// 新增
router.post('/', (req, res) => {
  const b = req.body
  const r = execute(`
    INSERT INTO customer_materials (date, customer_code, jkx_code, price, cost_price, material_code, material_name, factory, status, customer_desc, remark)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    b.date || '',
    b.customer_code || '',
    b.jkx_code || '',
    b.price || '',
    b.cost_price || '',
    b.material_code || '',
    b.material_name || '',
    b.factory || '',
    b.status || '报价',
    b.customer_desc || '',
    b.remark || ''
  ])
  res.json({ code: 0, data: { id: r.lastInsertRowid } })
})

// 编辑
router.put('/:id', (req, res) => {
  const existing = queryOne('SELECT * FROM customer_materials WHERE id = ? AND is_deleted = 0', [Number(req.params.id)])
  if (!existing) return res.status(404).json({ code: 1, msg: '记录不存在' })

  const b = req.body
  execute(`
    UPDATE customer_materials SET date=?, customer_code=?, jkx_code=?, price=?, cost_price=?, material_code=?, material_name=?, factory=?, status=?, customer_desc=?, remark=?, updated_at=datetime('now','localtime')
    WHERE id=?
  `, [
    b.date ?? existing.date,
    b.customer_code ?? existing.customer_code,
    b.jkx_code ?? existing.jkx_code,
    b.price ?? existing.price,
    b.cost_price ?? existing.cost_price,
    b.material_code ?? existing.material_code,
    b.material_name ?? existing.material_name,
    b.factory ?? existing.factory,
    b.status ?? existing.status,
    b.customer_desc ?? existing.customer_desc,
    b.remark ?? existing.remark,
    Number(req.params.id)
  ])
  res.json({ code: 0, msg: '更新成功' })
})

// 删除
router.delete('/:id', (req, res) => {
  execute("UPDATE customer_materials SET is_deleted = 1, updated_at = datetime('now','localtime') WHERE id = ?", [Number(req.params.id)])
  res.json({ code: 0, msg: '删除成功' })
})

export default router
