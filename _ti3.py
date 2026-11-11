p="client/src/views/Materials.vue"
s=open(p,encoding="utf-8").read()
s=s.replace("  const q = (carryKeyword || '').trim()\n  keyword.value = (q && !name.includes(q)) ? q : ''","  const q = (carryKeyword || '').trim()\n  const shown = displayName || name\n  keyword.value = (q && !shown.includes(q) && !name.includes(q)) ? q : ''",1)
open(p,"w",encoding="utf-8",newline="").write(s)
print("ok")
