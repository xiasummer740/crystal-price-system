p="client/src/views/Materials.vue"
s=open(p,encoding="utf-8").read()
s=s.replace("</b>\n                  <span>· {{ quoteRef.factory || '工厂未填' }}</span>","</b>\n                  <span>&nbsp;· {{ quoteRef.factory || '工厂未填' }}</span>",1)
open(p,"w",encoding="utf-8",newline="").write(s)
print("ok")
