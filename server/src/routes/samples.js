import { Router } from 'express'
import multer from 'multer'
import { queryAll, queryOne, execute } from '../db.js'
import { generateSampleTemplate, exportSamples, importSamplesFromExcel } from '../utils/export.js'

const router = Router()
const upload = multer({ storage: multer.memoryStorage() })

// 列表
router.get('/', (req, res) => {
  const { page=1, pageSize=50, keyword, factory, brand, sortBy='created_at', sortOrder='DESC' } = req.query
  const conditions = ['is_deleted = 0']
  const params = []
  if (keyword) { conditions.push('(material_code LIKE ? OR material_name LIKE ? OR brand LIKE ?)'); const kw=`%${keyword}%`; params.push(kw,kw,kw) }
  if (factory) { conditions.push('factory_code = ?'); params.push(factory) }
  if (brand) { conditions.push('brand = ?'); params.push(brand) }
  // 任意列精确筛选
  const filterColumns = ['dimension','pin_count','frequency','load_cap','voltage','mode','freq_tol','material_code','factory_code']
  for (const col of filterColumns) {
    if (req.query[col]) { conditions.push(`${col} = ?`); params.push(req.query[col]) }
  }
  if (req.query.material_name) { conditions.push('material_name LIKE ?'); params.push(`%${req.query.material_name}%`) }
  if (req.query.material_spec) { conditions.push('material_spec LIKE ?'); params.push(`%${req.query.material_spec}%`) }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const validSort = ['created_at','material_code','material_name','brand','price_with_tax','stock_quantity'].includes(sortBy) ? sortBy : 'created_at'
  const validOrder = sortOrder.toUpperCase()==='ASC' ? 'ASC' : 'DESC'
  const total = queryOne(`SELECT COUNT(*) as total FROM material_samples ${where}`, params)?.total ?? 0
  const offset = (Number(page)-1)*Number(pageSize)
  const rows = queryAll(`SELECT * FROM material_samples ${where} ORDER BY ${validSort} ${validOrder} LIMIT ? OFFSET ?`, [...params, Number(pageSize), offset])
  res.json({ code:0, data:{ list:rows, total, page:Number(page), pageSize:Number(pageSize) } })
})

// 筛选选项（必须在 /:id 之前）
router.get('/meta/options', (_req, res) => {
  const factories = queryAll('SELECT DISTINCT factory_code FROM material_samples WHERE is_deleted=0 AND factory_code!=""').map(r=>r.factory_code)
  const brands = queryAll('SELECT DISTINCT brand FROM material_samples WHERE is_deleted=0 AND brand!=""').map(r=>r.brand)
  res.json({ code:0, data:{ factories, brands } })
})

// 模板下载（必须在 /:id 之前）
router.get('/template', (_req, res) => {
  try {
    const buffer = generateSampleTemplate()
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    const fn = '样品导入模板.xlsx'
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fn)}"; filename*=UTF-8''${encodeURIComponent(fn)}`)
    res.send(buffer)
  } catch (e) { res.status(500).json({ code:1, msg:e.message }) }
})

// 导出（必须在 /:id 之前）
router.get('/export', (req, res) => {
  try {
    const buffer = exportSamples(req.query)
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    const fn = '样品登记.xlsx'
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fn)}"; filename*=UTF-8''${encodeURIComponent(fn)}`)
    res.send(buffer)
  } catch (e) { res.status(500).json({ code:1, msg:e.message }) }
})

// 导入
router.post('/import', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ code:1, msg:'请选择文件' })
    const count = importSamplesFromExcel(req.file.buffer)
    res.json({ code:0, data:{ count }, msg:`成功导入 ${count} 条记录` })
  } catch (e) { res.status(500).json({ code:1, msg:e.message }) }
})

// 列值查询
router.get('/column-values/:column', (req, res) => {
  const allowed = ['brand','dimension','pin_count','frequency','load_cap','voltage','mode','freq_tol','material_code','material_name','material_spec','factory_code']
  const col = req.params.column
  if (!allowed.includes(col)) return res.status(400).json({ code: 1, msg: '无效的列名' })
  const keyword = req.query.keyword || ''
  let sql = `SELECT DISTINCT ${col} as value FROM material_samples WHERE is_deleted = 0 AND ${col} != ''`
  const p = []
  if (keyword) { sql += ` AND ${col} LIKE ?`; p.push(`%${keyword}%`) }
  sql += ` ORDER BY ${col} LIMIT 200`
  const rows = queryAll(sql, p)
  res.json({ code: 0, data: rows.map(r => r.value) })
})

// 新增
router.post('/', (req, res) => {
  const b = req.body
  const r = execute(`INSERT INTO material_samples (material_code,material_name,material_spec,brand,dimension,pin_count,frequency,load_cap,voltage,mode,freq_tol,price_with_tax,cost_price,factory_code,stock_quantity,spec_document,remarks) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [b.material_code||'',b.material_name||'',b.material_spec||'',b.brand||'',b.dimension||'',b.pin_count||'',b.frequency||'',b.load_cap||'',b.voltage||'',b.mode||'',b.freq_tol||'',b.price_with_tax??null,b.cost_price??null,b.factory_code||'',b.stock_quantity??0,b.spec_document||'',b.remarks||''])
  res.json({ code:0, data:{ id:r.lastInsertRowid } })
})

// 详情（:id 必须放在最后）
router.get('/:id', (req, res) => {
  const row = queryOne('SELECT * FROM material_samples WHERE id=? AND is_deleted=0', [Number(req.params.id)])
  if (!row) return res.status(404).json({ code:1, msg:'记录不存在' })
  res.json({ code:0, data:row })
})

// 编辑
router.put('/:id', (req, res) => {
  const existing = queryOne('SELECT * FROM material_samples WHERE id=? AND is_deleted=0', [Number(req.params.id)])
  if (!existing) return res.status(404).json({ code:1, msg:'记录不存在' })
  const fields = ['material_code','material_name','material_spec','brand','dimension','pin_count','frequency','load_cap','voltage','mode','freq_tol','price_with_tax','cost_price','factory_code','stock_quantity','spec_document','remarks']
  const sets = fields.map(f=>`${f}=?`)
  const values = fields.map(f=>req.body[f]??existing[f])
  execute(`UPDATE material_samples SET updated_at=datetime('now','localtime'), ${sets.join(',')} WHERE id=?`, [...values, Number(req.params.id)])
  res.json({ code:0, msg:'更新成功' })
})

// 批量软删除
router.post('/batch-delete', (req, res) => {
  const { ids, keyword, factory, brand } = req.body || {}
  if (ids && Array.isArray(ids) && ids.length) {
    const placeholders = ids.map(() => '?').join(',')
    execute(`UPDATE material_samples SET is_deleted = 1, updated_at = datetime('now','localtime') WHERE id IN (${placeholders})`, ids)
    return res.json({ code: 0, msg: `已删除 ${ids.length} 条` })
  }
  const conditions = ['is_deleted = 0']; const params = []
  if (keyword) { conditions.push('(material_code LIKE ? OR material_name LIKE ? OR brand LIKE ?)'); const kw = `%${keyword}%`; params.push(kw,kw,kw) }
  if (factory) { conditions.push('factory_code = ?'); params.push(factory) }
  if (brand) { conditions.push('brand = ?'); params.push(brand) }
  const result = execute(`UPDATE material_samples SET is_deleted = 1, updated_at = datetime('now','localtime') WHERE ${conditions.join(' AND ')}`, params)
  res.json({ code: 0, msg: `已删除 ${result.changes} 条` })
})

// ===== 回收站 =====
router.get('/trash/list', (_req, res) => {
  const rows = queryAll('SELECT * FROM material_samples WHERE is_deleted = 1 ORDER BY updated_at DESC LIMIT 200')
  res.json({ code: 0, data: { list: rows, total: rows.length } })
})
router.post('/trash/restore/:id', (req, res) => {
  execute(`UPDATE material_samples SET is_deleted = 0, updated_at = datetime('now','localtime') WHERE id = ?`, [Number(req.params.id)])
  res.json({ code: 0, msg: '已恢复' })
})
router.post('/trash/clear', (req, res) => {
  const ids = req.body?.ids
  if (ids && Array.isArray(ids) && ids.length) {
    const placeholders = ids.map(() => '?').join(',')
    execute(`DELETE FROM material_samples WHERE id IN (${placeholders})`, ids)
    return res.json({ code: 0, msg: `已彻底删除 ${ids.length} 条` })
  }
  const result = execute('DELETE FROM material_samples WHERE is_deleted = 1')
  res.json({ code: 0, msg: `已清空 ${result.changes} 条记录` })
})
router.delete('/trash/:id', (req, res) => {
  execute('DELETE FROM material_samples WHERE id = ?', [Number(req.params.id)])
  res.json({ code: 0, msg: '已彻底删除' })
})

// 删除
router.delete('/:id', (req, res) => {
  execute(`UPDATE material_samples SET is_deleted=1, updated_at=datetime('now','localtime') WHERE id=?`, [Number(req.params.id)])
  res.json({ code:0, msg:'删除成功' })
})

export default router
