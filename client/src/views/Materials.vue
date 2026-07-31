<template>
  <transition name="page-fade">
    <div class="page-wrap">
      <header class="page-header">
        <div class="header-left">
          <button class="back-btn" @click="goBack">‹</button>
          <h3>客户物料</h3>
          <span class="result-badge" v-if="selectedCustomer && total">共 {{ total }} 条</span>
          <span class="result-badge" v-else-if="customerList.length">共 {{ customerList.length }} 个客户</span>
        </div>
        <div class="header-right">
          <button class="action-btn" @click="handleBackup" title="导出 Excel 备份">📥 备份</button>
          <button class="action-btn" @click="handleImport" title="从 Excel 导入">📤 导入</button>
          <button class="add-btn" :disabled="!selectedCustomer" @click="openForm()">＋ 新增</button>
          <button class="close-btn" @click="goBack" title="关闭">✕</button>
        </div>
      </header>

      <!-- 客户选择器 -->
      <div class="customer-bar">
        <div class="customer-select-wrap" :class="{ focused: showCustomerDropdown }">
          <span class="cs-label">👤 客户</span>
          <input ref="customerInputRef" v-model="customerQuery" placeholder="搜索或选择客户…" class="customer-input"
            @input="onCustomerInput" @focus="showCustomerDropdown = true" @blur="onCustomerBlur" @keydown="onCustomerKeydown" />
          <span v-if="selectedCustomer" class="cs-clear" @click="clearCustomer">×</span>
          <span v-else class="cs-arrow">▾</span>
          <div class="customer-dropdown" v-if="showCustomerDropdown">
            <!-- 已有物料的客户 -->
            <div class="cd-group" v-if="customerList.length">
              <div class="cd-group-title">已有物料的客户</div>
              <div v-for="c in customerList" :key="c.customer" class="cd-item"
                :class="{ active: selectedCustomer === c.customer }"
                @mousedown.prevent="selectCustomer(c.customer)">
                <span class="cd-name">👤 {{ c.customer }}</span>
                <span class="cd-count">{{ c.material_count }} 项</span>
              </div>
            </div>
            <!-- 全系统搜索建议 -->
            <div class="cd-group" v-if="systemCustomers.length">
              <div class="cd-group-title">全系统客户</div>
              <div v-for="c in systemCustomers" :key="c.name" class="cd-item"
                @mousedown.prevent="selectCustomer(c.name)">
                <span class="cd-name">👤 {{ c.name }}</span>
                <span class="cd-hint">新建</span>
              </div>
            </div>
            <div v-if="!customerList.length && !systemCustomers.length" class="cd-empty">
              {{ customerQuery ? '无匹配客户' : '暂无客户数据' }}
            </div>
          </div>
        </div>
      </div>

      <!-- 未选择客户：显示客户列表入口 -->
      <div class="customer-grid" v-if="!selectedCustomer">
        <div v-if="customerList.length">
          <div class="grid-title">选择客户查看物料清单</div>
          <div class="grid-list">
            <div v-for="c in customerList" :key="c.customer" class="grid-card" @click="selectCustomer(c.customer)">
              <div class="gc-name">👤 {{ c.customer }}</div>
              <div class="gc-count">{{ c.material_count }} 项物料</div>
            </div>
          </div>
        </div>
        <div v-else class="empty-state">
          <div class="empty-icon">📦</div>
          <p class="empty-title">暂无物料</p>
          <p class="empty-desc">在上方搜索客户名，或先从 Excel 导入</p>
        </div>
      </div>

      <!-- 已选择客户：物料表格 -->
      <template v-else>
        <!-- 搜索栏 + 筛选 -->
        <div class="filter-panel">
          <div class="search-box">
            <input v-model="keyword" placeholder="搜索编码/料号/名称…" @input="onSearchDebounced" class="search-input" />
            <span v-if="keyword" class="search-clear" @click="keyword = ''; onSearch()">×</span>
          </div>
          <div class="filter-btn" :class="{ active: statusFilter }" @click="showStatusSheet = !showStatusSheet" title="按状态筛选">
            {{ statusFilter || '状态' }} ▾
          </div>
          <div class="filter-btn" :class="{ active: factoryFilter }" @click="showFactorySheet = !showFactorySheet" title="按工厂筛选">
            {{ factoryFilter || '工厂' }} ▾
          </div>
          <div class="date-filter" title="按日期范围筛选">
            <input v-model="dateStart" type="date" class="date-input" @change="onSearch" />
            <span class="date-sep">~</span>
            <input v-model="dateEnd" type="date" class="date-input" @change="onSearch" />
          </div>
          <button v-if="hasFilters" class="clear-filter-btn" @click="clearFilters" title="清除所有筛选">✕ 清除</button>
        </div>

        <div class="table-wrap">
          <table class="mat-table">
            <thead>
              <tr>
                <th class="col-date">日期</th>
                <th class="col-code">客户编码</th>
                <th class="col-jkx">晶科鑫料号</th>
                <th class="col-price">报价</th>
                <th class="col-cost">成本价</th>
                <th class="col-mat">物料编码</th>
                <th class="col-name">物料名称</th>
                <th class="col-factory">工厂</th>
                <th class="col-status">状态</th>
                <th class="col-desc">客户描述</th>
                <th class="col-remark">备注</th>
                <th class="col-actions">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!loading && !list.length">
                <td colspan="12" class="empty-row">暂无物料记录，点击「＋ 新增」添加</td>
              </tr>
              <tr v-for="item in list" :key="item.id" class="mat-row" :style="{ background: statusRowBg(item.status) }">
                <td class="col-date">{{ (item.date || '').slice(0, 10) }}</td>
                <td class="col-code">{{ item.customer_code }}</td>
                <td class="col-jkx">{{ item.jkx_code }}</td>
                <td class="col-price">{{ item.price }}</td>
                <td class="col-cost">{{ item.cost_price }}</td>
                <td class="col-mat">{{ item.material_code }}</td>
                <td class="col-name" :title="materialNameTitle(item)">
                  <span class="prim-name">{{ item.material_name }}</span>
                  <span v-if="(item.alternates || []).length" class="alt-badge" :title="altNames(item)">备选{{ item.alternates.length }}</span>
                </td>
                <td class="col-factory">
                  <span class="prim-name">{{ item.factory }}</span>
                  <span v-if="(item.alternates || []).length" class="alt-badge alt-factory" :title="altFactories(item)">+{{ item.alternates.length }}</span>
                </td>
                <td class="col-status">
                  <span class="status-tag" :style="{ background: statusBg(item.status), color: statusColor(item.status), borderColor: statusColor(item.status) + '55' }">
                    {{ item.status }}
                  </span>
                </td>
                <td class="col-desc" :title="item.customer_desc">{{ item.customer_desc }}</td>
                <td class="col-remark" :title="item.remark">{{ item.remark }}</td>
                <td class="col-actions">
                  <button class="tbl-btn edit-btn-sm" @click="openForm(item)">✎</button>
                  <button class="tbl-btn del-btn-sm" @click="handleDelete(item)">🗑</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="pager" v-if="total > pageSize">
          <button class="pg-btn" :disabled="page <= 1" @click="page = 1; load()">首页</button>
          <button class="pg-btn" :disabled="page <= 1" @click="page--; load()">‹</button>
          <span class="pg-info">{{ page }} / {{ totalPages }}</span>
          <button class="pg-btn" :disabled="page >= totalPages" @click="page++; load()">›</button>
          <button class="pg-btn" :disabled="page >= totalPages" @click="page = totalPages; load()">末页</button>
        </div>
      </template>

      <!-- 状态选择弹窗 -->
      <van-action-sheet v-model:show="showStatusSheet" :actions="statusActions" cancel-text="取消"
        @select="onStatusSelect" close-on-click-action />

      <!-- 工厂筛选弹窗 -->
      <van-action-sheet v-model:show="showFactorySheet" :actions="factoryActions" cancel-text="取消"
        @select="onFactorySelect" close-on-click-action />

      <!-- 新增/编辑弹窗 -->
      <van-overlay :show="showForm" z-index="2000">
        <div class="form-overlay" @click="showForm = false">
          <div class="form-dialog" @click.stop>
            <h3 class="form-title">{{ editing ? '编辑物料' : '新增物料' }} <span class="form-customer">👤 {{ selectedCustomer }}</span></h3>
            <div class="form-grid">
              <div class="form-field">
                <label>日期</label>
                <input v-model="form.date" type="date" class="f-input" />
              </div>
              <div class="form-field">
                <label>客户物料编码</label>
                <input v-model="form.customer_code" placeholder="客户物料编码" class="f-input" />
              </div>
              <div class="form-field">
                <label>晶科鑫料号</label>
                <input v-model="form.jkx_code" placeholder="晶科鑫料号" class="f-input" />
              </div>
              <div class="form-field">
                <label>报价</label>
                <input v-model="form.price" placeholder="报价" class="f-input" />
              </div>
              <div class="form-field">
                <label>成本价</label>
                <input v-model="form.cost_price" placeholder="成本价" class="f-input" />
              </div>
              <div class="form-field">
                <label>物料编码</label>
                <input v-model="form.material_code" placeholder="物料编码" class="f-input" />
              </div>
              <div class="form-field">
                <label>物料名称</label>
                <input v-model="form.material_name" placeholder="物料名称" class="f-input" />
              </div>
              <div class="form-field">
                <label>工厂</label>
                <input v-model="form.factory" placeholder="工厂" class="f-input" />
              </div>
              <div class="form-field">
                <label>状态</label>
                <div class="status-select" @click="showFormStatusSheet = true">
                  <span class="status-tag" :style="{ background: statusBg(form.status), color: statusColor(form.status), borderColor: statusColor(form.status) + '55' }">
                    {{ form.status }}
                  </span>
                  <span class="select-arrow">▾</span>
                </div>
              </div>
              <div class="form-field form-field-full">
                <label>客户描述</label>
                <textarea v-model="form.customer_desc" placeholder="客户描述" class="f-textarea" rows="2"></textarea>
              </div>
              <div class="form-field form-field-full">
                <label>备注</label>
                <textarea v-model="form.remark" placeholder="备注" class="f-textarea" rows="2"></textarea>
              </div>
            </div>

            <!-- 备选物料/工厂 -->
            <div class="alternates-section">
              <div class="alt-header">
                <label class="alt-title">🔁 备选物料 / 工厂</label>
                <button class="alt-add-btn" @click="addAlternate">＋ 添加备选</button>
              </div>
              <p class="alt-hint">主料缺货时临时可用的相近物料（选填）</p>
              <div v-for="(alt, i) in form.alternates" :key="i" class="alt-row">
                <input v-model="alt.material_code" placeholder="备选物料编码" class="f-input alt-input alt-code" />
                <input v-model="alt.material_name" placeholder="备选物料名称" class="f-input alt-input alt-name" />
                <input v-model="alt.factory" placeholder="备选工厂" class="f-input alt-input alt-factory-input" />
                <input v-model="alt.cost_price" placeholder="备选成本价" class="f-input alt-input alt-price" />
                <button class="alt-del-btn" @click="removeAlternate(i)" title="删除此备选">×</button>
              </div>
            </div>
            <div class="form-actions">
              <button class="form-cancel" @click="showForm = false">取消</button>
              <button class="form-save" :disabled="saving" @click="saveForm">{{ saving ? '保存中…' : '保存' }}</button>
            </div>
          </div>
        </div>
      </van-overlay>

      <!-- 表单内的状态选择 -->
      <van-action-sheet v-model:show="showFormStatusSheet" :actions="statusActions" cancel-text="取消"
        @select="onFormStatusSelect" close-on-click-action />
    </div>
  </transition>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast, showConfirmDialog } from 'vant'
import { fetchMaterials, createMaterial, updateMaterial, deleteMaterial, getMaterialStatusConfig, exportMaterials, importMaterialsExcel, searchAllCustomers, fetchMaterialCustomers, fetchMaterialFactories } from '../utils/api.js'

const route = useRoute()
const router = useRouter()
const isStandalone = ref(route.query.standalone === '1')

// 客户选择
const selectedCustomer = ref('')
const customerQuery = ref('')
const showCustomerDropdown = ref(false)
const customerList = ref([])
const systemCustomers = ref([])
const customerInputRef = ref(null)

// 列表数据
const list = ref([])
const total = ref(0)
const loading = ref(false)
const page = ref(1)
const pageSize = ref(50)
const keyword = ref('')
const statusFilter = ref('')
const factoryFilter = ref('')
const dateStart = ref('')
const dateEnd = ref('')
const showFactorySheet = ref(false)
const factoryList = ref([])

// 状态配置
const statusColors = ref({})
const STATUS_ORDER = ['报价', '规格书', '送样', '下散单', '下批量']
const statusActions = computed(() => {
  const acts = STATUS_ORDER.map(s => ({ name: s, value: s }))
  acts.unshift({ name: '全部状态', value: '' })
  return acts
})

const factoryActions = computed(() => {
  const acts = factoryList.value.map(f => ({ name: f, value: f }))
  acts.unshift({ name: '全部工厂', value: '' })
  return acts
})

// 状态标签：浅色背景 + 同色深字（保证文字可读）
function statusColor(status) {
  return statusColors.value[status]?.color || '#999'
}
function statusBg(status) {
  const c = statusColor(status)
  // 将 hex 转 18% 透明度背景
  const r = parseInt(c.slice(1, 3), 16), g = parseInt(c.slice(3, 5), 16), b = parseInt(c.slice(5, 7), 16)
  return `rgba(${r},${g},${b},0.15)`
}
// 整行背景色：按状态轻染色（约6%透明度，不影响文字可读）
function statusRowBg(status) {
  const c = statusColor(status)
  const r = parseInt(c.slice(1, 3), 16), g = parseInt(c.slice(3, 5), 16), b = parseInt(c.slice(5, 7), 16)
  return `rgba(${r},${g},${b},0.07)`
}

const showStatusSheet = ref(false)
function onStatusSelect(item) {
  statusFilter.value = item.value
  page.value = 1
  load()
}

function onFactorySelect(item) {
  factoryFilter.value = item.value
  showFactorySheet.value = false
  page.value = 1
  load()
}

async function loadFactories() {
  try {
    const r = await fetchMaterialFactories(selectedCustomer.value)
    factoryList.value = r.data || []
  } catch {
    factoryList.value = []
  }
}

// 是否有筛选条件
const hasFilters = computed(() =>
  keyword.value || statusFilter.value || factoryFilter.value || dateStart.value || dateEnd.value
)

function clearFilters() {
  keyword.value = ''
  statusFilter.value = ''
  factoryFilter.value = ''
  dateStart.value = ''
  dateEnd.value = ''
  page.value = 1
  load()
}

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))

// 客户选择器
async function loadCustomerList() {
  try {
    const r = await fetchMaterialCustomers()
    customerList.value = r.data || []
  } catch {}
}

let customerSearchTimer = null
function onCustomerInput() {
  showCustomerDropdown.value = true
  clearTimeout(customerSearchTimer)
  customerSearchTimer = setTimeout(async () => {
    const q = customerQuery.value.trim()
    if (!q) { systemCustomers.value = []; return }
    try {
      const r = await searchAllCustomers(q)
      // 去重：排除已在 customerList 中的
      const existing = new Set(customerList.value.map(c => c.customer))
      systemCustomers.value = (r.data || []).filter(c => !existing.has(c.name))
    } catch {
      systemCustomers.value = []
    }
  }, 300)
}

function onCustomerBlur() {
  setTimeout(() => { showCustomerDropdown.value = false }, 200)
}

function onCustomerKeydown(e) {
  if (e.key === 'Enter' && customerQuery.value.trim()) {
    selectCustomer(customerQuery.value.trim())
  }
  if (e.key === 'Escape') showCustomerDropdown.value = false
}

function selectCustomer(name) {
  selectedCustomer.value = name
  customerQuery.value = name
  showCustomerDropdown.value = false
  systemCustomers.value = []
  page.value = 1
  statusFilter.value = ''
  factoryFilter.value = ''
  dateStart.value = ''
  dateEnd.value = ''
  keyword.value = ''
  loadFactories()
  load()
  // 聚焦到搜索框
  nextTick(() => document.querySelector('.search-input')?.focus())
}

function clearCustomer() {
  selectedCustomer.value = ''
  customerQuery.value = ''
  list.value = []
  total.value = 0
  loadCustomerList()
}

// 搜索
let searchTimer = null
function onSearchDebounced() {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    page.value = 1
    load()
  }, 350)
}
function onSearch() {
  page.value = 1
  load()
}

// 加载列表
async function load() {
  if (!selectedCustomer.value) { list.value = []; total.value = 0; return }
  loading.value = true
  try {
    const params = { page: page.value, pageSize: pageSize.value, customer: selectedCustomer.value }
    if (keyword.value) params.keyword = keyword.value
    if (statusFilter.value) params.status = statusFilter.value
    if (factoryFilter.value) params.factory = factoryFilter.value
    if (dateStart.value) params.start = dateStart.value
    if (dateEnd.value) params.end = dateEnd.value
    const r = await fetchMaterials(params)
    list.value = r.data.list || []
    total.value = r.data.total || 0
  } catch (e) {
    showToast('加载失败: ' + e.message)
    list.value = []; total.value = 0
  } finally {
    loading.value = false
  }
}

// 新增/编辑
const showForm = ref(false)
const showFormStatusSheet = ref(false)
const editing = ref(null)
const saving = ref(false)
const form = ref({
  date: '', customer_code: '', jkx_code: '', price: '', cost_price: '',
  material_code: '', material_name: '', factory: '', status: '报价',
  customer_desc: '', remark: '', alternates: []
})

function openForm(item) {
  if (item) {
    editing.value = item.id
    form.value = {
      date: item.date || '',
      customer_code: item.customer_code || '',
      jkx_code: item.jkx_code || '',
      price: item.price || '',
      cost_price: item.cost_price || '',
      material_code: item.material_code || '',
      material_name: item.material_name || '',
      factory: item.factory || '',
      status: item.status || '报价',
      customer_desc: item.customer_desc || '',
      remark: item.remark || '',
      alternates: (item.alternates || []).map(a => ({ material_code: a.material_code || '', material_name: a.material_name || '', factory: a.factory || '', cost_price: a.cost_price || '' }))
    }
  } else {
    editing.value = null
    form.value = { date: new Date().toISOString().slice(0, 10), customer_code: '', jkx_code: '', price: '', cost_price: '', material_code: '', material_name: '', factory: '', status: '报价', customer_desc: '', remark: '', alternates: [] }
  }
  showForm.value = true
}

// 备选物料/工厂
function addAlternate() {
  form.value.alternates.push({ material_code: '', material_name: '', factory: '', cost_price: '' })
}
function removeAlternate(i) {
  form.value.alternates.splice(i, 1)
}
// 表格展示辅助
function materialNameTitle(item) {
  const alts = (item.alternates || []).filter(a => a.material_name || a.material_code)
  if (!alts.length) return item.material_name
  const lines = alts.map(a => {
    const parts = []
    if (a.material_code) parts.push(`编码:${a.material_code}`)
    if (a.material_name) parts.push(a.material_name)
    if (a.factory) parts.push(`@${a.factory}`)
    if (a.cost_price) parts.push(`成本:${a.cost_price}`)
    return `  ${parts.join(' ')}`
  })
  return `${item.material_name || ''}\n备选:${lines.join('\n')}`
}
function altNames(item) {
  return (item.alternates || []).filter(a => a.material_name).map(a => a.material_name).join('、')
}
function altFactories(item) {
  return (item.alternates || []).filter(a => a.factory).map(a => a.factory).join('、')
}

function onFormStatusSelect(item) {
  form.value.status = item.value
  showFormStatusSheet.value = false
}

async function saveForm() {
  saving.value = true
  try {
    const data = { ...form.value, customer: selectedCustomer.value }
    // 清理空备选
    data.alternates = data.alternates.filter(a => (a.material_name || '').trim() || (a.factory || '').trim())
    if (editing.value) {
      await updateMaterial(editing.value, data)
      showToast('已更新')
    } else {
      await createMaterial(data)
      showToast('已创建')
    }
    showForm.value = false
    load()
    loadCustomerList()
  } catch (e) {
    showToast('保存失败: ' + e.message)
  } finally {
    saving.value = false
  }
}

// 删除
async function handleDelete(item) {
  try {
    await showConfirmDialog({ title: '确认删除', message: `删除「${item.customer_code || item.material_name || '未命名'}」？` })
    await deleteMaterial(item.id)
    showToast('已删除')
    load()
    loadCustomerList()
  } catch (e) {
    if (e !== 'cancel' && !e?.message?.includes('cancel')) showToast('删除失败: ' + e.message)
  }
}

// 导入导出(备份)
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

async function handleBackup() {
  try {
    const r = await exportMaterials()
    downloadBlob(r, `客户物料备份_${new Date().toISOString().slice(0, 10)}.xlsx`)
    showToast('备份已下载')
  } catch (e) {
    showToast('备份失败: ' + e.message)
  }
}

function handleImport() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.xlsx,.xls'
  input.style.display = 'none'
  document.body.appendChild(input)
  input.addEventListener('change', async () => {
    const file = input.files[0]
    if (!file) return
    const fd = new FormData()
    fd.append('file', file)
    try {
      const r = await importMaterialsExcel(fd)
      showToast(r.msg || '导入成功')
      loadCustomerList()
      if (selectedCustomer.value) load()
    } catch (e) {
      showToast('导入失败: ' + e.message)
    }
    document.body.removeChild(input)
  })
  input.click()
}

function onKeydown(e) {
  if (e.key === 'Escape') {
    if (showForm.value) { showForm.value = false; return }
    if (showCustomerDropdown.value) { showCustomerDropdown.value = false; return }
    if (isStandalone.value) { window.close(); return }
  }
}

function goBack() {
  if (isStandalone.value) { window.close() }
  else { if (window.history.length > 1) router.back(); else router.push('/') }
}

onMounted(async () => {
  document.addEventListener('keydown', onKeydown)
  try {
    const r = await getMaterialStatusConfig()
    statusColors.value = r.data || {}
  } catch {}
  await loadCustomerList()
})

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
})
</script>

<style scoped>
.page-fade-enter-active { transition: opacity .2s ease, transform .2s ease; }
.page-fade-enter-from { opacity: 0; transform: translateY(8px); }
.page-wrap { display: flex; flex-direction: column; height: 100vh; background: #f5f6f8; }

/* 头部 */
.page-header { display: flex; align-items: center; justify-content: space-between; padding: 8px 16px; background: #fff; border-bottom: 1px solid #e8e8e8; flex-shrink: 0; }
.header-left { display: flex; align-items: center; gap: 8px; }
.header-left h3 { font-size: 16px; font-weight: 600; margin: 0; color: #323233; }
.header-right { display: flex; align-items: center; gap: 6px; }
.back-btn { background: none; border: none; font-size: 20px; cursor: pointer; color: var(--color-primary); padding: 2px 4px; line-height: 1; }
.result-badge { font-size: 11px; color: #999; background: #f5f6f8; padding: 2px 8px; border-radius: 10px; }
.action-btn { padding: 4px 10px; border-radius: 6px; border: 1px solid #e0e0e0; background: #fff; font-size: 11px; cursor: pointer; white-space: nowrap; transition: all .15s; color: #555; }
.action-btn:hover { border-color: var(--color-primary); color: var(--color-primary); background: #f0f8ff; }
.add-btn { padding: 6px 14px; border-radius: 6px; border: none; background: var(--color-primary); color: #fff; font-size: 12px; cursor: pointer; text-decoration: none; white-space: nowrap; transition: background .15s; }
.add-btn:hover { background: #1676d9; }
.add-btn:disabled { background: #95c9f9; cursor: not-allowed; }
.close-btn { width: 32px; height: 32px; border-radius: 50%; border: none; background: #f5f5f5; color: #999; font-size: 14px; cursor: pointer; display: flex; align-items: center; justify-content: center; margin-left: 4px; transition: all .15s; }
.close-btn:hover { background: #ee0a24; color: #fff; }

/* 客户选择栏 */
.customer-bar { display: flex; gap: 8px; padding: 8px 16px; background: #fff; border-bottom: 1px solid #f0f0f0; flex-shrink: 0; }
.customer-select-wrap { position: relative; flex: 1; display: flex; align-items: center; gap: 6px; background: #f5f6f8; border-radius: 8px; padding: 0 10px; height: 38px; border: 1px solid transparent; transition: all .2s; }
.customer-select-wrap.focused { border-color: var(--color-primary); background: #fff; box-shadow: 0 0 0 2px rgba(var(--color-primary-rgb),.1); }
.cs-label { font-size: 12px; color: #888; white-space: nowrap; }
.customer-input { flex: 1; border: none; outline: none; font-size: 13px; color: #323233; background: transparent; font-family: inherit; }
.customer-input::placeholder { color: #bbb; }
.cs-clear { color: #bbb; cursor: pointer; font-size: 16px; padding: 2px; }
.cs-clear:hover { color: #666; }
.cs-arrow { color: #bbb; font-size: 10px; }

/* 客户下拉 */
.customer-dropdown { position: absolute; top: 100%; left: 0; right: 0; z-index: 100; margin-top: 4px; background: #fff; border-radius: 8px; box-shadow: 0 6px 24px rgba(0,0,0,.12); max-height: 300px; overflow-y: auto; }
.cd-group { border-bottom: 1px solid #f0f0f0; }
.cd-group:last-child { border-bottom: none; }
.cd-group-title { padding: 8px 14px 4px; font-size: 10px; color: #bbb; text-transform: uppercase; }
.cd-item { display: flex; align-items: center; padding: 9px 14px; cursor: pointer; transition: background .1s; gap: 8px; }
.cd-item:hover { background: rgba(var(--color-primary-rgb),.06); }
.cd-item.active { background: rgba(var(--color-primary-rgb),.1); }
.cd-name { flex: 1; font-size: 13px; color: #323233; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cd-count { font-size: 11px; color: #999; white-space: nowrap; }
.cd-hint { font-size: 10px; color: var(--color-primary); white-space: nowrap; padding: 1px 6px; border-radius: 3px; background: rgba(var(--color-primary-rgb),.08); }
.cd-empty { padding: 20px; text-align: center; color: #bbb; font-size: 13px; }

.customer-grid { flex: 1; overflow-y: auto; padding: 16px; }
.grid-title { font-size: 14px; color: #888; margin-bottom: 12px; }
.grid-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 10px; }
.grid-card { background: #fff; border-radius: 10px; padding: 16px; cursor: pointer; border: 1px solid #f0f0f0; transition: all .2s; }
.grid-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,.06); border-color: var(--color-primary); transform: translateY(-1px); }
.gc-name { font-size: 14px; font-weight: 600; color: #323233; margin-bottom: 4px; }
.gc-count { font-size: 11px; color: #999; }
.filter-btn { padding: 4px 10px; border-radius: 6px; border: 1px solid #e0e0e0; font-size: 12px; color: #555; background: #fff; cursor: pointer; white-space: nowrap; user-select: none; transition: all .15s; height: 38px; display: flex; align-items: center; }
.filter-btn:hover { border-color: var(--color-primary); color: var(--color-primary); }
.filter-btn.active { background: rgba(var(--color-primary-rgb),.08); border-color: var(--color-primary); color: var(--color-primary); }

/* 搜索栏 */
.filter-panel { display: flex; gap: 8px; padding: 8px 16px; background: #fff; border-bottom: 1px solid #f0f0f0; flex-shrink: 0; align-items: center; flex-wrap: wrap; }
.search-box { display: flex; align-items: center; flex: 1; min-width: 120px; background: #f5f6f8; border-radius: 8px; padding: 0 10px; height: 34px; }
.search-input { flex: 1; border: none; outline: none; font-size: 12px; color: #323233; background: transparent; font-family: inherit; }
.search-input::placeholder { color: #bbb; }
.search-clear { color: #bbb; cursor: pointer; font-size: 14px; padding: 2px; }
.search-clear:hover { color: #666; }
.filter-btn { padding: 4px 10px; border-radius: 6px; border: 1px solid #e0e0e0; font-size: 12px; color: #555; background: #fff; cursor: pointer; white-space: nowrap; user-select: none; transition: all .15s; height: 34px; display: flex; align-items: center; }
.filter-btn:hover { border-color: var(--color-primary); color: var(--color-primary); }
.filter-btn.active { background: rgba(var(--color-primary-rgb),.08); border-color: var(--color-primary); color: var(--color-primary); }
.date-filter { display: flex; align-items: center; gap: 4px; background: #f5f6f8; border-radius: 8px; padding: 0 8px; height: 34px; }
.date-input { border: none; outline: none; font-size: 12px; color: #323233; background: transparent; font-family: inherit; cursor: pointer; }
.date-input::-webkit-calendar-picker-indicator { cursor: pointer; }
.date-sep { color: #ccc; font-size: 11px; }
.clear-filter-btn { padding: 4px 10px; border-radius: 6px; border: 1px solid #ffcdd2; font-size: 11px; color: #e53935; background: #fff5f5; cursor: pointer; white-space: nowrap; transition: all .15s; height: 34px; }
.clear-filter-btn:hover { background: #ffebee; }

/* 表格 */
.table-wrap { flex: 1; overflow: auto; padding: 0 16px 8px; }
.mat-table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 12px; min-width: 1080px; }
.mat-table thead { position: sticky; top: 0; z-index: 5; }
.mat-table th { background: #f7f8fa; color: #666; font-weight: 600; padding: 10px 8px; text-align: left; border-bottom: 1px solid #e0e0e0; white-space: nowrap; }
.mat-table td { padding: 8px; border-bottom: 1px solid #f0f0f0; color: #323233; vertical-align: middle; }
.mat-row:hover td { background: #f8f9ff; }
.empty-row { text-align: center; color: #bbb; padding: 40px 0 !important; font-size: 14px; }

.col-date { width: 90px; }
.col-code { width: 110px; }
.col-jkx { width: 110px; }
.col-price { width: 80px; }
.col-cost { width: 80px; }
.col-mat { width: 110px; }
.col-name { width: 130px; max-width: 130px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.col-factory { width: 80px; }
.col-status { width: 80px; }
.col-desc { width: 130px; max-width: 130px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.col-remark { width: 120px; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.col-actions { width: 70px; text-align: center; }

.status-tag { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; border: 1px solid; }
.tbl-btn { background: none; border: none; cursor: pointer; font-size: 14px; padding: 2px 4px; transition: opacity .15s; line-height: 1; }
.tbl-btn:hover { opacity: .7; }
.edit-btn-sm { color: var(--color-primary); }
.del-btn-sm { color: #ee0a24; }

/* 备选徽章 */
.prim-name { display: inline; }
.alt-badge { display: inline-block; margin-left: 6px; padding: 1px 5px; border-radius: 3px; font-size: 10px; font-weight: 500; background: #e6f7ff; color: #1890ff; border: 1px solid #91d5ff; white-space: nowrap; cursor: help; }
.alt-badge.alt-factory { margin-left: 4px; background: #f6ffed; color: #52c41a; border-color: #b7eb8f; }

/* 备选物料编辑区 */
.alternates-section { margin-top: 14px; padding-top: 12px; border-top: 1px solid #f0f0f0; }
.alt-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
.alt-title { font-size: 13px; font-weight: 600; color: #555; }
.alt-add-btn { padding: 3px 10px; border-radius: 4px; border: 1px dashed #91d5ff; background: #e6f7ff; color: #1890ff; font-size: 11px; cursor: pointer; font-family: inherit; transition: all .15s; }
.alt-add-btn:hover { background: #bae7ff; }
.alt-hint { font-size: 10px; color: #bbb; margin: 0 0 8px; }
.alt-row { display: flex; gap: 8px; margin-bottom: 8px; }
.alt-input { flex: 1; }
.alt-code { flex: 1.2; }
.alt-name { flex: 2; }
.alt-factory-input { flex: 1; }
.alt-price { flex: 0.8; min-width: 90px; }
.alt-del-btn { width: 32px; height: 32px; border-radius: 6px; border: none; background: #fff1f0; color: #ff4d4f; font-size: 15px; cursor: pointer; flex-shrink: 0; font-family: inherit; transition: background .15s; align-self: flex-end; }
.alt-del-btn:hover { background: #ffccc7; }

/* 分页 */
.pager { display: flex; align-items: center; justify-content: center; gap: 6px; padding: 10px 0 16px; flex-shrink: 0; }
.pg-btn { padding: 4px 10px; border-radius: 4px; border: 1px solid #d9d9d9; background: #fff; color: #555; font-size: 12px; cursor: pointer; font-family: inherit; transition: all .15s; min-width: 32px; text-align: center; }
.pg-btn:hover:not(:disabled) { color: var(--color-primary); border-color: var(--color-primary); }
.pg-btn:disabled { color: #ccc; cursor: not-allowed; background: #f5f5f5; }
.pg-info { font-size: 12px; color: #888; padding: 0 4px; }

/* 新增/编辑弹窗 */
.form-overlay { display: flex; align-items: center; justify-content: center; padding: 24px; }
.form-dialog { width: 100%; max-width: 640px; background: #fff; border-radius: 12px; padding: 24px; box-shadow: 0 8px 30px rgba(0,0,0,.15); max-height: 85vh; overflow-y: auto; }
.form-title { font-size: 17px; font-weight: 600; margin: 0 0 16px; color: #323233; display: flex; align-items: center; gap: 8px; }
.form-customer { font-size: 13px; color: #666; font-weight: 400; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.form-field { display: flex; flex-direction: column; gap: 4px; }
.form-field-full { grid-column: 1 / -1; }
.form-field label { font-size: 11px; color: #888; font-weight: 500; }
.f-input { padding: 8px 10px; border: 1px solid #e0e0e0; border-radius: 6px; font-size: 13px; color: #323233; outline: none; font-family: inherit; transition: border-color .2s; }
.f-input:focus { border-color: var(--color-primary); }
.f-input::placeholder { color: #ccc; }
.f-textarea { padding: 8px 10px; border: 1px solid #e0e0e0; border-radius: 6px; font-size: 13px; color: #323233; outline: none; font-family: inherit; resize: vertical; transition: border-color .2s; }
.f-textarea:focus { border-color: var(--color-primary); }
.f-textarea::placeholder { color: #ccc; }
.status-select { position: relative; display: flex; align-items: center; justify-content: space-between; padding: 6px 10px; border: 1px solid #e0e0e0; border-radius: 6px; cursor: pointer; transition: border-color .2s; min-height: 34px; }
.status-select:hover { border-color: var(--color-primary); }
.select-arrow { color: #bbb; font-size: 12px; margin-left: 6px; }
.form-actions { display: flex; gap: 10px; margin-top: 18px; justify-content: flex-end; }
.form-cancel { padding: 8px 20px; border-radius: 6px; border: 1px solid #d9d9d9; background: #fff; color: #666; font-size: 13px; cursor: pointer; font-family: inherit; }
.form-cancel:hover { background: #f5f5f5; }
.form-save { padding: 8px 20px; border-radius: 6px; border: none; background: var(--color-primary); color: #fff; font-size: 13px; cursor: pointer; font-family: inherit; }
.form-save:hover { background: #1676d9; }
.form-save:disabled { background: #95c9f9; cursor: not-allowed; }

/* 空状态 */
.empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; flex: 1; padding: 60px 20px; text-align: center; }
.empty-icon { font-size: 56px; margin-bottom: 12px; }
.empty-title { font-size: 16px; color: #323233; margin: 0 0 6px; font-weight: 500; }
.empty-desc { font-size: 13px; color: #bbb; margin: 0; }

/* 移动端适配 */
@media (max-width: 768px) {
  .mat-table { min-width: auto; }
  .col-desc, .col-remark { display: none; }
  .col-price, .col-cost { width: 70px; }
  .form-dialog { max-width: 100%; padding: 16px; margin: 0; }
  .form-grid { grid-template-columns: 1fr; }
  .grid-list { grid-template-columns: 1fr; }
}
</style>
