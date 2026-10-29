<template>
  <div class="cdf">
    <!-- 文件夹列表 -->
    <template v-if="!activeFolder">
      <div class="cdf-bar">
        <button class="cdf-btn primary" @click="startNew">＋ 新建文件夹</button>
        <span class="cdf-hint">默认名「当天日期-自定义」，例如 20261029-ISO9001；体系证书可以一个类目一个文件夹</span>
        <button class="cdf-btn" @click="load" :disabled="loading">{{ loading ? '刷新中…' : '刷新' }}</button>
      </div>

      <div v-if="showNew" class="cdf-new">
        <input ref="nameInput" v-model="newName" class="cdf-input" placeholder="20261029-ISO9001" @keyup.enter="createFolder" />
        <button class="cdf-btn primary" @click="createFolder" :disabled="creating">{{ creating ? '创建中…' : '创建' }}</button>
        <button class="cdf-btn" @click="showNew = false">取消</button>
      </div>

      <div class="cdf-grid">
        <button v-for="f in allFolders" :key="f.id" class="cdf-folder" @click="openFolder(f)">
          <div class="cdf-folder-name">📁 {{ f.name }}</div>
          <div class="cdf-folder-meta">
            <span>{{ f.total }} 个文件</span>
            <span v-if="f.expired" class="cdf-badge red">已过期 {{ f.expired }}</span>
            <span v-if="f.expiring" class="cdf-badge orange">{{ f.expiring }} 个将到期</span>
          </div>
        </button>
        <div v-if="!allFolders.length" class="cdf-empty">还没有文件夹，点「＋ 新建文件夹」</div>
      </div>
    </template>

    <!-- 文件夹内 -->
    <template v-else>
      <div class="cdf-bar">
        <button class="cdf-btn" @click="closeFolder">‹ 返回文件夹</button>
        <b class="cdf-cur">📁 {{ activeFolder.name }}</b>
        <span class="cdf-hint">{{ files.length }} 个文件</span>
        <button v-if="activeFolder.id" class="cdf-btn" @click="startRename">重命名</button>
        <button v-if="activeFolder.id" class="cdf-btn danger" @click="removeFolder" :disabled="files.length > 0"
          :title="files.length ? '先删掉里面的文件' : '删除空文件夹'">删除文件夹</button>
      </div>

      <div class="cdf-drop" :class="{ drag: dragging }" @click="pick"
        @dragover.prevent="dragging = true" @dragleave="dragging = false" @drop.prevent="onDrop">
        <div class="cdf-drop-main">拖文件到这里，或点一下选择文件</div>
        <div class="cdf-drop-sub">也可以 Ctrl+V 粘贴（微信里复制的文件直接粘）· 上传到「{{ activeFolder.name }}」</div>
      </div>
      <input ref="fileInput" type="file" multiple hidden @change="onPick" />

      <div v-if="files.length" class="cdf-files">
        <div v-for="d in files" :key="d.id" class="cdf-file">
          <div class="cdf-thumb" @click="preview(d)">
            <img v-if="d.is_image" :src="d.url" alt="" loading="lazy" />
            <span v-else class="cdf-icon">{{ fileIcon(d.ext) }}</span>
          </div>
          <div class="cdf-info">
            <div class="cdf-title" :title="d.file_name">{{ d.title || d.file_name }}</div>
            <div class="cdf-sub">{{ fmtSize(d.size) }} · {{ (d.created_at || '').slice(0, 10) }}</div>
          </div>
          <button class="cdf-exp" :class="expiryClass(d)" @click="editExpiry(d)" :title="d.expires_at ? '点击修改过期时间' : '点击设置过期时间'">
            {{ expiryText(d) }}
          </button>
          <button class="cdf-op" title="预览" @click="preview(d)">👁</button>
          <a class="cdf-op" :href="d.url" :download="d.file_name" title="下载">⬇</a>
          <button v-if="canCopy" class="cdf-op" title="复制文件（可粘到微信）" @click="copyDoc(d)">📋</button>
          <button class="cdf-op" title="在资源管理器里定位" @click="locateDoc(d)">📁</button>
          <button class="cdf-op" title="移动到别的文件夹" @click="openMove(d)">📂</button>
          <button class="cdf-op danger" title="删除" @click="removeDoc(d)">🗑</button>
        </div>
      </div>
      <div v-else class="cdf-empty">这个文件夹还是空的，拖文件进来吧</div>
    </template>

    <!-- 过期时间设置 -->
    <div v-if="expiryDoc" class="cdf-mask" @click.self="expiryDoc = null">
      <div class="cdf-modal">
        <h4>设置过期时间</h4>
        <div class="cdf-modal-file">{{ expiryDoc.title }}</div>
        <input v-model="expiryValue" type="date" class="cdf-input" />
        <div class="cdf-modal-tip">体系证书一般填年审到期日；留空表示长期有效</div>
        <div class="cdf-modal-btns">
          <button class="cdf-btn" @click="expiryDoc = null">取消</button>
          <button class="cdf-btn" @click="saveExpiry('')">清除</button>
          <button class="cdf-btn primary" @click="saveExpiry(expiryValue)">保存</button>
        </div>
      </div>
    </div>

    <!-- 重命名文件夹 -->
    <div v-if="renameOpen" class="cdf-mask" @click.self="renameOpen = false">
      <div class="cdf-modal">
        <h4>重命名文件夹</h4>
        <input v-model="renameValue" class="cdf-input" placeholder="20261029-ISO9001" @keyup.enter="saveRename" />
        <div class="cdf-modal-tip">改名后文件夹里的文件会一起跟着走，不会丢</div>
        <div class="cdf-modal-btns">
          <button class="cdf-btn" @click="renameOpen = false">取消</button>
          <button class="cdf-btn primary" @click="saveRename">保存</button>
        </div>
      </div>
    </div>

    <!-- 移动文件 -->
    <div v-if="moveDoc" class="cdf-mask" @click.self="moveDoc = null">
      <div class="cdf-modal">
        <h4>移动文件</h4>
        <div class="cdf-modal-file">{{ moveDoc.title }}</div>
        <select v-model="moveTarget" class="cdf-input">
          <option :value="0">未分类</option>
          <option v-for="f in folders" :key="f.id" :value="f.id">{{ f.name }}</option>
        </select>
        <div class="cdf-modal-tip">只能移到同一个客户/主体下的文件夹</div>
        <div class="cdf-modal-btns">
          <button class="cdf-btn" @click="moveDoc = null">取消</button>
          <button class="cdf-btn primary" @click="doMove">移动</button>
        </div>
      </div>
    </div>

    <!-- 图片预览 -->
    <div v-if="previewUrl" class="cdf-preview" @click="previewUrl = ''">
      <img :src="previewUrl" alt="" />
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { showConfirmDialog, showSuccessToast, showNotify } from 'vant'
import {
  fetchDocFolders, createDocFolder, deleteDocFolder, fetchCompanyDocs,
  uploadCompanyDocs, deleteCompanyDoc, copyCompanyDoc, openCompanyDoc, setDocExpiry,
  renameDocFolder, moveCompanyDoc
} from '../utils/api.js'

const props = defineProps({
  ownerType: { type: String, default: 'customer' },
  ownerName: { type: String, default: '' },
  canCopy: { type: Boolean, default: false }
})
const emit = defineEmits(['changed'])

const folders = ref([])
const uncategorized = ref({ id: 0, name: '未分类', total: 0, expired: 0, expiring: 0 })
const activeFolder = ref(null)
const files = ref([])
const loading = ref(false)
const creating = ref(false)
const dragging = ref(false)
const showNew = ref(false)
const newName = ref('')
const nameInput = ref(null)
const fileInput = ref(null)
const expiryDoc = ref(null)
const expiryValue = ref('')
const previewUrl = ref('')
const renameOpen = ref(false)
const renameValue = ref('')
const moveDoc = ref(null)
const moveTarget = ref(0)

const allFolders = computed(() => {
  const list = [...folders.value]
  if (uncategorized.value.total > 0) list.push({ ...uncategorized.value, virtual: true })
  return list
})

function todayTag() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`
}

async function load() {
  if (!props.ownerName) { folders.value = []; return }
  loading.value = true
  try {
    const r = await fetchDocFolders(props.ownerType, props.ownerName)
    folders.value = r.data?.folders || []
    uncategorized.value = r.data?.uncategorized || { id: 0, name: '未分类', total: 0, expired: 0, expiring: 0 }
    if (activeFolder.value && !activeFolder.value.virtual) {
      const hit = folders.value.find(f => f.id === activeFolder.value.id)
      activeFolder.value = hit || null
    }
  } catch (e) {
    showNotify({ type: 'danger', message: '读取文件夹失败：' + (e.message || '未知错误') })
  } finally {
    loading.value = false
  }
}

async function openFolder(f) {
  activeFolder.value = f
  await loadFiles()
}

function closeFolder() {
  activeFolder.value = null
  files.value = []
}

async function loadFiles() {
  if (!activeFolder.value) return
  try {
    const r = await fetchCompanyDocs(props.ownerType, props.ownerName, activeFolder.value.id)
    files.value = r.data || []
  } catch (e) {
    showNotify({ type: 'danger', message: '读取文件失败：' + (e.message || '未知错误') })
  }
}

function startNew() {
  showNew.value = true
  newName.value = `${todayTag()}-`
  nextTick(() => nameInput.value?.focus())
}

async function createFolder() {
  const name = String(newName.value || '').trim()
  if (!name || name === `${todayTag()}-`) return showNotify({ type: 'danger', message: '请填文件夹名（日期后面加点内容）' })
  creating.value = true
  try {
    const r = await createDocFolder(props.ownerType, props.ownerName, name)
    showSuccessToast('已创建「' + r.data.name + '」')
    showNew.value = false
    await load()
    emit('changed')
  } catch (e) {
    showNotify({ type: 'danger', message: e?.response?.data?.msg || ('创建失败：' + e.message) })
  } finally {
    creating.value = false
  }
}

async function removeFolder() {
  if (!activeFolder.value?.id) return
  try {
    await showConfirmDialog({ title: '删除文件夹', message: `删除空文件夹「${activeFolder.value.name}」？` })
  } catch { return }
  try {
    await deleteDocFolder(activeFolder.value.id)
    showSuccessToast('已删除')
    closeFolder()
    await load()
    emit('changed')
  } catch (e) {
    showNotify({ type: 'danger', message: e?.response?.data?.msg || ('删除失败：' + e.message) })
  }
}

function pick() { fileInput.value?.click() }
function onPick(e) {
  const list = [...(e.target.files || [])]
  e.target.value = ''
  if (list.length) doUpload(list)
}
function onDrop(e) {
  dragging.value = false
  const list = [...(e.dataTransfer?.files || [])]
  if (list.length) doUpload(list)
}

async function doUpload(list) {
  if (!activeFolder.value) return
  try {
    await uploadCompanyDocs({
      ownerType: props.ownerType,
      ownerName: props.ownerName,
      folderId: activeFolder.value.id,
      files: list
    })
    showSuccessToast(`已上传 ${list.length} 个文件`)
    await loadFiles()
    await load()
    emit('changed')
  } catch (e) {
    showNotify({ type: 'danger', message: e?.response?.data?.msg || ('上传失败：' + e.message) })
  }
}

function onPaste(e) {
  if (!activeFolder.value) return
  const list = [...(e.clipboardData?.files || [])]
  if (list.length) { e.preventDefault(); doUpload(list) }
}

function preview(d) {
  if (d.is_image) previewUrl.value = d.url
  else window.open(d.url, '_blank')
}
async function copyDoc(d) {
  try {
    await copyCompanyDoc(d.id)
    showSuccessToast('已复制「' + d.file_name + '」，可粘贴到微信')
  } catch (e) { showNotify({ type: 'danger', message: '复制失败：' + (e.message || '未知错误') }) }
}
async function locateDoc(d) {
  try { await openCompanyDoc(d.id) }
  catch (e) { showNotify({ type: 'danger', message: '打开位置失败：' + (e.message || '未知错误') }) }
}
async function removeDoc(d) {
  try {
    await showConfirmDialog({ title: '删除资料', message: `删除「${d.title || d.file_name}」？文件也会一起删。` })
  } catch { return }
  try {
    await deleteCompanyDoc(d.id)
    showSuccessToast('已删除')
    await loadFiles()
    await load()
    emit('changed')
  } catch (e) { showNotify({ type: 'danger', message: '删除失败：' + (e.message || '未知错误') }) }
}

function startRename() {
  if (!activeFolder.value?.id) return
  renameValue.value = activeFolder.value.name
  renameOpen.value = true
}

async function saveRename() {
  const name = String(renameValue.value || '').trim()
  if (!name) return showNotify({ type: 'danger', message: '文件夹名不能为空' })
  try {
    const r = await renameDocFolder(activeFolder.value.id, name)
    showSuccessToast('已改名')
    renameOpen.value = false
    activeFolder.value = { ...activeFolder.value, name: r.data.name }
    await load()
    emit('changed')
  } catch (e) {
    showNotify({ type: 'danger', message: e?.response?.data?.msg || ('改名失败：' + e.message) })
  }
}

function openMove(d) {
  moveDoc.value = d
  moveTarget.value = 0
}

async function doMove() {
  if (!moveDoc.value) return
  try {
    await moveCompanyDoc(moveDoc.value.id, moveTarget.value)
    showSuccessToast('已移动')
    moveDoc.value = null
    await loadFiles()
    await load()
    emit('changed')
  } catch (e) {
    showNotify({ type: 'danger', message: e?.response?.data?.msg || ('移动失败：' + e.message) })
  }
}

function editExpiry(d) {
  expiryDoc.value = d
  expiryValue.value = d.expires_at || ''
}
async function saveExpiry(val) {
  try {
    await setDocExpiry(expiryDoc.value.id, val || '')
    showSuccessToast(val ? '已设置过期时间' : '已清除过期时间')
    expiryDoc.value = null
    await loadFiles()
    await load()
  } catch (e) {
    showNotify({ type: 'danger', message: e?.response?.data?.msg || ('保存失败：' + e.message) })
  }
}

function daysLeft(d) {
  if (!d.expires_at) return null
  const end = new Date(d.expires_at + 'T00:00:00')
  const now = new Date(); now.setHours(0, 0, 0, 0)
  return Math.ceil((end - now) / 86400000)
}
function expiryText(d) {
  const n = daysLeft(d)
  if (n === null) return '设过期'
  if (n < 0) return `已过期 ${-n} 天`
  if (n === 0) return '今天到期'
  if (n <= 30) return `${n} 天后到期`
  return `有效至 ${d.expires_at}`
}
function expiryClass(d) {
  const n = daysLeft(d)
  if (n === null) return 'none'
  if (n < 0) return 'expired'
  if (n <= 30) return 'soon'
  return 'ok'
}

function fileIcon(ext) {
  return ({ pdf: '📕', doc: '📘', docx: '📘', xls: '📗', xlsx: '📗', txt: '📄', csv: '📄' }[String(ext || '').toLowerCase()] || '📎')
}
function fmtSize(n) {
  const b = Number(n) || 0
  if (b < 1024) return b + ' B'
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB'
  return (b / 1024 / 1024).toFixed(1) + ' MB'
}

watch(() => props.ownerName, () => { closeFolder(); load() })
onMounted(() => { load(); window.addEventListener('paste', onPaste) })
onBeforeUnmount(() => window.removeEventListener('paste', onPaste))
defineExpose({ load, closeFolder })
</script>

<style scoped>
.cdf { font-size: 13px; color: #1f2937; }
.cdf-bar { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; flex-wrap: wrap; }
.cdf-btn { border: 1px solid #d0d5dd; background: #fff; color: #344054; border-radius: 6px; padding: 6px 12px; font-size: 13px; cursor: pointer; }
.cdf-btn.primary { background: var(--color-primary, #1989fa); border-color: var(--color-primary, #1989fa); color: #fff; }
.cdf-btn.danger { color: #d92d20; border-color: #f3c1c1; }
.cdf-btn:disabled { opacity: .5; cursor: not-allowed; }
.cdf-hint { color: #98a2b3; font-size: 12px; flex: 1; }
.cdf-cur { font-size: 14px; }
.cdf-new { display: flex; gap: 8px; margin-bottom: 10px; }
.cdf-input { flex: 1; min-width: 0; border: 1px solid #d0d5dd; border-radius: 6px; padding: 7px 9px; font-size: 13px; outline: none; }
.cdf-input:focus { border-color: var(--color-primary, #1989fa); }
.cdf-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 10px; }
.cdf-folder { text-align: left; border: 1px solid #e4e7ec; background: #fafbfc; border-radius: 9px; padding: 12px; cursor: pointer; }
.cdf-folder:hover { border-color: var(--color-primary, #1989fa); background: #f5f9ff; }
.cdf-folder-name { font-size: 14px; color: #1f2937; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cdf-folder-meta { display: flex; gap: 8px; align-items: center; margin-top: 6px; color: #98a2b3; font-size: 12px; flex-wrap: wrap; }
.cdf-badge { border-radius: 10px; padding: 1px 7px; font-size: 11px; }
.cdf-badge.red { background: #fff1f0; color: #d92d20; }
.cdf-badge.orange { background: #fff7e6; color: #ad6800; }
.cdf-drop { border: 1.5px dashed #cdd5df; border-radius: 10px; padding: 16px; text-align: center; cursor: pointer; background: #fbfcfe; margin-bottom: 10px; }
.cdf-drop.drag, .cdf-drop:hover { border-color: var(--color-primary, #1989fa); background: #f5f9ff; }
.cdf-drop-main { font-size: 13px; color: #344054; }
.cdf-drop-sub { margin-top: 4px; font-size: 11px; color: #98a2b3; }
.cdf-files { display: flex; flex-direction: column; }
.cdf-file { display: flex; align-items: center; gap: 8px; padding: 8px 4px; border-bottom: 1px dashed #eef0f3; }
.cdf-thumb { width: 38px; height: 38px; border-radius: 6px; background: #f5f6f8; display: flex; align-items: center; justify-content: center; overflow: hidden; cursor: pointer; flex: 0 0 auto; }
.cdf-thumb img { width: 100%; height: 100%; object-fit: cover; }
.cdf-icon { font-size: 18px; }
.cdf-info { flex: 1; min-width: 0; }
.cdf-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cdf-sub { color: #98a2b3; font-size: 11px; margin-top: 2px; }
.cdf-exp { border: 1px solid #d0d5dd; background: #fff; border-radius: 12px; padding: 3px 9px; font-size: 11px; cursor: pointer; white-space: nowrap; }
.cdf-exp.none { color: #98a2b3; border-style: dashed; }
.cdf-exp.ok { color: #475467; }
.cdf-exp.soon { color: #ad6800; background: #fff7e6; border-color: #ffe7ba; }
.cdf-exp.expired { color: #d92d20; background: #fff1f0; border-color: #f3c1c1; }
.cdf-op { border: none; background: #fff; cursor: pointer; font-size: 14px; padding: 2px 3px; text-decoration: none; }
.cdf-op.danger { color: #d92d20; }
.cdf-empty { color: #98a2b3; text-align: center; padding: 22px 0; }
.cdf-mask { position: fixed; inset: 0; background: rgba(15,23,42,.45); z-index: 3200; display: flex; align-items: center; justify-content: center; }
.cdf-modal { background: #fff; border-radius: 10px; padding: 16px; width: min(380px, 90vw); }
.cdf-modal h4 { margin: 0 0 8px; font-size: 15px; }
.cdf-modal-file { color: #667085; font-size: 12px; margin-bottom: 10px; word-break: break-all; }
.cdf-modal-tip { color: #98a2b3; font-size: 11px; margin-top: 8px; }
.cdf-modal-btns { display: flex; gap: 8px; justify-content: flex-end; margin-top: 14px; }
.cdf-preview { position: fixed; inset: 0; background: rgba(0,0,0,.8); z-index: 3300; display: flex; align-items: center; justify-content: center; }
.cdf-preview img { max-width: 92vw; max-height: 90vh; object-fit: contain; }
</style>
