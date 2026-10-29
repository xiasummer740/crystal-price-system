import axios from 'axios'
import { useSaveStatusStore } from '../stores/saveStatus.js'

export const http = axios.create({
  baseURL: '/api',
  timeout: 15000
})

// 自动附加鉴权 token
async function ensureToken() {
  let token = localStorage.getItem('crystal_auth_token')
  if (!token) {
    try { const r = await axios.get('/api/auth/token'); token = r.data.data.token; localStorage.setItem('crystal_auth_token', token) } catch {}
  }
  return token
}
ensureToken()

// 写操作方法名
const WRITE_METHODS = ['post', 'put', 'delete', 'patch']

http.interceptors.request.use(async config => {
  if (config.method !== 'get') {
    const token = await ensureToken()
    if (token) config.headers['x-auth-token'] = token
  }
  // 写请求：通知 saveStatus 进入 saving
  if (WRITE_METHODS.includes(config.method)) {
    try { useSaveStatusStore().setSaving() } catch {}
  }
  return config
})


http.interceptors.response.use(
  res => {
    // 写请求成功：通知 saveStatus 已保存
    if (WRITE_METHODS.includes(res.config.method)) {
      try { useSaveStatusStore().setSaved() } catch {}
    }
    return res.data
  },
  err => {
    // 写请求失败：通知 saveStatus 失败
    const method = err.config?.method
    if (method && WRITE_METHODS.includes(method)) {
      try { useSaveStatusStore().setFailed(err) } catch {}
    }
    // 401 → 刷新 token 后自动重试一次（避免用户感知到 token 过期）
    if (err.response?.status === 401 && !err.config?._retry) {
      localStorage.removeItem('crystal_auth_token')
      return ensureToken().then(newToken => {
        if (!newToken) return Promise.reject(new Error('无法获取授权令牌'))
        err.config._retry = true
        err.config.headers['x-auth-token'] = newToken
        return http(err.config)
      })
    }
    const msg = err.response?.data?.msg || '网络错误'
    return Promise.reject(new Error(msg))
  }
)

export function fetchPrices(params) {
  return http.get('/prices', { params })
}

export function fetchPricesGrouped(params) {
  return http.get('/prices/grouped', { params })
}

export function getPrice(id) {
  return http.get(`/prices/${id}`)
}

export function createPrice(data) {
  return http.post('/prices', data)
}

export function updatePrice(id, data) {
  return http.put(`/prices/${id}`, data)
}

export function deletePrice(id) {
  return http.delete(`/prices/${id}`)
}

// 报价备注图片/文件上传与删除
export function uploadPriceImages(formData) {
  return http.post('/prices/upload', formData)
}
// 迁移到归档区后文件在多层目录里，裸文件名不够用 —— 传完整 URL 由后端解析回磁盘路径
export function deletePriceImage(url) {
  return http.delete('/prices/upload', { params: { url } })
}

// 客户物料备注图片/文件上传与删除
// customer 决定落位（客户管理/<客户>/物料图片/），不传则进 _未分配客户
export function uploadMaterialImages(formData, customer = '') {
  return http.post('/materials/upload', formData, { params: { customer } })
}
export function deleteMaterialImage(url) {
  return http.delete('/materials/upload', { params: { url } })
}
/** 把规格书/附件文件复制到系统剪贴板（可粘到微信） */
export function copyMaterialFile(url) {
  return http.post('/materials/copy-file', { url })
}
/** 客户收货地址（地图地址页的收货点/联系人地址） */
export function fetchCustomerAddresses(customer) {
  return http.get('/materials/customer-addresses', { params: { customer } })
}
/** 报价页面：按物料编码取最近一条报价 */
export function fetchLatestQuote(code) {
  return http.get('/materials/latest-quote', { params: { code } })
}
/** 批量同步成本价：只补空值（按同料号最近一次成本） */
export function syncMaterialCost(customer) {
  return http.post('/materials/sync-cost', { customer })
}

export function getMetaOptions() {
  return http.get('/prices/meta/options')
}

export function getColumnValues(column, keyword = '') {
  return http.get(`/prices/column-values/${column}`, { params: { keyword } })
}

export function exportExcel(params) {
  return http.get('/export', { params, responseType: 'blob' })
}

export function importExcel(formData) {
  return http.post('/import', formData)
}

export function importSamples(formData) {
  return http.post('/samples/import', formData)
}

export function fetchTrashList() {
  return http.get('/prices/trash/list')
}

export function restoreTrash(id) {
  return http.post(`/prices/trash/restore/${id}`)
}

export function permanentDeleteTrash(id) {
  return http.delete(`/prices/trash/${id}`)
}

export function clearTrash(ids) {
  return http.post('/prices/trash/clear', ids ? { ids } : {})
}

// ====== 记事便签 ======
export function fetchNotes(params) {
  return http.get('/notes', { params })
}
export function getNote(id) {
  return http.get(`/notes/${id}`)
}
export function createNote(data) {
  return http.post('/notes', data)
}
export function updateNote(id, data) {
  return http.put(`/notes/${id}`, data)
}
export function deleteNote(id) {
  return http.delete(`/notes/${id}`)
}
export function batchDeleteNotes(ids) {
  return http.post('/notes/batch-delete', { ids })
}
export function getDueReminders() {
  return http.get('/notes/reminders')
}
export function markReminded(id) {
  return http.post(`/notes/${id}/reminded`)
}
// customer + date 决定落位（客户管理/<客户>/记事/<日期>/），date 不传则由后端取当天
export function uploadNoteImages(formData, customer = '', date = '') {
  return http.post('/notes/upload', formData, { params: { customer, date } })
}
export function deleteNoteImage(url) {
  return http.delete('/notes/upload', { params: { url } })
}
export function fetchNoteCustomers() {
  return http.get('/notes/customers/list')
}
export function exportNotesPackage(params) {
  return http.get('/notes/export', { params, responseType: 'blob' })
}
export function importNotesZip(formData) {
  return http.post('/notes/import', formData)
}
export function downloadNoteTemplate() {
  return http.get('/notes/template', { responseType: 'blob' })
}

// ====== 事项类型 ======
export function fetchCategories() {
  return http.get('/notes/categories/list')
}
export function createCategory(data) {
  return http.post('/notes/categories', data)
}
export function updateCategory(id, data) {
  return http.put(`/notes/categories/${id}`, data)
}
export function deleteCategory(id) {
  return http.delete(`/notes/categories/${id}`)
}

// ====== 应用设置（Key-Value 持久化，跨升级保留） ======
export function fetchSettings() {
  return http.get('/settings')
}
export function saveSettings(data) {
  return http.post('/settings', data)
}

// ====== 地图地址 ======
export function fetchMapCustomers(params) {
  return http.get('/map/customers', { params })
}
export function getMapCustomer(id) {
  return http.get(`/map/customers/${id}`)
}
export function fetchMapAddressHistory(id) {
  return http.get(`/map/customers/${id}/address-history`)
}
export function createMapCustomer(data) {
  return http.post('/map/customers', data)
}
export function updateMapCustomer(id, data) {
  return http.put(`/map/customers/${id}`, data)
}
export function deleteMapCustomer(id) {
  return http.delete(`/map/customers/${id}`)
}
export function importMapCustomersFromNotes() {
  return http.post('/map/customers/import')
}
export function geocodeAddress(q, amapKey) {
  const params = { q }
  if (amapKey) params.key = amapKey
  return http.get('/map/geocode', { params })
}
export function reverseGeocode(lat, lng, amapKey) {
  const params = { lat, lng }
  if (amapKey) params.key = amapKey
  return http.get('/map/reverse-geocode', { params })
}
export function poiSearch(keywords, amapKey, page = 1, city = '') {
  const params = { keywords, page, merge: '1' }
  if (amapKey) params.key = amapKey
  if (city) params.city = city
  // 安全密钥
  const jscode = localStorage.getItem('crystal_amap_jscode') || ''
  if (jscode) params.jscode = jscode
  return http.get('/map/poi-search', { params })
}

// 保存高德安全密钥
export function setAmapJscode(code) {
  if (code) localStorage.setItem('crystal_amap_jscode', code)
  else localStorage.removeItem('crystal_amap_jscode')
}
export function getAmapKey() {
  return localStorage.getItem('crystal_amap_key') || ''
}
export function exportMapAddresses() {
  return http.get('/map/export', { responseType: 'blob' })
}
// Map purchasers
export function fetchPurchasers(customerId) {
  return http.get(`/map/customers/${customerId}/purchasers`)
}
export function createPurchaser(data) {
  return http.post('/map/purchasers', data)
}
export function updatePurchaser(id, data) {
  return http.put(`/map/purchasers/${id}`, data)
}
export function deletePurchaser(id) {
  return http.delete(`/map/purchasers/${id}`)
}
// Map addresses
export function fetchAddresses(customerId) {
  return http.get(`/map/customers/${customerId}/addresses`)
}
export function createAddress(data) {
  return http.post('/map/addresses', data)
}
export function updateAddress(id, data) {
  return http.put(`/map/addresses/${id}`, data)
}
export function deleteAddress(id) {
  return http.delete(`/map/addresses/${id}`)
}
// Sites（收货点）
export function fetchSites(customerId) {
  return http.get(`/map/customers/${customerId}/sites`)
}
export function createSite(data) {
  return http.post('/map/sites', data)
}
export function updateSite(id, data) {
  return http.put(`/map/sites/${id}`, data)
}
export function deleteSite(id) {
  return http.delete(`/map/sites/${id}`)
}
// Trip plans
export function fetchTripPlans(params) {
  return http.get('/map/trip-plans', { params })
}
export function getTripPlan(id) {
  return http.get(`/map/trip-plans/${id}`)
}
export function createTripPlan(data) {
  return http.post('/map/trip-plans', data)
}
export function updateTripPlan(id, data) {
  return http.put(`/map/trip-plans/${id}`, data)
}
export function deleteTripPlan(id) {
  return http.delete(`/map/trip-plans/${id}`)
}
// Trip points
export function getTripPoints(planId) {
  return http.get(`/map/trip-plans/${planId}/points`)
}
export function createTripPoint(data) {
  return http.post('/map/trip-points', data)
}
export function updateTripPoint(id, data) {
  return http.put(`/map/trip-points/${id}`, data)
}
export function deleteTripPoint(id) {
  return http.delete(`/map/trip-points/${id}`)
}
export function reorderTripPoints(planId, pointIds) {
  return http.put('/map/trip-points/reorder', { plan_id: planId, point_ids: pointIds })
}

// ====== 客户物料 ======
export function fetchMaterials(params) {
  return http.get('/materials', { params })
}
export function getMaterial(id) {
  return http.get(`/materials/${id}`)
}
export function createMaterial(data) {
  return http.post('/materials', data)
}
export function updateMaterial(id, data) {
  return http.put(`/materials/${id}`, data)
}
export function deleteMaterial(id) {
  return http.delete(`/materials/${id}`)
}
export function getMaterialStatusConfig() {
  return http.get('/materials/status-config')
}
export function exportMaterials() {
  return http.get('/materials/export', { responseType: 'blob' })
}
export function importMaterialsExcel(formData) {
  return http.post('/materials/import', formData)
}
export function searchAllCustomers(keyword) {
  return http.get('/materials/customers/search', { params: { keyword } })
}
export function fetchMaterialCustomers() {
  return http.get('/materials/customers/list')
}

// ===== 客户名统一入口（所有页面的联想/下拉都该走这里）=====
// 查询范围 = customers 名册 ∪ 记事 ∪ 客户物料 ∪ 报价 ∪ 地图（并集），
// 所以不管客户名是在哪个页面录进去的，这里都能搜到。
// 返回项形如 { name, material_count, quote_count, note_count, map_count, total_count }
export function suggestCustomers(keyword, limit) {
  return http.get('/customers/suggest', { params: { keyword, limit } })
}
/** 取全部客户名（字符串数组），给下拉/网格用 */
export function fetchAllCustomerNames() {
  return http.get('/customers/list', { params: { limit_as_list: 1 } })
}
/** 取全部客户名（对象数组，带各来源计数） */
export function fetchAllCustomersDetailed() {
  return http.get('/customers/list')
}

// ===== 客户名册管理（删除 / 合并）=====
// 为什么需要：页面显示的是「名册 ∪ 各来源表」的**并集**，所以「只从名册删」没有用 ——
// 源头还写着旧名字，页面照样显示、下次启动还会回填。后端因此规定：
// 有引用时拒绝直接删（并告诉你被哪张表引用了几条），要改就用合并。
// 详见 server/src/routes/customers.js 顶部注释。
export function fetchCustomerRegistry(params) {
  return http.get('/customers/manage', { params })
}
export function previewCustomerMerge(from, to) {
  return http.post('/customers/merge-preview', { from, to })
}
export function mergeCustomerName(from, to) {
  return http.post('/customers/merge', { from, to })
}
export function deleteCustomerName(name) {
  return http.delete('/customers/' + encodeURIComponent(name))
}
export function fetchMaterialFactories(customer) {
  return http.get('/materials/factories/list', { params: { customer } })
}

// ===== 生成订单（供货合同） =====
// 落位：<数据目录>/客户管理/<客户>/订单/日期+物料型号+数量.xlsx
export function fetchOrderOptions(customer) {
  return http.get('/orders/options', { params: { customer } })
}
export function generateOrder(payload) {
  return http.post('/orders/generate', payload, { timeout: 180000 })
}
/** 只生成 PDF 预览（不落盘、不占单号） */
export function previewOrder(payload) {
  return http.post('/orders/preview', payload, { responseType: 'blob', timeout: 180000 })
}
export function fetchOrderList(customer) {
  return http.get('/orders/list', { params: { customer } })
}
export function openOrderPath(customer, name, mode = 'file') {
  return http.post('/orders/open', { customer, name, mode })
}
export function uploadOrderSeal(formData) {
  return http.post('/orders/seal', formData)
}
export function resetOrderSeal() {
  return http.post('/orders/seal/reset')
}
export function saveOrderDefaults(payload) {
  return http.post('/orders/defaults', payload)
}
export function orderDownloadUrl(customer, name) {
  return `/api/orders/download?customer=${encodeURIComponent(customer)}&name=${encodeURIComponent(name)}`
}
/** 浏览器内预览（目前只有 PDF 支持 inline；xlsx 仍会下载） */
export function orderPreviewUrl(customer, name) {
  return orderDownloadUrl(customer, name) + '&inline=1'
}
/** 把订单文件（PDF/Excel）复制到系统剪贴板，可直接粘到微信/QQ */
export function copyOrderFile(customer, name) {
  return http.post('/orders/copy', { customer, name })
}

/** 删除一份订单（xlsx + pdf 一起删） */
export function deleteOrder(customer, name) {
  return http.post('/orders/delete', { customer, name })
}

// ===== 报价单（客户管理/<客户>/报价单/）=====
export function fetchQuoteOptions(customer) {
  return http.get('/quotes/options', { params: { customer } })
}
export function generateQuote(payload) {
  // Word 转 PDF 可能十几秒，默认 15s 会超时成「网络错误」
  return http.post('/quotes/generate', payload, { timeout: 180000 })
}
export function previewQuote(payload) {
  return http.post('/quotes/preview', payload, { responseType: 'blob', timeout: 180000 })
}
export function fetchQuoteList(customer) {
  return http.get('/quotes/list', { params: { customer } })
}
export function quoteDownloadUrl(customer, name) {
  return `/api/quotes/download?customer=${encodeURIComponent(customer)}&name=${encodeURIComponent(name)}`
}
export function quotePreviewUrl(customer, name) {
  return quoteDownloadUrl(customer, name) + '&inline=1'
}
export function copyQuoteFile(customer, name) {
  return http.post('/quotes/copy', { customer, name })
}
export function deleteQuoteFile(customer, name) {
  return http.post('/quotes/delete', { customer, name })
}

// ===== 客户文件柜（客户管理/<客户>/客户文件/）=====
export function fetchCustomerFiles(customer) {
  return http.get('/customer-files', { params: { customer } })
}
export function mkdirCustomerFolder(customer, name) {
  return http.post('/customer-files/mkdir', { customer, name })
}
export function uploadCustomerFiles(formData) {
  return http.post('/customer-files/upload', formData)
}
export function deleteCustomerFile(customer, folder, name) {
  return http.post('/customer-files/delete', { customer, folder, name })
}
export function deleteCustomerFolder(customer, folder) {
  return http.post('/customer-files/delete-folder', { customer, folder })
}
export function copyCustomerFile(customer, folder, name) {
  return http.post('/customer-files/copy', { customer, folder, name })
}
export function openCustomerFile(customer, folder, name) {
  return http.post('/customer-files/open', { customer, folder, name })
}

// ===== 阶段停留时长 / 待跟进 / 月度汇总（祥哥 2026-10-14）=====
// 停留天数两种口径：有状态事件=精确，没有=按上次改动估算（界面必须能区分）。
// 阈值由用户在「待跟进」面板里自己设，默认全 0 = 不提醒；「下批量」是终态不参与。
export function fetchStaleMaterials() {
  return http.get('/materials/stale')
}
/** 月度汇总（客户 × 指标）；start/end 为 YYYY-MM-DD，缺省=本月 */
export function fetchMaterialMonthly(params) {
  return http.get('/materials/monthly', { params })
}
/** 读取全部设置（app_settings KV） */
export function fetchAppSettings() {
  return http.get('/settings')
}
/** 保存设置（值会被转成字符串存） */
export function saveAppSettings(obj) {
  return http.post('/settings', obj)
}

// ===== 客户账期 / 对账付款资料（祥哥 2026-10-15）=====
// 显示在「客户物料」页头选中客户那一行，入口也在那儿 + 名册管理。
// 支持两种口径：结构化（每月对账日 + 账期天数，自动滚动）+ 手填「下次对账日」（优先）。
export function fetchCustomerProfile(name) {
  return http.get('/customers/profile', { params: { name } })
}
export function saveCustomerProfile(payload) {
  return http.post('/customers/profile', payload)
}

// ===== 公司资料 / 开票资料库（祥哥 2026-10-15）=====
// 主要存**客户发来的**开票资料（图片/PDF/Word/Excel），也存自己公司的证照（支持多家抬头）。
// 归属与分类走 query：multer 决定目录/文件名时就要知道归属，走 body 时字段可能还没解析到。
export function fetchCompanyDocs(ownerType, ownerName, folderId) {
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
}
export function renameDocFolder(id, name) {
  return http.post(`/company-docs/folders/${id}/rename`, { name })
}
export function moveCompanyDoc(id, folderId) {
  return http.post(`/company-docs/docs/${id}/move`, { folder_id: folderId })
}
export function fetchCompanyDocsSummary() {
  return http.get('/company-docs/summary')
}
export function deleteCompanyDoc(id) {
  return http.delete(`/company-docs/docs/${id}`)
}
/** 把资料文件复制到系统剪贴板（粘到微信） */
export function copyCompanyDoc(id) {
  return http.post('/company-docs/copy', { id })
}
/** 在资源管理器里定位资料文件 */
export function openCompanyDoc(id) {
  return http.post('/company-docs/open', { id })
}
/** 上传（可多选）。onProgress 用于显示进度条 */
export function uploadCompanyDocs({ ownerType, ownerName, category, folderId, files, onProgress }) {
  const fd = new FormData()
  for (const f of files) fd.append('files', f, f.name)
  return http.post('/company-docs/upload', fd, {
    params: { owner_type: ownerType, owner_name: ownerName, category: category || '', folder_id: folderId || 0 },
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (e) => { if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100)) }
  })
}
export function fetchCompanyProfiles() {
  return http.get('/company-docs/companies')
}
export function saveCompanyProfile(payload) {
  return http.post('/company-docs/companies', payload)
}
export function deleteCompanyProfile(id) {
  return http.delete(`/company-docs/companies/${id}`)
}

// ===== 物料进展时间线（祥哥 2026-10-14 需求）=====
// 把已有的报价/改价（price_logs）、送样、规格书、以及**被显式关联的记事**聚合成一条时间线。
// 记事是客户级的、默认不进；只有用户主动关联过这个物料的那条才出现。
// 详见 server/src/utils/materialTimeline.js 顶部注释。
export function fetchMaterialTimeline(id) {
  return http.get(`/materials/${id}/timeline`)
}
/** 该物料自己的进展流水（不含聚合来的报价/送样） */
export function fetchMaterialEvents(id) {
  return http.get(`/materials/${id}/events`)
}

// ===== 附件 URL 工具 =====

// 本地文件 URL → 交给桌面端用系统程序打开；其余（http 外链）走浏览器。
// 归档后文件散在 客户管理/、报价规格书/、报价备注图/ 下，旧前缀一并认，
// 让没刷新到的页面也能正常打开。
const LOCAL_FILE_PREFIXES = [
  '/api/cust/', '/api/quote-specs/', '/api/quote-images/',
  '/api/specs/', '/api/uploads/materials/', '/api/uploads/notes/', '/api/uploads/prices/'
]
export function isLocalFileUrl(url) {
  return !!url && LOCAL_FILE_PREFIXES.some(p => String(url).startsWith(p))
}

// 附件显示名：优先上传时附加的 ?name= 原始名，否则回落到末段文件名
export function fileDisplayName(url) {
  if (!url) return ''
  const m = String(url).match(/[?&]name=([^&]+)/)
  if (m) { try { return decodeURIComponent(m[1]) } catch { /* 落到末段 */ } }
  const last = String(url).split('?')[0].split('/').filter(Boolean).pop() || ''
  try { return decodeURIComponent(last) } catch { return last }
}
