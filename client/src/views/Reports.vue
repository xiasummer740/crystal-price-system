<template>
  <div class="app-wrap">
    <header class="topbar">
      <div class="topbar-left">
        <span class="logo-dot" style="background:#722ed1"></span>
        <span class="logo-text">总结汇报</span>
        <span class="logo-sub">基于记事自动生成</span>
      </div>
      <div class="topbar-right">
        <router-link to="/" class="nav-btn">← 返回主页</router-link>
      </div>
    </header>

    <div class="main-area">
      <!-- 时间切换 -->
      <div class="tab-bar">
        <button v-for="t in tabs" :key="t.key" class="tab-btn" :class="{active: range === t.key}" @click="switchRange(t.key)">
          {{ t.label }}
        </button>
        <div class="tab-date" v-if="range === 'custom'">
          <input v-model="customStart" type="date" @change="load" />
          <span> → </span>
          <input v-model="customEnd" type="date" @change="load" />
        </div>
        <span class="tab-range" v-else>{{ rangeLabel }}</span>
      </div>

      <!-- 加载中 -->
      <template v-if="loading">
        <div class="stat-row" style="justify-content:center;padding:60px 0">
          <van-loading size="24" /><span style="margin-left:10px;color:#999">生成报告中...</span>
        </div>
      </template>

      <!-- 报告内容 -->
      <template v-else-if="report">
        <!-- 统计卡片 -->
        <div class="stat-row">
          <div class="stat-card total"><span class="stat-num">{{ report.total }}</span>总计</div>
          <div class="stat-card done"><span class="stat-num">{{ report.byStatus.done || 0 }}</span>已完成</div>
          <div class="stat-card doing"><span class="stat-num">{{ report.byStatus.in_progress || 0 }}</span>进行中</div>
          <div class="stat-card todo"><span class="stat-num">{{ report.byStatus.todo || 0 }}</span>待办</div>
          <button class="report-btn" @click="showReport = true; generateReport()">📄 一键报告</button>
        </div>

        <!-- 要点 -->
        <div class="highlights" v-if="report.highlights.length">
          <span v-for="h in report.highlights" :key="h" class="hl-tag">{{ h }}</span>
        </div>

        <!-- 按客户分组 -->
        <div v-if="report.byCustomer.length" class="customer-list">
          <div v-for="group in report.byCustomer" :key="group.customer" class="customer-group">
            <div class="customer-header">
              <span class="customer-dot"></span>
              <span class="customer-name" @click="goCompanyReport(group.customer)">{{ group.customer }}</span>
              <span class="customer-count">{{ group.count }}条</span>
              <button class="customer-summary-btn" @click.stop="goCompanyReport(group.customer)">📋 汇总</button>
              <span class="customer-done" v-if="group.done">✅ {{ group.done }}</span>
              <span class="customer-pending" v-if="group.pending">⏳ {{ group.pending }}</span>
            </div>
            <div class="item-list">
              <div v-for="item in group.items" :key="item.id" class="report-item" @click="$router.push('/notes/' + item.id + '?from=reports')">
                <span class="item-status" :class="'s-' + item.status">
                  {{ {todo:'📋',in_progress:'🔄',done:'✅',follow_up:'🔄'}[item.status] || '📋' }}
                </span>
                <div class="item-body">
                  <div class="item-title" v-if="item.title">{{ item.title }}</div>
                  <div class="item-content" v-if="item.content">📝 {{ item.content }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 空状态 -->
        <div v-else class="empty-state">
          <van-empty description="该时段暂无记事记录" />
        </div>
      </template>
    </div>

    <!-- 一键报告弹出层 -->
    <van-overlay :show="showReport" @click="showReport = false">
      <div class="report-overlay" @click.stop>
        <div class="report-header">
          <h3>📄 {{ currentTabLabel }}报告</h3>
          <div class="report-header-actions">
            <button class="report-action-btn" @click="copyReport">📋 复制</button>
            <button class="report-action-btn close" @click="showReport = false">✕</button>
          </div>
        </div>
        <div class="report-body">
          <pre class="report-text">{{ reportText }}</pre>
        </div>
      </div>
    </van-overlay>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { http } from '../utils/api.js'
import { showToast } from 'vant'

const router = useRouter()

const tabs = [
  { key: 'today', label: '日报' },
  { key: 'week', label: '周报' },
  { key: 'last-week', label: '上周报' },
  { key: 'month', label: '月报' },
  { key: 'year', label: '年报' }
]
const range = ref('today')
const customStart = ref('')
const customEnd = ref('')
const loading = ref(false)
const report = ref(null)

const rangeLabel = computed(() => {
  if (!report.value) return ''
  const s = (report.value.start || '').slice(0, 10)
  const e = (report.value.end || '').slice(0, 10)
  return s === e ? s : `${s} ~ ${e}`
})

function switchRange(key) {
  range.value = key
  load()
}

async function load() {
  loading.value = true
  report.value = null
  try {
    const params = { range: range.value }
    if (customStart.value && customEnd.value) {
      params.range = 'custom'
      params.start = customStart.value
      params.end = customEnd.value
    }
    const r = await http.get('/reports', { params })
    report.value = r.data
  } catch (e) {
    report.value = null
  } finally {
    loading.value = false
  }
}

onMounted(() => load())

// ── 跳转到公司记事汇总页 ──
const startDate = computed(() => (report.value?.start || '').slice(0, 10))
const endDate = computed(() => (report.value?.end || '').slice(0, 10))
function goCompanyReport(customer) {
  const params = new URLSearchParams()
  if (startDate.value) params.set('start', startDate.value)
  if (endDate.value) params.set('end', endDate.value)
  router.push('/reports/company/' + encodeURIComponent(customer) + '?' + params.toString())
}

// ── 一键报告生成 ──
const showReport = ref(false)
const reportText = ref('')
const currentTabLabel = computed(() => tabs.find(t => t.key === range.value)?.label || range.value)

const statusText = { todo: '待办', in_progress: '进行中', done: '已完成', follow_up: '跟进后续' }

function generateReport() {
  const r = report.value
  if (!r) { reportText.value = '暂无数据'; return }

  const lines = []
  // 标题
  const period = rangeLabel.value
  lines.push(`【${currentTabLabel.value}报告】${period}`)
  const parts = []
  if (r.byStatus.done) parts.push(`已完成 ${r.byStatus.done}`)
  if (r.byStatus.in_progress) parts.push(`进行中 ${r.byStatus.in_progress}`)
  if (r.byStatus.todo) parts.push(`待办 ${r.byStatus.todo}`)
  if (r.byStatus.follow_up) parts.push(`跟进 ${r.byStatus.follow_up}`)
  lines.push(`总计 ${r.total} 条 | ${parts.join('、')}`)
  lines.push('')

  // 各客户
  const noTitle = /^(未命名|untitled)$/i
  const showDate = range.value !== 'today'  // 日报不用显示日期
  for (const group of r.byCustomer) {
    const valid = group.items.filter(item => {
      if ((!item.title || noTitle.test(item.title.trim())) && !item.content) return false
      return true
    })
    if (!valid.length) continue
    lines.push(`▎${group.customer}（${valid.length}条）`)
    for (const item of valid) {
      const status = statusText[item.status] || '待办'
      const showTitle = item.title && !noTitle.test(item.title.trim())
      const text = showTitle
        ? item.title + (item.content ? ' — ' + item.content : '')
        : item.content
      const date = showDate && item.created_at ? item.created_at.slice(5, 10) : ''
      const prefix = date ? `${date} ` : ''
      lines.push(`  [${status}] ${prefix}${text}`)
    }
    lines.push('')
  }

  // 要点总结
  if (r.highlights.length) {
    lines.push(`要点：${r.highlights.join('、')}`)
  }

  reportText.value = lines.join('\n')
}

async function copyReport() {
  try {
    await navigator.clipboard.writeText(reportText.value)
    showToast('已复制到剪贴板')
  } catch {
    // 兜底
    const ta = document.createElement('textarea')
    ta.value = reportText.value
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
    showToast('已复制到剪贴板')
  }
}
</script>

<style scoped>
.app-wrap{display:flex;flex-direction:column;height:100vh;background:#f0f2f5}
.topbar{display:flex;align-items:center;justify-content:space-between;padding:0 20px;height:44px;background:linear-gradient(135deg,#1a1a2e,#16213e);flex-shrink:0}
.topbar-left{display:flex;align-items:center;gap:8px}
.logo-dot{width:8px;height:8px;border-radius:50%;background:#4fc3f7;box-shadow:0 0 6px rgba(79,195,247,.5)}
.logo-text{font-size:15px;font-weight:500;color:#e8e8e8;letter-spacing:1px}
.logo-sub{font-size:11px;color:#888;font-weight:400}
.nav-btn{background:transparent;color:#ccc;border:1px solid rgba(255,255,255,.25);border-radius:4px;padding:4px 10px;font-size:12px;cursor:pointer;font-family:inherit;text-decoration:none}
.nav-btn:hover{color:#fff;border-color:rgba(255,255,255,.5)}

.main-area{flex:1;overflow-y:auto;padding:12px 16px}

/* 标签栏 */
.tab-bar{display:flex;align-items:center;gap:8px;margin-bottom:12px;flex-wrap:wrap}
.tab-btn{padding:6px 18px;border-radius:6px;border:1px solid #d9d9d9;background:#fff;color:#666;font-size:13px;cursor:pointer;font-family:inherit;transition:all .2s}
.tab-btn:hover{border-color:#722ed1;color:#722ed1}
.tab-btn.active{background:#722ed1;color:#fff;border-color:#722ed1}
.tab-range{font-size:12px;color:#999;margin-left:4px}
.tab-date{display:flex;align-items:center;gap:4px;font-size:12px;color:#666}
.tab-date input{padding:4px 8px;border:1px solid #d9d9d9;border-radius:4px;font-size:12px;font-family:inherit}

/* OCR 提示 */
.ocr-hint{text-align:center;padding:8px;font-size:12px;color:#722ed1;background:#f9f0ff;border-radius:6px;margin-bottom:12px}

/* 统计卡片 */
.stat-row{display:flex;gap:10px;margin-bottom:12px;flex-wrap:wrap}
.stat-card{flex:1;min-width:80px;text-align:center;padding:14px 8px;border-radius:10px;font-size:11px;color:#666;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.04)}
.stat-num{display:block;font-size:28px;font-weight:700;margin-bottom:2px}
.stat-card.total .stat-num{color:#323233}
.stat-card.done .stat-num{color:#52c41a}
.stat-card.doing .stat-num{color:#1890ff}
.stat-card.todo .stat-num{color:#faad14}

/* 要点标签 */
.highlights{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px}
.hl-tag{padding:4px 12px;border-radius:12px;background:#f9f0ff;color:#722ed1;font-size:11px;border:1px solid #efdbff}

/* 客户分组 */
.customer-list{display:flex;flex-direction:column;gap:10px}
.customer-group{background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.04)}
.customer-header{display:flex;align-items:center;gap:8px;padding:10px 14px;background:#fafafa;border-bottom:1px solid #f0f0f0}
.customer-dot{width:6px;height:6px;border-radius:50%;background:#722ed1}
.customer-name{font-weight:600;font-size:14px;color:#323233;flex:1}
.customer-count{font-size:11px;color:#999}
.customer-done{font-size:11px;color:#52c41a}
.customer-pending{font-size:11px;color:#faad14}
.customer-summary-btn{padding:2px 8px;border-radius:4px;border:1px solid #722ed1;background:#f9f0ff;color:#722ed1;font-size:11px;cursor:pointer;font-family:inherit;transition:all .15s;white-space:nowrap}
.customer-summary-btn:hover{background:#efdbff}

/* 条目 */
.item-list{border-top:1px solid #f5f5f5}
.report-item{display:flex;align-items:flex-start;gap:10px;padding:10px 14px;cursor:pointer;border-bottom:1px solid #f5f5f5;transition:background .1s}
.report-item:last-child{border-bottom:none}
.report-item:hover{background:#f9f0ff}
.item-status{font-size:16px;line-height:1.4;flex-shrink:0}
.item-body{flex:1;min-width:0}
.item-title{font-size:13px;font-weight:500;color:#323233;margin-bottom:2px}
.item-content{font-size:11px;color:#888;line-height:1.5}
.item-ocr{font-size:11px;color:#722ed1;line-height:1.5;margin-top:2px;padding:3px 6px;background:#f9f0ff;border-radius:4px}
.empty-state{padding:60px 0}

/* 一键报告按钮 */
.report-btn{display:inline-flex;align-items:center;gap:4px;padding:8px 14px;border-radius:8px;border:none;background:linear-gradient(135deg,#722ed1,#531dab);color:#fff;font-size:12px;cursor:pointer;font-family:inherit;transition:all .2s;white-space:nowrap;font-weight:500;min-width:80px;justify-content:center}
.report-btn:hover{transform:translateY(-1px);box-shadow:0 4px 12px rgba(114,46,209,.35)}

/* 报告弹出层 */
.report-overlay{position:fixed;top:10vh;left:10%;right:10%;bottom:10vh;background:#fff;border-radius:12px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 16px 48px rgba(0,0,0,.3)}
@media(max-width:600px){.report-overlay{left:4%;right:4%;top:6vh;bottom:6vh}}
.report-header{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid #f0f0f0;flex-shrink:0}
.report-header h3{margin:0;font-size:15px;color:#323233}
.report-header-actions{display:flex;gap:8px}
.report-action-btn{padding:4px 12px;border-radius:4px;border:1px solid #d9d9d9;background:#fff;color:#555;font-size:12px;cursor:pointer;font-family:inherit;transition:all .15s}
.report-action-btn:hover{border-color:#722ed1;color:#722ed1}
.report-action-btn.close{border:none;font-size:16px;color:#999;padding:4px 8px}
.report-action-btn.close:hover{color:#ee0a24}
.report-body{flex:1;overflow-y:auto;padding:16px;background:#fafafa}
.report-text{margin:0;white-space:pre-wrap;word-wrap:break-word;font-size:13px;line-height:1.8;color:#323233;font-family:'Microsoft YaHei','PingFang SC',sans-serif}

/* ===== 移动端适配 ===== */
@media (max-width: 768px) {
  .app-wrap{overflow-x:hidden}
  .topbar{height:auto;padding:0 10px;flex-wrap:wrap;gap:4px;min-height:44px}
  .topbar-left{gap:4px}
  .logo-text{font-size:13px}
  .logo-sub{font-size:10px}
  .nav-btn{font-size:10px;padding:3px 6px}
  .main-area{padding:8px 10px;overflow-x:hidden}
  .tab-bar{gap:4px}
  .tab-btn{font-size:11px;padding:5px 12px}
  .tab-date{font-size:11px;flex-wrap:wrap}
  .tab-date input{font-size:11px;padding:3px 6px;max-width:100px}
  .tab-range{font-size:11px}
  .ocr-hint{font-size:11px;padding:6px}
  .stat-row{gap:6px}
  .stat-card{padding:10px 4px;min-width:60px}
  .stat-num{font-size:22px}
  .highlights{gap:4px}
  .hl-tag{font-size:10px;padding:3px 8px}
  .customer-group{border-radius:8px}
  .customer-header{padding:8px 10px;flex-wrap:wrap;gap:4px}
  .customer-name{font-size:13px}
  .customer-count{font-size:10px}
  .customer-done,.customer-pending{font-size:10px}
  .customer-summary-btn{font-size:10px;padding:2px 6px}
  .report-item{padding:8px 10px;gap:8px}
  .item-status{font-size:14px}
  .item-title{font-size:12px}
  .item-content{font-size:10px}
  .item-ocr{font-size:10px;padding:3px 6px}
  .empty-state{padding:40px 0}
  .report-btn{font-size:11px;padding:6px 12px;min-width:60px}
  .report-overlay{left:2%!important;right:2%!important;top:4vh!important;bottom:4vh!important;border-radius:8px}
  .report-header{padding:8px 12px}
  .report-header h3{font-size:14px}
  .report-header-actions{gap:4px}
  .report-action-btn{font-size:11px;padding:3px 8px}
  .report-body{padding:12px}
  .report-text{font-size:12px;line-height:1.6}
}

/* ===== 公司详情弹出层 (unscoped) ===== */
</style>
