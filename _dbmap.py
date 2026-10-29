p = r"server/src/db.js"
s = open(p, encoding="utf-8").read()
anchor = '  try { db.run(\'CREATE INDEX IF NOT EXISTS idx_map_customers_name ON map_customers(name)\') } catch {}'
add = anchor + """
  // 客户资料最近更新时间（列表排序用）
  try { db.run("ALTER TABLE map_customers ADD COLUMN updated_at TEXT DEFAULT ''") } catch {}
  // 地址变更历史（谁改的、什么时候）
  db.run(`
    CREATE TABLE IF NOT EXISTS map_address_history (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      old_address TEXT DEFAULT '',
      new_address TEXT DEFAULT '',
      changed_at  DATETIME DEFAULT (datetime('now','localtime'))
    )
  `)"""
assert anchor in s
s = s.replace(anchor, add, 1)
open(p, "w", encoding="utf-8", newline="").write(s)
print("db ok")
