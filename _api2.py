p = r"client/src/utils/api.js"
s = open(p, encoding="utf-8").read()
s = s.replace("""export function setDocExpiry(id, expiresAt) {
  return http.post(`/company-docs/docs/${id}/expiry`, { expires_at: expiresAt })
}""", """export function setDocExpiry(id, expiresAt) {
  return http.post(`/company-docs/docs/${id}/expiry`, { expires_at: expiresAt })
}
export function renameDocFolder(id, name) {
  return http.post(`/company-docs/folders/${id}/rename`, { name })
}
export function moveCompanyDoc(id, folderId) {
  return http.post(`/company-docs/docs/${id}/move`, { folder_id: folderId })
}""")
open(p, "w", encoding="utf-8", newline="").write(s)
print("ok")
