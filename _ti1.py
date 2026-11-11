p="server/src/routes/materials.js"
s=open(p,encoding="utf-8").read()
old='''router.get('/customers/search', (req, res) => {
  res.json({ code: 0, data: resolveSuggestWithMaterialMatch(req.query.keyword, req.query.limit) })
})'''
new='''router.get('/customers/search', (req, res) => {
  const keyword = String(req.query.keyword || '').trim()
  const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 20))
  const base = resolveSuggestWithMaterialMatch(keyword, limit)
  if (!keyword) return res.json({ code: 0, data: base })
  // 抬头也算搜索入口：搜到抬头 → 归到它所属的客户，物料同一套
  const titles = queryAll(
    `SELECT t.title, t.customer,
            (SELECT COUNT(*) FROM customer_materials m WHERE m.is_deleted = 0 AND m.customer = t.customer) AS material_count
       FROM customer_titles t
      WHERE t.title LIKE ?
      ORDER BY t.is_default DESC, t.id ASC LIMIT ?`,
    [`%${keyword}%`, limit]
  )
  const existing = new Set(base.map(x => x.name))
  for (const t of titles) {
    if (!t.title || t.title === t.customer || existing.has(t.title)) continue
    base.push({ name: t.title, customer: t.customer, is_title: true, material_count: t.material_count || 0 })
  }
  res.json({ code: 0, data: base })
})'''
assert old in s
s=s.replace(old,new,1)
open(p,"w",encoding="utf-8",newline="").write(s)
print("server ok")
