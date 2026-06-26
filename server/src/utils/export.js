import XLSX from 'xlsx'
import { queryAll, execute, executeBatch, saveNow } from '../db.js'

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
  const { keyword, factory, quoter, currency, category, startDate, endDate } = query
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
    executeBatch(`INSERT INTO material_prices (created_at,updated_at,material_code,material_name,material_spec,category,brand,dimension,pin_count,frequency,load_cap,voltage,mode,freq_tol,temperature,price_with_tax,price_without_tax,currency,factory_code,quoter,standard_lead_time,min_package,spec_document,first_inquiry_customer,remarks) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [createdAt,updatedAt,r.material_code||'',r.material_name||'',r.material_spec||'',r.category||'',r.brand||'',r.dimension||'',r.pin_count||'',r.frequency||'',r.load_cap||'',r.voltage||'',r.mode||'',r.freq_tol||'',r.temperature||'',r.price_with_tax??null,r.price_without_tax??null,r.currency||'CNY',r.factory_code||'',r.quoter||'',r.standard_lead_time||'',r.min_package||'',r.spec_document||'',r.first_inquiry_customer||'',r.remarks||''])
    count++
  }
  saveNow()
  return count
}

// ===== 记事便签导出 =====

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
  const priorityMap = { 1: '低', 2: '中', 3: '高' }
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

// ===== 样品导入导出 =====

export function exportSamples(query = {}) {
  const { keyword, factory, brand } = query
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
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const rows = queryAll(`SELECT * FROM material_samples ${where} ORDER BY created_at DESC`, params)
  const headers = ['登记时间','物料编码','物料名称','物料规格','品牌','尺寸','PIN脚','频点','负载','电压','模式','频偏','含税价','本价含税','工厂','库存数量','规格书','备注']
  const data = rows.map(r => [r.created_at,r.material_code,r.material_name,r.material_spec,r.brand,r.dimension,r.pin_count,r.frequency,r.load_cap,r.voltage,r.mode,r.freq_tol,r.price_with_tax,r.cost_price,r.factory_code,r.stock_quantity,r.spec_document,r.remarks])
  data.unshift(headers)
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(data)
  XLSX.utils.book_append_sheet(wb, ws, '样品登记')
  ws['!cols'] = headers.map((_,i) => ({ wch: i<3?20:i<10?12:10 }))
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
}

export function generateSampleTemplate() {
  const headers = ['登记时间','物料编码','物料名称','物料规格','品牌','尺寸','PIN脚','频点','负载','电压','模式','频偏','含税价','本价含税','工厂','库存数量','规格书','备注']
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet([headers])
  ws['!cols'] = headers.map(h => ({ wch: h.length*1.5+4 }))
  XLSX.utils.book_append_sheet(wb, ws, '样品导入模板')
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
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
    const allVals = [r.material_code,r.material_name,r.material_spec,r.brand,r.dimension,r.pin_count,r.frequency,r.load_cap,r.voltage,r.mode,r.freq_tol,r.price_with_tax,r.cost_price,r.factory_code,r.stock_quantity,r.spec_document,r.remarks]
    if (!allVals.some(v => v !== '' && v != null)) continue
    const now = formatLocal(new Date())
    const createdAt = r.created_at || now
    const updatedAt = r.updated_at || createdAt
    executeBatch(`INSERT INTO material_samples (created_at,updated_at,material_code,material_name,material_spec,brand,dimension,pin_count,frequency,load_cap,voltage,mode,freq_tol,price_with_tax,cost_price,factory_code,stock_quantity,spec_document,remarks) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [createdAt,updatedAt,r.material_code||'',r.material_name||'',r.material_spec||'',r.brand||'',r.dimension||'',r.pin_count||'',r.frequency||'',r.load_cap||'',r.voltage||'',r.mode||'',r.freq_tol||'',r.price_with_tax??null,r.cost_price??null,r.factory_code||'',r.stock_quantity||0,r.spec_document||'',r.remarks||''])
    count++
  }
  saveNow()
  return count
}
