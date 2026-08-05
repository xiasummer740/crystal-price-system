<template>
  <transition name="page-fade">
    <div class="page-wrap">
      <header class="page-header">
        <button class="back-btn" @click="goBack">{{ isEdit ? '‹ 返回' : '取消' }}</button>
        <h3>{{ isEdit ? '编辑记事' : '新增记事' }}</h3>
        <button v-if="!isEdit" class="save-new-btn" :disabled="saving" @click="saveAndNew">{{ saving ? '保存中…' : '保存并新建' }}</button>
        <button class="save-btn" :disabled="saving" @click="save">{{ saving ? '保存中…' : '保存' }}</button>
      </header>

      <div class="page-body">
        <div class="form-section">
          <van-field v-model="form.title" placeholder="输入记事标题（选填）" maxlength="200" clearable />

          <van-field v-model="form.customer" label="客户" placeholder="关联客户（可选）" clearable
            @update:model-value="onCustomerInput" @focus="onCustomerFocus" @blur="onCustomerBlur" />
          <div class="customer-suggest" v-if="showCustomerSuggest && filteredCustomers.length">
            <div v-for="c in filteredCustomers" :key="c" class="cs-item" @mousedown.prevent="selectCustomer(c)">
              {{ c }}
            </div>
          </div>

          <van-field label="事项类型" is-link readonly :model-value="categoryLabel" placeholder="选择事项类型" @click="showCategoryPicker = true" />

          <van-field label="优先级" is-link readonly :model-value="priorityLabel" @click="showPriorityPicker = true" />

          <van-field label="状态" is-link readonly :model-value="statusLabel" @click="showStatusPicker = true" />

          <van-field label="提醒时间" is-link readonly :model-value="reminderLabel" placeholder="设置提醒（可选）" @click="showReminderPicker = true" />
          <div v-if="form.reminder_at" class="reminder-actions">
            <button class="clear-reminder" @click="clearReminder">清除提醒</button>
          </div>
        </div>

        <div class="form-section">
          <div class="section-title">
            记事内容
            <span class="section-count">{{ form.content.length }}</span>
          </div>
          <textarea v-model="form.content" class="content-textarea" placeholder="输入记事内容…&#10;支持 Markdown: **加粗** # 标题 `代码` [链接](url)" rows="6"></textarea>
        </div>

        <div class="form-section">
          <div class="section-title">
            附件
            <span class="img-count">{{ (form.images || []).length }}/9</span>
          </div>
          <div class="upload-area" @dragover.prevent @drop.prevent="onDrop" @paste.prevent="onPaste">
            <div class="img-grid">
              <div v-for="(url, i) in form.images" :key="i" class="img-item">
                <template v-if="isImageUrl(url)">
                  <img :src="url" @click="previewImg = i" loading="lazy" />
                </template>
                <template v-else>
                  <div class="file-thumb" @click="openFile(url)">
                    <span class="file-icon">{{ fileIcon(url) }}</span>
                    <span class="file-name">{{ fileName(url) }}</span>
                  </div>
                </template>
                <button class="img-del" @click="removeImg(i)">×</button>
              </div>
              <div v-if="(form.images || []).length < 9" class="upload-btn" @click="pickFile">
                <span class="upload-icon">＋</span>
                <span class="upload-text">点击或拖拽上传</span>
              </div>
            </div>
            <p class="upload-hint">支持 Ctrl+V 粘贴截图，支持任意文件格式</p>
          </div>
        </div>
      </div>

      <!-- 图片预览 -->
      <van-image-preview v-model:show="showPreview" :images="form.images" :start-position="previewImg" @change="previewImg = $event" />

      <!-- 事项类型选择 -->
      <van-action-sheet v-model:show="showCategoryPicker" :actions="categoryActions" cancel-text="取消"
        @select="onCategoryConfirm" close-on-click-action />

      <!-- 优先级选择 -->
      <van-action-sheet v-model:show="showPriorityPicker" :actions="priorityActions" cancel-text="取消"
        @select="onPriorityConfirm" close-on-click-action />

      <!-- 状态选择 -->
      <van-action-sheet v-model:show="showStatusPicker" :actions="statusActions" cancel-text="取消"
        @select="onStatusConfirm" close-on-click-action />

      <!-- 事项类型管理 -->
      <NoteCategories :show="showCatMgr" @close="showCatMgr = false" @updated="onCatMgrUpdated" />

      <!-- 提醒时间选择 -->
      <van-popup v-model:show="showReminderPicker" round position="bottom" :style="{ height: '50%' }">
        <div class="reminder-picker">
          <h4>设置提醒时间</h4>
          <van-field v-model="reminderDate" label="日期" type="date" />
          <van-field v-model="reminderTime" label="时间" type="time" />
          <div class="reminder-btns">
            <button class="reminder-cancel" @click="showReminderPicker = false">取消</button>
            <button class="reminder-ok" @click="confirmReminder">确定</button>
          </div>
        </div>
      </van-popup>

      <input ref="fileInput" type="file" multiple hidden @change="onFileChange" />
    </div>
  </transition>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast, showConfirmDialog } from 'vant'
import { getNote, createNote, updateNote, uploadNoteImages, deleteNoteImage, fetchCategories, fetchNoteCustomers } from '../utils/api.js'
import NoteCategories from './NoteCategories.vue'

const route = useRoute()
const router = useRouter()
const isEdit = computed(() => !!route.params.id)
const saving = ref(false)
const fileInput = ref(null)
const showPreview = ref(false)
const previewImg = ref(0)
const categories = ref([])
const errors = ref({})
const customerList = ref([])
const showCustomerSuggest = ref(false)
const filteredCustomers = computed(() => {
  const kw = (form.customer || '').trim().toLowerCase()
  if (!kw) return customerList.value.slice(0, 10)
  return customerList.value.filter(c => c.toLowerCase().includes(kw)).slice(0, 10)
})
function onCustomerInput() { showCustomerSuggest.value = true }
function onCustomerFocus() { showCustomerSuggest.value = true }
function onCustomerBlur() { setTimeout(() => { showCustomerSuggest.value = false }, 200) }
function selectCustomer(name) { form.customer = name; showCustomerSuggest.value = false }
const hasChanged = ref(false)
const originalForm = ref(null)

const form = reactive({
  title: '',
  customer: '',
  category_id: 0,
  content: '',
  images: [],
  reminder_at: '',
  priority: 2,
  status: 'todo',
  is_pinned: false
})

// 选择器状态
const showCategoryPicker = ref(false)
const showPriorityPicker = ref(false)
const showStatusPicker = ref(false)
const showCatMgr = ref(false)
const showReminderPicker = ref(false)
const reminderDate = ref('')
const reminderTime = ref('')
const reminderLabel = ref('')

const priorityLabel = computed(() => ({ 1: '🔴 高', 2: '🟡 中', 3: '🔵 低' })[form.priority] || '中')
const statusLabel = computed(() => ({ todo: '待办', done: '已完成', follow_up: '跟进后续' })[form.status] || '待办')
const categoryLabel = computed(() => {
  const c = categories.value.find(c => c.id === form.category_id)
  return c ? c.name : '未分类'
})

const priorityActions = [
  { name: '🔴 高', value: 1 },
  { name: '🟡 中', value: 2 },
  { name: '🔵 低', value: 3 }
]
const statusActions = [
  { name: '待办', value: 'todo' },
  { name: '已完成', value: 'done' },
  { name: '跟进后续', value: 'follow_up' }
]
const categoryActions = computed(() => {
  const acts = categories.value.map(c => ({ name: c.name, value: c.id }))
  acts.unshift({ name: '未分类', value: 0 })
  acts.push({ name: '🏷️ 管理类型', value: -1 })
  return acts
})

onMounted(async () => {
  try {
    const r = await fetchCategories()
    categories.value = r.data || []
  } catch { categories.value = [] }
  try {
    const r = await fetchNoteCustomers()
    customerList.value = r.data || []
  } catch {}

  if (isEdit.value) {
    try {
      const r = await getNote(route.params.id)
      const d = r.data
      form.title = d.title || ''
      form.customer = d.customer || ''
      form.category_id = d.category_id || 0
      // 编辑时只取最新一段内容（去掉时间戳和分隔历史）
      let editContent = d.content || ''
      const sepIdx = editContent.indexOf('\n\n---\n\n')
      if (sepIdx > 0) editContent = editContent.slice(0, sepIdx)
      editContent = editContent.replace(/^📅\s+\*\*.*?\*\*\n*/u, '')
      form.content = editContent.trim()
      form.images = safeParse(d.images, [])
      form.reminder_at = d.reminder_at || ''
      form.priority = d.priority ?? 2
      form.status = d.status || 'todo'
      form.is_pinned = !!d.is_pinned
      if (form.reminder_at) {
        reminderDate.value = form.reminder_at.slice(0, 10)
        reminderTime.value = form.reminder_at.slice(11, 16)
        reminderLabel.value = form.reminder_at.slice(0, 16)
      }
      originalForm.value = JSON.parse(JSON.stringify(form))
    } catch (e) {
      showToast('加载失败: ' + e.message)
      router.push('/notes')
    }
  } else {
    if (route.query.customer) form.customer = route.query.customer
    originalForm.value = JSON.parse(JSON.stringify(form))
  }
})

// 深度监听 form 所有字段变化（包括 v-model 直接修改的 title/content）
watch(form, trackChange, { deep: true })

// 监听表单变化
function trackChange() {
  if (!originalForm.value) return
  const cur = JSON.stringify(form)
  const orig = JSON.stringify(originalForm.value)
  hasChanged.value = cur !== orig
}

// 离开页面时检测未保存改动
function onBeforeUnload(e) {
  if (hasChanged.value) {
    e.preventDefault()
    e.returnValue = ''
  }
}
onMounted(() => window.addEventListener('beforeunload', onBeforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload))

// 路由离开守卫
async function goBack() {
  if (hasChanged.value) {
    try {
      await showConfirmDialog({ title: '未保存', message: '有未保存的修改，确定离开吗？' })
    } catch { return }
  }
  router.push('/notes')
}

function safeParse(str, def) {
  try { return JSON.parse(str) || def } catch { return def }
}

function onCategoryConfirm(item) {
  if (item.value === -1) {
    // 管理类型 -> emit 打开分类管理
    showCategoryPicker.value = false
    showCatMgr.value = true
    return
  }
  form.category_id = item.value
  showCategoryPicker.value = false
  trackChange()
}
function onPriorityConfirm(item) {
  form.priority = item.value
  showPriorityPicker.value = false
  trackChange()
}
function onStatusConfirm(item) {
  form.status = item.value
  showStatusPicker.value = false
  trackChange()
}
function confirmReminder() {
  if (reminderDate.value && reminderTime.value) {
    form.reminder_at = reminderDate.value + ' ' + reminderTime.value + ':00'
    reminderLabel.value = form.reminder_at.slice(0, 16)
  }
  showReminderPicker.value = false
  trackChange()
}
async function onCatMgrUpdated() {
  await fetchCategories().then(r => { categories.value = r.data || [] }).catch(() => {})
}
function clearReminder() {
  form.reminder_at = ''
  reminderLabel.value = ''
  reminderDate.value = ''
  reminderTime.value = ''
  trackChange()
}

function pickFile() { fileInput.value?.click() }
// 非图片文件：下载（保留原文件名）
function openFile(url) {
  const name = fileName(url)
  fetch(url).then(r => r.blob()).then(blob => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = name
    a.click()
    URL.revokeObjectURL(a.href)
  }).catch(() => window.open(url, '_blank'))
}

async function onFileChange(e) {
  const files = e.target.files
  if (!files?.length) return
  await uploadFiles(files)
  fileInput.value.value = ''
}

async function onDrop(e) {
  const files = e.dataTransfer?.files
  if (!files?.length) return
  await uploadFiles(files)
}

async function onPaste(e) {
  const items = e.clipboardData?.items
  if (!items) return
  const files = []
  for (const item of items) {
    if (item.type?.startsWith('image/') || item.kind === 'file') {
      const file = item.getAsFile()
      if (file) files.push(file)
    }
  }
  if (!files.length) return
  // 有文件 → 阻止默认粘贴行为，上传文件
  e.preventDefault()
  showToast(`检测到 ${files.length} 个文件，上传中…`)
  await uploadFiles(files)
}

// 判断 URL 是否为图片
function isImageUrl(url) {
  return /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?|$)/i.test(url)
}
// 文件展示图标
function fileIcon(url) {
  const ext = url.split('?')[0].split('.').pop()?.toLowerCase() || ''
  if (['pdf'].includes(ext)) return '📄'
  if (['doc','docx'].includes(ext)) return '📝'
  if (['xls','xlsx','csv'].includes(ext)) return '📊'
  if (['zip','rar','7z'].includes(ext)) return '📦'
  if (['txt','json','xml','md'].includes(ext)) return '📃'
  return '📎'
}
// 修复 mojibake：UTF-8 字节被当 Latin-1 解码后的乱码还原
function fixMojibake(str) {
  if (!/[\x80-\xFF]/.test(str)) return str
  try {
    const bytes = new Uint8Array([...str].map(c => c.charCodeAt(0) & 0xFF))
    const fixed = new TextDecoder('utf-8').decode(bytes)
    if (/[一-鿿　-〿＀-￯]/.test(fixed)) return fixed
  } catch {}
  return str
}

// 从 URL 提取原始文件名
function fileName(url) {
  // 优先取 ?name= 参数（新格式，前端上传时写入的正确文件名）
  const nameMatch = url.match(/[?&]name=([^&]+)/)
  if (nameMatch) {
    try { return decodeURIComponent(nameMatch[1]) } catch {}
  }
  // 旧格式：从 URL 路径提取 + 修复乱码
  let name = url.split('/').pop() || ''
  try { name = decodeURIComponent(name) } catch {}
  name = name.replace(/^\d{13}-[a-z0-9]{6}-/, '')
  return fixMojibake(name)
}

async function uploadFiles(files) {
  const remaining = 9 - (form.images || []).length
  if (remaining <= 0) { showToast('最多上传9个文件'); return }
  const toUpload = Array.from(files).slice(0, remaining)
  const fd = new FormData()
  const origNames = toUpload.map(f => f.name)  // 上传前捕获原始文件名（前端 File.name 永远正确）
  for (const f of toUpload) fd.append('files', f)
  try {
    const r = await uploadNoteImages(fd)
    const urls = r.data || []
    // 在 URL 后追加 ?name= 参数，确保文件名正确显示（绕过服务器端的编码问题）
    const enriched = urls.map((url, i) => url + '?name=' + encodeURIComponent(origNames[i]))
    form.images.push(...enriched)
    trackChange()
    showToast(`已上传 ${urls.length} 个文件`)
  } catch (e) {
    showToast('上传失败: ' + (e.response?.data?.msg || e.message))
  }
}

async function removeImg(i) {
  const url = form.images[i]
  // 通知服务器删除文件（不等待结果，不影响用户体验）
  if (url) {
    const parts = url.split('/')
    const filename = parts[parts.length - 1]
    deleteNoteImage(filename).catch(() => {})
  }
  form.images.splice(i, 1)
  trackChange()
}

async function save() {
  saving.value = true
  try {
    const data = {
      title: form.title.trim(),
      customer: form.customer,
      category_id: form.category_id,
      content: form.content,
      images: form.images,
      reminder_at: form.reminder_at || null,
      priority: form.priority,
      status: form.status,
      is_pinned: form.is_pinned
    }
    if (isEdit.value) {
      await updateNote(route.params.id, data)
      showToast('已更新')
    } else {
      await createNote(data)
      showToast('已创建')
    }
    hasChanged.value = false
    router.push('/notes')
  } catch (e) {
    showToast('保存失败: ' + e.message)
  } finally {
    saving.value = false
  }
}

async function saveAndNew() {
  saving.value = true
  try {
    const data = {
      title: form.title.trim(),
      customer: form.customer,
      category_id: form.category_id,
      content: form.content,
      images: form.images,
      reminder_at: form.reminder_at || null,
      priority: form.priority,
      status: form.status,
      is_pinned: form.is_pinned
    }
    await createNote(data)
    showToast('已创建')
    // 重置表单，保留客户名/事项类型
    const keepCustomer = form.customer
    const keepCategory = form.category_id
    Object.assign(form, {
      title: '', customer: keepCustomer, category_id: keepCategory,
      content: '', images: [], reminder_at: '', priority: 2, status: 'todo', is_pinned: false
    })
    originalForm.value = JSON.parse(JSON.stringify(form))
    hasChanged.value = false
  } catch (e) {
    showToast('保存失败: ' + e.message)
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.page-fade-enter-active { transition: opacity .2s ease, transform .2s ease; }
.page-fade-enter-from { opacity: 0; transform: translateY(8px); }
.page-wrap { display: flex; flex-direction: column; height: 100vh; background: #f5f6f8; }
.page-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 16px; background: #fff; border-bottom: 1px solid #e8e8e8; flex-shrink: 0; }
.page-header h3 { font-size: 16px; font-weight: 600; color: #323233; margin: 0; }
.back-btn { background: none; border: none; color: var(--color-primary); font-size: 15px; cursor: pointer; padding: 4px 8px; font-family: inherit; }
.save-btn { padding: 6px 18px; border-radius: 6px; border: none; background: var(--color-primary); color: #fff; font-size: 13px; cursor: pointer; font-family: inherit; transition: background .15s; }
.save-btn:hover { background: #1676d9; }
.save-btn:disabled { background: #95c9f9; cursor: not-allowed; }
.save-new-btn { padding: 6px 14px; border-radius: 6px; border: 1px solid var(--color-primary); background: #fff; color: var(--color-primary); font-size: 12px; cursor: pointer; font-family: inherit; margin-right: 6px; transition: all .15s; }
.save-new-btn:hover { background: rgba(var(--color-primary-rgb),.08); }
.save-new-btn:disabled { opacity: .5; cursor: not-allowed; }
.page-body { flex: 1; overflow-y: auto; padding: 12px 16px; }
.form-section { background: #fff; border-radius: 10px; padding: 4px 0; margin-bottom: 12px; box-shadow: 0 1px 3px rgba(0,0,0,.04); }
.section-title { font-size: 13px; font-weight: 600; color: #555; padding: 12px 16px 8px; display: flex; align-items: center; justify-content: space-between; }
.section-count { font-size: 11px; color: #ccc; font-weight: 400; }
.img-count { font-size: 11px; color: #999; font-weight: 400; }
.content-textarea { width: 100%; border: none; outline: none; font-size: 14px; color: #323233; padding: 8px 16px 16px; resize: vertical; min-height: 120px; font-family: inherit; background: transparent; box-sizing: border-box; }
.content-textarea::placeholder { color: #bbb; }
.upload-area { padding: 0 16px 16px; }
.upload-hint { font-size: 10px; color: #ccc; margin: 6px 0 0; }
.customer-suggest { position: relative; z-index: 20; margin: -12px 16px 8px; background: #fff; border: 1px solid #e0e0e0; border-radius: 0 0 8px 8px; box-shadow: 0 6px 20px rgba(0,0,0,.1); max-height: 200px; overflow-y: auto; }
.cs-item { padding: 10px 14px; font-size: 13px; color: #323233; cursor: pointer; border-bottom: 1px solid #f5f5f5; transition: background .1s; }
.cs-item:last-child { border-bottom: none; }
.cs-item:hover { background: rgba(var(--color-primary-rgb),.08); color: var(--color-primary); }
.img-grid { display: flex; flex-wrap: wrap; gap: 8px; }
.img-item { position: relative; width: 80px; height: 80px; border-radius: 8px; overflow: hidden; border: 1px solid #f0f0f0; }
.img-item img { width: 100%; height: 100%; object-fit: cover; cursor: pointer; transition: opacity .2s; }
.img-item img:hover { opacity: .85; }
.img-del { position: absolute; top: 2px; right: 2px; width: 20px; height: 20px; border-radius: 50%; border: none; background: rgba(0,0,0,.5); color: #fff; font-size: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center; line-height: 1; transition: background .2s; }
.img-del:hover { background: rgba(238,10,36,.8); }
.upload-btn { width: 80px; height: 80px; border-radius: 8px; border: 1px dashed #d9d9d9; display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer; color: #bbb; transition: all .2s; }
.upload-btn:hover { border-color: var(--color-primary); color: var(--color-primary); background: rgba(var(--color-primary-rgb),.04); }
.upload-icon { font-size: 22px; line-height: 1; }
.upload-text { font-size: 10px; margin-top: 2px; }
.file-thumb { width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #fafbfc; cursor: pointer; gap: 2px; }
.file-icon { font-size: 28px; line-height: 1; }
.file-name { font-size: 8px; color: #999; max-width: 72px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: center; }
.reminder-actions { display: flex; align-items: center; gap: 8px; padding: 0 16px 12px; }
.clear-reminder { background: none; border: none; color: #ee0a24; font-size: 12px; cursor: pointer; padding: 2px 4px; font-family: inherit; }
.clear-reminder:hover { text-decoration: underline; }
.reminder-picker { padding: 20px; }
.reminder-picker h4 { font-size: 16px; font-weight: 600; margin: 0 0 16px; color: #323233; }
.reminder-btns { display: flex; gap: 10px; margin-top: 16px; }
.reminder-cancel { flex: 1; padding: 10px; border-radius: 8px; border: 1px solid #d9d9d9; background: #fff; color: #666; font-size: 14px; cursor: pointer; font-family: inherit; }
.reminder-ok { flex: 1; padding: 10px; border-radius: 8px; border: none; background: var(--color-primary); color: #fff; font-size: 14px; cursor: pointer; font-family: inherit; }

/* ===== 移动端适配 ===== */
@media (max-width: 768px) {
  .clear-reminder{font-size:11px}
  .reminder-picker{padding:14px}
  .reminder-picker h4{font-size:15px}
  .reminder-btns{gap:6px}
  .reminder-cancel,.reminder-ok{font-size:13px;padding:8px}
}
</style>
