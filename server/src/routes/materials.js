import { Router } from 'express'
import multer from 'multer'
import XLSX from 'xlsx'
import { queryAll, queryOne, execute } from '../db.js'

const router = Router()

// 状态列表（带颜色）
// 采购进度视觉色阶：询价(冷)→规格(蓝紫)→送样(青)→散单(橙)→批量(绿)
// 采用 Ant Design 标准色（色相分离明显、色弱友好、白底可读）
const STATUS_CONFIG = {
  '报价':   { color: '#1677ff', order: 0 },
  '规格书': { color: '#722ed1', order: 1 },
  '送样':   { color: '#13c2c2', order: 2 },
  '下散单': { color: '#fa8c16', order: 3 },
  '下批量': { color: '#52c41a', order: 4 }
}

// ========== 全系统客户联想 ==========

// 搜索全系统所有客户名（material_prices/notes/customers/map_customers/已有物料）
router.get('/customers/search', (req, res) => {
  const keyword = (req.query.keyword || '').trim()
  if (!keyword) return res.json({ code: 0, data: [] })
  const kw = `%${keyword}%`
  const rows = queryAll(`
    SELECT DISTINCT name, 0 as material_count FROM (
      SELECT name FROM customers WHERE name != '' AND name LIKE ?
      UNION
      SELECT DISTINCT customer FROM notes WHERE is_deleted = 0 AND customer IS NOT NULL AND customer != '' AND customer LIKE ?
      UNION
      SELECT DISTINCT first_inquiry_customer FROM material_prices WHERE is_deleted = 0 AND first_inquiry_customer IS NOT NULL AND first_inquiry_customer != '' AND first_inquiry_customer LIKE ?
      UNION
      SELECT DISTINCT name FROM map_customers WHERE name != '' AND name LIKE ?
      UNION
      SELECT DISTINCT customer FROM customer_materials WHERE is_deleted = 0 AND customer IS NOT NULL AND customer != '' AND customer LIKE ?
    ) src
    ORDER BY name ASC
    LIMIT 20
  `, [kw, kw, kw, kw, kw])
  res.json({ code: 0, data: rows })
})

// ========== CRUD ==========

// 列表 — 按客户筛选 + 搜索 + 状态/工厂/日期筛选 + 分页
router.get('/', (req, res) => {
  const { page = 1, pageSize = 50, keyword, status, customer, factory, start, end } = req.query
  const conditions = ['is_deleted = 0']
  const params = []

  if (customer) { conditions.push('customer = ?'); params.push(customer) }
  if (keyword) {
    conditions.push('(customer_code LIKE ? OR jkx_code LIKE ? OR material_code LIKE ? OR material_name LIKE ? OR customer_desc LIKE ? OR remark LIKE ?)')
    const kw = `%${keyword}%`
    params.push(kw, kw, kw, kw, kw, kw)
  }
  if (status) { conditions.push('status = ?'); params.push(status) }
  if (factory) { conditions.push('factory = ?'); params.push(factory) }
  if (start) { conditions.push('date >= ?'); params.push(start) }
  if (end) { conditions.push('date <= ?'); params.push(end) }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const total = queryOne(`SELECT COUNT(*) as total FROM customer_materials ${where}`, params)?.total ?? 0
  const offset = (Number(page) - 1) * Number(pageSize)

  const rows = queryAll(`
    SELECT * FROM customer_materials ${where}
    ORDER BY date DESC, updated_at DESC, id DESC
    LIMIT ? OFFSET ?
  `, [...params, Number(pageSize), offset]).map(parseAlternates)

  res.json({ code: 0, data: { list: rows, total, page: Number(page), pageSize: Number(pageSize) } })
})

// 获取有物料的客户列表（含物料数）
router.get('/customers/list', (_req, res) => {
  const rows = queryAll(`
    SELECT customer, COUNT(*) as material_count
    FROM customer_materials
    WHERE is_deleted = 0 AND customer IS NOT NULL AND customer != ''
    GROUP BY customer
    ORDER BY material_count DESC, customer ASC
    LIMIT 200
  `)
  res.json({ code: 0, data: rows })
})

// 获取工厂列表（去重，供筛选）
router.get('/factories/list', (req, res) => {
  const { customer } = req.query
  let sql = `SELECT DISTINCT factory FROM customer_materials WHERE is_deleted = 0 AND factory IS NOT NULL AND factory != ''`
  const params = []
  if (customer) { sql += ' AND customer = ?'; params.push(customer) }
  sql += ' ORDER BY factory ASC LIMIT 100'
  const rows = queryAll(sql, params)
  res.json({ code: 0, data: rows.map(r => r.factory) })
})

// 获取状态配置（前端查颜色）
router.get('/status-config', (_req, res) => {
  res.json({ code: 0, data: STATUS_CONFIG })
})

// ========== Excel 导入导出 ==========

// 导出 Excel（必须在 /:id 前注册，避免被匹配为 id）
router.get('/export', (_req, res) => {
  const rows = queryAll('SELECT * FROM customer_materials WHERE is_deleted = 0 ORDER BY customer ASC, created_at DESC')
  const data = rows.map(r => {
    let alternates = []
    try { alternates = JSON.parse(r.alternates || '[]') } catch {}
    return {
      '客户': r.customer || '',
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
      '备注': r.remark || '',
      '规格书': r.spec_document || '',
      '备选物料': alternates.map(a => [a.material_code || '', a.material_name || '', a.factory || '', a.cost_price || ''].join('@')).join(' | ')
    }
  })

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(data)
  ws['!cols'] = [
    { wch: 16 }, { wch: 12 }, { wch: 18 }, { wch: 18 }, { wch: 12 },
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
      // 解析备选物料列（格式：编码@名称@工厂@成本价 | 编码@名称@工厂@成本价）
      const alternates = String(row['备选物料'] || '')
        .split('|').map(s => s.trim()).filter(Boolean)
        .map(s => {
          const [material_code = '', material_name = '', factory = '', cost_price = ''] = s.split('@')
          return { material_code: material_code.trim(), material_name: material_name.trim(), factory: factory.trim(), cost_price: cost_price.trim() }
        }).filter(a => a.material_name || a.material_code || a.factory)

      execute(`
        INSERT INTO customer_materials (customer, date, customer_code, jkx_code, price, cost_price, material_code, material_name, factory, status, customer_desc, remark, alternates, spec_document)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        String(row['客户'] || ''),
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
        String(row['备注'] || ''),
        JSON.stringify(alternates),
        String(row['规格书'] || '')
      ])
      imported++
    }
    res.json({ code: 0, data: { count: imported }, msg: `成功导入 ${imported} 条记录` })
  } catch (e) {
    console.error('[materials-import]', e)
    res.status(500).json({ code: 1, msg: '导入失败: ' + e.message })
  }
})

// 解析备选物料 JSON
function parseAlternates(row) {
  if (!row) return row
  try { row.alternates = JSON.parse(row.alternates || '[]') } catch { row.alternates = [] }
  return row
}

// 详情
router.get('/:id', (req, res) => {
  const row = queryOne('SELECT * FROM customer_materials WHERE id = ? AND is_deleted = 0', [Number(req.params.id)])
  if (!row) return res.status(404).json({ code: 1, msg: '记录不存在' })
  res.json({ code: 0, data: parseAlternates(row) })
})

// 新增
router.post('/', (req, res) => {
  const b = req.body
  const alternates = Array.isArray(b.alternates)
    ? JSON.stringify(b.alternates.filter(a => a && (a.material_name || a.factory)))
    : '[]'
  const r = execute(`
    INSERT INTO customer_materials (customer, date, customer_code, jkx_code, price, cost_price, material_code, material_name, factory, status, customer_desc, remark, alternates, spec_document)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    b.customer || '',
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
    b.remark || '',
    alternates,
    b.spec_document || ''
  ])
  res.json({ code: 0, data: { id: r.lastInsertRowid } })
})

// 编辑
router.put('/:id', (req, res) => {
  const existing = queryOne('SELECT * FROM customer_materials WHERE id = ? AND is_deleted = 0', [Number(req.params.id)])
  if (!existing) return res.status(404).json({ code: 1, msg: '记录不存在' })

  const b = req.body
  const alternates = Array.isArray(b.alternates)
    ? JSON.stringify(b.alternates.filter(a => a && (a.material_name || a.factory)))
    : (existing.alternates || '[]')
  execute(`
    UPDATE customer_materials SET customer=?, date=?, customer_code=?, jkx_code=?, price=?, cost_price=?, material_code=?, material_name=?, factory=?, status=?, customer_desc=?, remark=?, alternates=?, spec_document=?, updated_at=datetime('now','localtime')
    WHERE id=?
  `, [
    b.customer ?? existing.customer,
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
    alternates,
    b.spec_document !== undefined ? b.spec_document : (existing.spec_document || ''),
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
