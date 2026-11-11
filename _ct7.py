p="client/src/utils/api.js"
s=open(p,encoding="utf-8").read()
s=s.replace('''export function fetchCompanyDocs(ownerType, ownerName, folderId) {
  const params = { owner_type: ownerType, owner_name: ownerName }
  if (folderId !== undefined && folderId !== null) params.folder_id = folderId
  return http.get('/company-docs/docs', { params })
}''','''export function fetchCompanyDocs(ownerType, ownerName, folderId, billingTitle) {
  const params = { owner_type: ownerType, owner_name: ownerName }
  if (folderId !== undefined && folderId !== null) params.folder_id = folderId
  if (billingTitle !== undefined && billingTitle !== null) params.title = billingTitle
  return http.get('/company-docs/docs', { params })
}''',1)
s=s.replace('''export function fetchDocFolders(ownerType, ownerName) {
  return http.get('/company-docs/folders', { params: { owner_type: ownerType, owner_name: ownerName } })
}''','''export function fetchDocFolders(ownerType, ownerName, billingTitle) {
  const params = { owner_type: ownerType, owner_name: ownerName }
  if (billingTitle !== undefined && billingTitle !== null) params.title = billingTitle
  return http.get('/company-docs/folders', { params })
}''',1)
s=s.replace('''export function createDocFolder(ownerType, ownerName, name) {
  return http.post('/company-docs/folders', { owner_type: ownerType, owner_name: ownerName, name })
}''','''export function createDocFolder(ownerType, ownerName, name, billingTitle) {
  return http.post('/company-docs/folders', { owner_type: ownerType, owner_name: ownerName, name, title: billingTitle || '' })
}''',1)
s=s.replace('''export function uploadCompanyDocs({ ownerType, ownerName, category, folderId, files, onProgress }) {''','''export function uploadCompanyDocs({ ownerType, ownerName, category, folderId, billingTitle, files, onProgress }) {''',1)
s=s.replace("    params: { owner_type: ownerType, owner_name: ownerName, category: category || '', folder_id: folderId || 0 },","    params: { owner_type: ownerType, owner_name: ownerName, category: category || '', folder_id: folderId || 0, title: billingTitle || '' },",1)
open(p,"w",encoding="utf-8",newline="").write(s)
print("api ok")
