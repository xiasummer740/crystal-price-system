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
export function uploadNoteImages(formData) {
  return http.post('/notes/upload', formData)
}
export function deleteNoteImage(filename) {
  return http.delete(`/notes/upload/${encodeURIComponent(filename)}`)
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
