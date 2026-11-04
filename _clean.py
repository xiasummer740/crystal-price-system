p="server/src/db.js"
s=open(p,encoding="utf-8").read()
anchor='''      changed_at  DATETIME DEFAULT (datetime('now','localtime'))
    )
  `)
'''
add=anchor+'''
  // 美元报价只有未税价：清掉历史遗留的含税价（2026-11-04）
  try {
    db.run("UPDATE material_prices SET price_with_tax = NULL WHERE currency = 'USD' AND price_with_tax IS NOT NULL")
    const n = db.getRowsModified()
    if (n) console.log(`[db] 已清理 ${n} 条美元报价的含税价`)
  } catch {}
'''
assert anchor in s
s=s.replace(anchor,add,1)
open(p,"w",encoding="utf-8",newline="").write(s)
print("ok")
