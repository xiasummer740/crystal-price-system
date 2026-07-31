<template>
  <div class="mm-page">
    <!-- 顶部导航 -->
    <header class="mm-header">
      <button v-if="selectedCustomer" class="mm-back" @click="backToCustomers">‹</button>
      <h3 class="mm-title">{{ selectedCustomer ? '📦 ' + selectedCustomer : '📦 客户物料' }}</h3>
      <span v-if="selectedCustomer" class="mm-count">{{ materialList.length }} 条</span>
    </header>

    <!-- ===== 客户列表视图 ===== -->
    <div v-if="!selectedCustomer" class="mm-body">
      <div class="mm-search">
        <van-search v-model="customerKeyword" shape="round" placeholder="搜客户名 / 型号 / 编码..." @search="onCustomerSearch" @clear="onCustomerSearch" @input="onCustomerInput" />
      </div>

      <div v-if="customerList.length" class="customer-list">
        <div v-for="c in customerList" :key="c.customer" class="customer-card" @click="selectCustomer(c.customer)">
          <div class="cc-left">
            <div class="cc-name">{{ c.customer }}</div>
            <div class="cc-count" v-if="c.material_count != null">{{ c.material_count }} 条物料</div>
            <div class="cc-tag" v-else>全系统匹配</div>
          </div>
          <van-icon name="arrow" size="14" color="#ccc" />
        </div>
      </div>
      <div v-else-if="!loadingCustomers" style="padding: 60px 0">
        <van-empty :description="customerKeyword ? '未找到相关客户/物料' : '暂无客户物料'">
          <p v-if="customerKeyword" style="font-size:12px;color:#999">可输入客户名，或物料型号/编码定位所属客户</p>
        </van-empty>
      </div>
    </div>

    <!-- ===== 物料列表视图 ===== -->
    <div v-else class="mm-body">
      <div class="mm-search">
        <van-search v-model="materialKeyword" shape="round" placeholder="搜物料编码 / 名称 / 型号..." @search="onMaterialSearch" @clear="onMaterialSearch" @input="onMaterialInput" />
      </div>

      <!-- 状态筛选 chips -->
      <div class="mm-chips" v-if="STATUS_ORDER.length">
        <span class="mm-chip" :class="{ active: statusFilter === '' }" @click="setStatus('')">全部</span>
        <span v-for="s in STATUS_ORDER" :key="s" class="mm-chip" :class="{ active: statusFilter === s }" :style="statusFilter === s ? chipActiveStyle(s) : {}" @click="setStatus(s)">{{ s }}</span>
      </div>

      <div v-if="materialList.length" class="mat-list">
        <div v-for="item in materialList" :key="item.id" class="mat-card" :style="{ background: statusRowBg(item.status) }" @click="openDetail(item)">
          <div class="mat-top">
            <span class="mat-date">{{ (item.date || '').slice(0, 10) || '—' }}</span>
            <span class="mat-status" :style="statusTagStyle(item.status)">{{ item.status || '—' }}</span>
          </div>
          <div class="mat-name rich-text" v-html="renderRich(item.material_name)"></div>

          <div class="mat-codes">
            <span v-if="item.customer_code" class="code-line"><b>客户编码</b> {{ item.customer_code }}</span>
            <span v-if="item.material_code" class="code-line"><b>物料编码</b> {{ item.material_code }}</span>
            <span v-if="item.jkx_code" class="code-line"><b>晶科鑫</b> {{ item.jkx_code }}</span>
          </div>

          <div class="mat-price-row">
            <div v-if="item.price" class="price-box">
              <span class="price-label">报价</span>
              <span class="price-val">{{ item.price }}</span>
            </div>
            <div v-if="item.cost_price" class="price-box cost">
              <span class="price-label">成本</span>
              <span class="price-val">{{ item.cost_price }}</span>
            </div>
            <span v-if="item.factory" class="factory-chip"><van-icon name="shop-o" size="11" /> {{ item.factory }}</span>
          </div>

          <div class="mat-meta">
            <span v-if="item.spec_document" class="meta-btn spec" @click.stop="openSpec(item.spec_document)">📄 {{ specName(item.spec_document) }}</span>
            <span v-if="(item.alternates || []).length" class="meta-btn alt" @click.stop="openDetail(item)">⇄ 备选 {{ item.alternates.length }}</span>
          </div>
          <div v-if="item.customer_desc" class="mat-desc rich-text" v-html="renderRich(item.customer_desc)"></div>
          <div v-if="item.remark" class="mat-remark">{{ item.remark }}</div>
        </div>
      </div>
      <div v-else-if="!loadingMaterials" style="padding: 60px 0">
        <van-empty description="暂无物料" />
      </div>
      <div v-if="loadingMaterials" style="text-align:center;padding:40px 0"><van-loading size="24" /></div>
    </div>

    <!-- ===== 详情弹窗 ===== -->
    <van-popup v-model:show="showDetail" round position="bottom" :style="{ height: '80%' }" closeable safe-area-inset-bottom>
      <div class="detail-wrap" v-if="detail">
        <div class="detail-head">
          <span class="detail-status" :style="statusTagStyle(detail.status)">{{ detail.status || '—' }}</span>
          <span class="detail-date">{{ (detail.date || '').slice(0, 10) }}</span>
        </div>
        <div class="detail-name rich-text" v-html="renderRich(detail.material_name)"></div>

        <div class="detail-section">
          <div v-for="f in detailFields" :key="f.key" class="detail-row" v-show="detail[f.key]">
            <span class="row-label">{{ f.label }}</span>
            <span class="row-value" :class="f.rich ? 'rich-text' : ''" @click="copyText(detail[f.key])" v-html="f.rich ? renderRich(detail[f.key]) : detail[f.key]"></span>
          </div>
        </div>

        <div v-if="(detail.alternates || []).length" class="detail-section">
          <div class="section-title">备选物料 ({{ detail.alternates.length }})</div>
          <div v-for="(a, i) in detail.alternates" :key="i" class="alt-item" v-show="a.material_name || a.material_code || a.factory">
            <div class="alt-line"><span class="alt-name">{{ a.material_name || '—' }}</span><span v-if="a.cost_price" class="alt-price">¥{{ a.cost_price }}</span></div>
            <div class="alt-sub">
              <span v-if="a.material_code" @click="copyText(a.material_code)">编码: {{ a.material_code }}</span>
              <span v-if="a.factory">工厂: {{ a.factory }}</span>
            </div>
          </div>
        </div>

        <div class="detail-actions">
          <button v-if="detail.spec_document" class="act-btn primary" @click="openSpec(detail.spec_document)">📄 打开规格书</button>
          <button class="act-btn" @click="copyText(detail.material_name)">复制名称</button>
          <button class="act-btn" @click="copyText(detail.material_code)">复制编码</button>
          <button class="act-btn" @click="copyText(detail.remark)">复制备注</button>
        </div>
      </div>
    </van-popup>

    <div style="height: 20px"></div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { showToast } from 'vant'
import { fetchMaterialCustomers, searchAllCustomers, fetchMaterials, getMaterialStatusConfig } from '../utils/api.js'

const STATUS_ORDER = ['报价', '规格书', '送样', '下散单', '下批量']

const selectedCustomer = ref('')
const customerList = ref([])
const customerKeyword = ref('')
const loadingCustomers = ref(false)

const materialList = ref([])
const materialKeyword = ref('')
const statusFilter = ref('')
const loadingMaterials = ref(false)

const statusColors = ref({})
const showDetail = ref(false)
const detail = ref(null)

let customerTimer = null
let materialTimer = null

// ===== 状态颜色（与桌面端一致） =====
function statusColor(status) { return statusColors.value[status]?.color || '#999' }
function statusTagStyle(status) {
  const c = statusColor(status)
  const r = parseInt(c.slice(1, 3), 16), g = parseInt(c.slice(3, 5), 16), b = parseInt(c.slice(5, 7), 16)
  return { color: c, background: `rgba(${r},${g},${b},0.12)`, borderColor: c }
}
function chipActiveStyle(status) {
  const c = statusColor(status)
  return { color: c, borderColor: c, background: `${c}1a` }
}
function statusRowBg(status) {
  const c = statusColor(status)
  const r = parseInt(c.slice(1, 3), 16), g = parseInt(c.slice(3, 5), 16), b = parseInt(c.slice(5, 7), 16)
  return `linear-gradient(0deg, rgba(${r},${g},${b},0.06), rgba(${r},${g},${b},0.06))`
}

// ===== 富文本渲染 =====
function renderRich(text) {
  if (!text) return ''
  return String(text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<b class="rt-hl">$1</b>')
}

// ===== 规格书名称 =====
function specName(url) {
  if (!url) return ''
  const nameMatch = url.match(/[?&]name=([^&]+)/)
  if (nameMatch) { try { return decodeURIComponent(nameMatch[1]) } catch {} }
  let name = url.split('/').pop() || ''
  try { name = decodeURIComponent(name) } catch {}
  return name.replace(/^\d+-\d+-/, '').replace(/^\d{13}-/, '')
}

// ===== 打开规格书（移动端浏览器新标签打开） =====
function openSpec(url) {
  if (!url) return
  const fullUrl = url.startsWith('http') ? url : window.location.origin + url
  window.open(fullUrl, '_blank')
}

// ===== 复制 =====
function copyText(text) {
  if (!text) return
  navigator.clipboard?.writeText(String(text)).then(() => showToast('已复制')).catch(() => {})
}

// ===== 客户列表 =====
async function loadCustomerList() {
  loadingCustomers.value = true
  try {
    const r = await fetchMaterialCustomers()
    customerList.value = r.data || []
  } catch { customerList.value = [] } finally { loadingCustomers.value = false }
}

async function onCustomerInput() {
  clearTimeout(customerTimer)
  customerTimer = setTimeout(onCustomerSearch, 350)
}
async function onCustomerSearch() {
  const q = customerKeyword.value.trim()
  if (!q) { loadCustomerList(); return }
  loadingCustomers.value = true
  try {
    const r = await searchAllCustomers(q)
    // 与桌面一致：名称匹配的客户直接展示；型号匹配返回的客户也展示
    const local = (await fetchMaterialCustomers().catch(() => ({ data: [] }))).data || []
    const localMatched = local.filter(c => c.customer.includes(q))
    const seen = new Set(localMatched.map(c => c.customer))
    const sysMatched = (r.data || []).filter(c => !seen.has(c.name))
    customerList.value = [...localMatched, ...sysMatched.map(c => ({ customer: c.name, material_count: null }))]
  } catch {
    customerList.value = []
  } finally { loadingCustomers.value = false }
}

function selectCustomer(name) {
  selectedCustomer.value = name
  // 若搜索词是型号而非客户名 → 作为物料筛选关键词（与桌面 selectCustomer 一致）
  const q = customerKeyword.value.trim()
  materialKeyword.value = (q && q !== name) ? q : ''
  statusFilter.value = ''
  loadMaterials()
}

function backToCustomers() {
  selectedCustomer.value = ''
  materialList.value = []
  statusFilter.value = ''
  loadCustomerList()
}

// ===== 物料列表 =====
function setStatus(s) {
  statusFilter.value = s
  loadMaterials()
}

function onMaterialInput() {
  clearTimeout(materialTimer)
  materialTimer = setTimeout(onMaterialSearch, 350)
}
function onMaterialSearch() { loadMaterials() }

async function loadMaterials() {
  loadingMaterials.value = true
  try {
    const params = { page: 1, pageSize: 100000, customer: selectedCustomer.value }
    if (materialKeyword.value.trim()) params.keyword = materialKeyword.value.trim()
    if (statusFilter.value) params.status = statusFilter.value
    const r = await fetchMaterials(params)
    materialList.value = r.data.list || []
  } catch {
    materialList.value = []
    showToast('加载失败')
  } finally { loadingMaterials.value = false }
}

// ===== 详情 =====
const detailFields = [
  { key: 'customer_code', label: '客户编码' },
  { key: 'jkx_code', label: '晶科鑫料号' },
  { key: 'material_code', label: '物料编码' },
  { key: 'price', label: '报价' },
  { key: 'cost_price', label: '成本价' },
  { key: 'factory', label: '工厂' },
  { key: 'customer_desc', label: '客户描述', rich: true },
  { key: 'remark', label: '备注' },
]
function openDetail(item) {
  detail.value = item
  showDetail.value = true
}

onMounted(async () => {
  try {
    const r = await getMaterialStatusConfig()
    statusColors.value = r.data || {}
  } catch {}
  loadCustomerList()
})
</script>

<style scoped>
.mm-page {
  min-height: 100vh;
  background: #f7f8fa;
  -webkit-font-smoothing: antialiased;
  -webkit-tap-highlight-color: transparent;
  overscroll-behavior: none;
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
}

/* ===== 头部 ===== */
.mm-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  background: #fff;
  position: sticky;
  top: 0;
  z-index: 20;
  border-bottom: 1px solid #f0f0f0;
}
.mm-back {
  border: none;
  background: #f5f6f8;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  font-size: 20px;
  line-height: 1;
  color: #333;
  cursor: pointer;
  flex-shrink: 0;
  padding: 0;
}
.mm-back:active { background: #ebedf0; }
.mm-title {
  font-size: 17px;
  font-weight: 700;
  margin: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #323233;
}
.mm-count { font-size: 11px; color: #999; background: #f5f6f8; padding: 3px 10px; border-radius: 10px; }

.mm-body { padding-top: 4px; }

/* ===== 搜索 ===== */
.mm-search { background: #fff; position: sticky; top: 55px; z-index: 10; }
.mm-search :deep(.van-search) { padding: 8px 8px 4px !important; }

/* ===== 客户卡片 ===== */
.customer-list { padding: 8px 12px 12px; }
.customer-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #fff;
  border-radius: 12px;
  padding: 14px 16px;
  margin-bottom: 10px;
  box-shadow: 0 .5px 2px rgba(0,0,0,.04), 0 2px 8px rgba(0,0,0,.03);
  cursor: pointer;
}
.customer-card:active { transform: scale(.985); background: #fafbfc; }
.cc-left { display: flex; align-items: baseline; gap: 10px; min-width: 0; }
.cc-name { font-size: 15px; font-weight: 600; color: #323233; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cc-count { font-size: 11px; color: #999; background: #f0f5ff; color: var(--color-primary); padding: 2px 8px; border-radius: 8px; flex-shrink: 0; }
.cc-tag { font-size: 11px; color: #d4380d; background: #fff1f0; border: 1px solid #ffccc7; padding: 2px 8px; border-radius: 8px; flex-shrink: 0; }

/* ===== 状态 chips ===== */
.mm-chips { display: flex; gap: 6px; padding: 8px 12px 4px; overflow-x: auto; -ms-overflow-style: none; scrollbar-width: none; }
.mm-chips::-webkit-scrollbar { display: none; }
.mm-chip {
  flex-shrink: 0;
  padding: 4px 12px;
  border-radius: 14px;
  font-size: 11px;
  background: #f5f6f8;
  color: #646566;
  border: 1px solid transparent;
  cursor: pointer;
  user-select: none;
}
.mm-chip:active { transform: scale(.95); }
.mm-chip.active { background: #fff; font-weight: 600; }

/* ===== 物料卡片 ===== */
.mat-list { padding: 8px 12px 12px; }
.mat-card {
  background: #fff;
  border-radius: 12px;
  padding: 12px 14px;
  margin-bottom: 10px;
  box-shadow: 0 .5px 2px rgba(0,0,0,.04), 0 2px 8px rgba(0,0,0,.03);
  cursor: pointer;
  border-left: 3px solid transparent;
}
.mat-card:active { transform: scale(.985); }
.mat-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
.mat-date { font-size: 11px; color: #999; }
.mat-status { font-size: 10px; font-weight: 600; padding: 2px 8px; border-radius: 4px; border: 1px solid; }
.mat-name { font-size: 15px; font-weight: 600; color: #323233; line-height: 1.4; margin-bottom: 6px; }
.mat-codes { display: flex; flex-direction: column; gap: 2px; margin-bottom: 8px; }
.code-line { font-size: 11px; color: #646566; }
.code-line b { color: #999; font-weight: 400; margin-right: 4px; }
.mat-price-row { display: flex; align-items: center; gap: 8px; padding: 6px 0; margin-bottom: 6px; }
.price-box { background: #fafbfc; border-radius: 6px; padding: 4px 10px; display: flex; align-items: baseline; gap: 6px; }
.price-box.cost { background: #fff7e6; }
.price-label { font-size: 10px; color: #999; }
.price-val { font-size: 14px; font-weight: 700; color: #e53935; }
.price-box.cost .price-val { color: #d48806; }
.factory-chip { margin-left: auto; font-size: 11px; color: #646566; background: #f5f6f8; padding: 4px 8px; border-radius: 6px; }
.mat-meta { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 4px; }
.meta-btn { font-size: 10px; padding: 3px 8px; border-radius: 4px; cursor: pointer; }
.meta-btn.spec { background: #e6f7ff; color: #1890ff; }
.meta-btn.alt { background: #f6ffed; color: #52c41a; }
.mat-desc { font-size: 11px; color: #595959; margin-bottom: 2px; }
.mat-remark { font-size: 11px; color: #8c8c8c; border-top: 1px dashed #eee; padding-top: 4px; margin-top: 4px; }

/* 富文本高亮（与桌面一致） */
.rich-text :deep(.rt-hl) { color: #d4380d; font-weight: 700; background: rgba(250, 173, 20, .15); padding: 0 2px; border-radius: 2px; }

/* ===== 详情弹窗 ===== */
.detail-wrap { padding: 20px 16px 24px; overflow-y: auto; height: 100%; -webkit-overflow-scrolling: touch; }
.detail-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.detail-status { font-size: 11px; font-weight: 600; padding: 2px 10px; border-radius: 4px; border: 1px solid; }
.detail-date { font-size: 12px; color: #999; }
.detail-name { font-size: 18px; font-weight: 700; color: #323233; margin-bottom: 14px; }
.detail-section { background: #fafbfc; border-radius: 10px; padding: 6px 12px; margin-bottom: 12px; }
.detail-row { display: flex; align-items: baseline; gap: 10px; padding: 8px 0; border-bottom: 1px solid #f0f0f0; font-size: 13px; }
.detail-row:last-child { border-bottom: none; }
.row-label { color: #999; flex-shrink: 0; width: 70px; font-size: 12px; }
.row-value { color: #323233; word-break: break-all; flex: 1; }
.section-title { font-size: 13px; font-weight: 600; color: #595959; padding: 8px 0 4px; }
.alt-item { padding: 8px 0; border-bottom: 1px solid #f0f0f0; font-size: 13px; }
.alt-item:last-child { border-bottom: none; }
.alt-line { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 2px; }
.alt-name { font-weight: 600; color: #323233; }
.alt-price { color: #d48806; font-weight: 600; }
.alt-sub { display: flex; gap: 12px; font-size: 11px; color: #999; }
.detail-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px; }
.act-btn {
  border: 1px solid #ddd;
  background: #fff;
  border-radius: 8px;
  padding: 8px 14px;
  font-size: 13px;
  color: #323233;
  cursor: pointer;
  flex: 1;
  min-width: 90px;
}
.act-btn:active { background: #f5f6f8; }
.act-btn.primary { background: var(--color-primary); border-color: var(--color-primary); color: #fff; }
</style>
