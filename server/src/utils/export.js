import XLSX from 'xlsx'
import JSZip from 'jszip'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { queryAll, queryOne, executeBatch, saveNow } from '../db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// 解析 Excel 中的「登记时间」单元格，返回 SQLite 'YYYY-MM-DD HH:mm:ss' 格式
// 支持：JS Date / Excel 数字序列号 / ISO 字符串 / 中文 'YYYY年MM月DD日 HH:mm' / 'YYYY/MM/DD' / 空
// 不合法 → 返回 null（调用方决定是否回落到 now）
function parseExcelDate(v) {
  if (v === undefined || v === null || v === '') return null
  // Date 对象（xlsx 启用 cellDates 时会自动转换；此处保险兼容）
  if (v instanceof Date && !isNaN(v.getTime())) return formatLocal(v)
  // Excel 数字序列号：以 1899-12-30 为基准
  if (typeof v === 'number' && isFinite(v)) {
    const ms = Math.round((v - 25569) * 86400 * 1000)
    const d = new Date(ms)
    if (!isNaN(d.getTime())) return formatLocal(d)
    return null
  }
  const s = String(v).trim()
  if (!s) return null
  // 中文格式 → 替换为 ISO 风格
  const norm = s
    .replace(/年|月/g, '-')
    .replace(/日/g, ' ')
    .replace(/\//g, '-')
    .replace(/\s+/g, ' ')
    .trim()
  const d = new Date(norm)
  if (!isNaN(d.getTime())) return formatLocal(d)
  return null
}

function formatLocal(d) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

// ===== 报价导入导出 =====

export function exportToExcel(query = {}) {
  const { keyword, factory, quoter, currency, category, startDate, endDate, multiFilter } = query
  const conditions = ['is_deleted = 0']
  const params = []
  if (keyword) { conditions.push('(material_code LIKE ? OR material_name LIKE ? OR material_spec LIKE ? OR first_inquiry_customer LIKE ?)'); const kw=`%${keyword}%`; params.push(kw,kw,kw,kw) }
  if (factory) { conditions.push('factory_code = ?'); params.push(factory) }
  if (quoter) { conditions.push('quoter = ?'); params.push(quoter) }
  if (currency) { conditions.push('currency = ?'); params.push(currency) }
  if (category) { conditions.push('category = ?'); params.push(category) }
  if (startDate) { conditions.push('created_at >= ?'); params.push(startDate) }
  if (endDate) { conditions.push('created_at <= ?'); params.push(endDate + ' 23:59:59') }
  // 列筛选
  const filterColumns = ['brand','dimension','pin_count','frequency','load_cap','voltage','mode','freq_tol','standard_lead_time','material_code','first_inquiry_customer']
  for (const col of filterColumns) {
    if (query[col]) { conditions.push(`${col} = ?`); params.push(query[col]) }
  }
  if (query.material_name) { conditions.push('material_name LIKE ?'); params.push(`%${query.material_name}%`) }
  if (query.material_spec) { conditions.push('material_spec LIKE ?'); params.push(`%${query.material_spec}%`) }
  // 高级筛选（multiFilter JSON）
  if (multiFilter) {
    try {
      const filters = JSON.parse(multiFilter)
      const allowed = ['material_code','material_name','material_spec','category','brand','dimension','pin_count','frequency','load_cap','voltage','mode','freq_tol','temperature','price_with_tax','price_without_tax','currency','factory_code','quoter','standard_lead_time','min_package','first_inquiry_customer','remarks','created_at']
      for (const f of filters) {
        if (!f.field || !allowed.includes(f.field)) continue
        const v = f.value || ''
        switch (f.op) {
          case 'contains': conditions.push(`${f.field} LIKE ?`); params.push(`%${v}%`); break
          case 'equals': conditions.push(`${f.field} = ?`); params.push(v); break
          case 'starts': conditions.push(`${f.field} LIKE ?`); params.push(`${v}%`); break
          case 'ends': conditions.push(`${f.field} LIKE ?`); params.push(`%${v}`); break
          case 'gt': conditions.push(`${f.field} > ?`); params.push(v); break
          case 'lt': conditions.push(`${f.field} < ?`); params.push(v); break
          case 'gte': conditions.push(`${f.field} >= ?`); params.push(v); break
          case 'lte': conditions.push(`${f.field} <= ?`); params.push(v); break
          case 'empty': conditions.push(`(${f.field} = '' OR ${f.field} IS NULL)`); break
          case 'nempty': conditions.push(`(${f.field} != '' AND ${f.field} IS NOT NULL)`); break
        }
      }
    } catch {}
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const rows = queryAll(`SELECT * FROM material_prices ${where} ORDER BY created_at DESC`, params)
  const headers = ['登记时间','物料编码','物料名称','物料规格','品类','品牌','尺寸规格','PIN脚','频点','负载','电压','模式','频偏','温度','含税价','未税价','币种','工厂编号','报价人','标准交期','最小包装','规格书','初次询价客户','备注']
  const data = rows.map(r => [r.created_at,r.material_code,r.material_name,r.material_spec,r.category,r.brand,r.dimension,r.pin_count,r.frequency,r.load_cap,r.voltage,r.mode,r.freq_tol,r.temperature,r.price_with_tax,r.price_without_tax,r.currency,r.factory_code,r.quoter,r.standard_lead_time,r.min_package,r.spec_document,r.first_inquiry_customer,r.remarks])
  data.unshift(headers)
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(data)
  XLSX.utils.book_append_sheet(wb, ws, '报价记录')
  ws['!cols'] = headers.map((_,i) => ({ wch: i<4?20:i<11?10:i<14?12:6 }))
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
}

export function generateTemplate() {
  const headers = ['登记时间','物料编码','物料名称','物料规格','品类','品牌','尺寸规格','PIN脚','频点','负载','电压','模式','频偏','温度','含税价','未税价','币种','工厂编号','报价人','标准交期','最小包装','规格书','初次询价客户','备注']
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet([headers])
  ws['!cols'] = headers.map(h => ({ wch: h.length*1.5+4 }))
  XLSX.utils.book_append_sheet(wb, ws, '报价导入模板')
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
}

export function importFromExcel(fileBuffer) {
  const wb = XLSX.read(fileBuffer, { type: 'buffer', cellDates: true })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws)
  const mapRow = (r) => ({
    created_at: parseExcelDate(r['登记时间'] ?? r['created_at']),
    updated_at: parseExcelDate(r['修改时间'] ?? r['updated_at']),
    material_code: String(r['物料编码']??r['material_code']??''),
    material_name: String(r['物料名称']??r['material_name']??''),
    material_spec: String(r['物料规格']??r['material_spec']??''),
    category: String(r['品类']??r['category']??''),
    brand: String(r['品牌']??r['brand']??''),
    dimension: String(r['尺寸规格']??r['dimension']??''),
    pin_count: String(r['PIN脚']??r['pin_count']??''),
    frequency: String(r['频点']??r['frequency']??''),
    load_cap: String(r['负载']??r['load_cap']??''),
    voltage: String(r['电压']??r['voltage']??''),
    mode: String(r['模式']??r['mode']??''),
    freq_tol: String(r['频偏']??r['freq_tol']??''),
    temperature: String(r['温度']??r['temperature']??''),
    price_with_tax: (v => v != null ? Number(v) : null)(r['含税价']??r['price_with_tax']),
    price_without_tax: (v => v != null ? Number(v) : null)(r['未税价']??r['price_without_tax']),
    currency: String(r['币种']??r['currency']??'CNY'),
    factory_code: String(r['工厂编号']??r['factory_code']??''),
    quoter: String(r['报价人']??r['quoter']??''),
    standard_lead_time: String(r['标准交期']??r['standard_lead_time']??''),
    min_package: String(r['最小包装']??r['min_package']??''),
    spec_document: String(r['规格书']??r['spec_document']??''),
    first_inquiry_customer: String(r['初次询价客户']??r['first_inquiry_customer']??''),
    remarks: String(r['备注']??r['remarks']??'')
  })
  let count = 0
  for (const item of rows) {
    const r = mapRow(item)
    if (!r.material_code && !r.material_name && !r.material_spec) continue
    // 登记时间缺失 → 用导入时刻；修改时间缺失 → 跟随 created_at
    const now = formatLocal(new Date())
    const createdAt = r.created_at || now
    const updatedAt = r.updated_at || createdAt
    const ins = executeBatch(`INSERT INTO material_prices (created_at,updated_at,material_code,material_name,material_spec,category,brand,dimension,pin_count,frequency,load_cap,voltage,mode,freq_tol,temperature,price_with_tax,price_without_tax,currency,factory_code,quoter,standard_lead_time,min_package,spec_document,first_inquiry_customer,remarks) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [createdAt,updatedAt,r.material_code||'',r.material_name||'',r.material_spec||'',r.category||'',r.brand||'',r.dimension||'',r.pin_count||'',r.frequency||'',r.load_cap||'',r.voltage||'',r.mode||'',r.freq_tol||'',r.temperature||'',r.price_with_tax??null,r.price_without_tax??null,r.currency||'CNY',r.factory_code||'',r.quoter||'',r.standard_lead_time||'',r.min_package||'',r.spec_document||'',r.first_inquiry_customer||'',r.remarks||''])
    // 记录导入时的初始价格日志
    const recordId = ins.lastInsertRowid
    if (recordId && (r.price_with_tax != null || r.price_without_tax != null)) {
      const logFields = [['price_with_tax', r.price_with_tax], ['price_without_tax', r.price_without_tax], ['currency', r.currency]]
      for (const [field, val] of logFields) {
        if (val != null) executeBatch('INSERT INTO price_logs (material_code,record_id,field_name,old_value,new_value) VALUES (?,?,?,?,?)', [r.material_code||'', recordId, field, '', String(val)])
      }
    }
    count++
  }
  saveNow()
  return count
}

// ===== 记事便签导出（纯 xlsx，供自动备份用） =====

export function exportNotes(query = {}) {
  const { keyword, customer, category_id, status } = query
  const conditions = ['n.is_deleted = 0']
  const params = []
  if (keyword) { conditions.push('(n.title LIKE ? OR n.content LIKE ? OR n.customer LIKE ?)'); const kw=`%${keyword}%`; params.push(kw,kw,kw) }
  if (customer) { conditions.push('n.customer = ?'); params.push(customer) }
  if (category_id) { conditions.push('n.category_id = ?'); params.push(Number(category_id)) }
  if (status) { conditions.push('n.status = ?'); params.push(status) }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const rows = queryAll(`
    SELECT n.*, c.name as category_name
    FROM notes n
    LEFT JOIN note_categories c ON n.category_id = c.id AND c.is_deleted = 0
    ${where}
    ORDER BY n.updated_at DESC
  `, params)
  const statusMap = { todo: '待办', in_progress: '进行中', done: '已完成' }
  const priorityMap = { 1: '高', 2: '中', 3: '低' }
  const headers = ['编号','标题','内容','客户','分类','优先级','状态','提醒时间','已提醒','是否置顶','创建时间','更新时间']
  const data = rows.map(r => [
    r.id, r.title, r.content, r.customer,
    r.category_name || '',
    priorityMap[r.priority] || '中',
    statusMap[r.status] || r.status,
    r.reminder_at || '',
    r.is_reminded ? '是' : '否',
    r.is_pinned ? '是' : '否',
    r.created_at, r.updated_at
  ])
  data.unshift(headers)
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(data)
  XLSX.utils.book_append_sheet(wb, ws, '记事便签')
  ws['!cols'] = headers.map((_, i) => ({ wch: i === 1 ? 30 : i === 2 ? 50 : 14 }))
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
}

// ===== 记事便签导出（ZIP：xlsx + 图片，供用户下载） =====

export async function exportNotesPackage(query = {}) {
  const { keyword, customer, category_id, status } = query
  const conditions = ['n.is_deleted = 0']
  const params = []
  if (keyword) { conditions.push('(n.title LIKE ? OR n.content LIKE ? OR n.customer LIKE ?)'); const kw=`%${keyword}%`; params.push(kw,kw,kw) }
  if (customer) { conditions.push('n.customer = ?'); params.push(customer) }
  if (category_id) { conditions.push('n.category_id = ?'); params.push(Number(category_id)) }
  if (status) { conditions.push('n.status = ?'); params.push(status) }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const rows = queryAll(`
    SELECT n.*, c.name as category_name
    FROM notes n
    LEFT JOIN note_categories c ON n.category_id = c.id AND c.is_deleted = 0
    ${where}
    ORDER BY n.updated_at DESC
  `, params)
  const statusMap = { todo: '待办', in_progress: '进行中', done: '已完成' }
  const priorityMap = { 1: '高', 2: '中', 3: '低' }
  const headers = ['编号','标题','内容','客户','分类','优先级','状态','提醒时间','已提醒','是否置顶','创建时间','更新时间','图片文件名']
  const data = rows.map(r => {
    let imageNames = ''
    try { imageNames = JSON.parse(r.images || '[]').map(u => decodeURIComponent(u.split('/').pop())).join(', ') } catch {}
    return [
      r.id, r.title, r.content, r.customer,
      r.category_name || '',
      priorityMap[r.priority] || '中',
      statusMap[r.status] || r.status,
      r.reminder_at || '',
      r.is_reminded ? '是' : '否',
      r.is_pinned ? '是' : '否',
      r.created_at, r.updated_at,
      imageNames
    ]
  })
  data.unshift(headers)
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(data)
  XLSX.utils.book_append_sheet(wb, ws, '记事便签')
  ws['!cols'] = headers.map((_, i) => ({ wch: i === 1 ? 30 : i === 2 ? 50 : 14 }))
  const xlsxBuf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

  // 打包 ZIP：xlsx + images/
  const zip = new JSZip()
  zip.file('记事便签.xlsx', xlsxBuf)

  const notesUploadDir = path.join(process.env.DATA_DIR || path.join(__dirname, '..', '..'), '记事图片库')
  const added = new Set()
  for (const row of rows) {
    let images = []
    try { images = JSON.parse(row.images || '[]') } catch {}
    for (const url of images) {
      const name = decodeURIComponent(url.split('/').pop())
      if (added.has(name)) continue
      added.add(name)
      const fp = path.join(notesUploadDir, name)
      if (fs.existsSync(fp)) zip.file(`images/${name}`, fs.readFileSync(fp))
    }
  }
  return zip.generateAsync({ type: 'nodebuffer' })
}

export function generateNoteTemplate() {
  const headers = ['标题','内容','客户','分类(类型名)','优先级(高/中/低)','状态(待办/进行中/已完成)','提醒时间(YYYY-MM-DD HH:mm)']
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet([headers])
  ws['!cols'] = headers.map(h => ({ wch: h.length * 1.5 + 4 }))
  XLSX.utils.book_append_sheet(wb, ws, '记事导入模板')
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
}

export async function importNotesFromZip(fileBuffer, notesUploadDir) {
  let xlsxBuf

  // 判断：是 ZIP 包（含记事便签.xlsx）还是纯 xlsx
  try {
    const zip = await JSZip.loadAsync(fileBuffer)
    const xlsxFile = zip.file('记事便签.xlsx')
    if (xlsxFile) {
      // ZIP 包模式
      xlsxBuf = await xlsxFile.async('nodebuffer')
      // 解压 images/
      const imageFiles = []
      zip.forEach((relativePath, file) => {
        if (relativePath.startsWith('images/') && !file.dir) imageFiles.push({ relativePath, file })
      })
      for (const { relativePath, file } of imageFiles) {
        const buf = await file.async('nodebuffer')
        const name = path.basename(relativePath)
        let target = path.join(notesUploadDir, name)
        if (fs.existsSync(target)) {
          const ext = path.extname(name)
          const base = path.basename(name, ext)
          target = path.join(notesUploadDir, `${base}_${Date.now()}${ext}`)
        }
        fs.writeFileSync(target, buf)
      }
    } else {
      // 纯 xlsx 模式（用户直接上传填好的模板）
      xlsxBuf = fileBuffer
    }
  } catch {
    // 不是合法 ZIP，当做纯 xlsx 处理
    xlsxBuf = fileBuffer
  }

  // 解析 xlsx
  const wb = XLSX.read(xlsxBuf, { type: 'buffer', cellDates: true })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws)

  // 解析并导入（支持模板带括号的表头和导出表头）
  function col(r, ...names) {
    for (const n of names) {
      const v = r[n]
      if (v !== undefined && v !== null) return v
    }
    return ''
  }

  const mapRow = (r) => {
    const raw = String(col(r, '图片文件名', 'images'))
    const imageNames = raw ? raw.split(',').map(s => s.trim()).filter(Boolean) : []
    const images = imageNames.map(n => {
      const candidates = fs.readdirSync(notesUploadDir).filter(f => f === n || f.endsWith('_' + n) || f.includes(path.basename(n, path.extname(n))))
      if (candidates.length) return `/api/uploads/notes/${encodeURIComponent(candidates[0])}`
      return ''
    }).filter(Boolean)

    return {
      title: String(col(r, '标题', 'title') || '未命名'),
      content: String(col(r, '内容', 'content')),
      customer: String(col(r, '客户', 'customer')),
      category_name: String(col(r, '分类', '分类(类型名)', 'category')),
      priority: (() => {
        const v = String(col(r, '优先级', '优先级(高/中/低)', 'priority'))
        if (/高|high|1/.test(v)) return 1
        if (/低|low|3/.test(v)) return 3
        return 2
      })(),
      status: (() => {
        const v = String(col(r, '状态', '状态(待办/进行中/已完成)', 'status'))
        if (/进行|in_progress/.test(v)) return 'in_progress'
        if (/完成|done/.test(v)) return 'done'
        return 'todo'
      })(),
      reminder_at: parseExcelDate(col(r, '提醒时间', '提醒时间(YYYY-MM-DD HH:mm)', 'reminder_at')),
      images
    }
  }

  let count = 0
  for (const item of rows) {
    const r = mapRow(item)
    if (!r.title) continue

    // 按分类名查找 category_id，不存在则自动创建
    let categoryId = 0
    if (r.category_name) {
      let cat = queryOne('SELECT id FROM note_categories WHERE name = ? AND is_deleted = 0', [r.category_name])
      if (cat) {
        categoryId = cat.id
      } else {
        // 自动创建缺失的分类
        const ins = executeBatch('INSERT INTO note_categories (name, color, sort_order) VALUES (?,?,?)', [r.category_name, '#1989fa', 99])
        categoryId = ins.lastInsertRowid
      }
    }

    const now = formatLocal(new Date())
    executeBatch(`INSERT INTO notes (title, content, customer, category_id, images, reminder_at, priority, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`, [
      r.title, r.content, r.customer, categoryId,
      JSON.stringify(r.images), r.reminder_at || null, r.priority, r.status, now, now
    ])
    count++
  }

  if (count) saveNow()
  return count
}

// ===== 样品导入导出 =====

export function exportSamples(query = {}) {
  const { keyword, factory, brand, multiFilter } = query
  const conditions = ['is_deleted = 0']
  const params = []
  if (keyword) { conditions.push('(material_code LIKE ? OR material_name LIKE ? OR brand LIKE ?)'); const kw=`%${keyword}%`; params.push(kw,kw,kw) }
  if (factory) { conditions.push('factory_code = ?'); params.push(factory) }
  if (brand) { conditions.push('brand = ?'); params.push(brand) }
  const filterColumns = ['dimension','pin_count','frequency','load_cap','voltage','mode','freq_tol','material_code','factory_code']
  for (const col of filterColumns) {
    if (query[col]) { conditions.push(`${col} = ?`); params.push(query[col]) }
  }
  if (query.material_name) { conditions.push('material_name LIKE ?'); params.push(`%${query.material_name}%`) }
  if (query.material_spec) { conditions.push('material_spec LIKE ?'); params.push(`%${query.material_spec}%`) }
  // 高级筛选（multiFilter JSON）
  if (multiFilter) {
    try {
      const filters = JSON.parse(multiFilter)
      const allowed = ['material_code','material_name','material_spec','brand','dimension','pin_count','frequency','load_cap','voltage','mode','freq_tol','temperature','price_with_tax','cost_price','factory_code','stock_quantity','remarks','created_at']
      for (const f of filters) {
        if (!f.field || !allowed.includes(f.field)) continue
        const v = f.value || ''
        switch (f.op) {
          case 'contains': conditions.push(`${f.field} LIKE ?`); params.push(`%${v}%`); break
          case 'equals': conditions.push(`${f.field} = ?`); params.push(v); break
          case 'starts': conditions.push(`${f.field} LIKE ?`); params.push(`${v}%`); break
          case 'ends': conditions.push(`${f.field} LIKE ?`); params.push(`%${v}`); break
          case 'gt': conditions.push(`${f.field} > ?`); params.push(v); break
          case 'lt': conditions.push(`${f.field} < ?`); params.push(v); break
          case 'gte': conditions.push(`${f.field} >= ?`); params.push(v); break
          case 'lte': conditions.push(`${f.field} <= ?`); params.push(v); break
          case 'empty': conditions.push(`(${f.field} = '' OR ${f.field} IS NULL)`); break
          case 'nempty': conditions.push(`(${f.field} != '' AND ${f.field} IS NOT NULL)`); break
        }
      }
    } catch {}
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const rows = queryAll(`SELECT * FROM material_samples ${where} ORDER BY created_at DESC`, params)
  const headers = ['登记时间','物料编码','物料名称','物料规格','品牌','尺寸','PIN脚','频点','负载','电压','模式','频偏','温度','含税价','本价含税','工厂','库存数量','规格书','备注']
  const data = rows.map(r => [r.created_at,r.material_code,r.material_name,r.material_spec,r.brand,r.dimension,r.pin_count,r.frequency,r.load_cap,r.voltage,r.mode,r.freq_tol,r.temperature,r.price_with_tax,r.cost_price,r.factory_code,r.stock_quantity,r.spec_document,r.remarks])
  data.unshift(headers)
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(data)
  XLSX.utils.book_append_sheet(wb, ws, '样品登记')
  ws['!cols'] = headers.map((_,i) => ({ wch: i<3?20:i<10?12:10 }))
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
}

export function generateSampleTemplate() {
  const headers = ['登记时间','物料编码','物料名称','物料规格','品牌','尺寸','PIN脚','频点','负载','电压','模式','频偏','温度','含税价','本价含税','工厂','库存数量','规格书','备注']
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet([headers])
  ws['!cols'] = headers.map(h => ({ wch: h.length*1.5+4 }))
  XLSX.utils.book_append_sheet(wb, ws, '样品导入模板')
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
}

// ===== 地图客户地址导出（供自动备份用） =====

export function exportMapCustomers() {
  const customers = queryAll(`
    SELECT mc.*,
      (SELECT COUNT(*) FROM map_purchasers WHERE customer_id = mc.id) as purchaser_count,
      (SELECT COUNT(*) FROM map_addresses WHERE customer_id = mc.id) as address_count,
      (SELECT COUNT(*) FROM map_sites WHERE customer_id = mc.id) as site_count
    FROM map_customers mc ORDER BY mc.name ASC
  `);
  const purchasers = queryAll(
    "SELECT mp.*, mc.name as customer_name FROM map_purchasers mp LEFT JOIN map_customers mc ON mp.customer_id = mc.id ORDER BY mc.name, mp.name",
  );
  const addresses = queryAll(
    "SELECT ma.*, mc.name as customer_name, mp.name as purchaser_name FROM map_addresses ma LEFT JOIN map_customers mc ON ma.customer_id = mc.id LEFT JOIN map_purchasers mp ON ma.purchaser_id = mp.id ORDER BY mc.name, ma.label",
  );
  const sites = queryAll(
    "SELECT ms.*, mc.name as customer_name FROM map_sites ms LEFT JOIN map_customers mc ON ms.customer_id = mc.id ORDER BY mc.name, ms.name",
  );

  const wb = XLSX.utils.book_new();

  // Sheet1: 客户信息
  const ws1Data = [["客户名","电话","地址","纬度","经度","备注","采购数","地址数","创建时间"]];
  for (const c of customers) {
    ws1Data.push([c.name,c.phone,c.address,c.latitude,c.longitude,c.notes,c.purchaser_count,c.address_count,c.created_at]);
  }
  const ws1 = XLSX.utils.aoa_to_sheet(ws1Data);
  XLSX.utils.book_append_sheet(wb, ws1, "客户信息");

  // Sheet2: 采购联系人
  const ws2Data = [["所属客户","采购名","电话","职位","备注"]];
  for (const p of purchasers) {
    ws2Data.push([p.customer_name, p.name, p.phone, p.title, p.notes]);
  }
  const ws2 = XLSX.utils.aoa_to_sheet(ws2Data);
  XLSX.utils.book_append_sheet(wb, ws2, "采购联系人");

  // Sheet3: 收件地址
  const ws3Data = [["所属客户","所属采购","标签","地址","收件人","联系电话","纬度","经度","是否默认","备注"]];
  for (const a of addresses) {
    ws3Data.push([a.customer_name,a.purchaser_name||"",a.label,a.address,a.contact_name,a.contact_phone,a.latitude,a.longitude,a.is_default?"是":"否",a.notes]);
  }
  const ws3 = XLSX.utils.aoa_to_sheet(ws3Data);
  XLSX.utils.book_append_sheet(wb, ws3, "收件地址");

  // Sheet4: 收货点
  const siteTypeMap = { office: "自有厂区", oem: "代工厂", warehouse: "仓库", branch: "办事处" };
  const ws4Data = [["所属客户","名称","类型","地址","纬度","经度","收件人","联系电话","是否默认","备注"]];
  for (const s of sites) {
    ws4Data.push([s.customer_name,s.name,siteTypeMap[s.site_type]||s.site_type,s.address,s.latitude,s.longitude,s.contact_name,s.contact_phone,s.is_default?"是":"否",s.notes]);
  }
  const ws4 = XLSX.utils.aoa_to_sheet(ws4Data);
  XLSX.utils.book_append_sheet(wb, ws4, "收货点");

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

export function importSamplesFromExcel(fileBuffer) {
  const wb = XLSX.read(fileBuffer, { type: 'buffer', cellDates: true })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws)
  const mapRow = (r) => ({
    created_at: parseExcelDate(r['登记时间'] ?? r['created_at']),
    updated_at: parseExcelDate(r['修改时间'] ?? r['updated_at']),
    material_code: String(r['物料编码']??r['material_code']??''),
    material_name: String(r['物料名称']??r['material_name']??''),
    material_spec: String(r['规格']??r['material_spec']??''),
    brand: String(r['品牌']??r['brand']??''),
    dimension: String(r['尺寸']??r['尺寸规格']??r['dimension']??''),
    pin_count: String(r['PIN脚']??r['pin_count']??''),
    frequency: String(r['频点']??r['frequency']??''),
    load_cap: String(r['负载']??r['load_cap']??''),
    voltage: String(r['电压']??r['voltage']??''),
    mode: String(r['模式']??r['mode']??''),
    freq_tol: String(r['频偏']??r['freq_tol']??''),
    temperature: String(r['温度']??r['temperature']??''),
    price_with_tax: (v => v != null ? Number(v) : null)(r['含税价']??r['price_with_tax']),
    cost_price: (v => v != null ? Number(v) : null)(r['本价含税']??r['本价']??r['cost_price']),
    factory_code: String(r['工厂']??r['工厂编号']??r['factory_code']??''),
    stock_quantity: parseInt(r['库存数量']??r['stock_quantity']??0)||0,
    spec_document: String(r['规格书']??r['spec_document']??''),
    remarks: String(r['备注']??r['remarks']??'')
  })
  let count = 0
  for (const item of rows) {
    const r = mapRow(item)
    if (!r.material_code && !r.material_name && !r.material_spec) continue
    const now = formatLocal(new Date())
    const createdAt = r.created_at || now
    const updatedAt = r.updated_at || createdAt
    executeBatch(`INSERT INTO material_samples (created_at,updated_at,material_code,material_name,material_spec,brand,dimension,pin_count,frequency,load_cap,voltage,mode,freq_tol,temperature,price_with_tax,cost_price,factory_code,stock_quantity,spec_document,remarks) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [createdAt,updatedAt,r.material_code||'',r.material_name||'',r.material_spec||'',r.brand||'',r.dimension||'',r.pin_count||'',r.frequency||'',r.load_cap||'',r.voltage||'',r.mode||'',r.freq_tol||'',r.temperature||'',r.price_with_tax??null,r.cost_price??null,r.factory_code||'',r.stock_quantity||0,r.spec_document||'',r.remarks||''])
    count++
  }
  saveNow()
  return count
}
