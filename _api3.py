p="client/src/utils/api.js"
s=open(p,encoding="utf-8").read()
s=s.replace("""export function getMapCustomer(id) {
  return http.get(`/map/customers/${id}`)
}""","""export function getMapCustomer(id) {
  return http.get(`/map/customers/${id}`)
}
export function fetchMapAddressHistory(id) {
  return http.get(`/map/customers/${id}/address-history`)
}""")
open(p,"w",encoding="utf-8",newline="").write(s)
print("ok")
