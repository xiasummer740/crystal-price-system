p = r"server/src/routes/materials.js"
s = open(p, encoding="utf-8").read()

helper = '''
/** 同料号最近一次非空成本价（优先晶科鑫料号，其次物料编码；跨客户，成本与客户无关） */
function lookupCostPrice(jkxCode, materialCode) {
  const tries = []
  if (jkxCode) tries.push(['jkx_code = ?', jkxCode])
  if (materialCode) tries.push(['material_code = ?', materialCode])
  for (const [where, val] of tries) {
    const r = queryOne(
      `SELECT cost_price FROM customer_materials
        WHERE is_deleted = 0 AND cost_price IS NOT NULL AND cost_price <> '' AND ${where}
        ORDER BY date DESC, id DESC LIMIT 1`,
      [val]
    )
    if (r?.cost_price) return String(r.cost_price)
  }
  return ''
}

'''
anchor = '// 新增\nrouter.post'
assert anchor in s
s = s.replace(anchor, helper + anchor, 1)

# create auto fill
s = s.replace("""    b.price || '',
    b.cost_price || '',""", """    b.price || '',
    b.cost_price || lookupCostPrice(b.jkx_code, b.material_code) || '',""", 1)

# sync endpoint before export/import? 放在编辑之前，避免受 /:id 影响
anchor2 = '// 编辑\nrouter.put'
add2 = '''// 批量同步成本价：只补空值，不覆盖已填（祥哥 2026-10-29）
router.post('/sync-cost', (req, res) => {
  try {
    const customer = String(req.body?.customer || '').trim()
    const rows = customer
      ? queryAll("SELECT id, jkx_code, material_code FROM customer_materials WHERE is_deleted = 0 AND (cost_price IS NULL OR cost_price = '') AND customer = ?", [customer])
      : queryAll("SELECT id, jkx_code, material_code FROM customer_materials WHERE is_deleted = 0 AND (cost_price IS NULL OR cost_price = '')")
    let updated = 0
    for (const r of rows) {
      const cost = lookupCostPrice(r.jkx_code, r.material_code)
      if (!cost) continue
      execute("UPDATE customer_materials SET cost_price = ?, updated_at = datetime('now','localtime') WHERE id = ?", [cost, r.id])
      updated++
    }
    if (updated) triggerBackup('materials')
    res.json({ code: 0, data: { updated, blanks: rows.length } })
  } catch (e) {
    res.status(500).json({ code: 1, msg: '同步成本价失败: ' + e.message })
  }
})

'''
assert anchor2 in s
s = s.replace(anchor2, add2 + anchor2, 1)
open(p, "w", encoding="utf-8", newline="").write(s)
print("ok")
