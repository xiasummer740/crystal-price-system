p = r"server/src/routes/materials.js"
s = open(p, encoding="utf-8").read()

# 最新报价查询 helper + 接口，放在 sync-cost 前
anchor = "// 批量同步成本价：只补空值"
add = '''/** 报价页面：按物料编码取最近一条报价（含时间/价格/工厂/报价人） */
function latestQuoteFor(code) {
  if (!code) return null
  const q = queryOne(
    `SELECT id, created_at, material_code, material_name, material_spec,
            price_with_tax, price_without_tax, currency, factory_code, quoter
       FROM material_prices
      WHERE is_deleted = 0 AND material_code = ?
      ORDER BY created_at DESC, id DESC LIMIT 1`,
    [String(code)]
  )
  if (!q) return null
  return {
    id: q.id,
    date: String(q.created_at || '').slice(0, 10),
    material_code: q.material_code,
    material_name: q.material_name,
    spec: q.material_spec || '',
    price: q.price_with_tax ?? q.price_without_tax ?? '',
    price_with_tax: q.price_with_tax,
    price_without_tax: q.price_without_tax,
    currency: q.currency || 'CNY',
    factory: q.factory_code || '',
    quoter: q.quoter || ''
  }
}

router.get('/latest-quote', (req, res) => {
  const code = String(req.query.code || '').trim()
  if (!code) return res.json({ code: 0, data: null })
  res.json({ code: 0, data: latestQuoteFor(code) })
})

'''
assert anchor in s
s = s.replace(anchor, add + anchor, 1)

# 列表每行附最新报价（物料编码优先，其次晶科鑫料号）
old = '''  // 每行补上停留时长（精确/估算两种口径，见 utils/materialDwell.js 顶部注释）
  annotateDwell(rows)'''
new = '''  // 每行补上停留时长（精确/估算两种口径，见 utils/materialDwell.js 顶部注释）
  annotateDwell(rows)
  // 每行带出最近一次报价信息（鼠标悬停成本价时显示）
  for (const r of rows) {
    r.latest_quote = latestQuoteFor(r.material_code) || latestQuoteFor(r.jkx_code)
  }'''
assert old in s
s = s.replace(old, new, 1)
open(p, "w", encoding="utf-8", newline="").write(s)
print("ok")
