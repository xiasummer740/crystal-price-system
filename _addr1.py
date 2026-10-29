p = r"server/src/routes/materials.js"
s = open(p, encoding="utf-8").read()
anchor = "router.get('/:id',"
add = '''// 客户收货地址（来自地图地址页的收货点 + 联系人地址），客户物料页直接展示
router.get('/customer-addresses', (req, res) => {
  const customer = String(req.query.customer || '').trim()
  if (!customer) return res.json({ code: 0, data: [] })
  const c = queryOne('SELECT id FROM map_customers WHERE name = ?', [customer])
  if (!c) return res.json({ code: 0, data: [] })
  const sites = queryAll(
    `SELECT name, address, contact_name, contact_phone, is_default
       FROM map_sites WHERE customer_id = ? AND address <> ''
      ORDER BY is_default DESC, id ASC`,
    [c.id]
  )
  const purchasers = queryAll(
    `SELECT name, phone, address FROM map_purchasers
      WHERE customer_id = ? AND address <> '' ORDER BY id ASC`,
    [c.id]
  )
  const data = [
    ...sites.map((x) => ({ type: 'site', label: x.name || '收货点', address: x.address, contact: [x.contact_name, x.contact_phone].filter(Boolean).join(' '), is_default: !!x.is_default })),
    ...purchasers.map((x) => ({ type: 'purchaser', label: x.name ? x.name + ' 收件地址' : '联系人地址', address: x.address, contact: x.phone || '', is_default: false }))
  ]
  res.json({ code: 0, data })
})

'''
assert anchor in s
s = s.replace(anchor, add + anchor, 1)
open(p, "w", encoding="utf-8", newline="").write(s)
print("ok")
