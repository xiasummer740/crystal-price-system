p="client/src/utils/api.js"
s=open(p,encoding="utf-8").read()
s=s.replace("""export function copyMaterialFile(url) {
  return http.post('/materials/copy-file', { url })
}""","""export function copyMaterialFile(url) {
  return http.post('/materials/copy-file', { url })
}
/** 批量同步成本价：只补空值（按同料号最近一次成本） */
export function syncMaterialCost(customer) {
  return http.post('/materials/sync-cost', { customer })
}""")
open(p,"w",encoding="utf-8",newline="").write(s)
print("api ok")
