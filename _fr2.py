p="client/src/utils/api.js"
s=open(p,encoding="utf-8").read()
s=s.replace("""export function renameCustomerFile(customer, folder, name, newName) {""","""export function renameCustomerFolder(customer, folder, newName) {
  return http.post('/customer-files/rename-folder', { customer, folder, newName })
}
export function renameCustomerFile(customer, folder, name, newName) {""",1)
open(p,"w",encoding="utf-8",newline="").write(s)
print("api ok")
