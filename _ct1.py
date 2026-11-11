p="server/src/db.js"
s=open(p,encoding="utf-8").read()
anchor="  // 客户抬头（同一客户/集团下可有多家开票主体，2026-11-11）"
add='''  // 客户资料按抬头隔离（2026-11-11）
  try { db.run("ALTER TABLE company_docs ADD COLUMN title TEXT DEFAULT ''") } catch {}
  try { db.run("ALTER TABLE company_doc_folders ADD COLUMN title TEXT DEFAULT ''") } catch {}

'''
assert anchor in s
s=s.replace(anchor, add+anchor,1)
open(p,"w",encoding="utf-8",newline="").write(s)
print("db ok")
