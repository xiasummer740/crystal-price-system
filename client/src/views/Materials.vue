<template>
  <transition name="page-fade">
    <div class="page-wrap">
      <header class="page-header" :class="{standalone: isStandalone}">
        <div class="header-left">
          <button class="back-btn" @click="goBack">‹</button>
          <h3>客户物料</h3>
          <span class="result-badge" v-if="total">共 {{ total }} 条</span>
        </div>
        <div class="header-right">
          <button class="action-btn" @click="handleBackup" title="导出 Excel 备份">📥 备份</button>
          <button class="action-btn" @click="handleImport" title="从 Excel 导入">📤 导入</button>
          <button class="add-btn" @click="openForm()">＋ 新增</button>
          <button class="close-btn" @click="goBack" title="关闭">✕</button>
        </div>
      </header>

      <div class="filter-bar">
        <div class="search-box">
          <input v-model="keyword" placeholder="搜索客户编码/料号/名称/描述…" @input="onSearchDebounced" class="search-input" />
          <span v-if="keyword" class="search-clear" @click="keyword = ''; onSearch()">×</span>
        </div>
        <div class="filter-btn" :class="{ active: statusFilter }" @click="showStatusSheet = !showStatusSheet">
          {{ statusFilter || '全部状态' }} ▾
        </div>
      </div>

      <!-- 表格 -->
      <div class="table-wrap" ref="tableWrapRef">
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
              <td colspan="12" class="empty-row">暂无物料记录</td>
            </tr>
            <tr v-for="item in list" :key="item.id" class="mat-row">
              <td class="col-date">{{ (item.date || '').slice(0, 10) }}</td>
              <td class="col-code">{{ item.customer_code }}</td>
              <td class="col-jkx">{{ item.jkx_code }}</td>
              <td class="col-price">{{ item.price }}</td>
              <td class="col-cost">{{ item.cost_price }}</td>
              <td class="col-mat">{{ item.material_code }}</td>
              <td class="col-name" :title="item.material_name">{{ item.material_name }}</td>
              <td class="col-factory">{{ item.factory }}</td>
              <td class="col-status">
                <span class="status-tag" :style="{ background: statusColor(item.status) + '20', color: statusColor(item.status), borderColor: statusColor(item.status) }">
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

      <!-- 分页 -->
      <div class="pager" v-if="total > pageSize">
        <button class="pg-btn" :disabled="page <= 1" @click="page = 1; load()">首页</button>
        <button class="pg-btn" :disabled="page <= 1" @click="page--; load()">‹</button>
        <span class="pg-info">{{ page }} / {{ totalPages }}</span>
        <button class="pg-btn" :disabled="page >= totalPages" @click="page++; load()">›</button>
        <button class="pg-btn" :disabled="page >= totalPages" @click="page = totalPages; load()">末页</button>
      </div>

      <!-- 状态选择弹窗 -->
      <van-action-sheet v-model:show="showStatusSheet" :actions="statusActions" cancel-text="取消"
        @select="onStatusSelect" close-on-click-action />

      <!-- 新增/编辑弹窗 -->
      <van-overlay :show="showForm" z-index="2000">
        <div class="form-overlay" @click="showForm = false">
          <div class="form-dialog" @click.stop>
            <h3 class="form-title">{{ editing ? '编辑物料' : '新增物料' }}</h3>
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
                  <span class="status-tag" :style="{ background: statusColor(form.status) + '20', color: statusColor(form.status), borderColor: statusColor(form.status) }">
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
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast, showConfirmDialog } from 'vant'
import { fetchMaterials, createMaterial, updateMaterial, deleteMaterial, getMaterialStatusConfig, exportMaterials, importMaterialsExcel } from '../utils/api.js'

const route = useRoute()
const router = useRouter()
const isStandalone = ref(route.query.standalone === '1')

// 列表数据
const list = ref([])
const total = ref(0)
const loading = ref(false)
const page = ref(1)
const pageSize = ref(50)
const keyword = ref('')
const statusFilter = ref('')

// 状态配置
const statusColors = ref({})
const STATUS_ORDER = ['报价', '规格书', '送样', '下散单', '下批量']
const statusActions = computed(() => {
  const acts = STATUS_ORDER.map(s => ({ name: s, value: s }))
  acts.unshift({ name: '全部状态', value: '' })
  return acts
})

function statusColor(status) {
  return statusColors.value[status] || '#999'
}

const showStatusSheet = ref(false)
function onStatusSelect(item) {
  statusFilter.value = item.value
  page.value = 1
  load()
}

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))

// 搜索防抖
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
  loading.value = true
  try {
    const params = { page: page.value, pageSize: pageSize.value }
    if (keyword.value) params.keyword = keyword.value
    if (statusFilter.value) params.status = statusFilter.value
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
  customer_desc: '', remark: ''
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
      remark: item.remark || ''
    }
  } else {
    editing.value = null
    form.value = { date: new Date().toISOString().slice(0, 10), customer_code: '', jkx_code: '', price: '', cost_price: '', material_code: '', material_name: '', factory: '', status: '报价', customer_desc: '', remark: '' }
  }
  showForm.value = true
}

function onFormStatusSelect(item) {
  form.value.status = item.value
  showFormStatusSheet.value = false
}

async function saveForm() {
  saving.value = true
  try {
    if (editing.value) {
      await updateMaterial(editing.value, form.value)
      showToast('已更新')
    } else {
      await createMaterial(form.value)
      showToast('已创建')
    }
    showForm.value = false
    load()
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
      load()
    } catch (e) {
      showToast('导入失败: ' + e.message)
    }
    document.body.removeChild(input)
  })
  input.click()
}

// 键盘事件
function onKeydown(e) {
  if (e.key === 'Escape') {
    if (showForm.value) { showForm.value = false; return }
    if (isStandalone.value) { window.close(); return }
  }
}

function goBack() {
  if (isStandalone.value) {
    window.close()
  } else {
    if (window.history.length > 1) router.back()
    else router.push('/')
  }
}

onMounted(async () => {
  document.addEventListener('keydown', onKeydown)
  // 加载状态颜色
  try {
    const r = await getMaterialStatusConfig()
    statusColors.value = r.data || {}
  } catch {}
  await load()
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
.close-btn { width: 32px; height: 32px; border-radius: 50%; border: none; background: #f5f5f5; color: #999; font-size: 14px; cursor: pointer; display: flex; align-items: center; justify-content: center; margin-left: 4px; transition: all .15s; }
.close-btn:hover { background: #ee0a24; color: #fff; }

/* 筛选栏 */
.filter-bar { display: flex; gap: 8px; padding: 8px 16px; background: #fff; border-bottom: 1px solid #f0f0f0; flex-shrink: 0; }
.search-box { display: flex; align-items: center; flex: 1; min-width: 120px; background: #f5f6f8; border-radius: 8px; padding: 0 10px; height: 34px; }
.search-input { flex: 1; border: none; outline: none; font-size: 12px; color: #323233; background: transparent; font-family: inherit; }
.search-input::placeholder { color: #bbb; }
.search-clear { color: #bbb; cursor: pointer; font-size: 14px; padding: 2px; }
.search-clear:hover { color: #666; }
.filter-btn { padding: 4px 10px; border-radius: 6px; border: 1px solid #e0e0e0; font-size: 12px; color: #555; background: #fff; cursor: pointer; white-space: nowrap; user-select: none; transition: all .15s; }
.filter-btn:hover { border-color: var(--color-primary); color: var(--color-primary); }
.filter-btn.active { background: rgba(var(--color-primary-rgb),.08); border-color: var(--color-primary); color: var(--color-primary); }

/* 表格 */
.table-wrap { flex: 1; overflow: auto; padding: 0 16px 8px; }
.mat-table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 12px; min-width: 1100px; }
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

/* 分页 */
.pager { display: flex; align-items: center; justify-content: center; gap: 6px; padding: 10px 0 16px; flex-shrink: 0; }
.pg-btn { padding: 4px 10px; border-radius: 4px; border: 1px solid #d9d9d9; background: #fff; color: #555; font-size: 12px; cursor: pointer; font-family: inherit; transition: all .15s; min-width: 32px; text-align: center; }
.pg-btn:hover:not(:disabled) { color: var(--color-primary); border-color: var(--color-primary); }
.pg-btn:disabled { color: #ccc; cursor: not-allowed; background: #f5f5f5; }
.pg-info { font-size: 12px; color: #888; padding: 0 4px; }

/* 新增/编辑弹窗 */
.form-overlay { display: flex; align-items: center; justify-content: center; padding: 24px; }
.form-dialog { width: 100%; max-width: 640px; background: #fff; border-radius: 12px; padding: 24px; box-shadow: 0 8px 30px rgba(0,0,0,.15); max-height: 85vh; overflow-y: auto; }
.form-title { font-size: 17px; font-weight: 600; margin: 0 0 16px; color: #323233; }
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

/* 移动端适配 */
@media (max-width: 768px) {
  .mat-table { min-width: auto; }
  .col-desc, .col-remark { display: none; }
  .col-price, .col-cost { width: 70px; }
  .form-dialog { max-width: 100%; padding: 16px; margin: 0; }
  .form-grid { grid-template-columns: 1fr; }
}
</style>
