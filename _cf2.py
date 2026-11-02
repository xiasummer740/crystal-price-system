p="client/src/utils/api.js"
s=open(p,encoding="utf-8").read()
s=s.replace("""export function deleteCustomerFolder(customer, folder) {
  return http.post('/customer-files/delete-folder', { customer, folder })
}""","""export function deleteCustomerFolder(customer, folder, force = false) {
  return http.post('/customer-files/delete-folder', { customer, folder, force })
}""",1)
open(p,"w",encoding="utf-8",newline="").write(s)
print("api ok")
