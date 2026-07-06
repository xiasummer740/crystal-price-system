import { Router } from 'express'
import { queryAll, queryOne, execute } from '../db.js'
import XLSX from 'xlsx'
import https from 'https'

const router = Router()

// ====== 客户 CRUD ======

// 客户列表（含采购数和地址数）
router.get('/customers', (req, res) => {
  const keyword = (req.query.keyword || '').trim()
  let sql = `
    SELECT mc.*,
      (SELECT COUNT(*) FROM map_purchasers WHERE customer_id = mc.id) as purchaser_count,
      (SELECT COUNT(*) FROM map_addresses WHERE customer_id = mc.id) as address_count
    FROM map_customers mc
  `
  const params = []
  if (keyword) {
    sql += " WHERE mc.name LIKE ? OR mc.address LIKE ? OR mc.phone LIKE ?"
    const kw = `%${keyword}%`
    params.push(kw, kw, kw)
  }
  sql += ' ORDER BY mc.name ASC'
  const rows = queryAll(sql, params)
  res.json({ code: 0, data: rows })
})

// 获取单个客户完整信息
router.get('/customers/:id', (req, res) => {
  const customer = queryOne('SELECT * FROM map_customers WHERE id = ?', [Number(req.params.id)])
  if (!customer) return res.status(404).json({ code: 1, msg: '客户不存在' })
  const purchasers = queryAll('SELECT * FROM map_purchasers WHERE customer_id = ? ORDER BY id ASC', [customer.id])
  const addresses = queryAll('SELECT * FROM map_addresses WHERE customer_id = ? ORDER BY is_default DESC, id ASC', [customer.id])
  // 按采购分组
  const purchaserMap = {}
  for (const p of purchasers) {
    p.addresses = addresses.filter(a => a.purchaser_id === p.id || a.purchaser_id === 0)
    purchaserMap[p.id] = p
  }
  const unassigned = addresses.filter(a => a.purchaser_id !== 0 && !purchaserMap[a.purchaser_id])
  res.json({ code: 0, data: { customer, purchasers, unassigned } })
})

// 新建客户
router.post('/customers', (req, res) => {
  const b = req.body
  if (!b.name) return res.status(400).json({ code: 1, msg: '客户名不能为空' })
  try {
    const r = execute(
      'INSERT INTO map_customers (name, phone, address, latitude, longitude, notes, source) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [b.name, b.phone || '', b.address || '', b.latitude || null, b.longitude || null, b.notes || '', b.source || 'manual']
    )
    // 同步写入 notes 的 customers 表
    try { execute('INSERT OR IGNORE INTO customers (name, source) VALUES (?, ?)', [b.name, 'map']) } catch {}
    res.json({ code: 0, data: { id: r.lastInsertRowid } })
  } catch (e) {
    if (e.message?.includes('UNIQUE')) return res.status(400).json({ code: 1, msg: '客户名已存在' })
    throw e
  }
})

// 更新客户
router.put('/customers/:id', (req, res) => {
  const existing = queryOne('SELECT * FROM map_customers WHERE id = ?', [Number(req.params.id)])
  if (!existing) return res.status(404).json({ code: 1, msg: '客户不存在' })
  const b = req.body
  execute(`UPDATE map_customers SET name=?, phone=?, address=?, latitude=?, longitude=?, notes=? WHERE id=?`, [
    b.name ?? existing.name,
    b.phone ?? existing.phone,
    b.address ?? existing.address,
    b.latitude !== undefined ? b.latitude : existing.latitude,
    b.longitude !== undefined ? b.longitude : existing.longitude,
    b.notes ?? existing.notes,
    Number(req.params.id)
  ])
  // 同步更新 customers 表
  if (b.name && b.name !== existing.name) {
    try { execute('INSERT OR IGNORE INTO customers (name, source) VALUES (?, ?)', [b.name, 'map']) } catch {}
  }
  res.json({ code: 0, msg: '更新成功' })
})

// 删除客户
router.delete('/customers/:id', (req, res) => {
  const id = Number(req.params.id)
  execute('DELETE FROM map_addresses WHERE customer_id = ?', [id])
  execute('DELETE FROM map_purchasers WHERE customer_id = ?', [id])
  execute('DELETE FROM map_customers WHERE id = ?', [id])
  res.json({ code: 0, msg: '删除成功' })
})

// 从记事导入客户名
router.post('/customers/import', (_req, res) => {
  const rows = queryAll(`
    SELECT name FROM customers WHERE name != ''
    UNION
    SELECT DISTINCT customer as name FROM notes WHERE is_deleted = 0 AND customer IS NOT NULL AND customer != ''
    ORDER BY name ASC
  `)
  let imported = 0
  for (const row of rows) {
    if (!row.name) continue
    const existing = queryOne('SELECT id FROM map_customers WHERE name = ?', [row.name])
    if (!existing) {
      execute('INSERT INTO map_customers (name, source) VALUES (?, ?)', [row.name, 'notes'])
      imported++
    }
  }
  res.json({ code: 0, data: { total: rows.length, imported }, msg: `共 ${rows.length} 个客户名，导入 ${imported} 个` })
})

// ====== 采购联系人 CRUD ======

router.get('/customers/:id/purchasers', (req, res) => {
  const rows = queryAll('SELECT * FROM map_purchasers WHERE customer_id = ? ORDER BY id ASC', [Number(req.params.id)])
  res.json({ code: 0, data: rows })
})

router.post('/purchasers', (req, res) => {
  const b = req.body
  if (!b.customer_id || !b.name) return res.status(400).json({ code: 1, msg: '参数不完整' })
  const r = execute('INSERT INTO map_purchasers (customer_id, name, phone, title, notes) VALUES (?, ?, ?, ?, ?)',
    [b.customer_id, b.name, b.phone || '', b.title || '', b.notes || ''])
  res.json({ code: 0, data: { id: r.lastInsertRowid } })
})

router.put('/purchasers/:id', (req, res) => {
  const existing = queryOne('SELECT * FROM map_purchasers WHERE id = ?', [Number(req.params.id)])
  if (!existing) return res.status(404).json({ code: 1, msg: '采购不存在' })
  const b = req.body
  execute('UPDATE map_purchasers SET name=?, phone=?, title=?, notes=? WHERE id=?', [
    b.name ?? existing.name, b.phone ?? existing.phone,
    b.title ?? existing.title, b.notes ?? existing.notes, Number(req.params.id)
  ])
  res.json({ code: 0, msg: '更新成功' })
})

router.delete('/purchasers/:id', (req, res) => {
  const id = Number(req.params.id)
  execute('DELETE FROM map_purchasers WHERE id = ?', [id])
  res.json({ code: 0, msg: '删除成功' })
})

// ====== 收件地址 CRUD ======

router.get('/customers/:id/addresses', (req, res) => {
  const rows = queryAll('SELECT * FROM map_addresses WHERE customer_id = ? ORDER BY is_default DESC, id ASC', [Number(req.params.id)])
  res.json({ code: 0, data: rows })
})

router.post('/addresses', (req, res) => {
  const b = req.body
  if (!b.customer_id || !b.address) return res.status(400).json({ code: 1, msg: '参数不完整' })
  const r = execute(
    'INSERT INTO map_addresses (customer_id, purchaser_id, label, address, contact_name, contact_phone, latitude, longitude, is_default, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [b.customer_id, b.purchaser_id || 0, b.label || '', b.address, b.contact_name || '', b.contact_phone || '',
     b.latitude || null, b.longitude || null, b.is_default ? 1 : 0, b.notes || '']
  )
  res.json({ code: 0, data: { id: r.lastInsertRowid } })
})

router.put('/addresses/:id', (req, res) => {
  const existing = queryOne('SELECT * FROM map_addresses WHERE id = ?', [Number(req.params.id)])
  if (!existing) return res.status(404).json({ code: 1, msg: '地址不存在' })
  const b = req.body
  execute(`UPDATE map_addresses SET purchaser_id=?, label=?, address=?, contact_name=?, contact_phone=?, latitude=?, longitude=?, is_default=?, notes=? WHERE id=?`, [
    b.purchaser_id ?? existing.purchaser_id, b.label ?? existing.label, b.address ?? existing.address,
    b.contact_name ?? existing.contact_name, b.contact_phone ?? existing.contact_phone,
    b.latitude !== undefined ? b.latitude : existing.latitude,
    b.longitude !== undefined ? b.longitude : existing.longitude,
    b.is_default !== undefined ? (b.is_default ? 1 : 0) : existing.is_default,
    b.notes ?? existing.notes, Number(req.params.id)
  ])
  res.json({ code: 0, msg: '更新成功' })
})

router.delete('/addresses/:id', (req, res) => {
  execute('DELETE FROM map_addresses WHERE id = ?', [Number(req.params.id)])
  res.json({ code: 0, msg: '删除成功' })
})

// ====== 行程规划 CRUD ======

router.get('/trip-plans', (req, res) => {
  const { date } = req.query
  let sql = 'SELECT tp.*, (SELECT COUNT(*) FROM map_trip_points WHERE plan_id = tp.id) as point_count FROM map_trip_plans tp'
  const params = []
  if (date) {
    sql += ' WHERE tp.plan_date = ?'
    params.push(date)
  }
  sql += ' ORDER BY tp.plan_date DESC, tp.id DESC'
  const rows = queryAll(sql, params)
  res.json({ code: 0, data: rows })
})

router.get('/trip-plans/:id', (req, res) => {
  const plan = queryOne('SELECT * FROM map_trip_plans WHERE id = ?', [Number(req.params.id)])
  if (!plan) return res.status(404).json({ code: 1, msg: '行程不存在' })
  const points = queryAll('SELECT * FROM map_trip_points WHERE plan_id = ? ORDER BY sort_order ASC, id ASC', [plan.id])
  res.json({ code: 0, data: { ...plan, points } })
})

router.post('/trip-plans', (req, res) => {
  const b = req.body
  if (!b.plan_date) return res.status(400).json({ code: 1, msg: '日期不能为空' })
  const r = execute('INSERT INTO map_trip_plans (plan_date, title, notes) VALUES (?, ?, ?)',
    [b.plan_date, b.title || '', b.notes || ''])
  res.json({ code: 0, data: { id: r.lastInsertRowid } })
})

router.put('/trip-plans/:id', (req, res) => {
  const existing = queryOne('SELECT * FROM map_trip_plans WHERE id = ?', [Number(req.params.id)])
  if (!existing) return res.status(404).json({ code: 1, msg: '行程不存在' })
  const b = req.body
  execute('UPDATE map_trip_plans SET plan_date=?, title=?, notes=? WHERE id=?', [
    b.plan_date ?? existing.plan_date, b.title ?? existing.title, b.notes ?? existing.notes, Number(req.params.id)
  ])
  res.json({ code: 0, msg: '更新成功' })
})

router.delete('/trip-plans/:id', (req, res) => {
  const id = Number(req.params.id)
  execute('DELETE FROM map_trip_points WHERE plan_id = ?', [id])
  execute('DELETE FROM map_trip_plans WHERE id = ?', [id])
  res.json({ code: 0, msg: '删除成功' })
})

// ====== 行程点 ======

router.get('/trip-plans/:id/points', (req, res) => {
  const rows = queryAll('SELECT * FROM map_trip_points WHERE plan_id = ? ORDER BY sort_order ASC, id ASC', [Number(req.params.id)])
  res.json({ code: 0, data: rows })
})

router.post('/trip-points', (req, res) => {
  const b = req.body
  if (!b.plan_id || !b.customer_name) return res.status(400).json({ code: 1, msg: '参数不完整' })
  // 获取当前最大排序
  const maxSort = queryOne('SELECT MAX(sort_order) as m FROM map_trip_points WHERE plan_id = ?', [b.plan_id])
  const nextSort = (maxSort?.m ?? -1) + 1
  const r = execute(
    'INSERT INTO map_trip_points (plan_id, sort_order, customer_id, address_id, customer_name, address, latitude, longitude, contact_name, contact_phone, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [b.plan_id, nextSort, b.customer_id || null, b.address_id || null, b.customer_name, b.address || '',
     b.latitude || null, b.longitude || null, b.contact_name || '', b.contact_phone || '', b.notes || '']
  )
  res.json({ code: 0, data: { id: r.lastInsertRowid } })
})

router.put('/trip-points/:id', (req, res) => {
  const existing = queryOne('SELECT * FROM map_trip_points WHERE id = ?', [Number(req.params.id)])
  if (!existing) return res.status(404).json({ code: 1, msg: '行程点不存在' })
  const b = req.body
  execute(`UPDATE map_trip_points SET customer_name=?, address=?, latitude=?, longitude=?, contact_name=?, contact_phone=?, notes=?, sort_order=? WHERE id=?`, [
    b.customer_name ?? existing.customer_name, b.address ?? existing.address,
    b.latitude !== undefined ? b.latitude : existing.latitude,
    b.longitude !== undefined ? b.longitude : existing.longitude,
    b.contact_name ?? existing.contact_name, b.contact_phone ?? existing.contact_phone,
    b.notes ?? existing.notes, b.sort_order ?? existing.sort_order, Number(req.params.id)
  ])
  res.json({ code: 0, msg: '更新成功' })
})

router.delete('/trip-points/:id', (req, res) => {
  execute('DELETE FROM map_trip_points WHERE id = ?', [Number(req.params.id)])
  res.json({ code: 0, msg: '删除成功' })
})

// 批量重排序行程点
router.put('/trip-points/reorder', (req, res) => {
  const { plan_id, point_ids } = req.body
  if (!plan_id || !Array.isArray(point_ids)) return res.status(400).json({ code: 1, msg: '参数错误' })
  for (let i = 0; i < point_ids.length; i++) {
    execute('UPDATE map_trip_points SET sort_order = ? WHERE id = ? AND plan_id = ?', [i, point_ids[i], plan_id])
  }
  res.json({ code: 0, msg: '排序已更新' })
})

// ====== 地理编码 ======
// 支持 Nominatim（免费，全球） 和 高德地图（需要 API Key，中国地址精准）

router.get('/geocode', (req, res) => {
  const q = (req.query.q || '').trim()
  if (!q) return res.json({ code: 0, data: [] })
  const key = req.query.key || ''

  // 如果有高德 API Key → 优先用高德
  if (key) {
    const url = `https://restapi.amap.com/v3/geocode/geo?key=${encodeURIComponent(key)}&address=${encodeURIComponent(q)}&city=&output=json`
    https.get(url, (resp) => {
      let data = ''
      resp.on('data', chunk => data += chunk)
      resp.on('end', () => {
        try {
          const r = JSON.parse(data)
          if (r.status === '1' && r.geocodes && r.geocodes.length) {
            const results = r.geocodes.map(g => {
              const [lng, lat] = (g.location || '').split(',').map(Number)
              return {
                label: g.formatted_address || g.address || q,
                lat, lng,
                address: g.formatted_address || q,
                province: g.province || '',
                city: g.city || '',
                district: g.district || '',
                level: g.level || ''
              }
            }).filter(r => r.lat && r.lng)
            return res.json({ code: 0, data: results, provider: 'amap' })
          }
          // 高德没结果，fallback 到 Nominatim
          fallbackNominatim(q, res)
        } catch { fallbackNominatim(q, res) }
      })
    }).on('error', () => fallbackNominatim(q, res))
    return
  }

  // 无高德 Key → Nominatim
  fallbackNominatim(q, res)
})

function fallbackNominatim(q, res) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5&countrycodes=cn`
  https.get(url, { headers: { 'User-Agent': 'CrystalPriceSystem/1.0' } }, (resp) => {
    let data = ''
    resp.on('data', chunk => data += chunk)
    resp.on('end', () => {
      try {
        const results = JSON.parse(data).map(r => ({
          label: r.display_name,
          lat: parseFloat(r.lat),
          lng: parseFloat(r.lon),
          type: r.type,
          provider: 'nominatim'
        }))
        res.json({ code: 0, data: results, provider: 'nominatim' })
      } catch { res.json({ code: 0, data: [], provider: 'nominatim' }) }
    })
  }).on('error', () => res.json({ code: 0, data: [], provider: 'nominatim' }))
}

// ====== 反向地理编码 ======
router.get('/reverse-geocode', (req, res) => {
  const lat = parseFloat(req.query.lat)
  const lng = parseFloat(req.query.lng)
  const key = req.query.key || ''
  if (isNaN(lat) || isNaN(lng)) return res.status(400).json({ code: 1, msg: '参数错误' })

  // 有高德 Key → 优先用高德
  if (key) {
    const url = `https://restapi.amap.com/v3/geocode/regeo?key=${encodeURIComponent(key)}&location=${lng},${lat}&output=json`
    https.get(url, (resp) => {
      let data = ''
      resp.on('data', chunk => data += chunk)
      resp.on('end', () => {
        try {
          const r = JSON.parse(data)
          if (r.status === '1' && r.regeocode) {
            const addr = r.regeocode.formatted_address || ''
            return res.json({ code: 0, data: { address: addr, provider: 'amap' } })
          }
          fallbackReverseNominatim(lat, lng, res)
        } catch { fallbackReverseNominatim(lat, lng, res) }
      })
    }).on('error', () => fallbackReverseNominatim(lat, lng, res))
    return
  }

  fallbackReverseNominatim(lat, lng, res)
})

function fallbackReverseNominatim(lat, lng, res) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=zh`
  https.get(url, { headers: { 'User-Agent': 'CrystalPriceSystem/1.0' } }, (resp) => {
    let data = ''
    resp.on('data', chunk => data += chunk)
    resp.on('end', () => {
      try {
        const r = JSON.parse(data)
        res.json({ code: 0, data: { address: r.display_name || '', provider: 'nominatim' } })
      } catch { res.json({ code: 0, data: { address: '', provider: 'nominatim' } }) }
    })
  }).on('error', () => res.json({ code: 0, data: { address: '', provider: 'nominatim' } }))
}

// ====== Excel 导出 ======

router.get('/export', (_req, res) => {
  const customers = queryAll(`
    SELECT mc.*,
      (SELECT COUNT(*) FROM map_purchasers WHERE customer_id = mc.id) as purchaser_count,
      (SELECT COUNT(*) FROM map_addresses WHERE customer_id = mc.id) as address_count
    FROM map_customers mc ORDER BY mc.name ASC
  `)
  const purchasers = queryAll('SELECT mp.*, mc.name as customer_name FROM map_purchasers mp LEFT JOIN map_customers mc ON mp.customer_id = mc.id ORDER BY mc.name, mp.name')
  const addresses = queryAll('SELECT ma.*, mc.name as customer_name, mp.name as purchaser_name FROM map_addresses ma LEFT JOIN map_customers mc ON ma.customer_id = mc.id LEFT JOIN map_purchasers mp ON ma.purchaser_id = mp.id ORDER BY mc.name, ma.label')

  const wb = XLSX.utils.book_new()

  // Sheet1: 客户信息
  const ws1Data = [['客户名', '电话', '地址', '纬度', '经度', '备注', '采购数', '地址数', '创建时间']]
  for (const c of customers) {
    ws1Data.push([c.name, c.phone, c.address, c.latitude, c.longitude, c.notes, c.purchaser_count, c.address_count, c.created_at])
  }
  const ws1 = XLSX.utils.aoa_to_sheet(ws1Data)
  XLSX.utils.book_append_sheet(wb, ws1, '客户信息')

  // Sheet2: 采购联系人
  const ws2Data = [['所属客户', '采购名', '电话', '职位', '备注']]
  for (const p of purchasers) {
    ws2Data.push([p.customer_name, p.name, p.phone, p.title, p.notes])
  }
  const ws2 = XLSX.utils.aoa_to_sheet(ws2Data)
  XLSX.utils.book_append_sheet(wb, ws2, '采购联系人')

  // Sheet3: 收件地址
  const ws3Data = [['所属客户', '所属采购', '标签', '地址', '收件人', '联系电话', '纬度', '经度', '是否默认', '备注']]
  for (const a of addresses) {
    ws3Data.push([a.customer_name, a.purchaser_name || '', a.label, a.address, a.contact_name, a.contact_phone, a.latitude, a.longitude, a.is_default ? '是' : '否', a.notes])
  }
  const ws3 = XLSX.utils.aoa_to_sheet(ws3Data)
  XLSX.utils.book_append_sheet(wb, ws3, '收件地址')

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  const fn = '客户地址信息.xlsx'
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fn)}"; filename*=UTF-8''${encodeURIComponent(fn)}`)
  res.send(buffer)
})

export default router
