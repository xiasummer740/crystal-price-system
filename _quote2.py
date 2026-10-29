p="client/src/utils/api.js"
s=open(p,encoding="utf-8").read()
s=s.replace("""/** 批量同步成本价：只补空值（按同料号最近一次成本） */""","""/** 报价页面：按物料编码取最近一条报价 */
export function fetchLatestQuote(code) {
  return http.get('/materials/latest-quote', { params: { code } })
}
/** 批量同步成本价：只补空值（按同料号最近一次成本） */""")
open(p,"w",encoding="utf-8",newline="").write(s)
print("api ok")
