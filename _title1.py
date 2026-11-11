p="server/src/db.js"
s=open(p,encoding="utf-8").read()
anchor="  // 客户物料：交期（祥哥 2026-11-06）"
add='''  // 客户抬头（同一客户/集团下可有多家开票主体，2026-11-11）
  db.run(`
    CREATE TABLE IF NOT EXISTS customer_titles (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      customer    TEXT NOT NULL,
      title       TEXT NOT NULL,
      tax_no      TEXT DEFAULT '',
      address     TEXT DEFAULT '',
      phone       TEXT DEFAULT '',
      contact     TEXT DEFAULT '',
      is_default  INTEGER DEFAULT 0,
      created_at  DATETIME DEFAULT (datetime('now','localtime'))
    )
  `)
  try { db.run('CREATE INDEX IF NOT EXISTS idx_customer_titles_customer ON customer_titles(customer)') } catch {}

'''
assert anchor in s
s=s.replace(anchor,add+anchor,1)
open(p,"w",encoding="utf-8",newline="").write(s)
print("db ok")
