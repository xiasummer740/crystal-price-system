p="client/src/utils/api.js"
s=open(p,encoding="utf-8").read()
s=s.replace("""export function deleteCustomerFile(customer, folder, name) {""","""export function renameCustomerFile(customer, folder, name, newName) {
  return http.post('/customer-files/rename', { customer, folder, name, newName })
}
export function deleteCustomerFile(customer, folder, name) {""",1)
open(p,"w",encoding="utf-8",newline="").write(s)
print("api ok")
