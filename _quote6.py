p="server/src/routes/materials.js"
s=open(p,encoding="utf-8").read()
start=s.index("router.get('/latest-quote'")
end=s.index("// 批量同步成本价", start)
block=s[start:end]
s=s[:start]+s[end:]
anchor="router.get('/:id',"
idx=s.index(anchor)
s=s[:idx]+block+s[idx:]
open(p,"w",encoding="utf-8",newline="").write(s)
print("moved")
