import { Router } from 'express'
import { queryAll, queryOne, execute } from '../db.js'

const router = Router()

// 组合筛选解析
function parseMultiFilter(multiStr, alias = '') {
  const pfix = alias ? alias + '.' : ''
  const conditions = []; const params = []
  if (!multiStr) return { conditions, params }
  let filters = []
  try { filters = JSON.parse(multiStr) } catch { return { conditions, params } }
  const allowed = ['material_code','material_name','material_spec','category','brand','dimension','pin_count','frequency','load_cap','voltage','mode','freq_tol','temperature','price_with_tax','price_without_tax','currency','factory_code','quoter','standard_lead_time','min_package','first_inquiry_customer','remarks','created_at']
  for (const f of filters) {
    if (!f.field || !allowed.includes(f.field)) continue
    const col = pfix + f.field; const v = f.value || ''
    switch (f.op) {
      case 'contains': conditions.push(`${col} LIKE ?`); params.push(`%${v}%`); break
      case 'equals': conditions.push(`${col} = ?`); params.push(v); break
      case 'starts': conditions.push(`${col} LIKE ?`); params.push(`${v}%`); break
      case 'ends': conditions.push(`${col} LIKE ?`); params.push(`%${v}`); break
      case 'gt': conditions.push(`${col} > ?`); params.push(v); break
      case 'lt': conditions.push(`${col} < ?`); params.push(v); break
      case 'gte': conditions.push(`${col} >= ?`); params.push(v); break
      case 'lte': conditions.push(`${col} <= ?`); params.push(v); break
      case 'empty': conditions.push(`(${col} = '' OR ${col} IS NULL)`); break
      case 'nempty': conditions.push(`(${col} != '' AND ${col} IS NOT NULL)`); break
    }
  }
  return { conditions, params }
}

// GET 列表 + 搜索 + 筛选 + 分页
router.get('/', (req, res) => {
  const { page = 1, pageSize = 50, keyword, factory, quoter, currency, category, startDate, endDate, sortBy = 'created_at', sortOrder = 'DESC', multiFilter } = req.query
  const conditions = ['is_deleted = 0']
  const params = []
  if (keyword) {
    conditions.push('(material_code LIKE ? OR material_name LIKE ? OR material_spec LIKE ? OR brand LIKE ? OR category LIKE ? OR frequency LIKE ? OR dimension LIKE ? OR factory_code LIKE ? OR first_inquiry_customer LIKE ? OR remarks LIKE ?)')
    const kw = `%${keyword}%`
    for (let i = 0; i < 10; i++) params.push(kw)
  }
  if (factory) { conditions.push('factory_code = ?'); params.push(factory) }
  if (quoter) { conditions.push('quoter = ?'); params.push(quoter) }
  if (currency) { conditions.push('currency = ?'); params.push(currency) }
  if (category) { conditions.push('category = ?'); params.push(category) }
  if (startDate) { conditions.push('created_at >= ?'); params.push(startDate) }
  if (endDate) { conditions.push('created_at <= ?'); params.push(endDate + ' 23:59:59') }
  // 任意列精确筛选
  const filterColumns = ['brand','dimension','pin_count','frequency','load_cap','voltage','mode','freq_tol','standard_lead_time','material_code','first_inquiry_customer']
  for (const col of filterColumns) {
    if (req.query[col]) { conditions.push(`${col} = ?`); params.push(req.query[col]) }
  }
  // 文本列模糊筛选
  if (req.query.material_name) { conditions.push('material_name LIKE ?'); params.push(`%${req.query.material_name}%`) }
  if (req.query.material_spec) { conditions.push('material_spec LIKE ?'); params.push(`%${req.query.material_spec}%`) }
  // 组合筛选
  const mf = parseMultiFilter(multiFilter)
  conditions.push(...mf.conditions); params.push(...mf.params)
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const allowedSort = ['created_at','updated_at','material_code','material_name','category','price_with_tax','price_without_tax','factory_code','quoter','standard_lead_time','first_inquiry_customer']
  const validSort = allowedSort.includes(sortBy) ? sortBy : 'created_at'
  const validOrder = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC'
  const total = queryOne(`SELECT COUNT(*) as total FROM material_prices ${where}`, params)?.total ?? 0
  const offset = (Number(page) - 1) * Number(pageSize)
  const rows = queryAll(`SELECT * FROM material_prices ${where} ORDER BY ${validSort} ${validOrder} LIMIT ? OFFSET ?`, [...params, Number(pageSize), offset])
  res.json({ code: 0, data: { list: rows, total, page: Number(page), pageSize: Number(pageSize) } })
})

// GET 同款合并列表 — 13个技术字段相同的视为同款，只显示最低价那条完整记录（必须在 /:id 之前）
router.get('/grouped', (req, res) => {
  const { page = 1, pageSize = 50, keyword, factory, quoter, currency, category, startDate, endDate, multiFilter } = req.query
  const conditions = ['t.is_deleted = 0']
  const params = []
  if (keyword) {
    conditions.push('(t.material_code LIKE ? OR t.material_name LIKE ? OR t.material_spec LIKE ? OR t.brand LIKE ? OR t.category LIKE ? OR t.frequency LIKE ? OR t.dimension LIKE ? OR t.factory_code LIKE ? OR t.first_inquiry_customer LIKE ? OR t.remarks LIKE ?)')
    const kw = `%${keyword}%`
    for (let i = 0; i < 10; i++) params.push(kw)
  }
  if (factory) { conditions.push('t.factory_code = ?'); params.push(factory) }
  if (quoter) { conditions.push('t.quoter = ?'); params.push(quoter) }
  if (currency) { conditions.push('t.currency = ?'); params.push(currency) }
  if (category) { conditions.push('t.category = ?'); params.push(category) }
  if (startDate) { conditions.push('t.created_at >= ?'); params.push(startDate) }
  if (endDate) { conditions.push('t.created_at <= ?'); params.push(endDate + ' 23:59:59') }
  const filterColumns = ['brand','dimension','pin_count','frequency','load_cap','voltage','mode','freq_tol','standard_lead_time','material_code','first_inquiry_customer']
  for (const col of filterColumns) {
    if (req.query[col]) { conditions.push(`t.${col} = ?`); params.push(req.query[col]) }
  }
  if (req.query.material_name) { conditions.push('t.material_name LIKE ?'); params.push(`%${req.query.material_name}%`) }
  if (req.query.material_spec) { conditions.push('t.material_spec LIKE ?'); params.push(`%${req.query.material_spec}%`) }
  const mf2 = parseMultiFilter(multiFilter, 't')
  conditions.push(...mf2.conditions); params.push(...mf2.params)
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

  const matchCols = ['material_code','material_name','material_spec','category','brand','dimension','pin_count','frequency','load_cap','voltage','mode','freq_tol','temperature']
  const taxRate = Math.max(0, Math.min(100, Number(req.query.taxRate) || 13))
  const fxRate = Number(req.query.fxRate) || 7.25
  const normPrice = (alias) => `CASE WHEN ${alias}.currency='USD' THEN COALESCE(${alias}.price_without_tax, ${alias}.price_with_tax/(1+${taxRate}/100.0), 999999)*${fxRate} ELSE COALESCE(${alias}.price_without_tax, ${alias}.price_with_tax/(1+${taxRate}/100.0), 999999) END`
  const groupCols = matchCols.join(',')

  // 分组统计 + 逐条取最低价记录
  const total = queryOne(`SELECT COUNT(*) as total FROM (SELECT 1 FROM material_prices t ${where} GROUP BY ${groupCols})`, params)?.total ?? 0
  const offset = (Number(page) - 1) * Number(pageSize)
  const paged = queryAll(`SELECT ${groupCols}, COUNT(*) as rc, COUNT(DISTINCT NULLIF(factory_code,'')) as fc FROM material_prices t ${where} GROUP BY ${groupCols} ORDER BY MAX(t.created_at) DESC LIMIT ? OFFSET ?`, [...params, Number(pageSize), offset])
  const list = []
  for (const grp of paged) {
    const conds = ['is_deleted = 0', ...matchCols.map(c => `COALESCE(${c},'') = ?`)]
    const vals = matchCols.map(c => grp[c] ?? '')
    const orderExpr = normPrice('material_prices')
    const row = queryOne(`SELECT * FROM material_prices WHERE ${conds.join(' AND ')} ORDER BY ${orderExpr} ASC, id ASC LIMIT 1`, vals)
    if (row) { row.record_count = grp.rc; row.factory_count = grp.fc; list.push(row) }
  }
  res.json({ code: 0, data: { list, total, page: Number(page), pageSize: Number(pageSize) } })
})

// 筛选选项（必须在 /:id 之前）
router.get('/meta/options', (_req, res) => {
  const factories = queryAll('SELECT DISTINCT factory_code FROM material_prices WHERE is_deleted = 0 AND factory_code != ""').map(r => r.factory_code)
  const quoters = queryAll('SELECT DISTINCT quoter FROM material_prices WHERE is_deleted = 0 AND quoter != ""').map(r => r.quoter)
  const categories = queryAll("SELECT DISTINCT category FROM material_prices WHERE is_deleted = 0 AND category != '' ORDER BY category").map(r => r.category)
  res.json({ code: 0, data: { factories, quoters, categories } })
})

// 表单快捷建议（必须在 /:id 之前）
router.get('/form-suggestions', (_req, res) => {
  // 注意：key 命名与前端字段名一致，方便直接访问
  const category = queryAll("SELECT DISTINCT category FROM material_prices WHERE is_deleted = 0 AND category != '' ORDER BY category").map(r => r.category)
  const factory = queryAll("SELECT DISTINCT factory_code FROM material_prices WHERE is_deleted = 0 AND factory_code != '' ORDER BY factory_code").map(r => r.factory_code)
  const quoter = queryAll("SELECT DISTINCT quoter FROM material_prices WHERE is_deleted = 0 AND quoter != '' ORDER BY quoter").map(r => r.quoter)
  const leadTime = queryAll("SELECT DISTINCT standard_lead_time FROM material_prices WHERE is_deleted = 0 AND standard_lead_time != '' ORDER BY standard_lead_time").map(r => r.standard_lead_time)
  // 技术参数字段去重值（用于产品参数编辑联想）
  const brand = queryAll("SELECT DISTINCT brand FROM material_prices WHERE is_deleted = 0 AND brand != '' ORDER BY brand").map(r => r.brand)
  const dimension = queryAll("SELECT DISTINCT dimension FROM material_prices WHERE is_deleted = 0 AND dimension != '' ORDER BY dimension").map(r => r.dimension)
  const pin_count = queryAll("SELECT DISTINCT pin_count FROM material_prices WHERE is_deleted = 0 AND pin_count != '' ORDER BY pin_count").map(r => r.pin_count)
  const frequency = queryAll("SELECT DISTINCT frequency FROM material_prices WHERE is_deleted = 0 AND frequency != '' ORDER BY frequency").map(r => r.frequency)
  const load_cap = queryAll("SELECT DISTINCT load_cap FROM material_prices WHERE is_deleted = 0 AND load_cap != '' ORDER BY load_cap").map(r => r.load_cap)
  const voltage = queryAll("SELECT DISTINCT voltage FROM material_prices WHERE is_deleted = 0 AND voltage != '' ORDER BY voltage").map(r => r.voltage)
  const mode = queryAll("SELECT DISTINCT mode FROM material_prices WHERE is_deleted = 0 AND mode != '' ORDER BY mode").map(r => r.mode)
  const freq_tol = queryAll("SELECT DISTINCT freq_tol FROM material_prices WHERE is_deleted = 0 AND freq_tol != '' ORDER BY freq_tol").map(r => r.freq_tol)
  const temperature = queryAll("SELECT DISTINCT temperature FROM material_prices WHERE is_deleted = 0 AND temperature != '' ORDER BY temperature").map(r => r.temperature)
  res.json({ code: 0, data: { category, factory, quoter, leadTime, brand, dimension, pin_count, frequency, load_cap, voltage, mode, freq_tol, temperature } })
})

// 物料编码的价格变更日志
router.get('/price-logs/:code', (req, res) => {
  const rows = queryAll('SELECT * FROM price_logs WHERE material_code = ? ORDER BY changed_at DESC LIMIT 50', [req.params.code])
  res.json({ code: 0, data: rows })
})

// 按物料编码聚合（必须在 /:id 之前）
router.get('/by-material/:code', (req, res) => {
  const code = req.params.code
  const tfs = ['material_name','material_spec','category','brand','dimension','pin_count','frequency','load_cap','voltage','mode','freq_tol']
  const { keyword, factory, quoter, currency, category, startDate, endDate, multiFilter } = req.query
  // 有物料编码直接查，没有物料编码时需要其他筛选条件
  const hasOther = keyword || factory || quoter || currency || category || startDate || endDate || multiFilter ||
    tfs.some(f => req.query[f]) || ['standard_lead_time','first_inquiry_customer'].some(f => req.query[f])
  if (!hasOther && (!code || code === '_empty_')) return res.status(400).json({ code: 1, msg: '请指定筛选条件或选择记录' })
  const conditions = ['is_deleted = 0']; const params = []
  if (code && code !== '_empty_') { conditions.push('material_code = ?'); params.push(code) }
  for (const tf of tfs) {
    if (req.query[tf]) { conditions.push(`COALESCE(${tf},'') = ?`); params.push(req.query[tf]) }
  }
  const rows = queryAll(`SELECT * FROM material_prices WHERE ${conditions.join(' AND ')} ORDER BY factory_code, created_at DESC`, params)
  const grouped = {}
  for (const r of rows) {
    const key = r.factory_code || '未指定工厂'
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(r)
  }
  res.json({ code: 0, data: { code: code === '_empty_' ? '(无编码)' : code, total: rows.length, factories: grouped } })
})

// 物料编码查询（必须在 /:id 之前）
router.get('/lookup-material/:code', (req, res) => {
  const row = queryOne(`SELECT material_name, material_spec, category, brand, dimension, pin_count, frequency, load_cap, voltage, mode, freq_tol FROM material_prices WHERE material_code = ? AND is_deleted = 0 ORDER BY created_at DESC LIMIT 1`, [req.params.code])
  res.json({ code: 0, data: row || null })
})

// 获取指定列的所有不重复值（必须在 /:id 之前）
router.get('/column-values/:column', (req, res) => {
  const allowed = ['brand','dimension','pin_count','frequency','load_cap','voltage','mode','freq_tol','temperature','standard_lead_time','material_code','material_name','material_spec','first_inquiry_customer','factory_code','quoter','currency','category']
  const col = req.params.column
  if (!allowed.includes(col)) return res.status(400).json({ code: 1, msg: '无效的列名' })
  const keyword = req.query.keyword || ''
  let sql = `SELECT DISTINCT ${col} as value FROM material_prices WHERE is_deleted = 0 AND ${col} != ''`
  const p = []
  if (keyword) { sql += ` AND ${col} LIKE ?`; p.push(`%${keyword}%`) }
  sql += ` ORDER BY ${col} LIMIT 200`
  const rows = queryAll(sql, p)
  res.json({ code: 0, data: rows.map(r => r.value) })
})

// ===== 以下路由使用 :id 参数，必须放在最后 =====

// GET 详情
router.get('/:id', (req, res) => {
  const row = queryOne('SELECT * FROM material_prices WHERE id = ? AND is_deleted = 0', [Number(req.params.id)])
  if (!row) return res.status(404).json({ code: 1, msg: '记录不存在' })
  res.json({ code: 0, data: row })
})

// POST 新增
router.post('/', (req, res) => {
  const b = req.body
  const r = execute(`INSERT INTO material_prices (material_code,material_name,material_spec,category,brand,dimension,pin_count,frequency,load_cap,voltage,mode,freq_tol,temperature,price_with_tax,price_without_tax,currency,factory_code,quoter,standard_lead_time,min_package,spec_document,first_inquiry_customer,remarks) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [b.material_code||'',b.material_name||'',b.material_spec||'',b.category||'',b.brand||'',b.dimension||'',b.pin_count||'',b.frequency||'',b.load_cap||'',b.voltage||'',b.mode||'',b.freq_tol||'',b.temperature||'',b.price_with_tax??null,b.price_without_tax??null,b.currency||'CNY',b.factory_code||'',b.quoter||'',b.standard_lead_time||'',b.min_package||'',b.spec_document||'',b.first_inquiry_customer||'',b.remarks||''])
  res.json({ code: 0, data: { id: r.lastInsertRowid } })
})

// PUT 编辑
router.put('/:id', (req, res) => {
  const existing = queryOne('SELECT * FROM material_prices WHERE id = ? AND is_deleted = 0', [Number(req.params.id)])
  if (!existing) return res.status(404).json({ code: 1, msg: '记录不存在' })
  const fields = ['material_code','material_name','material_spec','category','brand','dimension','pin_count','frequency','load_cap','voltage','mode','freq_tol','temperature','price_with_tax','price_without_tax','currency','factory_code','quoter','standard_lead_time','min_package','spec_document','first_inquiry_customer','remarks']
  const sets = fields.map(f => `${f} = ?`)
  const values = fields.map(f => req.body[f] ?? existing[f])
  execute(`UPDATE material_prices SET updated_at = datetime('now','localtime'), ${sets.join(', ')} WHERE id = ?`, [...values, Number(req.params.id)])
  // 记录价格/币种变更日志
  const logFields = ['price_with_tax','price_without_tax','currency']
  for (const lf of logFields) {
    const ov = String(existing[lf] ?? ''); const nv = String(req.body[lf] ?? existing[lf] ?? '')
    if (ov !== nv) execute(`INSERT INTO price_logs (material_code,record_id,field_name,old_value,new_value) VALUES (?,?,?,?,?)`, [existing.material_code||'', Number(req.params.id), lf, ov, nv])
  }
  res.json({ code: 0, msg: '更新成功' })
})

// POST 批量更新同款产品技术参数
router.post('/batch-update-specs', (req, res) => {
  const b = req.body; const source = b.source || {}
  const { keyword, factory, quoter, currency, category, startDate, endDate, multiFilter } = b
  const matchCols = ['material_code','material_name','material_spec','category','brand','dimension','pin_count','frequency','load_cap','voltage','mode','freq_tol','temperature']
  const techFields = ['material_code','material_name','material_spec','category','brand','dimension','pin_count','frequency','load_cap','voltage','mode','freq_tol','temperature','spec_document']
  const hasFilter = keyword || factory || quoter || currency || category || startDate || endDate || multiFilter ||
    Object.keys(b).some(k => matchCols.includes(k) || ['standard_lead_time','first_inquiry_customer'].includes(k))
  if (!hasFilter) return res.status(400).json({ code: 1, msg: '请指定筛选条件或选择记录' })
  const conditions = ['is_deleted = 0']; const params = []
  // 只用 material_code 匹配（原匹配全部字段太严格，空字段稍微不对就更新0行）
  const mc = (source.material_code || '').trim()
  if (mc) {
    conditions.push('material_code = ?'); params.push(mc)
  } else if (source.id) {
    // 无编码：只更新当前这一条记录。不能匹配所有空编码记录——
    // 否则会把其他无编码的不同物料全部刷成表单里的编码+参数（数据被批量改写）
    conditions.push('id = ?'); params.push(source.id)
  } else {
    conditions.push('1 = 0')
  }
  const sets = techFields.map(f => `${f} = ?`); const vals = techFields.map(f => b[f] ?? source[f] ?? '')
  const result = execute(`UPDATE material_prices SET updated_at = datetime('now','localtime'), ${sets.join(', ')} WHERE ${conditions.join(' AND ')}`, [...vals, ...params])
  res.json({ code: 0, msg: `技术参数已批量更新（影响 ${result.changes} 行）` })
})

// POST 批量软删除（按条件）
router.post('/batch-delete', (req, res) => {
  const { ids, keyword, factory, quoter, currency, category, startDate, endDate, multiFilter } = req.body || {}
  // 方式1：按ID列表
  if (ids && Array.isArray(ids) && ids.length) {
    const placeholders = ids.map(() => '?').join(',')
    execute(`UPDATE material_prices SET is_deleted = 1, updated_at = datetime('now','localtime') WHERE id IN (${placeholders})`, ids)
    return res.json({ code: 0, msg: `已删除 ${ids.length} 条` })
  }
  // 方式2：按筛选条件
  const hasFilter = keyword || factory || quoter || currency || category || startDate || endDate || multiFilter || Object.keys(req.body).some(k => ['brand','dimension','pin_count','frequency','load_cap','voltage','mode','freq_tol','standard_lead_time','material_code','first_inquiry_customer','material_name','material_spec'].includes(k))
  if (!hasFilter) return res.status(400).json({ code: 1, msg: '请指定筛选条件或选择记录' })
  const conditions = ['is_deleted = 0']; const params = []
  if (keyword) { conditions.push('(material_code LIKE ? OR material_name LIKE ? OR material_spec LIKE ? OR brand LIKE ? OR category LIKE ? OR frequency LIKE ? OR dimension LIKE ? OR factory_code LIKE ? OR first_inquiry_customer LIKE ? OR remarks LIKE ?)'); const kw = `%${keyword}%`; for (let i=0;i<10;i++) params.push(kw) }
  if (factory) { conditions.push('factory_code = ?'); params.push(factory) }
  if (quoter) { conditions.push('quoter = ?'); params.push(quoter) }
  if (currency) { conditions.push('currency = ?'); params.push(currency) }
  if (category) { conditions.push('category = ?'); params.push(category) }
  if (startDate) { conditions.push('created_at >= ?'); params.push(startDate) }
  if (endDate) { conditions.push('created_at <= ?'); params.push(endDate + ' 23:59:59') }
  if (multiFilter) {
    const mf = parseMultiFilter(multiFilter)
    conditions.push(...mf.conditions); params.push(...mf.params)
  }
  // 列筛选参数（跟列表接口一致）
  const filterColumns = ['brand','dimension','pin_count','frequency','load_cap','voltage','mode','freq_tol','standard_lead_time','material_code','first_inquiry_customer']
  for (const col of filterColumns) {
    if (req.body[col]) { conditions.push(`${col} = ?`); params.push(req.body[col]) }
  }
  if (req.body.material_name) { conditions.push('material_name LIKE ?'); params.push(`%${req.body.material_name}%`) }
  if (req.body.material_spec) { conditions.push('material_spec LIKE ?'); params.push(`%${req.body.material_spec}%`) }
  const result = execute(`UPDATE material_prices SET is_deleted = 1, updated_at = datetime('now','localtime') WHERE ${conditions.join(' AND ')}`, params)
  res.json({ code: 0, msg: `已删除 ${result.changes} 条` })
})

// 回收站列表
router.get('/trash/list', (_req, res) => {
  const rows = queryAll('SELECT * FROM material_prices WHERE is_deleted = 1 ORDER BY updated_at DESC LIMIT 200')
  res.json({ code: 0, data: { list: rows, total: rows.length } })
})
// 恢复
router.post('/trash/restore/:id', (req, res) => {
  execute(`UPDATE material_prices SET is_deleted = 0, updated_at = datetime('now','localtime') WHERE id = ?`, [Number(req.params.id)])
  res.json({ code: 0, msg: '已恢复' })
})
// 清空回收站（批量彻底删除）
router.post('/trash/clear', (req, res) => {
  const ids = req.body?.ids
  if (ids && Array.isArray(ids) && ids.length) {
    const placeholders = ids.map(() => '?').join(',')
    execute(`DELETE FROM price_logs WHERE record_id IN (${placeholders})`, ids)
    execute(`DELETE FROM material_prices WHERE id IN (${placeholders})`, ids)
    return res.json({ code: 0, msg: `已彻底删除 ${ids.length} 条` })
  }
  const rows = queryAll('SELECT id FROM material_prices WHERE is_deleted = 1')
  const allIds = rows.map(r => r.id)
  if (allIds.length) {
    const placeholders = allIds.map(() => '?').join(',')
    execute(`DELETE FROM price_logs WHERE record_id IN (${placeholders})`, allIds)
  }
  const result = execute('DELETE FROM material_prices WHERE is_deleted = 1')
  res.json({ code: 0, msg: `已清空 ${result.changes} 条记录` })
})
// 彻底删除单条
router.delete('/trash/:id', (req, res) => {
  const id = Number(req.params.id)
  execute('DELETE FROM price_logs WHERE record_id = ?', [id])
  execute('DELETE FROM material_prices WHERE id = ?', [id])
  res.json({ code: 0, msg: '已彻底删除' })
})

// DELETE 软删除
router.delete('/:id', (req, res) => {
  execute(`UPDATE material_prices SET is_deleted = 1, updated_at = datetime('now','localtime') WHERE id = ?`, [Number(req.params.id)])
  res.json({ code: 0, msg: '删除成功' })
})

export default router
