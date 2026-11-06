p="server/src/db.js"
s=open(p,encoding="utf-8").read()
anchor='  // 客户资料最近更新时间（列表排序用）'
add='''  // 客户物料：交期（祥哥 2026-11-06）
  try { db.run("ALTER TABLE customer_materials ADD COLUMN lead_time TEXT DEFAULT ''") } catch {}

'''
assert anchor in s
s=s.replace(anchor, add+anchor,1)
open(p,"w",encoding="utf-8",newline="").write(s)
print("db ok")
