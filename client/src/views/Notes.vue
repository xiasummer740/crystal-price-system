<template>
  <transition name="page-fade">
    <div class="page-wrap">
      <header class="page-header" :class="{standalone: isStandalone}">
        <div class="header-left">
          <button class="back-btn" @click="goBack">‹</button>
          <h3>记事便签</h3>
          <span class="result-badge" v-if="store.total">共 {{ store.total }} 条</span>
        </div>
        <div class="header-right">
          <button class="hdr-btn" :class="{active: store.viewMode === 'card'}" @click="switchMode('card')" title="卡片视图">📋</button>
          <button class="hdr-btn" :class="{active: store.viewMode === 'kanban'}" @click="switchMode('kanban')" title="看板视图">📊</button>
          <button class="hdr-btn cat-btn" @click="showCategoryManager = true" title="管理分类">🏷️</button>
          <button class="action-btn" @click="handleExport" title="导出记事（含图片）">📥 导出</button>
          <button class="action-btn" @click="handleImport" title="导入记事">📤 导入</button>
          <button class="action-btn" @click="handleDownloadTemplate" title="下载导入模板">📄 模板</button>
          <router-link to="/notes/add" class="add-btn">＋ 新增</router-link>
          <button class="close-btn" @click="goBack" title="关闭">✕</button>
        </div>
      </header>

      <div class="filter-bar" v-if="store.viewMode === 'card'">
        <div class="search-box">
          <input v-model="store.filters.keyword" placeholder="搜索标题、内容、客户…" @input="onSearchDebounced" class="search-input" ref="searchInput" />
          <span v-if="store.filters.keyword" class="search-clear" @click="store.filters.keyword = ''; onSearch()">×</span>
        </div>
        <div class="filter-btn" :class="{ active: store.filters.category_id }" @click="openFilter('category')">
          {{ filterLabel('category') }} ▾
        </div>
        <div class="filter-btn" :class="{ active: store.filters.status }" @click="openFilter('status')">
          {{ filterLabel('status') }} ▾
        </div>
        <div class="filter-btn" :class="{ active: store.filters.reminder }" @click="openFilter('reminder')">
          {{ filterLabel('reminder') }} ▾
        </div>
      </div>

      <!-- 骨架屏加载 -->
      <div v-if="store.loading && !store.list.length" class="skeleton-area">
        <div v-for="n in 4" :key="n" class="skeleton-group">
          <div class="skeleton-header"></div>
          <div class="skeleton-grid">
            <div v-for="m in 3" :key="m" class="skeleton-card">
              <div class="sk-hdr"><span class="sk-dot"></span><span class="sk-tag"></span></div>
              <div class="sk-title"></div>
              <div class="sk-desc"></div>
              <div class="sk-meta"><span class="sk-tag"></span><span class="sk-tag"></span></div>
            </div>
          </div>
        </div>
      </div>

      <!-- 卡片视图 -->
      <div class="card-view" v-show="store.viewMode === 'card' && !(store.loading && !store.list.length)">
        <div v-if="store.list.length">
          <div v-for="(items, customer) in groupedByCustomer" :key="customer" class="customer-group">
            <div class="customer-header">
              <span class="customer-dot"></span>
              <span class="customer-name" @click="addNoteFor(customer)" :title="'为「'+customer+'」新增记事'">{{ customer || '未指定客户' }}</span>
              <span class="customer-count">{{ items.length }} 条</span>
              <span class="customer-add" @click.stop="addNoteFor(customer)" title="为该客户新增记事">＋</span>
            </div>
            <transition-group name="card-stagger" tag="div" class="card-grid">
              <div v-for="item in items" :key="item.id" class="note-card" @click="goDetail(item)" :class="{ pinned: item.is_pinned }">
                <div class="card-header">
                  <span class="card-priority" :class="'p' + (item.priority || 2)">
                    {{ {1:'🔴',2:'🟡',3:'🔵'}[item.priority || 2] }}
                  </span>
                  <span class="card-cat" v-if="item.category_name" :style="{ background: item.category_color + '20', color: item.category_color }">
                    {{ item.category_name }}
                  </span>
                  <span v-if="item.is_pinned" class="card-pin">📌</span>
                  <span v-if="item.reminder_at && !item.is_reminded" class="card-reminder-icon">⏰</span>
                </div>
                <h4 class="card-title">{{ item.title }}</h4>
                <p class="card-desc" v-if="item.content">{{ contentPreview(item.content) }}</p>
                <div class="card-time">{{ fmtTime(item.updated_at || item.created_at) }}</div>
                <div class="card-meta">
                  <span v-if="item.customer" class="card-customer">👤 {{ item.customer }}</span>
                  <span class="card-status" :class="item.status">
                    {{ {todo:'待办',in_progress:'进行中',done:'已完成'}[item.status] || '待办' }}
                  </span>
                  <span v-if="hasAttachments(item)" class="card-img-count">📎 {{ attachmentCount(item) }}</span>
                  <span class="card-edit" @click.stop="router.push('/notes/edit/'+item.id)" title="编辑">✎</span>
                </div>
              </div>
            </transition-group>
          </div>
        </div>
        <div v-else-if="!store.loading" class="empty-state">
          <div class="empty-icon">📝</div>
          <p class="empty-title">{{ hasActiveFilter ? '没有匹配的记事' : '暂无记事' }}</p>
          <p class="empty-desc">{{ hasActiveFilter ? '试试调整搜索条件或筛选' : '点击下方按钮创建第一条记事' }}</p>
          <router-link to="/notes/add" class="empty-add-btn">新建记事</router-link>
        </div>

        <div class="pager" v-if="store.total > store.filters.pageSize">
          <button class="pg-btn" :disabled="store.filters.page <= 1" @click="store.setFilter('page', 1); load()">首页</button>
          <button class="pg-btn" :disabled="store.filters.page <= 1" @click="store.setFilter('page', store.filters.page - 1); load()">‹</button>
          <span class="pg-info">{{ store.filters.page }} / {{ totalPages }}</span>
          <button class="pg-btn" :disabled="store.filters.page >= totalPages" @click="store.setFilter('page', store.filters.page + 1); load()">›</button>
          <button class="pg-btn" :disabled="store.filters.page >= totalPages" @click="store.setFilter('page', totalPages); load()">末页</button>
        </div>
      </div>

      <!-- 看板视图 -->
      <div class="kanban-view" v-show="store.viewMode === 'kanban' && !(store.loading && !store.list.length)">
        <div class="kanban-cols">
          <div v-for="col in kanbanCols" :key="col.key" class="kanban-col"
            @dragover.prevent="onDragOver($event, col.key)"
            @dragleave.prevent="onDragLeave($event, col.key)"
            @drop="onDrop($event, col.key)"
            :class="{ 'drag-over': dragOverCol === col.key }">
            <div class="kanban-col-head">
              <span class="kanban-dot" :style="{ background: col.color }"></span>
              <span class="kanban-col-title">{{ col.label }}</span>
              <span class="kanban-count">{{ grouped[col.key]?.length || 0 }}</span>
            </div>
            <div class="kanban-list">
              <div v-for="item in grouped[col.key]" :key="item.id" class="kanban-card" :draggable="true"
                @dragstart="onDragStart($event, item)" @click="goDetail(item)">
                <div class="kanban-card-header">
                  <span class="card-priority" :class="'p' + (item.priority || 2)">{{ {1:'🔴',2:'🟡',3:'🔵'}[item.priority || 2] }}</span>
                  <span class="kanban-cat" v-if="item.category_name" :style="{ color: item.category_color }">{{ item.category_name }}</span>
                  <span v-if="item.is_pinned" class="card-pin">📌</span>
                </div>
                <div class="kanban-title">{{ item.title }}</div>
                <div class="kanban-meta">
                  <span v-if="item.customer">{{ item.customer }}</span>
                  <span v-if="item.reminder_at && !item.is_reminded">⏰</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 加载覆盖层（刷新数据时） -->
      <div v-if="store.loading && store.list.length" class="loading-overlay">
        <van-loading size="18" />
      </div>

      <!-- 悬浮新增按钮 -->
      <router-link to="/notes/add" class="fab">＋</router-link>

      <!-- 事项类型管理 -->
      <NoteCategories :show="showCategoryManager" @close="showCategoryManager = false" @updated="onCategoriesUpdated" />

      <!-- 筛选弹出层（支持滚轮滚动） -->
      <van-action-sheet v-model:show="showFilterSheet" :actions="filterActions" cancel-text="取消"
        @select="onFilterSelect" close-on-click-action description="选择筛选条件" />
    </div>
  </transition>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast } from 'vant'
import { useNotesStore } from '../stores/notes.js'
import { updateNote, exportNotesPackage, importNotesZip, downloadNoteTemplate } from '../utils/api.js'
import NoteCategories from './NoteCategories.vue'

const emit = defineEmits(['close'])
const route = useRoute()
const router = useRouter()
const store = useNotesStore()
const showCategoryManager = ref(false)
const draggingItem = ref(null)
const dragOverCol = ref('')
const searchInput = ref(null)

const isStandalone = ref(route.query.standalone === '1')
const showFilterSheet = ref(false)
const filterType = ref('')

const filterActions = computed(() => {
  if (filterType.value === 'category') {
    const opts = [{ name: '全部分类', value: '' }]
    for (const c of store.categories) {
      opts.push({ name: c.name, value: c.id })
    }
    return opts
  }
  if (filterType.value === 'status') {
    return [
      { name: '全部状态', value: '' },
      { name: '待办', value: 'todo' },
      { name: '进行中', value: 'in_progress' },
      { name: '已完成', value: 'done' }
    ]
  }
  if (filterType.value === 'reminder') {
    return [
      { name: '全部提醒', value: '' },
      { name: '待提醒', value: 'pending' }
    ]
  }
  return []
})

const filterLabels = {
  category: { '': '全部分类' },
  status: { '': '全部状态', todo: '待办', in_progress: '进行中', done: '已完成' },
  reminder: { '': '全部提醒', pending: '待提醒' }
}

function filterLabel(type) {
  const v = store.filters[type]
  const map = filterLabels[type]
  if (!map) return '筛选'
  if (map[v] !== undefined) return map[v]
  if (type === 'category' && v) {
    const c = store.categories.find(c => c.id === Number(v))
    if (c) return c.name
  }
  return '筛选'
}

function openFilter(type) {
  filterType.value = type
  showFilterSheet.value = true
}

function onFilterSelect(item) {
  if (filterType.value) {
    store.setFilter(filterType.value, item.value)
    onSearch()
  }
}

const hasActiveFilter = computed(() =>
  store.filters.keyword || store.filters.category_id || store.filters.status || store.filters.reminder
)

const kanbanCols = [
  { key: 'todo', label: '待办', color: '#757575' },
  { key: 'in_progress', label: '进行中', color: '#1565c0' },
  { key: 'done', label: '已完成', color: '#2e7d32' }
]

const grouped = computed(() => {
  const g = { todo: [], in_progress: [], done: [] }
  for (const item of store.list) {
    const s = item.status || 'todo'
    if (g[s]) g[s].push(item)
    else g.todo.push(item)
  }
  return g
})

const totalPages = computed(() => Math.max(1, Math.ceil(store.total / store.filters.pageSize)))

const groupedByCustomer = computed(() => {
  const groups = {}
  for (const item of store.list) {
    const key = item.customer || ''
    if (!groups[key]) groups[key] = []
    groups[key].push(item)
  }
  // 客户排序：有待办/进行中 > 仅已完成；同优先级按最新更新时间
  const keys = Object.keys(groups).sort((a, b) => {
    const aAct = groups[a].some(i => i.status === 'todo' || i.status === 'in_progress')
    const bAct = groups[b].some(i => i.status === 'todo' || i.status === 'in_progress')
    if (aAct && !bAct) return -1
    if (!aAct && bAct) return 1
    const aLast = Math.max(...groups[a].map(i => new Date((i.updated_at||i.created_at||'').replace(' ','T')).getTime()).filter(t => !isNaN(t)))
    const bLast = Math.max(...groups[b].map(i => new Date((i.updated_at||i.created_at||'').replace(' ','T')).getTime()).filter(t => !isNaN(t)))
    return bLast - aLast
  })
  const sorted = {}
  for (const k of keys) sorted[k] = groups[k]
  return sorted
})

function contentPreview(text) {
  return text.replace(/<[^>]+>/g, '').replace(/\n/g, ' ').slice(0, 80) + (text.length > 80 ? '…' : '')
}
function fmtTime(t) {
  if (!t) return ''
  const d = new Date(t.replace(' ', 'T'))
  if (isNaN(d.getTime())) return t.slice(0, 10)
  const pad = n => String(n).padStart(2, '0')
  return `${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function hasAttachments(item) {
  try { const imgs = JSON.parse(item.images || '[]'); return imgs.length > 0 } catch { return false }
}
function attachmentCount(item) {
  try { return JSON.parse(item.images || '[]').length } catch { return 0 }
}
function goDetail(item) {
  router.push('/notes/' + item.id)
}
function addNoteFor(customer) {
  if (customer) router.push('/notes/add?customer=' + encodeURIComponent(customer))
}
function goBack() {
  if (isStandalone.value) {
    window.close()
  } else {
    emit('close')
  }
}
function switchMode(mode) {
  store.viewMode = mode
  store.setFilter('page', 1)
  load()
}

let searchTimer = null
function onSearchDebounced() {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => onSearch(), 350)
}
function onSearch() {
  store.setFilter('page', 1)
  load()
}

async function load() {
  store.setFilter('pageSize', store.viewMode === 'kanban' ? 200 : 50)
  await store.loadList()
}

function onDragStart(e, item) {
  draggingItem.value = item
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', item.id)
}
function onDragOver(e, colKey) {
  dragOverCol.value = colKey
  e.dataTransfer.dropEffect = 'move'
}
function onDragLeave(e, colKey) {
  if (dragOverCol.value === colKey) dragOverCol.value = ''
}
async function onDrop(e, status) {
  dragOverCol.value = ''
  if (!draggingItem.value) return
  if (draggingItem.value.status === status) { draggingItem.value = null; return }
  try {
    await updateNote(draggingItem.value.id, { status })
    draggingItem.value.status = status
    showToast('已移至' + ({ todo: '待办', in_progress: '进行中', done: '已完成' }[status] || status))
  } catch (e) {
    showToast('更新失败: ' + e.message)
  }
  draggingItem.value = null
  load()
}

async function onCategoriesUpdated() {
  await store.loadCategories()
  load()
}

// 导入导出
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function triggerDownload(url) {
  const a = document.createElement('a')
  a.href = url; a.style.display = 'none'
  document.body.appendChild(a); a.click()
  document.body.removeChild(a)
}

function handleExport() {
  const p = new URLSearchParams()
  if (store.filters.keyword) p.set('keyword', store.filters.keyword)
  if (store.filters.customer) p.set('customer', store.filters.customer)
  if (store.filters.category_id) p.set('category_id', store.filters.category_id)
  if (store.filters.status) p.set('status', store.filters.status)
  triggerDownload('/api/notes/export?' + p.toString())
}

function handleDownloadTemplate() {
  triggerDownload('/api/notes/template')
}

let importInput = null
function handleImport() {
  if (!importInput) {
    importInput = document.createElement('input')
    importInput.type = 'file'
    importInput.accept = '.zip,.xlsx'
    importInput.style.display = 'none'
    document.body.appendChild(importInput)
    importInput.addEventListener('change', async () => {
      const file = importInput.files[0]
      if (!file) return
      const formData = new FormData()
      formData.append('file', file)
      try {
        const res = await importNotesZip(formData)
        showToast(res.msg || '导入成功')
        load()
      } catch (e) {
        showToast('导入失败: ' + e.message)
      }
      importInput.value = ''
    })
  }
  importInput.click()
}

function onKeydown(e) {
  if (e.key === 'Escape' && isStandalone.value) {
    window.close()
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
    if (store.viewMode === 'card') searchInput.value?.focus()
    e.preventDefault()
  }
}

onMounted(async () => {
  document.addEventListener('keydown', onKeydown)
  await store.loadCategories()
  await load()
})

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
})
</script>

<style scoped>
/* ====== 基础布局 ====== */
.page-wrap { display: flex; flex-direction: column; height: 100vh; background: #f5f6f8; }

/* ====== 页面过渡动画 ====== */
.page-fade-enter-active { transition: opacity .2s ease, transform .2s ease; }
.page-fade-enter-from { opacity: 0; transform: translateY(8px); }

/* ====== 头部 ====== */
.page-header { display: flex; align-items: center; justify-content: space-between; padding: 8px 16px; background: #fff; border-bottom: 1px solid #e8e8e8; flex-shrink: 0; position: sticky; top: 0; z-index: 10; }
.header-left { display: flex; align-items: center; gap: 8px; }
.header-left h3 { font-size: 16px; font-weight: 600; margin: 0; color: #323233; }
.header-right { display: flex; align-items: center; gap: 6px; }
.back-btn { background: none; border: none; font-size: 20px; cursor: pointer; color: #1989fa; padding: 2px 4px; line-height: 1; }
.result-badge { font-size: 11px; color: #999; background: #f5f6f8; padding: 2px 8px; border-radius: 10px; }
.hdr-btn { width: 32px; height: 32px; border-radius: 6px; border: 1px solid #e0e0e0; background: #fff; font-size: 16px; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0; line-height: 1; transition: all .15s; }
.hdr-btn.active { background: #1989fa; border-color: #1989fa; color: #fff; }
.hdr-btn:hover:not(.active) { border-color: #1989fa; }
.cat-btn { font-size: 14px; }
.action-btn { padding: 4px 8px; border-radius: 6px; border: 1px solid #e0e0e0; background: #fff; font-size: 11px; cursor: pointer; white-space: nowrap; transition: all .15s; color: #555; }
.action-btn:hover { border-color: #1989fa; color: #1989fa; background: #f0f8ff; }
.add-btn { padding: 6px 14px; border-radius: 6px; border: none; background: #1989fa; color: #fff; font-size: 12px; cursor: pointer; text-decoration: none; white-space: nowrap; transition: background .15s; }
.add-btn:hover { background: #1676d9; }
.close-btn { width: 32px; height: 32px; border-radius: 50%; border: none; background: #f5f5f5; color: #999; font-size: 14px; cursor: pointer; display: flex; align-items: center; justify-content: center; margin-left: 4px; transition: all .15s; }
.close-btn:hover { background: #ee0a24; color: #fff; }

/* ====== 筛选栏 ====== */
.filter-bar { display: flex; gap: 8px; padding: 8px 16px; background: #fff; border-bottom: 1px solid #f0f0f0; flex-shrink: 0; overflow-x: auto; }
.search-box { display: flex; align-items: center; flex: 1; min-width: 120px; background: #f5f6f8; border-radius: 8px; padding: 0 10px; height: 34px; transition: box-shadow .2s; }
.search-box:focus-within { box-shadow: 0 0 0 2px rgba(25,137,250,.15); }
.search-input { flex: 1; border: none; outline: none; font-size: 12px; color: #323233; background: transparent; font-family: inherit; }
.search-input::placeholder { color: #bbb; }
.search-clear { color: #bbb; cursor: pointer; font-size: 14px; padding: 2px; }
.search-clear:hover { color: #666; }
.filter-select { padding: 4px 8px; border-radius: 6px; border: 1px solid #e0e0e0; font-size: 12px; color: #555; background: #fff; font-family: inherit; outline: none; min-width: 70px; cursor: pointer; transition: border-color .2s; }
.filter-select:focus { border-color: #1989fa; }
.filter-btn { padding: 4px 10px; border-radius: 6px; border: 1px solid #e0e0e0; font-size: 12px; color: #555; background: #fff; font-family: inherit; outline: none; cursor: pointer; transition: all .15s; white-space: nowrap; user-select: none; }
.filter-btn:hover { border-color: #1989fa; color: #1989fa; }
.filter-btn.active { background: #e6f4ff; border-color: #1989fa; color: #1989fa; }

/* ====== 骨架屏 ====== */
.skeleton-area { flex: 1; overflow-y: auto; padding: 12px 16px; }
.skeleton-group { margin-bottom: 20px; }
.skeleton-header { height: 20px; width: 100px; background: #e8e8e8; border-radius: 4px; margin-bottom: 12px; animation: sk-pulse 1.5s infinite ease-in-out; }
.skeleton-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
.skeleton-card { background: #fff; border-radius: 12px; padding: 16px; border: 1px solid #f0f0f0; }
.sk-hdr { display: flex; gap: 6px; margin-bottom: 10px; }
.sk-dot { width: 14px; height: 14px; background: #eee; border-radius: 50%; animation: sk-pulse 1.5s infinite ease-in-out; }
.sk-tag { height: 14px; background: #eee; border-radius: 3px; animation: sk-pulse 1.5s infinite ease-in-out; }
.sk-title { height: 16px; width: 70%; background: #eee; border-radius: 4px; margin-bottom: 8px; animation: sk-pulse 1.5s infinite ease-in-out 0.1s; }
.sk-desc { height: 12px; width: 90%; background: #eee; border-radius: 4px; margin-bottom: 12px; animation: sk-pulse 1.5s infinite ease-in-out 0.2s; }
.sk-meta { display: flex; gap: 8px; }
.sk-meta .sk-tag { width: 40px; height: 16px; animation: sk-pulse 1.5s infinite ease-in-out 0.3s; }
@keyframes sk-pulse { 0%,100% { opacity: .4; } 50% { opacity: .8; } }

/* ====== 卡片列表 ====== */
.card-view { flex: 1; overflow-y: auto; padding: 12px 16px; }
.customer-group { margin-bottom: 20px; animation: group-in .3s ease; }
@keyframes group-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
.customer-header { display: flex; align-items: center; gap: 8px; padding: 6px 4px 10px; border-bottom: 1px solid #f0f0f0; margin-bottom: 10px; }
.customer-dot { width: 8px; height: 8px; border-radius: 50%; background: #1989fa; flex-shrink: 0; }
.customer-name { font-size: 14px; font-weight: 600; color: #323233; cursor: pointer; transition: color .15s; }
.customer-name:hover { color: #1989fa; }
.customer-count { font-size: 11px; color: #bbb; margin-left: auto; }
.customer-add { font-size: 16px; color: #ccc; cursor: pointer; padding: 0 4px; margin-left: 6px; line-height: 1; transition: color .15s; }
.customer-add:hover { color: #52c41a; }

/* 卡片网格 */
.card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
.card-stagger-enter-active { transition: all .25s ease; }
.card-stagger-enter-from { opacity: 0; transform: translateY(12px); }
.note-card { background: #fff; border-radius: 12px; padding: 16px; cursor: pointer; border: 1px solid #f0f0f0; transition: all .2s cubic-bezier(.4,0,.2,1); position: relative; overflow: hidden; }
.note-card:hover { box-shadow: 0 6px 20px rgba(0,0,0,.07); transform: translateY(-2px); border-color: #d0d0d0; }
.note-card:active { transform: translateY(0); }
.note-card.pinned { border-left: 3px solid #ff9800; }
.note-card.pinned::before { content: ''; position: absolute; top: 0; right: 0; width: 60px; height: 60px; background: linear-gradient(135deg, transparent 50%, rgba(255,152,0,.06) 50%); pointer-events: none; }
.card-header { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; }
.card-priority { font-size: 14px; line-height: 1; }
.card-cat { font-size: 10px; padding: 1px 6px; border-radius: 3px; font-weight: 500; }
.card-pin { font-size: 12px; margin-left: auto; }
.card-reminder-icon { font-size: 11px; margin-left: auto; opacity: .7; }
.card-title { font-size: 15px; font-weight: 600; color: #1a1a2e; margin: 0 0 6px; word-break: break-word; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.card-desc { font-size: 12px; color: #999; margin: 0 0 10px; line-height: 1.5; word-break: break-word; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.card-time { font-size: 10px; color: #ccc; margin: 0 0 6px; }
.card-meta { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; font-size: 11px; color: #aaa; }
.card-customer { color: #666; }
.card-edit { font-size: 13px; color: #ccc; cursor: pointer; margin-left: auto; padding: 0 2px; line-height: 1; transition: color .15s; }
.card-edit:hover { color: #1989fa; }
.card-status { padding: 1px 6px; border-radius: 3px; font-size: 10px; }
.card-status.todo { background: #f5f5f5; color: #757575; }
.card-status.in_progress { background: #e3f2fd; color: #1565c0; }
.card-status.done { background: #e8f5e9; color: #2e7d32; }

/* ====== 空状态 ====== */
.empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; flex: 1; padding: 40px 20px; text-align: center; }
.empty-icon { font-size: 56px; margin-bottom: 12px; }
.empty-title { font-size: 16px; color: #323233; margin: 0 0 6px; font-weight: 500; }
.empty-desc { font-size: 13px; color: #bbb; margin: 0 0 20px; }
.empty-add-btn { display: inline-block; padding: 10px 28px; border-radius: 8px; background: #1989fa; color: #fff; font-size: 14px; text-decoration: none; transition: background .15s; }
.empty-add-btn:hover { background: #1676d9; }

/* ====== 分页 ====== */
.pager { display: flex; align-items: center; justify-content: center; gap: 6px; padding: 16px 0 24px; }
.pg-btn { padding: 4px 10px; border-radius: 4px; border: 1px solid #d9d9d9; background: #fff; color: #555; font-size: 12px; cursor: pointer; font-family: inherit; transition: all .15s; min-width: 32px; text-align: center; }
.pg-btn:hover:not(:disabled) { color: #1989fa; border-color: #1989fa; }
.pg-btn:disabled { color: #ccc; cursor: not-allowed; background: #f5f5f5; }
.pg-info { font-size: 12px; color: #888; padding: 0 4px; }

/* ====== 看板视图 ====== */
.kanban-view { flex: 1; overflow-x: auto; padding: 12px 16px; }
.kanban-cols { display: flex; gap: 12px; height: 100%; min-height: 400px; }
.kanban-col { flex: 1; min-width: 240px; background: #f0f2f5; border-radius: 10px; display: flex; flex-direction: column; transition: background .2s; }
.kanban-col.drag-over { background: #e3f2fd; }
.kanban-col-head { display: flex; align-items: center; gap: 6px; padding: 12px 14px; flex-shrink: 0; }
.kanban-dot { width: 8px; height: 8px; border-radius: 50%; }
.kanban-col-title { font-size: 13px; font-weight: 600; color: #555; }
.kanban-count { font-size: 11px; color: #999; background: #e0e0e0; padding: 1px 7px; border-radius: 8px; margin-left: auto; }
.kanban-list { flex: 1; overflow-y: auto; padding: 0 8px 12px; }
.kanban-card { background: #fff; border-radius: 8px; padding: 10px 12px; margin-bottom: 8px; cursor: pointer; border: 1px solid #f0f0f0; transition: all .15s; }
.kanban-card:hover { box-shadow: 0 2px 8px rgba(0,0,0,.06); border-color: #d0d0d0; }
.kanban-card:active { transform: scale(.98); }
.kanban-card-header { display: flex; align-items: center; gap: 4px; margin-bottom: 4px; }
.kanban-cat { font-size: 10px; font-weight: 500; }
.kanban-title { font-size: 13px; font-weight: 500; color: #323233; word-break: break-word; }
.kanban-meta { font-size: 10px; color: #bbb; margin-top: 4px; display: flex; gap: 6px; }

/* ====== 加载覆盖层 ====== */
.loading-area { flex: 1; display: flex; align-items: center; justify-content: center; }
.loading-overlay { position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%); z-index: 200; padding: 8px 16px; background: rgba(0,0,0,.6); border-radius: 20px; color: #fff; }

/* ====== FAB ====== */
.fab { position: fixed; bottom: 24px; right: 24px; width: 52px; height: 52px; border-radius: 50%; background: #1989fa; color: #fff; font-size: 24px; display: flex; align-items: center; justify-content: center; text-decoration: none; box-shadow: 0 4px 16px rgba(25,137,250,.3); z-index: 100; transition: all .2s; }
.fab:hover { background: #1676d9; transform: scale(1.08); box-shadow: 0 6px 24px rgba(25,137,250,.4); }
.fab:active { transform: scale(.95); }
</style>
