import { Router } from 'express'
import multer from 'multer'
import XLSX from 'xlsx'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { queryAll, queryOne, execute } from '../db.js'
import { exportMaterials } from '../utils/export.js'
import { triggerBackup } from '../utils/excelBackup.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const router = Router()

// 规格书目录（与 index.js 一致）
const specDir = path.join(process.env.DATA_DIR || path.join(__dirname, '..', '..'), '规格书')

// ========== 客户改名：规格书文件夹整组迁移 ==========
// 客户A改名/合并到B：迁移 规格书/客户物料/A/ → B/，并同步该客户全部物料的客户名 + 规格书引用
function renameCustomerFolder(oldName, newName) {
  if (!oldName || !newName || oldName === newName) return
  const cleanOld = String(oldName).replace(/[<>:"|?*\\/]/g, '_').trim() || '未命名客户'
  const cleanNew = String(newName).replace(/[<>:"|?*\\/]/g, '_').trim() || '未命名客户'
  if (cleanOld === cleanNew) return

  const oldDir = path.join(specDir, '客户物料', cleanOld)
  const newDir = path.join(specDir, '客户物料', cleanNew)

  // 1. 迁移文件夹内文件（同名复用，删除旧副本）
  if (fs.existsSync(oldDir)) {
    if (!fs.existsSync(newDir)) fs.mkdirSync(newDir, { recursive: true })
    for (const f of fs.readdirSync(oldDir)) {
      const sp = path.join(oldDir, f)
      const dp = path.join(newDir, f)
      if (fs.statSync(sp).isDirectory()) continue
      if (!fs.existsSync(dp)) fs.renameSync(sp, dp)
      else { try { fs.unlinkSync(sp) } catch {} }
    }
    // 清空后的旧文件夹删除
    try { if (!fs.readdirSync(oldDir).length) fs.rmdirSync(oldDir) } catch {}
  }

  // 2. 同步该客户全部物料：客户名 + 规格书引用（URL 中是 encodeURIComponent 后的路径）
  execute("UPDATE customer_materials SET customer = ? WHERE is_deleted = 0 AND customer = ?", [cleanNew, cleanOld])
  const oldPrefix = '/api/specs/' + encodeURIComponent('客户物料') + '/' + encodeURIComponent(cleanOld)
  const newPrefix = '/api/specs/' + encodeURIComponent('客户物料') + '/' + encodeURIComponent(cleanNew)
  const changed = execute(
    "UPDATE customer_materials SET spec_document = REPLACE(spec_document, ?, ?) WHERE is_deleted = 0 AND spec_document LIKE ?",
    [oldPrefix, newPrefix, oldPrefix + '%']
  )
  triggerBackup('materials')
  return { movedRows: changed?.changes ?? 0 }
}

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

// 搜索全系统所有客户名 + 支持物料型号/编码匹配
// 输入客户名 → 匹配客户；输入型号/编码 → 匹配到该物料所属客户
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
      -- 物料型号/编码匹配 → 返回所属客户
      UNION
      SELECT DISTINCT customer FROM customer_materials WHERE is_deleted = 0 AND customer IS NOT NULL AND customer != ''
        AND (customer_code LIKE ? OR jkx_code LIKE ? OR material_code LIKE ? OR material_name LIKE ? OR customer_desc LIKE ?)
      UNION
      SELECT DISTINCT first_inquiry_customer FROM material_prices WHERE is_deleted = 0 AND first_inquiry_customer IS NOT NULL AND first_inquiry_customer != ''
        AND (material_code LIKE ? OR material_spec LIKE ? OR material_name LIKE ? OR spec_document LIKE ?)
    ) src
    ORDER BY name ASC
    LIMIT 20
  `, [kw, kw, kw, kw, kw, kw, kw, kw, kw, kw, kw, kw, kw])
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
  const buffer = exportMaterials()
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
    triggerBackup('materials')
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

// 防重复：同客户下，客户物料编码/晶科鑫料号已存在则拦截（不同客户可以有相同料号）
function findMaterialDuplicate(b, excludeId = null) {
  const customer = String(b.customer || '').trim()
  const ccode = String(b.customer_code || '').trim()
  const jcode = String(b.jkx_code || '').trim()
  if (!customer || (!ccode && !jcode)) return null
  const base = ['is_deleted = 0', 'customer = ?']
  const baseParams = [customer]
  if (excludeId) { base.push('id != ?'); baseParams.push(excludeId) }
  if (ccode) {
    const row = queryOne(`SELECT * FROM customer_materials WHERE ${[...base, 'customer_code = ?'].join(' AND ')} LIMIT 1`, [...baseParams, ccode])
    if (row) return { msg: `该客户下「客户物料编码 ${ccode}」已存在，不能重复添加` }
  }
  if (jcode) {
    const row = queryOne(`SELECT * FROM customer_materials WHERE ${[...base, 'jkx_code = ?'].join(' AND ')} LIMIT 1`, [...baseParams, jcode])
    if (row) return { msg: `该客户下「晶科鑫料号 ${jcode}」已存在，不能重复添加` }
  }
  return null
}

// 新增
router.post('/', (req, res) => {
  const b = req.body
  // 同客户内客户物料编码/晶科鑫料号重复 → 拦截
  const dup = findMaterialDuplicate(b)
  if (dup) return res.status(400).json({ code: 1, msg: dup.msg })
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
  triggerBackup('materials')
  res.json({ code: 0, data: { id: r.lastInsertRowid } })
})

// 编辑
router.put('/:id', (req, res) => {
  const existing = queryOne('SELECT * FROM customer_materials WHERE id = ? AND is_deleted = 0', [Number(req.params.id)])
  if (!existing) return res.status(404).json({ code: 1, msg: '记录不存在' })

  const b = req.body
  // 编辑时同样校验：改了编码撞上同客户已有编码 → 拦截（排除自身；缺省字段用原值）
  const dup = findMaterialDuplicate({
    customer: b.customer ?? existing.customer,
    customer_code: b.customer_code ?? existing.customer_code,
    jkx_code: b.jkx_code ?? existing.jkx_code
  }, Number(req.params.id))
  if (dup) return res.status(400).json({ code: 1, msg: dup.msg })
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
  triggerBackup('materials')

  // 客户改名 → 规格书文件夹整组迁移 + 同步该客户全部物料
  let renameMsg = ''
  if (b.customer && b.customer !== existing.customer) {
    const info = renameCustomerFolder(existing.customer, b.customer)
    if (info) renameMsg = `，客户「${existing.customer}」的规格书已迁移到「${b.customer}」`
  }
  res.json({ code: 0, msg: '更新成功' + renameMsg })
})

// 删除
router.delete('/:id', (req, res) => {
  execute("UPDATE customer_materials SET is_deleted = 1, updated_at = datetime('now','localtime') WHERE id = ?", [Number(req.params.id)])
  triggerBackup('materials')
  res.json({ code: 0, msg: '删除成功' })
})

export default router
