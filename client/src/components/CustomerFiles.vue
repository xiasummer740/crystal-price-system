<template>
  <teleport to="body">
    <div v-if="show" class="cf-mask" @click.self="close">
      <div class="cf-panel" @paste.prevent="onPaste">
        <header class="cf-head">
          <h3>客户文件</h3>
          <span class="cf-cus" :title="customer">{{ customer }}</span>
          <button class="cf-x" @click="close" title="关闭">✕</button>
        </header>

        <div class="cf-toolbar">
          <button class="cf-btn primary" @click="startNew">＋ 新建文件夹</button>
          <span class="cf-hint">默认名：{{ today6 }} + 晶科鑫料号，后面可加后缀或整个改名</span>
          <button class="cf-btn" @click="load" :disabled="loading">{{ loading ? '刷新中…' : '刷新' }}</button>
        </div>

        <div class="cf-body">
          <aside class="cf-folders">
            <button v-for="f in folders" :key="f.name" class="cf-folder" :class="{ on: f.name === activeFolder }" @click="activeFolder = f.name">
              <span class="cf-folder-name">📁 {{ f.name }}</span>
              <em>{{ f.files.length }}</em>
            </button>
            <div v-if="!folders.length" class="cf-empty">还没有文件夹，点上面「新建文件夹」</div>
          </aside>

          <section class="cf-main">
            <div v-if="newFolder.open" class="cf-new">
              <div class="cf-new-title">新建文件夹</div>
              <div class="cf-new-row">
                <input v-model="newFolder.name" class="cf-input" placeholder="261026SJK-xxxx" @input="newFolder.manual = true" />
                <button class="cf-btn primary" @click="createFolder" :disabled="creating">{{ creating ? '创建中…' : '创建' }}</button>
                <button class="cf-btn" @click="newFolder.open = false">取消</button>
              </div>
              <div class="cf-new-row">
                <span class="cf-chip">{{ today6 }}</span>
                <select v-model="newFolder.code" class="cf-input cf-sel" @change="applyTemplate">
                  <option value="">选晶科鑫料号（可空）</option>
                  <option v-for="m in materialOptions" :key="m.code" :value="m.code">{{ m.code }}{{ m.name ? ' · ' + m.name : '' }}</option>
                </select>
                <input v-model="newFolder.suffix" class="cf-input" placeholder="后缀，可空，比如 -报价" @input="applyTemplate" />
              </div>
              <div class="cf-new-tip">名字会按「日期 + 料号 + 后缀」自动拼好，也可以直接改上面的名字</div>
            </div>

            <template v-if="activeFolder">
              <div class="cf-drop" :class="{ drag: dragging }"
                @dragover.prevent="dragging = true" @dragleave="dragging = false" @drop.prevent="onDrop"
                @click="fileInput?.click()">
                <div class="cf-drop-main">拖文件到这里，或点一下选择文件</div>
                <div class="cf-drop-sub">也可以 Ctrl+V 粘贴（微信里复制的文件直接粘）· 上传到「{{ activeFolder }}」</div>
              </div>
              <input ref="fileInput" type="file" multiple hidden @change="onPick" />

              <div class="cf-files" v-if="activeFiles.length">
                <div v-for="f in activeFiles" :key="f.name" class="cf-file">
                  <span class="cf-icon">{{ icon(f.name) }}</span>
                  <a class="cf-fname" :href="fileUrl(f.name)" target="_blank" :title="f.name">{{ f.name }}</a>
                  <span class="cf-size">{{ fmtSize(f.size) }}</span>
                  <button class="cf-mini" @click="openFile(f.name)" title="在资源管理器里定位">定位</button>
                  <button v-if="canCopyFile" class="cf-mini" @click="copyFile(f.name)" title="复制文件，可粘到微信">复制</button>
                  <button class="cf-mini danger" @click="removeFile(f.name)" title="删除文件">删除</button>
                </div>
              </div>
              <div v-else class="cf-empty">这个文件夹还是空的，拖文件进来吧</div>

              <div class="cf-foot">
                <button class="cf-mini danger" @click="removeFolder(activeFolder)">删除这个空文件夹</button>
              </div>
            </template>

            <div v-else class="cf-empty big">左边选一个文件夹，或先新建一个</div>
          </section>
        </div>

        <div v-if="uploading" class="cf-uploading">正在上传 {{ uploading }} 个文件…</div>
      </div>
    </div>
  </teleport>
</template>

<script setup>
import { computed, reactive, ref, watch, onBeforeUnmount, onMounted } from 'vue'
import { showToast, showConfirmDialog } from 'vant'
import {
  fetchCustomerFiles, mkdirCustomerFolder, uploadCustomerFiles,
  deleteCustomerFile, deleteCustomerFolder, copyCustomerFile, openCustomerFile
} from '../utils/api.js'

const props = defineProps({
  show: { type: Boolean, default: false },
  customer: { type: String, default: '' },
  materials: { type: Array, default: () => [] }
})
const emit = defineEmits(['update:show'])

const folders = ref([])
const activeFolder = ref('')
const loading = ref(false)
const creating = ref(false)
const uploading = ref(0)
const dragging = ref(false)
const fileInput = ref(null)
const canCopyFile = ref(!!window.electronAPI || ['localhost', '127.0.0.1'].includes(location.hostname))

const today6 = computed(() => {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return String(d.getFullYear()).slice(2) + p(d.getMonth() + 1) + p(d.getDate())
})

const newFolder = reactive({ open: false, code: '', suffix: '', name: '', manual: false })

// 料号去重，附带名称方便辨认
const materialOptions = computed(() => {
  const seen = new Set()
  const out = []
  for (const m of props.materials || []) {
    const code = String(m.jkx_code || m.material_code || '').trim()
    if (!code || seen.has(code)) continue
    seen.add(code)
    out.push({ code, name: String(m.material_name || '').slice(0, 18) })
  }
  return out
})

const activeFiles = computed(() => folders.value.find(f => f.name === activeFolder.value)?.files || [])

function applyTemplate() {
  if (!newFolder.open) return
  newFolder.name = today6.value + (newFolder.code || '') + (newFolder.suffix || '')
  newFolder.manual = true
}

function startNew() {
  newFolder.open = true
  newFolder.code = ''
  newFolder.suffix = ''
  newFolder.name = today6.value
  newFolder.manual = false
}

async function load() {
  if (!props.customer) return
  loading.value = true
  try {
    const r = await fetchCustomerFiles(props.customer)
    folders.value = r.data?.folders || []
    if (!folders.value.find(f => f.name === activeFolder.value)) {
      activeFolder.value = folders.value[0]?.name || ''
    }
  } catch (e) {
    showToast('读取失败: ' + (e.message || '未知错误'))
  } finally {
    loading.value = false
  }
}

async function createFolder() {
  const name = String(newFolder.name || '').trim()
  if (!name) return showToast('请填文件夹名')
  creating.value = true
  try {
    const r = await mkdirCustomerFolder(props.customer, name)
    showToast('已创建「' + r.data.name + '」')
    newFolder.open = false
    await load()
    activeFolder.value = r.data.name
  } catch (e) {
    showToast(e.message || '创建失败')
  } finally {
    creating.value = false
  }
}

async function doUpload(list) {
  const files = Array.from(list || []).filter(Boolean)
  if (!files.length) return
  if (!activeFolder.value) return showToast('先选一个文件夹')
  uploading.value = files.length
  try {
    const fd = new FormData()
    fd.append('customer', props.customer)
    fd.append('folder', activeFolder.value)
    for (const f of files) fd.append('files', f, f.name)
    const r = await uploadCustomerFiles(fd)
    showToast('已上传 ' + (r.data?.files?.length || files.length) + ' 个文件')
    await load()
  } catch (e) {
    showToast('上传失败: ' + (e.message || '未知错误'))
  } finally {
    uploading.value = 0
  }
}

function onPick(e) { doUpload(e.target.files); e.target.value = '' }
function onDrop(e) { dragging.value = false; doUpload(e.dataTransfer?.files) }
function onPaste(e) {
  if (!props.show) return
  const files = e.clipboardData?.files
  if (files?.length) { e.preventDefault(); doUpload(files) }
}

function fileUrl(name) {
  return `/api/cust/${encodeURIComponent(props.customer)}/${encodeURIComponent('客户文件')}/${encodeURIComponent(activeFolder.value)}/${encodeURIComponent(name)}`
}

async function copyFile(name) {
  try {
    await copyCustomerFile(props.customer, activeFolder.value, name)
    showToast('已复制「' + name + '」，可粘贴到微信')
  } catch (e) { showToast('复制失败: ' + (e.message || '未知错误')) }
}

async function openFile(name) {
  try { await openCustomerFile(props.customer, activeFolder.value, name) }
  catch (e) { showToast('打开失败: ' + (e.message || '未知错误')) }
}

async function removeFile(name) {
  try {
    await showConfirmDialog({ title: '删除文件', message: `删除「${name}」？不能恢复。`, confirmButtonText: '删除', confirmButtonColor: '#ee0a24' })
  } catch { return }
  try {
    await deleteCustomerFile(props.customer, activeFolder.value, name)
    showToast('已删除')
    await load()
  } catch (e) { showToast('删除失败: ' + (e.message || '未知错误')) }
}

async function removeFolder(name) {
  try {
    await showConfirmDialog({ title: '删除文件夹', message: `删除空文件夹「${name}」？`, confirmButtonText: '删除', confirmButtonColor: '#ee0a24' })
  } catch { return }
  try {
    await deleteCustomerFolder(props.customer, name)
    showToast('已删除')
    if (activeFolder.value === name) activeFolder.value = ''
    await load()
  } catch (e) { showToast(e.message || '删除失败') }
}

function icon(name) {
  const e = String(name).toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || ''
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(e)) return '🖼'
  if (e === 'pdf') return '📄'
  if (['doc', 'docx'].includes(e)) return '📝'
  if (['xls', 'xlsx', 'csv'].includes(e)) return '📊'
  if (['zip', 'rar', '7z'].includes(e)) return '🗜'
  return '📎'
}
function fmtSize(n) {
  if (!n) return ''
  if (n < 1024) return n + ' B'
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB'
  return (n / 1024 / 1024).toFixed(1) + ' MB'
}

function close() { emit('update:show', false) }

watch(() => props.show, v => {
  if (v) { activeFolder.value = ''; newFolder.open = false; load() }
})
watch(() => props.customer, () => { if (props.show) load() })
onMounted(() => window.addEventListener('paste', onPaste))
onBeforeUnmount(() => window.removeEventListener('paste', onPaste))
</script>

<style scoped>
.cf-mask { position: fixed; inset: 0; background: rgba(15, 23, 42, .55); z-index: 3500; display: flex; align-items: center; justify-content: center; }
.cf-panel { width: min(1080px, 94vw); height: min(82vh, 860px); background: #fff; border-radius: 12px; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 18px 50px rgba(0,0,0,.35); }
.cf-head { display: flex; align-items: center; gap: 10px; padding: 12px 16px; border-bottom: 1px solid #eef0f3; }
.cf-head h3 { margin: 0; font-size: 16px; color: #1f2937; }
.cf-cus { color: #667085; font-size: 13px; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cf-x { border: none; background: #f2f4f7; color: #475467; width: 28px; height: 28px; border-radius: 50%; cursor: pointer; }
.cf-toolbar { display: flex; align-items: center; gap: 10px; padding: 10px 16px; border-bottom: 1px solid #f2f4f7; flex-wrap: wrap; }
.cf-hint { color: #98a2b3; font-size: 12px; flex: 1; }
.cf-btn { border: 1px solid #d0d5dd; background: #fff; color: #344054; border-radius: 6px; padding: 6px 12px; font-size: 13px; cursor: pointer; }
.cf-btn.primary { background: var(--color-primary, #1989fa); border-color: var(--color-primary, #1989fa); color: #fff; }
.cf-btn:disabled { opacity: .6; cursor: default; }
.cf-body { flex: 1; display: flex; min-height: 0; }
.cf-folders { width: 270px; border-right: 1px solid #eef0f3; overflow-y: auto; padding: 8px; background: #fafbfc; }
.cf-folder { display: flex; align-items: center; gap: 6px; width: 100%; border: none; background: transparent; text-align: left; padding: 8px 10px; border-radius: 7px; cursor: pointer; color: #344054; font-size: 13px; }
.cf-folder:hover { background: #eef4ff; }
.cf-folder.on { background: #e6f0ff; color: #155eef; font-weight: 600; }
.cf-folder-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cf-folder em { font-style: normal; color: #98a2b3; font-size: 11px; }
.cf-main { flex: 1; min-width: 0; padding: 12px 16px; overflow-y: auto; display: flex; flex-direction: column; }
.cf-new { border: 1px solid #e4e7ec; border-radius: 10px; padding: 12px; margin-bottom: 12px; background: #fcfcfd; }
.cf-new-title { font-size: 13px; color: #344054; font-weight: 600; margin-bottom: 8px; }
.cf-new-row { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; }
.cf-input { flex: 1; min-width: 0; border: 1px solid #d0d5dd; border-radius: 6px; padding: 6px 8px; font-size: 13px; outline: none; }
.cf-input:focus { border-color: var(--color-primary, #1989fa); }
.cf-sel { flex: 0 0 260px; }
.cf-chip { background: #eef4ff; color: #155eef; border-radius: 5px; padding: 4px 8px; font-size: 12px; }
.cf-new-tip { color: #98a2b3; font-size: 12px; }
.cf-drop { border: 1.5px dashed #cdd5df; border-radius: 10px; padding: 18px; text-align: center; cursor: pointer; background: #fbfcfe; }
.cf-drop.drag, .cf-drop:hover { border-color: var(--color-primary, #1989fa); background: #f5f9ff; }
.cf-drop-main { font-size: 13px; color: #344054; }
.cf-drop-sub { margin-top: 4px; font-size: 11px; color: #98a2b3; }
.cf-files { margin-top: 10px; }
.cf-file { display: flex; align-items: center; gap: 8px; padding: 7px 4px; border-bottom: 1px dashed #eef0f3; font-size: 13px; }
.cf-icon { flex: 0 0 auto; }
.cf-fname { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #155eef; text-decoration: none; }
.cf-fname:hover { text-decoration: underline; }
.cf-size { color: #98a2b3; font-size: 11px; flex: 0 0 auto; }
.cf-mini { border: 1px solid #d0d5dd; background: #fff; color: #475467; border-radius: 5px; padding: 2px 8px; font-size: 12px; cursor: pointer; }
.cf-mini.danger { color: #d92d20; border-color: #f3c1c1; }
.cf-empty { color: #98a2b3; font-size: 13px; padding: 18px 8px; text-align: center; }
.cf-empty.big { margin: auto; }
.cf-foot { margin-top: auto; padding-top: 14px; }
.cf-uploading { padding: 8px 16px; background: #fff7e6; color: #ad6800; font-size: 12px; border-top: 1px solid #ffe7ba; }
</style>
