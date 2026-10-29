p="client/src/views/CompanyDocs.vue"
s=open(p,encoding="utf-8").read()
s=s.replace(".comp-docs {", ".comp-card :deep(.cdf) { margin-top: 6px; }\n.comp-docs { margin-bottom: 4px; }\n.comp-docs {", 1)
open(p,"w",encoding="utf-8",newline="").write(s)
print("ok")
