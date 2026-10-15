<template>
  <div class="md-page">
    <van-nav-bar title="公司资料" left-text="返回" left-arrow @click-left="router.back()" />

    <!-- 归属选择：自己公司 / 客户 -->
    <van-tabs v-model:active="tab" sticky>
      <van-tab title="客户资料" name="customer" />
      <van-tab title="自己公司" name="self" />
    </van-tabs>

    <!-- ===== 客户资料 ===== -->
    <template v-if="tab === 'customer'">
      <van-search v-model="keyword" placeholder="搜索客户" />
      <div class="md-owners">
        <div v-for="c in filtered" :key="c.name" class="md-owner" :class="{ active: c.name === ownerName }" @click="select(c.name)">
          <span class="md-owner-name">{{ c.name }}</span>
          <span v-if="c.doc_count" class="md-badge">{{ c.doc_count }}</span>
        </div>
        <div v-if="!filtered.length" class="md-empty">没有匹配的客户</div>
      </div>
    </template>

    <!-- ===== 自己公司 ===== -->
    <template v-else>
      <div class="md-owners">
        <div v-for="c in companies" :key="c.id" class="md-owner" :class="{ active: c.name === ownerName }" @click="select(c.name, 'self')">
          <span class="md-owner-name">{{ c.name }}</span>
          <span v-if="c.is_default" class="md-default">默认</span>
          <span v-if="c.doc_count" class="md-badge">{{ c.doc_count }}</span>
        </div>
        <div v-if="!companies.length" class="md-empty">还没有主体</div>
      </div>
      <!-- 开票资料：手机上最常用的就是「复制发给客户」 -->
      <div v-if="currentCompany" class="md-fields">
        <div class="md-fields-head">
          <span>开票资料</span>
          <van-button size="mini" type="primary" plain @click="copyInfo">复制</van-button>
        </div>
        <div class="md-field"><b>公司名称</b>{{ currentCompany.name }}</div>
        <div v-if="currentCompany.tax_no" class="md-field"><b>纳税人识别号</b>{{ currentCompany.tax_no }}</div>
        <div v-if="currentCompany.address" class="md-field"><b>地址</b>{{ currentCompany.address }}</div>
        <div v-if="currentCompany.phone" class="md-field"><b>电话</b>{{ currentCompany.phone }}</div>
        <div v-if="currentCompany.bank" class="md-field"><b>开户行</b>{{ currentCompany.bank }}</div>
        <div v-if="currentCompany.account" class="md-field"><b>账号</b>{{ currentCompany.account }}</div>
        <div v-if="currentCompany.remark" class="md-field"><b>备注</b>{{ currentCompany.remark }}</div>
      </div>
    </template>

    <!-- ===== 资料列表（两个 tab 共用） ===== -->
    <div v-if="ownerName" class="md-docs">
      <div class="md-docs-head">
        <span>{{ ownerName }} 的资料（{{ docs.length }}）</span>
        <van-button size="mini" type="primary" :loading="uploading" @click="pick">上传</van-button>
      </div>
      <div v-if="!docs.length" class="md-empty">还没有资料</div>
      <div v-else class="md-list">
        <div v-for="d in docs" :key="d.id" class="md-item">
          <img v-if="d.is_image" class="md-thumb" :src="d.url" :alt="d.title" />
          <span v-else class="md-file-icon">{{ icon(d.ext) }}</span>
          <div class="md-item-main">
            <div class="md-item-title">{{ d.title || d.file_name }}</div>
            <div class="md-item-sub">{{ d.category || '未分类' }} · {{ size(d.size) }} · {{ (d.created_at || '').slice(0, 10) }}</div>
          </div>
          <div class="md-item-ops">
            <!-- 手机上：图片点开就能看/长按保存；PDF 等交给系统应用打开 -->
            <a class="md-op" :href="d.url" target="_blank" rel="noopener">打开</a>
            <van-button size="mini" plain type="danger" @click="remove(d)">删</van-button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showConfirmDialog, showNotify, showSuccessToast } from 'vant'
import { fetchCompanyDocs, fetchCompanyDocsSummary, deleteCompanyDoc, uploadCompanyDocs, fetchMaterialCustomers } from '../utils/api.js'

const route = useRoute()
const router = useRouter()

const tab = ref('customer')
const ownerName = ref('')
const ownerType = ref('customer')
const docs = ref([])
const companies = ref([])
const options = ref([])
const keyword = ref('')
const uploading = ref(false)

const filtered = computed(() => {
  const kw = keyword.value.trim()
  return kw ? options.value.filter(c => c.name.includes(kw)) : options.value
})
const currentCompany = computed(() => companies.value.find(c => c.name === ownerName.value) || null)
const icon = (ext) => ({ pdf: '📕', doc: '📘', docx: '📘', xls: '📗', xlsx: '📗', txt: '📄', csv: '📄' }[String(ext || '').toLowerCase()] || '📎')
const size = (n) => {
  const b = Number(n) || 0
  return b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(1) + ' KB' : (b / 1048576).toFixed(1) + ' MB'
}

async function loadSummary() {
  const r = await fetchCompanyDocsSummary()
  companies.value = r.data.companies || []
  const saved = r.data.customers || []
  const savedMap = new Map(saved.map(c => [c.name, c.doc_count]))
  const all = await fetchMaterialCustomers().catch(() => ({ data: [] }))
  const names = new Set([...saved.map(c => c.name), ...((all.data || []).map(c => c.customer || c.name || c))])
  options.value = [...names].filter(Boolean).map(name => ({ name, doc_count: savedMap.get(name) || 0 }))
    .sort((a, b) => (b.doc_count - a.doc_count) || a.name.localeCompare(b.name, 'zh'))
}
async function loadDocs() {
  if (!ownerName.value) { docs.value = []; return }
  try {
    const r = await fetchCompanyDocs(ownerType.value, ownerName.value)
    docs.value = r.data || []
  } catch (e) { showNotify({ type: 'danger', message: '读取失败：' + e.message }) }
}
async function select(name, type = 'customer') {
  ownerName.value = name
  ownerType.value = type
  await loadDocs()
}
function pick() {
  const input = document.createElement('input')
  input.type = 'file'
  input.multiple = true
  input.accept = '.jpg,.jpeg,.png,.gif,.webp,.bmp,.heic,.heif,.tif,.tiff,.pdf,.ofd,.doc,.docx,.xls,.xlsx,.wps,.et,.dps,.txt,.csv'
  input.style.display = 'none'
  input.onchange = async () => {
    const files = [...(input.files || [])]
    input.remove()
    if (!files.length) return
    uploading.value = true
    try {
      await uploadCompanyDocs({ ownerType: ownerType.value, ownerName: ownerName.value, category: ownerType.value === 'self' ? '营业执照' : '开票资料', files })
      showSuccessToast('已上传')
      await loadDocs()
      await loadSummary()
    } catch (e) {
      showNotify({ type: 'danger', message: e?.response?.data?.msg || ('上传失败：' + e.message) })
    } finally { uploading.value = false }
  }
  document.body.appendChild(input)   // 挂到 DOM 再点（见 CompanyDocs 里的同款说明）
  input.click()
}
async function remove(d) {
  try { await showConfirmDialog({ title: '删除', message: `确定删除「${d.title || d.file_name}」？` }) } catch { return }
  try {
    await deleteCompanyDoc(d.id)
    showSuccessToast('已删除')
    await loadDocs(); await loadSummary()
  } catch (e) { showNotify({ type: 'danger', message: '删除失败：' + e.message }) }
}
async function copyInfo() {
  const c = currentCompany.value
  if (!c) return
  const text = [`公司名称：${c.name}`, `纳税人识别号：${c.tax_no || ''}`, `地址：${c.address || ''}`, `电话：${c.phone || ''}`, `开户行：${c.bank || ''}`, `账号：${c.account || ''}`, c.remark ? `备注：${c.remark}` : ''].filter(Boolean).join('\n')
  try { await navigator.clipboard.writeText(text); showSuccessToast('已复制开票资料') } catch { showNotify({ type: 'danger', message: '复制失败，请长按选择文本' }) }
}

onMounted(async () => {
  await loadSummary()
  const c = String(route.query.customer || '').trim()
  if (c) { tab.value = 'customer'; await select(c) }
  else if (options.value.length) await select(options.value[0].name)
})
</script>

<style scoped>
.md-page { min-height: 100vh; background: #f7f8fa; padding-bottom: 20px; }
.md-owners { background: #fff; }
.md-owner { display: flex; align-items: center; gap: 8px; padding: 12px 16px; border-bottom: 1px solid #f7f8fa; font-size: 14px; color: #323233; }
.md-owner.active { background: #e8f3ff; color: #1677ff; font-weight: 600; }
.md-owner-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.md-badge { background: #eef4ff; color: #3b7ddd; border-radius: 8px; padding: 0 7px; font-size: 12px; }
.md-default { background: #07c160; color: #fff; border-radius: 4px; padding: 0 5px; font-size: 11px; }
.md-empty { padding: 26px; text-align: center; color: #969799; font-size: 13px; }
.md-fields { margin-top: 10px; background: #fff; padding: 10px 16px 14px; }
.md-fields-head { display: flex; align-items: center; justify-content: space-between; font-size: 13px; font-weight: 600; color: #323233; margin-bottom: 6px; }
.md-field { display: flex; gap: 8px; font-size: 13px; color: #323233; padding: 3px 0; }
.md-field b { width: 88px; flex-shrink: 0; color: #646566; font-weight: 500; }
.md-docs { margin-top: 10px; background: #fff; padding: 10px 16px 16px; }
.md-docs-head { display: flex; align-items: center; justify-content: space-between; font-size: 13px; font-weight: 600; color: #323233; margin-bottom: 8px; }
.md-item { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid #f7f8fa; }
.md-thumb { width: 44px; height: 44px; object-fit: cover; border-radius: 6px; background: #f2f3f5; }
.md-file-icon { width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; font-size: 24px; background: #f7f8fa; border-radius: 6px; }
.md-item-main { flex: 1; min-width: 0; }
.md-item-title { font-size: 13px; color: #323233; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.md-item-sub { font-size: 11px; color: #969799; margin-top: 2px; }
.md-item-ops { display: flex; align-items: center; gap: 6px; }
.md-op { font-size: 12px; color: #1677ff; text-decoration: none; }
</style>
