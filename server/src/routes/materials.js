import { Router } from 'express'
import multer from 'multer'
import XLSX from 'xlsx'
import fs from 'fs'
import path from 'path'
import { queryAll, queryOne, execute } from '../db.js'
import { exportMaterials } from '../utils/export.js'
import { STATUS_CONFIG } from '../utils/materialStatus.js'
import { pageParams } from '../utils/paging.js'
import { triggerBackup } from '../utils/excelBackup.js'
import * as A from '../utils/customerArchive.js'

const router = Router()

// ========== 客户物料备注图片/文件上传（微信粘贴报价原始记录） ==========
// 落位：客户管理/<客户>/物料图片/ —— 客户名走 query，路径由路径助手算
const materialFileUpload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const customer = String(req.query?.customer || '').trim()
      const dir = A.customerImageDirAbs(customer)   // 客户为空 → _未分配客户
      A.ensureDir(dir)
      req._imgCustomer = customer
      cb(null, dir)
    },
    filename: (_req, file, cb) => {
      // A.safeFilename 先修 Windows 下 busboy 把 UTF-8 当 Latin-1 读出来的中文乱码，再净化非法字符。
      // 归档目录是给人翻的，文件名不能是「å¤‡æ³¨å›¾」这种。
      const safe = A.safeFilename(file.originalname, 'file')
      const ext = A.extOf(safe)
      const base = safe.slice(0, safe.length - ext.length).slice(0, 80)
      cb(null, Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '-' + base + ext)
    }
  }),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
})

// 备注附件上传
router.post('/upload', materialFileUpload.array('files', 9), (req, res) => {
  if (!req.files || !req.files.length) return res.status(400).json({ code: 1, msg: '请选择文件' })
  const urls = req.files.map(f => A.customerImageUrl(req._imgCustomer, f.filename))
  res.json({ code: 0, data: urls })
})

// 删除已上传的备注附件
// 现在文件在多层目录里，裸文件名不再够用 —— 必须传完整归档 URL，解析回磁盘路径再删。
// resolveUrl 会挡掉路径遍历、绝对路径、NTFS 数据流，并校验结果落在数据目录内。
router.delete('/upload', (req, res) => {
  const hit = A.resolveUrl(req.query?.url)
  if (!hit) return res.status(400).json({ code: 1, msg: '非法的文件路径' })
  if (!fs.existsSync(hit.abs)) return res.status(404).json({ code: 1, msg: '文件不存在' })
  try { fs.unlinkSync(hit.abs); res.json({ code: 0, msg: '已删除' }) }
  catch (e) { res.status(500).json({ code: 1, msg: '删除失败' }) }
})

// ========== 客户改名：整个客户目录整组迁移 ==========
// 客户A改名/合并到B：把 客户管理/A/ 整个搬到 客户管理/B/（规格书 + 物料图片 + 记事），
// 并同步该客户全部物料/记事的客户名 + 三类文件引用。
// 合并到已有客户时：同名文件保留目标已有的，删掉源副本。

/** 递归搬目录内容到目标（目标已有同名文件则保留已有的，删源副本） */
function moveInto(srcDir, destDir) {
  for (const e of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const s = path.join(srcDir, e.name), d = path.join(destDir, e.name)
    if (e.isDirectory()) {
      fs.mkdirSync(d, { recursive: true })
      moveInto(s, d)
      try { if (!fs.readdirSync(s).length) fs.rmdirSync(s) } catch {}
    } else if (fs.existsSync(d)) {
      try { fs.unlinkSync(s) } catch {}
    } else {
      // 跨盘 / 文件被占用会失败 —— 留原地不报错，下次启动 syncArchive 会把它捞回来
      try { fs.renameSync(s, d) } catch {}
    }
  }
}

function renameCustomerFolder(oldName, newName) {
  if (!oldName || !newName || oldName === newName) return
  const oldFolder = A.customerFolder(oldName)
  const newFolder = A.customerFolder(newName)
  if (oldFolder === newFolder) return

  // 1. 整个客户目录搬家
  const oldDir = A.customerDirAbs(oldName)
  const newDir = A.customerDirAbs(newName)
  let listFile = null
  if (fs.existsSync(oldDir)) {
    A.ensureDir(newDir)
    moveInto(oldDir, newDir)
    try { if (!fs.readdirSync(oldDir).length) fs.rmdirSync(oldDir) } catch {}
    // 物料清单得跟着改名：moveInto 是连文件名一起原样搬的，不归位的话
    // 新目录里会顶着旧客户/被合并客户的名字，等下次启动 syncArchive 才修（那之前只有这一份）。
    // 失败不留空手：下次启动 syncArchive 会再修一遍，这里负责把话带给用户。
    try { listFile = A.normalizeArchiveList(newDir, A.archiveListName(newName)) }
    catch (e) { listFile = { error: e.message } }
  }

  // 2. 同步客户名（DB 存原始名，文件夹名才是 sanitize 过的）
  let moved = 0
  moved += execute("UPDATE customer_materials SET customer = ? WHERE is_deleted = 0 AND customer = ?", [newName, oldName])?.changes ?? 0
  moved += execute("UPDATE notes SET customer = ? WHERE is_deleted = 0 AND customer = ?", [newName, oldName])?.changes ?? 0

  // 3. 文件引用改前缀。
  // 🔴 必须用 encodeURIComponent 后的文件夹名去比：库里存的是 percent-encoded 的 URL，
  //    拿未编码的中文前缀 LIKE 去匹配永远为真/永远匹配不上（旧代码就是这么失效的）。
  const fromPfx = '/api/cust/' + encodeURIComponent(oldFolder) + '/'
  const toPfx = '/api/cust/' + encodeURIComponent(newFolder) + '/'
  for (const [table, col] of [
    ['customer_materials', 'spec_document'],
    ['customer_materials', 'remark_images'],
    ['notes', 'images']
  ]) {
    moved += execute(
      `UPDATE ${table} SET ${col} = REPLACE(${col}, ?, ?) WHERE is_deleted = 0 AND ${col} LIKE ?`,
      [fromPfx, toPfx, '%' + fromPfx + '%']
    )?.changes ?? 0
  }

  triggerBackup('materials')
  return { movedRows: moved, listFile }
}

// 状态清单已挪到 utils/materialStatus.js（全系统唯一来源，含 color/order）。
// 这里只引用，不再抄第三份 —— 抄本越多，加状态时漏改的地方越多，而且不报错。

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

// 可点表头排序的列（白名单，防 SQL 注入：只放真实列名，前端传别的就退回默认排序）
const SORTABLE_COLS = new Set([
  'date', 'customer_code', 'jkx_code', 'price', 'cost_price',
  'material_code', 'material_name', 'factory', 'status', 'customer_desc', 'remark'
])

// —— 排序列表达式 ——
// 三类列各有各的坑。统一原则：取不到「有意义的值」就返回 NULL，由 ORDER BY 的 NULLS LAST 沉底。
// 沉底是「看得见的」——用户能看出这条没参与排序；折成 0 是「看不见的」——排错了也毫无提示。

// ① 普通文本列：空串当没值。否则升序时一屏全是空备注/空名称，看着像排序坏了。
const EMPTY_AS_NULL = (col) => `NULLIF(TRIM(${col}), '')`

// ② 报价/成本价：库里存的是 TEXT，直接 ORDER BY 是字符串序（"100" < "9"）。
//    先剥掉货币符号/千分位/全角空格，再确认「长得像数字」才 CAST。
//    不像数字的（"面议"、"1.5~2"）绝不能 CAST —— SQLite 会静默折成 0，
//    那会让「￥100」排到「9」前面，用户根本看不出排错了。
const PRICE_VALUE = (col) => {
  const n = `REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(${col}), '￥', ''), '¥', ''), '元', ''), ',', ''), '　', '')`
  return `CASE WHEN ${n} GLOB '*[0-9]*' AND ${n} NOT GLOB '*[^0-9.]*' THEN CAST(${n} AS REAL) END`
}

// ③ 状态列：按业务流转顺序（报价→规格书→送样→下散单→下批量），不是按汉字编码 ——
//    后者排出来跟生命周期/颜色阶完全无关，用户点了会以为是 bug。顺序取自上面的 STATUS_CONFIG。
const STATUS_VALUE = `CASE TRIM(status) ${
  Object.entries(STATUS_CONFIG).map(([k, v]) => `WHEN '${k}' THEN ${v.order}`).join(' ')
} ELSE 99 END`

const NUMERIC_SORT_COLS = new Set(['price', 'cost_price'])
function sortExprOf(col) {
  if (NUMERIC_SORT_COLS.has(col)) return PRICE_VALUE(col)
  if (col === 'status') return STATUS_VALUE
  return EMPTY_AS_NULL(col)
}

// 列表 — 按客户筛选 + 搜索 + 状态/工厂/日期筛选 + 排序 + 分页
router.get('/', (req, res) => {
  const { keyword, status, customer, factory, start, end, sort, order } = req.query
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
  const pg = pageParams(req.query)

  // 未指定排序时保持原行为；指定了才按白名单列排序（sort/order 都经校验，不可注入）
  // 每个表达式都可能产出 NULL（空值/不是数字），一律 NULLS LAST 沉底；
  // 注意 NULLS LAST 是排序方向的子句，必须写在 ASC/DESC 后面，不能跟在表达式后面
  const orderBy = SORTABLE_COLS.has(sort)
    ? `${sortExprOf(sort)} ${String(order).toLowerCase() === 'asc' ? 'ASC' : 'DESC'} NULLS LAST, id DESC`
    : 'date DESC, updated_at DESC, id DESC'

  const rows = queryAll(`
    SELECT * FROM customer_materials ${where}
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `, [...params, pg.pageSize, pg.offset]).map(parseAlternates)

  res.json({ code: 0, data: { list: rows, total, page: pg.page, pageSize: pg.pageSize } })
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
  // full：文件名就叫「备份」，且配套的 /import 会读「规格书」「备选物料」两列 ——
  // 这里少给两列，用户导出再导入就会把这两项清空。归档用的 11 列表不走这条路。
  const buffer = exportMaterials('', { full: true })
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

// 解析备选物料 + 备注图片 JSON
function parseAlternates(row) {
  if (!row) return row
  try { row.alternates = JSON.parse(row.alternates || '[]') } catch { row.alternates = [] }
  try { row.remark_images = JSON.parse(row.remark_images || '[]') } catch { row.remark_images = [] }
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
  const remarkImages = Array.isArray(b.remark_images) ? JSON.stringify(b.remark_images) : '[]'
  const r = execute(`
    INSERT INTO customer_materials (customer, date, customer_code, jkx_code, price, cost_price, material_code, material_name, factory, status, customer_desc, remark, alternates, spec_document, remark_images)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    b.spec_document || '',
    remarkImages
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
  const remarkImages = Array.isArray(b.remark_images) ? JSON.stringify(b.remark_images) : (existing.remark_images || '[]')
  execute(`
    UPDATE customer_materials SET customer=?, date=?, customer_code=?, jkx_code=?, price=?, cost_price=?, material_code=?, material_name=?, factory=?, status=?, customer_desc=?, remark=?, alternates=?, spec_document=?, remark_images=?, updated_at=datetime('now','localtime')
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
    remarkImages,
    Number(req.params.id)
  ])
  triggerBackup('materials')

  // 客户改名 → 整个客户目录整组迁移 + 同步该客户全部物料/记事
  let renameMsg = ''
  if (b.customer && b.customer !== existing.customer) {
    const info = renameCustomerFolder(existing.customer, b.customer)
    if (info) {
      renameMsg = `，客户「${existing.customer}」的资料已迁移到「${b.customer}」`
      // 物料清单没归位就说出来 —— 下个启动会再修一遍，但不告诉用户等于没说
      if (info.listFile?.error) renameMsg += `（⚠️ 物料清单改名失败将下次启动重试：${info.listFile.error}）`
      else if (info.listFile?.kept?.length) renameMsg += `（⚠️ 物料清单有旧文件未覆盖，请人工确认：${info.listFile.kept.join('、')}）`
    }
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
