<template>
  <div class="app-wrap">
    <header class="topbar">
      <div class="topbar-left">
        <button class="back-btn" @click="$router.push('/reports')">← 返回汇报</button>
        <span class="logo-dot" style="background:#722ed1"></span>
        <span class="logo-text">{{ customer }}</span>
        <span class="logo-sub" v-if="notes.length">{{ notes.length }} 条</span>
      </div>
      <div class="topbar-right">
        <span class="date-label">{{ rangeLabel }}</span>
      </div>
    </header>

    <div class="main-area">
      <!-- 时间切换 -->
      <div class="tab-bar">
        <button v-for="t in tabs" :key="t.key" class="tab-btn" :class="{active: range === t.key}" @click="switchRange(t.key)">
          {{ t.label }}
        </button>
      </div>

      <!-- 加载中 -->
      <template v-if="loading">
        <div class="loading-state">
          <van-loading size="24" /><span style="margin-left:10px;color:#999">加载中...</span>
        </div>
      </template>

      <!-- 汇总内容 -->
      <template v-else-if="notes.length">
        <div class="summary-stats">
          <div class="stat-item"><span class="stat-num">{{ notes.length }}</span>总计</div>
          <div class="stat-item"><span class="stat-num done">{{ doneCount }}</span>已完成</div>
          <div class="stat-item"><span class="stat-num doing">{{ progressCount }}</span>进行中</div>
          <div class="stat-item"><span class="stat-num todo">{{ todoCount }}</span>待办</div>
        </div>

        <!-- 按分类分组 -->
        <div v-for="(items, cat) in groupedByCategory" :key="cat" class="cat-group">
          <div class="cat-header">
            <span class="cat-dot"></span>
            <span class="cat-name">{{ cat || '未分类' }}</span>
            <span class="cat-count">{{ items.length }} 条</span>
          </div>

          <div v-for="note in items" :key="note.id" class="note-item" @click="$router.push('/notes/' + note.id + '?from=reports')">
            <div class="note-head">
              <div class="note-title-row">
                <span class="note-status" :class="note.status">
                  {{ {todo:'📋',in_progress:'🔄',done:'✅',follow_up:'🔄'}[note.status] || '📋' }}
                </span>
                <strong class="note-title" v-if="note.title">{{ note.title }}</strong>
                <span v-else class="note-title no-title">(无标题)</span>
                <span class="note-priority" :class="'p' + (note.priority || 2)">
                  {{ {1:'🔴 高',2:'🟡 中',3:'🔵 低'}[note.priority || 2] }}
                </span>
              </div>
              <span class="note-date">{{ (note.created_at || '').slice(0, 10) }}</span>
            </div>
            <div class="note-content" v-if="note.content">{{ contentPreview(note.content) }}</div>
            <div class="note-meta">
              <span v-if="note.category_name" class="meta-tag cat-tag" :style="{ background: note.category_color + '20', color: note.category_color }">{{ note.category_name }}</span>
              <span v-if="hasAttachments(note)" class="meta-tag">📎 {{ attachmentCount(note) }}</span>
              <span v-if="note.reminder_at && !note.is_reminded" class="meta-tag reminder-tag">⏰ 待提醒</span>
            </div>
          </div>
        </div>
      </template>

      <!-- 空 -->
      <div v-else class="empty-state">
        <van-empty :description="'该公司在' + currentTabLabel + '内暂无记事记录'" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { http } from '../utils/api.js'

const route = useRoute()
const router = useRouter()
const customer = ref(decodeURIComponent(route.params.customer || ''))

// 时间范围标签（同 Reports.vue）
const tabs = [
  { key: 'today', label: '日报' },
  { key: 'week', label: '周报' },
  { key: 'last-week', label: '上周报' },
  { key: 'month', label: '月报' },
  { key: 'year', label: '年报' }
]
const range = ref('month')
const loading = ref(false)
const notes = ref([])

// 从 URL 参数恢复时间范围（从汇报页跳过来时）
onMounted(() => {
  const qStart = route.query.start || ''
  const qEnd = route.query.end || ''
  if (qStart && qEnd) {
    // 尝试推断 range 类型
    const days = Math.round((new Date(qEnd) - new Date(qStart)) / 86400000)
    if (days <= 1) range.value = 'today'
    else if (days <= 7) range.value = 'week'
    else if (days <= 31) range.value = 'month'
    else range.value = 'year'
  }
  load()
})

const currentTabLabel = computed(() => {
  const t = tabs.find(t => t.key === range.value)
  return t ? t.label : range.value
})

// 计算日期范围（同 Reports 后端 calcRange）
function calcRange(rangeKey) {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

  let start, end
  switch (rangeKey) {
    case 'today':
      start = fmt(now)
      end = fmt(now)
      break
    case 'week': {
      const day = now.getDay()
      const mon = new Date(now)
      mon.setDate(now.getDate() - (day === 0 ? 6 : day - 1))
      start = fmt(mon)
      end = fmt(now)
      break
    }
    case 'last-week': {
      const day = now.getDay()
      const thisMon = new Date(now)
      thisMon.setDate(now.getDate() - (day === 0 ? 6 : day - 1))
      const lastMon = new Date(thisMon)
      lastMon.setDate(thisMon.getDate() - 7)
      const lastSun = new Date(lastMon)
      lastSun.setDate(lastMon.getDate() + 6)
      start = fmt(lastMon)
      end = fmt(lastSun)
      break
    }
    case 'month':
      start = fmt(new Date(now.getFullYear(), now.getMonth(), 1))
      end = fmt(now)
      break
    case 'year':
      start = `${now.getFullYear()}-01-01`
      end = fmt(now)
      break
    default:
      start = fmt(now)
      end = fmt(now)
  }
  return { start, end }
}

const rangeLabel = computed(() => {
  const { start, end } = calcRange(range.value)
  return start === end ? start : `${start} ~ ${end}`
})

const doneCount = computed(() => notes.value.filter(n => n.status === 'done').length)
const progressCount = computed(() => notes.value.filter(n => n.status === 'in_progress').length)
const todoCount = computed(() => notes.value.filter(n => n.status === 'todo' || !n.status).length)

const groupedByCategory = computed(() => {
  const groups = {}
  for (const n of notes.value) {
    const key = n.category_name || '未分类'
    if (!groups[key]) groups[key] = []
    groups[key].push(n)
  }
  return groups
})

function switchRange(key) {
  range.value = key
  load()
}

async function load() {
  loading.value = true
  notes.value = []
  try {
    const { start, end } = calcRange(range.value)
    const r = await http.get('/notes', {
      params: {
        customer: customer.value,
        start,
        end,
        pageSize: 200 // 一次拉取足够多
      }
    })
    notes.value = r.data?.data?.list || r.data?.list || []
  } catch (e) {
    notes.value = []
  } finally {
    loading.value = false
  }
}

function contentPreview(text) {
  return text.replace(/<[^>]+>/g, '').replace(/\n/g, ' ').slice(0, 120) + (text.length > 120 ? '…' : '')
}
function hasAttachments(item) {
  try { const imgs = JSON.parse(item.images || '[]'); return imgs.length > 0 } catch { return false }
}
function attachmentCount(item) {
  try { return JSON.parse(item.images || '[]').length } catch { return 0 }
}
</script>

<style scoped>
.app-wrap{display:flex;flex-direction:column;height:100vh;background:#f0f2f5}
.topbar{display:flex;align-items:center;justify-content:space-between;padding:0 16px;height:44px;background:linear-gradient(135deg,#1a1a2e,#16213e);flex-shrink:0;gap:8px}
.topbar-left{display:flex;align-items:center;gap:8px;min-width:0;flex:1}
.topbar-right{flex-shrink:0}
.back-btn{background:transparent;color:#ccc;border:1px solid rgba(255,255,255,.25);border-radius:4px;padding:4px 8px;font-size:12px;cursor:pointer;font-family:inherit;flex-shrink:0}
.back-btn:hover{color:#fff;border-color:rgba(255,255,255,.5)}
.logo-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
.logo-text{font-size:15px;font-weight:500;color:#e8e8e8;letter-spacing:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.logo-sub{font-size:11px;color:#888;white-space:nowrap}
.date-label{font-size:11px;color:#888;padding:4px 10px;background:rgba(255,255,255,.06);border-radius:4px}

.main-area{flex:1;overflow-y:auto;padding:12px 16px}

/* 标签栏 */
.tab-bar{display:flex;align-items:center;gap:8px;margin-bottom:12px}
.tab-btn{padding:6px 18px;border-radius:6px;border:1px solid #d9d9d9;background:#fff;color:#666;font-size:13px;cursor:pointer;font-family:inherit;transition:all .2s}
.tab-btn:hover{border-color:#722ed1;color:#722ed1}
.tab-btn.active{background:#722ed1;color:#fff;border-color:#722ed1}

.loading-state{display:flex;align-items:center;justify-content:center;padding:60px 0}

/* 统计 */
.summary-stats{display:flex;gap:10px;margin-bottom:16px}
.stat-item{flex:1;text-align:center;padding:14px 8px;border-radius:10px;font-size:11px;color:#666;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.04)}
.stat-num{display:block;font-size:28px;font-weight:700;margin-bottom:2px;color:#323233}
.stat-num.done{color:#52c41a}
.stat-num.doing{color:#1890ff}
.stat-num.todo{color:#faad14}

/* 分类分组 */
.cat-group{background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.04);margin-bottom:12px}
.cat-header{display:flex;align-items:center;gap:8px;padding:10px 14px;background:#fafafa;border-bottom:1px solid #f0f0f0}
.cat-dot{width:6px;height:6px;border-radius:50%;background:#722ed1}
.cat-name{font-weight:600;font-size:14px;color:#323233;flex:1}
.cat-count{font-size:11px;color:#999}

/* 记事条目 */
.note-item{padding:12px 14px;cursor:pointer;border-bottom:1px solid #f5f5f5;transition:background .1s}
.note-item:last-child{border-bottom:none}
.note-item:hover{background:#f9f0ff}
.note-head{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;gap:8px}
.note-title-row{display:flex;align-items:center;gap:6px;min-width:0;flex:1}
.note-status{font-size:14px;flex-shrink:0}
.note-title{font-size:14px;color:#323233;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.note-title.no-title{color:#bbb;font-weight:400}
.note-priority{font-size:10px;color:#999;flex-shrink:0}
.note-date{font-size:11px;color:#bbb;white-space:nowrap;flex-shrink:0}
.note-content{font-size:12px;color:#666;line-height:1.6;margin-bottom:6px;word-break:break-word}
.note-meta{display:flex;gap:6px;flex-wrap:wrap}
.meta-tag{font-size:10px;padding:2px 6px;border-radius:3px;background:#f5f6f8;color:#888}
.cat-tag{font-weight:500}
.reminder-tag{color:#e65100;background:#fff3e0}

.empty-state{padding:60px 0}
</style>
