<template>
  <transition name="page-fade">
    <div class="page-wrap">
      <header class="page-header">
        <button class="back-btn" @click="goBack">‹ 返回</button>
        <h3>{{ isEdit ? '编辑记事' : '新增记事' }}</h3>
        <button class="save-btn" :disabled="saving" @click="save">{{ saving ? '保存中…' : '保存' }}</button>
      </header>

      <div class="page-body">
        <div class="form-section">
          <van-field v-model="form.title" label="标题" placeholder="输入记事标题" maxlength="200"
            :rules="[{ required: true, message: '标题不能为空' }]"
            :error="!!errors.title" :error-message="errors.title" />

          <van-field v-model="form.customer" label="客户" placeholder="关联客户（可选）" clearable />

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
            图片附件
            <span class="img-count">{{ (form.images || []).length }}/9</span>
          </div>
          <div class="upload-area" @dragover.prevent @drop.prevent="onDrop">
            <div class="img-grid">
              <div v-for="(img, i) in form.images" :key="i" class="img-item">
                <img :src="img" @click="previewImg = i" loading="lazy" />
                <button class="img-del" @click="removeImg(i)">×</button>
              </div>
              <div v-if="(form.images || []).length < 9" class="upload-btn" @click="pickFile">
                <span class="upload-icon">＋</span>
                <span class="upload-text">点击或拖拽上传</span>
              </div>
            </div>
            <p class="upload-hint">支持 Ctrl+V 粘贴截图</p>
          </div>
        </div>
      </div>

      <!-- 图片预览 -->
      <van-image-preview v-model:show="showPreview" :images="form.images" :start-position="previewImg" @change="previewImg = $event" />

      <!-- 事项类型选择 -->
      <van-popup v-model:show="showCategoryPicker" round position="bottom">
        <van-picker :columns="categoryColumns" @confirm="onCategoryConfirm" @cancel="showCategoryPicker = false" />
      </van-popup>

      <!-- 优先级选择 -->
      <van-popup v-model:show="showPriorityPicker" round position="bottom">
        <van-picker :columns="priorityColumns" @confirm="onPriorityConfirm" @cancel="showPriorityPicker = false" />
      </van-popup>

      <!-- 状态选择 -->
      <van-popup v-model:show="showStatusPicker" round position="bottom">
        <van-picker :columns="statusColumns" @confirm="onStatusConfirm" @cancel="showStatusPicker = false" />
      </van-popup>

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

      <input ref="fileInput" type="file" multiple accept="image/*" hidden @change="onFileChange" />
    </div>
  </transition>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast, showConfirmDialog } from 'vant'
import { getNote, createNote, updateNote, uploadNoteImages, fetchCategories } from '../utils/api.js'

const route = useRoute()
const router = useRouter()
const isEdit = computed(() => !!route.params.id)
const saving = ref(false)
const fileInput = ref(null)
const showPreview = ref(false)
const previewImg = ref(0)
const categories = ref([])
const errors = ref({})
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
const showReminderPicker = ref(false)
const reminderDate = ref('')
const reminderTime = ref('')
const reminderLabel = ref('')

const priorityLabel = computed(() => ({ 1: '🔴 高', 2: '🟡 中', 3: '🔵 低' })[form.priority] || '中')
const statusLabel = computed(() => ({ todo: '待办', in_progress: '进行中', done: '已完成' })[form.status] || '待办')
const categoryLabel = computed(() => {
  const c = categories.value.find(c => c.id === form.category_id)
  return c ? c.name : '未分类'
})

const priorityColumns = [
  { text: '🔴 高', value: 1 },
  { text: '🟡 中', value: 2 },
  { text: '🔵 低', value: 3 }
]
const statusColumns = [
  { text: '待办', value: 'todo' },
  { text: '进行中', value: 'in_progress' },
  { text: '已完成', value: 'done' }
]
const categoryColumns = computed(() => {
  const cols = categories.value.map(c => ({ text: c.name, value: c.id }))
  cols.unshift({ text: '未分类', value: 0 })
  return cols
})

onMounted(async () => {
  try {
    const r = await fetchCategories()
    categories.value = r.data || []
  } catch { categories.value = [] }

  if (isEdit.value) {
    try {
      const r = await getNote(route.params.id)
      const d = r.data
      form.title = d.title || ''
      form.customer = d.customer || ''
      form.category_id = d.category_id || 0
      form.content = d.content || ''
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
    originalForm.value = JSON.parse(JSON.stringify(form))
  }
})

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

function onCategoryConfirm({ selectedOptions }) {
  form.category_id = selectedOptions[0].value
  showCategoryPicker.value = false
  trackChange()
}
function onPriorityConfirm({ selectedOptions }) {
  form.priority = selectedOptions[0].value
  showPriorityPicker.value = false
  trackChange()
}
function onStatusConfirm({ selectedOptions }) {
  form.status = selectedOptions[0].value
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
function clearReminder() {
  form.reminder_at = ''
  reminderLabel.value = ''
  reminderDate.value = ''
  reminderTime.value = ''
  trackChange()
}

function pickFile() { fileInput.value?.click() }

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
  const tag = e.target?.tagName || ''
  if (tag === 'INPUT' || tag === 'TEXTAREA') return
  const items = e.clipboardData?.items
  if (!items) return
  const imgFiles = []
  for (const item of items) {
    if (item.type?.startsWith('image/')) {
      const file = item.getAsFile()
      if (file) imgFiles.push(file)
    }
  }
  if (!imgFiles.length) return
  e.preventDefault()
  showToast(`检测到 ${imgFiles.length} 张截图，上传中…`)
  await uploadFiles(imgFiles)
}

async function uploadFiles(files) {
  const remaining = 9 - (form.images || []).length
  if (remaining <= 0) { showToast('最多上传9张图片'); return }
  const toUpload = Array.from(files).slice(0, remaining)
  const fd = new FormData()
  for (const f of toUpload) fd.append('files', f)
  try {
    const r = await uploadNoteImages(fd)
    const urls = r.data || []
    form.images.push(...urls)
    trackChange()
    showToast(`已上传 ${urls.length} 张`)
  } catch (e) {
    showToast('上传失败: ' + (e.response?.data?.msg || e.message))
  }
}

function removeImg(i) {
  form.images.splice(i, 1)
  trackChange()
}

async function save() {
  errors.value = {}
  if (!form.title.trim()) {
    errors.value.title = '标题不能为空'
    showToast('标题不能为空')
    return
  }
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
</script>

<style scoped>
.page-fade-enter-active { transition: opacity .2s ease, transform .2s ease; }
.page-fade-enter-from { opacity: 0; transform: translateY(8px); }
.page-wrap { display: flex; flex-direction: column; height: 100vh; background: #f5f6f8; }
.page-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 16px; background: #fff; border-bottom: 1px solid #e8e8e8; flex-shrink: 0; }
.page-header h3 { font-size: 16px; font-weight: 600; color: #323233; margin: 0; }
.back-btn { background: none; border: none; color: #1989fa; font-size: 15px; cursor: pointer; padding: 4px 8px; font-family: inherit; }
.save-btn { padding: 6px 18px; border-radius: 6px; border: none; background: #1989fa; color: #fff; font-size: 13px; cursor: pointer; font-family: inherit; transition: background .15s; }
.save-btn:hover { background: #1676d9; }
.save-btn:disabled { background: #95c9f9; cursor: not-allowed; }
.page-body { flex: 1; overflow-y: auto; padding: 12px 16px; }
.form-section { background: #fff; border-radius: 10px; padding: 4px 0; margin-bottom: 12px; box-shadow: 0 1px 3px rgba(0,0,0,.04); }
.section-title { font-size: 13px; font-weight: 600; color: #555; padding: 12px 16px 8px; display: flex; align-items: center; justify-content: space-between; }
.section-count { font-size: 11px; color: #ccc; font-weight: 400; }
.img-count { font-size: 11px; color: #999; font-weight: 400; }
.content-textarea { width: 100%; border: none; outline: none; font-size: 14px; color: #323233; padding: 8px 16px 16px; resize: vertical; min-height: 120px; font-family: inherit; background: transparent; box-sizing: border-box; }
.content-textarea::placeholder { color: #bbb; }
.upload-area { padding: 0 16px 16px; }
.upload-hint { font-size: 10px; color: #ccc; margin: 6px 0 0; }
.img-grid { display: flex; flex-wrap: wrap; gap: 8px; }
.img-item { position: relative; width: 80px; height: 80px; border-radius: 8px; overflow: hidden; border: 1px solid #f0f0f0; }
.img-item img { width: 100%; height: 100%; object-fit: cover; cursor: pointer; transition: opacity .2s; }
.img-item img:hover { opacity: .85; }
.img-del { position: absolute; top: 2px; right: 2px; width: 20px; height: 20px; border-radius: 50%; border: none; background: rgba(0,0,0,.5); color: #fff; font-size: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center; line-height: 1; transition: background .2s; }
.img-del:hover { background: rgba(238,10,36,.8); }
.upload-btn { width: 80px; height: 80px; border-radius: 8px; border: 1px dashed #d9d9d9; display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer; color: #bbb; transition: all .2s; }
.upload-btn:hover { border-color: #1989fa; color: #1989fa; background: #f0f6ff; }
.upload-icon { font-size: 22px; line-height: 1; }
.upload-text { font-size: 10px; margin-top: 2px; }
.reminder-actions { display: flex; align-items: center; gap: 8px; padding: 0 16px 12px; }
.clear-reminder { background: none; border: none; color: #ee0a24; font-size: 12px; cursor: pointer; padding: 2px 4px; font-family: inherit; }
.clear-reminder:hover { text-decoration: underline; }
.reminder-picker { padding: 20px; }
.reminder-picker h4 { font-size: 16px; font-weight: 600; margin: 0 0 16px; color: #323233; }
.reminder-btns { display: flex; gap: 10px; margin-top: 16px; }
.reminder-cancel { flex: 1; padding: 10px; border-radius: 8px; border: 1px solid #d9d9d9; background: #fff; color: #666; font-size: 14px; cursor: pointer; font-family: inherit; }
.reminder-ok { flex: 1; padding: 10px; border-radius: 8px; border: none; background: #1989fa; color: #fff; font-size: 14px; cursor: pointer; font-family: inherit; }
</style>
