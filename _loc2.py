p="client/src/utils/api.js"
s=open(p,encoding="utf-8").read()
s=s.replace("""export function openCustomerFile(customer, folder, name) {
  return http.post('/customer-files/open', { customer, folder, name })
}""","""export function openCustomerFile(customer, folder, name) {
  return http.post('/customer-files/open', { customer, folder, name })
}
export function getCustomerFilePath(customer, folder, name) {
  return http.post('/customer-files/path', { customer, folder, name })
}""",1)
open(p,"w",encoding="utf-8",newline="").write(s)
print("api ok")
