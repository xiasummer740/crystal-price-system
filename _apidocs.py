p = r"client/src/utils/api.js"
s = open(p, encoding="utf-8").read()

s = s.replace("""export function fetchCompanyDocs(ownerType, ownerName) {
  return http.get('/company-docs/docs', { params: { owner_type: ownerType, owner_name: ownerName } })
}""", """export function fetchCompanyDocs(ownerType, ownerName, folderId) {
  const params = { owner_type: ownerType, owner_name: ownerName }
  if (folderId !== undefined && folderId !== null) params.folder_id = folderId
  return http.get('/company-docs/docs', { params })
}

// ===== 资料文件夹 + 过期时间（祥哥 2026-10-29）=====
export function fetchDocFolders(ownerType, ownerName) {
  return http.get('/company-docs/folders', { params: { owner_type: ownerType, owner_name: ownerName } })
}
export function createDocFolder(ownerType, ownerName, name) {
  return http.post('/company-docs/folders', { owner_type: ownerType, owner_name: ownerName, name })
}
export function deleteDocFolder(id) {
  return http.delete(`/company-docs/folders/${id}`)
}
export function setDocExpiry(id, expiresAt) {
  return http.post(`/company-docs/docs/${id}/expiry`, { expires_at: expiresAt })
}""")

s = s.replace("""export function uploadCompanyDocs({ ownerType, ownerName, category, files, onProgress }) {
  const fd = new FormData()
  for (const f of files) fd.append('files', f, f.name)
  return http.post('/company-docs/upload', fd, {
    params: { owner_type: ownerType, owner_name: ownerName, category: category || '' },""", """export function uploadCompanyDocs({ ownerType, ownerName, category, folderId, files, onProgress }) {
  const fd = new FormData()
  for (const f of files) fd.append('files', f, f.name)
  return http.post('/company-docs/upload', fd, {
    params: { owner_type: ownerType, owner_name: ownerName, category: category || '', folder_id: folderId || 0 },""")
open(p, "w", encoding="utf-8", newline="").write(s)
print("ok")
