p = r"server/src/routes/map.js"
s = open(p, encoding="utf-8").read()

s = s.replace("""      (SELECT COUNT(*) FROM map_sites WHERE customer_id = mc.id) as site_count
    FROM map_customers mc""", """      (SELECT COUNT(*) FROM map_sites WHERE customer_id = mc.id) as site_count,
      (SELECT name FROM map_sites WHERE customer_id = mc.id ORDER BY is_default DESC, id ASC LIMIT 1) as default_site_name,
      (SELECT address FROM map_sites WHERE customer_id = mc.id ORDER BY is_default DESC, id ASC LIMIT 1) as default_site_address
    FROM map_customers mc""")

old_put = """  const b = req.body;
  execute(
    `UPDATE map_customers SET name=?, phone=?, address=?, latitude=?, longitude=?, notes=? WHERE id=?`,"""
new_put = """  const b = req.body;
  // 地址改了 → 记一条变更历史（祥哥 2026-10-29）
  const newAddr = b.address !== undefined ? String(b.address || '') : existing.address
  if (newAddr !== (existing.address || '')) {
    try {
      execute(
        'INSERT INTO map_address_history (customer_id, old_address, new_address) VALUES (?, ?, ?)',
        [Number(req.params.id), existing.address || '', newAddr]
      )
    } catch {}
  }
  execute(
    `UPDATE map_customers SET name=?, phone=?, address=?, latitude=?, longitude=?, notes=?, updated_at=datetime('now','localtime') WHERE id=?`,"""
assert old_put in s
s = s.replace(old_put, new_put, 1)

# 地址历史接口（放在获取单个客户之前）
anchor2 = '// 获取单个客户完整信息'
add2 = '''// 地址变更历史
router.get("/customers/:id/address-history", (req, res) => {
  const rows = queryAll(
    "SELECT * FROM map_address_history WHERE customer_id = ? ORDER BY id DESC LIMIT 100",
    [Number(req.params.id)]
  );
  res.json({ code: 0, data: rows });
});

'''
assert anchor2 in s
s = s.replace(anchor2, add2 + anchor2, 1)
open(p, "w", encoding="utf-8", newline="").write(s)
print("route ok")
