p = r"server/src/db.js"
s = open(p, encoding="utf-8").read()
anchor = "  try { db.run('CREATE INDEX IF NOT EXISTS idx_company_docs_owner ON company_docs(owner_type, owner_name)') } catch {}"
add = anchor + """

  // 公司资料柜：按「日期+自定义」建文件夹；文件可设过期时间（体系证书年审用）
  db.run(`
    CREATE TABLE IF NOT EXISTS company_doc_folders (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_type  TEXT NOT NULL DEFAULT 'customer',
      owner_name  TEXT NOT NULL DEFAULT '',
      name        TEXT NOT NULL,
      created_at  DATETIME DEFAULT (datetime('now','localtime')),
      UNIQUE(owner_type, owner_name, name)
    )
  `)
  try { db.run('ALTER TABLE company_docs ADD COLUMN folder_id INTEGER DEFAULT 0') } catch {}
  try { db.run("ALTER TABLE company_docs ADD COLUMN expires_at TEXT DEFAULT ''") } catch {}"""
assert anchor in s
s = s.replace(anchor, add, 1)
open(p, "w", encoding="utf-8", newline="").write(s)
print("ok")
