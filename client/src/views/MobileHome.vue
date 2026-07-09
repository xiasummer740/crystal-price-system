<template>
  <div class="page-container">
    <div class="page-header">
      <span class="header-title">报价查询</span>
      <span class="header-stat" style="display:flex;align-items:center;gap:8px">
        <span :style="{fontSize:'10px',color:autoRefresh?'#52c41a':'#ccc',cursor:'pointer'}" @click="toggleAutoRefresh">{{ autoRefresh ? '⟳ 自动刷新' : '⟲ 已暂停' }}</span>
        共 {{ store.total }} 条
      </span>
    </div>

    <div class="page-content">
      <!-- 搜索框 -->
      <div class="search-area">
        <van-search v-model="store.filters.keyword" shape="round" placeholder="搜编码 / 名称 / 规格 / 品牌 / 客户..." @search="onSearch" @clear="onSearch" @input="onKeywordInput" />
      </div>

      <!-- 快捷筛选标签 -->
      <div class="chip-row" v-if="quickFilters.length">
        <span class="chip-label">快捷筛选</span>
        <div class="chip-scroll">
          <span v-for="f in quickFilters" :key="f.value" class="chip" :class="{active: quickActive[f.value]}" @click="toggleQuick(f)">{{ f.label }}</span>
        </div>
      </div>

      <!-- 高级筛选入口 -->
      <div class="filter-entry" @click="showFilter = true">
        <van-icon name="filter-o" size="16" />
        <span>{{ activeFilterText }}</span>
        <van-icon name="arrow" size="12" color="#bbb" />
      </div>

      <!-- 列表 -->
      <van-pull-refresh v-model="refreshing" @refresh="onRefresh">
        <van-list v-model:loading="store.loading" :finished="finished" finished-text="— 没有更多了 —" @load="onLoadMore" :offset="100">
          <div v-if="store.loading && !store.list.length" style="text-align:center;padding:60px 0">
            <van-loading size="24" /><div style="color:#999;margin-top:8px">加载中...</div>
          </div>
          <div v-else-if="!store.list.length && !store.loading" style="padding:60px 0">
            <van-empty description="暂无记录" />
          </div>

          <div v-for="item in store.list" :key="item.id" class="price-card" @click="showMaterialSummary(item.material_code)">
            <div class="card-top">
              <span class="card-code">{{ item.material_code || '—' }}</span>
              <span class="card-date">{{ formatDate(item.created_at) }}</span>
            </div>
            <div class="card-name">{{ item.material_name || '—' }}</div>
            <div class="card-spec" v-if="item.material_spec || item.category">
              <span v-if="item.material_spec" class="spec-text">{{ item.material_spec }}</span>
              <span v-if="item.category" class="cat-tag">{{ item.category }}</span>
            </div>

            <div class="card-price-row">
              <div class="price-main" v-if="item.price_with_tax != null">
                <span class="price-num">{{ formatPrice(item.price_with_tax, item.currency) }}</span>
                <span class="price-tag">含税</span>
              </div>
              <div class="price-main" v-if="item.price_without_tax != null">
                <span class="price-num price-sub">{{ formatPrice(item.price_without_tax, item.currency) }}</span>
                <span class="price-tag">未税</span>
              </div>
              <span class="currency-badge" :class="item.currency === 'USD' ? 'usd' : 'cny'">{{ item.currency === 'USD' ? 'USD' : 'CNY' }}</span>
            </div>

            <div class="card-meta">
              <span v-if="item.factory_code" class="meta-chip"><van-icon name="shop-o" size="10" /> {{ item.factory_code }}</span>
              <span v-if="item.quoter" class="meta-chip"><van-icon name="user-o" size="10" /> {{ item.quoter }}</span>
              <span v-if="item.standard_lead_time" class="meta-chip"><van-icon name="clock-o" size="10" /> {{ item.standard_lead_time }}</span>
              <span v-if="item.first_inquiry_customer" class="meta-chip meta-ellipsis"><van-icon name="contact-o" size="10" /> {{ item.first_inquiry_customer }}</span>
            </div>
            <div class="card-note" v-if="item.remarks" @click.stop>
              <van-icon name="notes-o" size="10" /> {{ item.remarks }}
            </div>
          </div>
        </van-list>
      </van-pull-refresh>

      <div style="height:70px"></div>
    </div>

    <!-- 底部TabBar -->
    <van-tabbar v-model="activeTab" route safe-area-inset-bottom>
      <van-tabbar-item icon="search" to="/mobile">查询</van-tabbar-item>
      <van-tabbar-item icon="add-o" to="/add">新增</van-tabbar-item>
      <van-tabbar-item icon="desktop-o" to="/">PC后台</van-tabbar-item>
      <van-tabbar-item icon="map-marked" to="/map-addresses">🗺️ 地图</van-tabbar-item>
    </van-tabbar>

    <!-- 地图 APP 选择 -->
    <van-action-sheet v-model:show="showMapPicker" :actions="mapApps" cancel-text="取消" close-on-click-action @select="onOpenMap" />

    <!-- 筛选弹出层 -->
    <van-popup v-model:show="showFilter" position="right" :style="{ width: '85%', height: '100%' }">
      <div class="filter-panel">
        <div class="filter-head">
          <h3>筛选条件</h3>
          <span class="filter-reset" @click="resetFilters">重置</span>
        </div>
        <div class="filter-body">
          <van-field v-model="filterForm.factory" label="工厂编号" placeholder="输入工厂编号" clearable />
          <van-field v-model="filterForm.quoter" label="报价人" placeholder="输入报价人" clearable />
          <van-field v-model="filterForm.currency" label="币种" readonly is-link placeholder="选择币种" @click="showCurrencyPicker = true" />
          <van-field v-model="filterForm.startDate" label="开始日期" type="date" />
          <van-field v-model="filterForm.endDate" label="结束日期" type="date" />
          <div class="filter-divider">技术参数</div>
          <van-field v-model="filterForm.brand" label="品牌" placeholder="如：TXC" clearable />
          <van-field v-model="filterForm.dimension" label="尺寸" placeholder="如：3.2×2.5mm" clearable />
          <van-field v-model="filterForm.frequency" label="频点" placeholder="如：32.768KHz" clearable />
          <van-field v-model="filterForm.mode" label="模式" placeholder="如：基频" clearable />
          <van-field v-model="filterForm.material_code" label="物料编码" placeholder="物料编码" clearable />
          <van-field v-model="filterForm.standard_lead_time" label="交期" placeholder="如：4周" clearable />
          <van-field v-model="filterForm.first_inquiry_customer" label="客户" placeholder="客户名称" clearable />
        </div>
        <div class="filter-btns">
          <van-button block type="primary" @click="applyFilter">应用筛选</van-button>
        </div>
      </div>
    </van-popup>

    <van-popup v-model:show="showCurrencyPicker" position="bottom" round>
      <van-picker :columns="currencyColumns" @confirm="onCurrencyConfirm" @cancel="showCurrencyPicker = false" />
    </van-popup>

    <!-- 物料汇总弹窗 -->
    <van-popup v-model:show="showSummaryPopup" round position="bottom" :style="{ height: '75%' }" closeable @closed="summaryData = null" safe-area-inset-bottom>
      <div class="summary-content" v-if="summaryData">
        <div class="summary-head">
          <h3><span class="sum-code" @click="copyText(summaryData.code)">{{ summaryData.code }}</span></h3>
          <span class="sum-badge">{{ summaryData.total }}条 · {{ Object.keys(summaryData.factories).length }}个工厂</span>
        </div>
        <div v-for="(quotes, factory) in summaryData.factories" :key="factory" class="summary-group">
          <div class="sum-factory">{{ factory }} <span class="sum-fct">{{ quotes.length }}条</span></div>
          <div v-for="q in quotes" :key="q.id" class="sum-row" @click="goDetail(q.id)">
            <span class="sum-date">{{ formatDate(q.created_at) }}</span>
            <span class="sum-price">{{ formatPrice(q.price_with_tax || q.price_without_tax, q.currency) }}</span>
            <span class="sum-lead">{{ q.standard_lead_time || '' }}</span>
            <van-icon name="arrow" size="12" color="#ccc" />
          </div>
        </div>
      </div>
    </van-popup>

    <!-- 高级筛选 -->
    <van-popup v-model:show="showAdvFilter" round position="bottom" :style="{ height:'65%' }" closeable safe-area-inset-bottom>
      <div class="adv-wrap">
        <h4 class="adv-title">高级筛选</h4>
        <div class="adv-rows">
          <div v-for="(f, i) in advFilters" :key="i" class="adv-row">
            <select v-model="f.field" class="adv-sel"><option value="">选择字段</option><option v-for="o in advFieldOptions" :key="o.value" :value="o.value">{{ o.label }}</option></select>
            <select v-model="f.op" class="adv-sel adv-op"><option value="contains">包含</option><option value="equals">等于</option><option value="starts">开头是</option><option value="ends">结尾是</option><option value="gt">&gt;</option><option value="lt">&lt;</option><option value="empty">为空</option><option value="nempty">不为空</option></select>
            <input v-if="f.op!=='empty'&&f.op!=='nempty'" v-model="f.value" class="adv-input" placeholder="输入值" />
            <button class="adv-del" @click="advFilters.splice(i,1)">×</button>
          </div>
        </div>
        <button class="adv-add" @click="advFilters.push({field:'',op:'contains',value:''})">＋ 添加条件</button>
        <div class="adv-btns"><button class="adv-reset" @click="resetAdvFilter">重置</button><button class="adv-apply" @click="applyAdvFilter">应用筛选</button></div>
      </div>
    </van-popup>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { usePriceStore } from '../stores/price.js'
import { http } from '../utils/api.js'
import { showToast } from 'vant'

const store = usePriceStore()
const router = useRouter()
const activeTab = ref(0)
const refreshing = ref(false)
const showFilter = ref(false)
const showCurrencyPicker = ref(false)
const showSummaryPopup = ref(false)
const summaryData = ref(null)
const currencyColumns = [{ text: '人民币 (CNY)', value: 'CNY' }, { text: '美元 (USD)', value: 'USD' }, { text: '全部', value: '' }]

const filterForm = ref({ factory: '', quoter: '', currency: '', startDate: '', endDate: '', brand: '', dimension: '', frequency: '', mode: '', material_code: '', standard_lead_time: '', first_inquiry_customer: '' })
const quickActive = ref({})
const quickFilters = ref([])
const showAdvFilter = ref(false)
const advFilters = ref([{field:'',op:'contains',value:''}])
// 地图导航
const showMapPicker = ref(false)
const mapApps = [
  { name: '🗺️ 高德地图', value: 'amap' },
  { name: '🗺️ 百度地图', value: 'baidu' },
  { name: '🗺️ 腾讯地图', value: 'tencent' },
  { name: '🗺️ Apple 地图', value: 'apple' },
]
function onOpenMap(item) {
  showMapPicker.value = false
  const url = getMapUrl(item.value)
  if (url) window.location.href = url
}
function getMapUrl(app) {
  // 使用搜索关键词让用户选择目的地，通用方案
  const dst = encodeURIComponent('')
  switch (app) {
    case 'amap': return `https://uri.amap.com/search?keyword=${dst}`
    case 'baidu': return `https://api.map.baidu.com/place/search?query=${dst}`
    case 'tencent': return `https://apis.map.qq.com/uri/v1/search?keyword=${dst}`
    case 'apple': return `https://maps.apple.com/?q=${dst}`
    default: return ''
  }
}
const advFieldOptions = [{label:'物料编码',value:'material_code'},{label:'物料名称',value:'material_name'},{label:'物料规格',value:'material_spec'},{label:'品类',value:'category'},{label:'品牌',value:'brand'},{label:'尺寸',value:'dimension'},{label:'频点',value:'frequency'},{label:'负载',value:'load_cap'},{label:'模式',value:'mode'},{label:'含税价',value:'price_with_tax'},{label:'未税价',value:'price_without_tax'},{label:'币种',value:'currency'},{label:'工厂',value:'factory_code'},{label:'报价人',value:'quoter'},{label:'交期',value:'standard_lead_time'},{label:'客户',value:'first_inquiry_customer'}]
let page = 1
let keywordTimer = null
const autoRefresh = ref(true)
let refreshTimer = null

function startAutoRefresh() {
  stopAutoRefresh()
  if (!autoRefresh.value) return
  refreshTimer = setInterval(async () => {
    try { await store.loadList() } catch {}
  }, 30000)
}
function stopAutoRefresh() { if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null } }
function toggleAutoRefresh() { autoRefresh.value = !autoRefresh.value; if (autoRefresh.value) startAutoRefresh(); else stopAutoRefresh() }

const finished = computed(() => store.list.length >= store.total && store.total > 0)
const activeFilterText = computed(() => {
  const p = []; const f = store.filters
  if (f.factory) p.push(f.factory); if (f.quoter) p.push(f.quoter)
  if (f.currency) p.push(f.currency); if (f.startDate) p.push('≥'+f.startDate)
  if (f.endDate) p.push('≤'+f.endDate)
  const cf = store.activeColumnFilters
  for (const c of cf) p.push(c.value)
  return p.length ? p.join(' · ') : '全部'
})

function formatDate(d) { if (!d) return '-'; return d.slice(0, 10) }
function formatPrice(val, currency) {
  if (val == null || val === '') return '-'
  return (currency === 'USD' ? '$' : '¥') + Number(val).toFixed(4)
}
function copyText(t) { if(!t) return; navigator.clipboard?.writeText(t).then(()=>showToast('已复制')).catch(()=>{}) }

function onKeywordInput() {
  clearTimeout(keywordTimer)
  keywordTimer = setTimeout(async () => {
    if (!store.filters.keyword) { quickFilters.value = []; return }
    try {
      const cols = ['brand','frequency','factory_code']
      const results = []
      for (const col of cols) {
        try {
          const vals = await store.loadColumnValues(col, store.filters.keyword)
          if (vals.length) {
            const labelMap = { brand:'品牌', frequency:'频点', factory_code:'工厂' }
            for (const v of vals.slice(0, 3)) results.push({ col, value: v, label: labelMap[col]+':'+v })
          }
        } catch {}
      }
      quickFilters.value = results.slice(0, 8)
    } catch {}
  }, 400)
}

function toggleQuick(f) {
  if (quickActive.value[f.value]) {
    delete quickActive.value[f.value]
    store.removeColumnFilter(f.col)
  } else {
    quickActive.value[f.value] = true
    store.setColumnFilter(f.col, f.value)
  }
  page = 1; store.setFilter('page', 1); store.loadList()
}

function onSearch() { page = 1; store.setFilter('page', 1); store.loadList() }
async function onRefresh() { page = 1; store.setFilter('page', 1); await store.loadList(); refreshing.value = false }
async function onLoadMore() { page++; store.setFilter('page', page); await store.loadList(true) }

function applyFilter() {
  store.filters.factory = filterForm.value.factory
  store.filters.quoter = filterForm.value.quoter
  store.filters.currency = filterForm.value.currency
  store.filters.startDate = filterForm.value.startDate
  store.filters.endDate = filterForm.value.endDate
  const colFilters = ['brand','dimension','frequency','mode','material_code','standard_lead_time','first_inquiry_customer']
  store.clearColumnFilters()
  for (const col of colFilters) {
    if (filterForm.value[col]) store.setColumnFilter(col, filterForm.value[col])
  }
  quickActive.value = {}
  showFilter.value = false; page = 1; store.setFilter('page', 1); store.loadList()
}

function resetFilters() {
  store.resetFilters()
  filterForm.value = { factory: '', quoter: '', currency: '', startDate: '', endDate: '', brand: '', dimension: '', frequency: '', mode: '', material_code: '', standard_lead_time: '', first_inquiry_customer: '' }
  quickActive.value = {}; quickFilters.value = []
  showFilter.value = false; page = 1; store.loadList()
}

function onCurrencyConfirm({ selectedOptions }) { filterForm.value.currency = selectedOptions[0]?.value || ''; showCurrencyPicker.value = false }
function applyAdvFilter() { const valid = advFilters.value.filter(f => f.field); store.multiFilter = valid.length ? JSON.stringify(valid) : ''; showAdvFilter.value = false; store.clearColumnFilters(); page = 1; store.setFilter('page', 1); store.loadList() }
function resetAdvFilter() { advFilters.value = [{field:'',op:'contains',value:''}]; store.multiFilter = ''; showAdvFilter.value = false; store.clearColumnFilters(); page = 1; store.loadList() }

async function showMaterialSummary(code) {
  if (!code) return
  try {
    const res = await http.get(`/prices/by-material/${encodeURIComponent(code)}`)
    summaryData.value = res.data
    showSummaryPopup.value = true
  } catch { showToast('加载失败') }
}

function goDetail(id) { showSummaryPopup.value = false; router.push('/detail/' + id) }

function onVisibilityChange() {
  if (document.hidden) { stopAutoRefresh() } else if (autoRefresh.value) { startAutoRefresh() }
}
onMounted(async () => {
  page = 1; store.setFilter('page', 1)
  await store.loadMetaOptions()
  await store.loadList()
  startAutoRefresh()
  document.addEventListener('visibilitychange', onVisibilityChange)
})
onUnmounted(() => { stopAutoRefresh(); document.removeEventListener('visibilitychange', onVisibilityChange) })
</script>

<style scoped>
/* ===== iOS PWA 全局 ===== */
.page-container { -webkit-font-smoothing:antialiased; -webkit-tap-highlight-color:transparent; overscroll-behavior:none; padding-top:env(safe-area-inset-top); }
.page-content { padding-bottom:env(safe-area-inset-bottom); }

/* ===== 头部 ===== */
.page-header { display:flex; align-items:center; justify-content:space-between; padding:12px 16px 0; }
.header-title { font-size:20px; font-weight:800; color:#323233; letter-spacing:-.3px; }
.header-stat { font-size:12px; color:#999; background:#f5f6f8; padding:4px 12px; border-radius:12px; }

/* ===== 搜索 ===== */
.search-area { padding:0 8px; background:#fff; position:sticky; top:0; z-index:10; }
.search-area :deep(.van-search){ padding:8px 8px 4px!important; }

/* ===== 快捷筛选 ===== */
.chip-row { display:flex; align-items:center; padding:4px 16px 8px; gap:8px; }
.chip-label { font-size:11px; color:#bbb; white-space:nowrap; }
.chip-scroll { display:flex; gap:6px; overflow-x:auto; flex:1; -ms-overflow-style:none; scrollbar-width:none; -webkit-overflow-scrolling:touch; }
.chip-scroll::-webkit-scrollbar { display:none; }
.chip { flex-shrink:0; padding:4px 14px; border-radius:14px; font-size:11px; background:#f5f6f8; color:#646566; cursor:pointer; border:1px solid transparent; user-select:none; }
.chip:active { transform:scale(0.95); }
.chip.active { background:rgba(var(--color-primary-rgb),.08); color:var(--color-primary); border-color:var(--color-primary); font-weight:500; }

/* ===== 筛选入口 ===== */
.filter-entry { display:flex; align-items:center; gap:6px; padding:6px 16px 10px; font-size:12px; color:#999; cursor:pointer; }
.filter-entry:active { opacity:0.6; }

/* ===== 卡片 ===== */
.price-card { background:#fff; border-radius:14px; padding:16px; margin:0 12px 12px; box-shadow:0 .5px 2px rgba(0,0,0,.05),0 2px 8px rgba(0,0,0,.03); cursor:pointer; }
.price-card:active { transform:scale(.985); background:#fafbfc; }
.card-top { display:flex; justify-content:space-between; align-items:center; margin-bottom:4px; }
.card-code { font-weight:700; font-size:16px; color:#1565c0; }
.card-date { font-size:10px; color:#bbb; }
.card-name { font-size:13px; color:#323233; font-weight:500; margin-bottom:4px; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; line-height:1.4; }
.card-spec { display:flex; align-items:center; gap:6px; margin-bottom:10px; }
.spec-text { font-size:11px; color:#999; }
.cat-tag { background:#e8f4fd; color:var(--color-primary); padding:1px 6px; border-radius:3px; font-size:10px; }

.card-price-row { display:flex; align-items:center; gap:12px; padding:10px 12px; background:#fafbfc; border-radius:10px; margin-bottom:10px; }
.price-main { display:flex; align-items:baseline; gap:4px; }
.price-num { font-size:19px; font-weight:700; color:#e53935; font-family:-apple-system,'SF Mono',monospace; }
.price-sub { color:#ef6c00; font-size:16px; }
.price-tag { font-size:9px; color:#999; }
.currency-badge { font-size:11px; font-weight:600; padding:3px 8px; border-radius:4px; margin-left:auto; }
.currency-badge.cny { background:#fff0f0; color:#c62828; }
.currency-badge.usd { background:#e8f4fd; color:#0d47a1; }

.card-meta { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:2px; }
.meta-chip { display:inline-flex; align-items:center; gap:3px; font-size:10px; background:#f5f6f8; padding:3px 7px; border-radius:4px; color:#646566; }
.meta-ellipsis { max-width:120px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; display:inline-flex!important; }
.card-note { font-size:10px; color:#999; padding:4px 0 0; display:flex; align-items:flex-start; gap:4px; }

/* ===== TabBar ===== */
:deep(.van-tabbar) { padding-bottom:env(safe-area-inset-bottom); }

/* ===== 筛选面板 ===== */
.filter-panel { display:flex; flex-direction:column; height:100%; }
.filter-head { display:flex; align-items:center; justify-content:space-between; padding:20px 16px 0; }
.filter-head h3 { font-size:18px; margin:0; }
.filter-reset { font-size:13px; color:var(--color-primary); cursor:pointer; }
.filter-body { flex:1; overflow-y:auto; -webkit-overflow-scrolling:touch; padding:8px 0; }
.filter-divider { font-size:12px; color:#999; padding:12px 16px 4px; }
.filter-btns { padding:12px 16px calc(20px + env(safe-area-inset-bottom)); }

/* ===== 物料汇总 ===== */
.summary-content { padding:20px 16px; overflow-y:auto; height:100%; -webkit-overflow-scrolling:touch; padding-bottom:calc(20px + env(safe-area-inset-bottom)); }
.summary-head { margin-bottom:16px; text-align:center; }
.summary-head h3 { font-size:18px; font-weight:600; margin:0 0 4px; }
.sum-code { color:#1565c0; cursor:pointer; }
.sum-badge { font-size:12px; color:#999; }
.summary-group { margin-bottom:14px; }
.sum-factory { font-weight:600; font-size:14px; padding:8px 12px; background:#f7f8fa; border-radius:6px; margin-bottom:4px; display:flex; align-items:center; gap:8px; }
.sum-fct { font-size:10px; background:var(--color-primary); color:#fff; padding:1px 6px; border-radius:8px; font-weight:400; }
.sum-row { display:flex; align-items:center; gap:12px; padding:10px 12px; border-bottom:1px solid #f5f5f5; font-size:12px; cursor:pointer; }
.sum-row:active { background:#f5f6f8; }
.sum-date { font-size:11px; color:#999; min-width:68px; }
.sum-price { font-weight:600; color:#e53935; flex:1; }
.sum-lead { font-size:10px; color:#999; }
</style>
