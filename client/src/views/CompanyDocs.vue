<template>
  <div class="cd-page"
    @dragover.prevent="onDragOver"
    @dragleave.prevent="onDragLeave"
    @drop.prevent="onDrop">
    <!-- 拖拽提示遮罩：微信里收到的图/PDF 直接拖进来最顺手 -->
    <div v-if="dragging" class="drop-mask">
      <div class="drop-box">
        <div class="drop-icon">📥</div>
        <div class="drop-text">松手就传到「{{ ownerName || '（请先选客户）' }}」</div>
        <div class="drop-hint">图片 / PDF / OFD / Word / Excel（一次最多 9 个）</div>
      </div>
    </div>

    <!-- 文件预览（图片直接看，PDF/Word 用系统程序打开） -->
    <van-popup v-model:show="showPreview" position="center" round :style="{ width: '760px', maxWidth: '94vw' }">
      <div class="pv">
        <div class="pv-head">
          <span class="pv-title">{{ previewDoc?.title || previewDoc?.file_name }}</span>
          <a class="pv-open" :href="previewDoc?.url" target="_blank" rel="noopener">用系统程序打开 ↗</a>
          <span class="pv-close" @click="showPreview = false">✕</span>
        </div>
        <img v-if="previewDoc?.is_image" class="pv-img" :src="previewDoc.url" :alt="previewDoc.title" />
        <div v-else class="pv-file">
          <div class="pv-icon">{{ fileIcon(previewDoc?.ext) }}</div>
          <div class="pv-name">{{ previewDoc?.file_name }}</div>
          <div class="pv-hint">这类文件不能内嵌显示，点右上角「用系统程序打开」。</div>
        </div>
      </div>
    </van-popup>

    <!-- 主体编辑（自己公司的开票资料，支持多家抬头） -->
    <van-popup v-model:show="showCompany" position="center" round :style="{ width: '560px', maxWidth: '94vw' }">
      <div class="ce">
        <header class="ce-head">
          <span class="ce-title">{{ companyForm.id ? '编辑主体' : '新增主体' }}</span>
          <span class="ce-close" @click="showCompany = false">✕</span>
        </header>
        <div class="ce-row"><label>主体名称</label><input v-model="companyForm.name" class="ce-input" placeholder="公司全称（开票抬头）" /></div>
        <div class="ce-row"><label>纳税人识别号</label><input v-model="companyForm.tax_no" class="ce-input" placeholder="统一社会信用代码 / 税号" /></div>
        <div class="ce-row"><label>地址</label><input v-model="companyForm.address" class="ce-input" /></div>
        <div class="ce-row"><label>电话</label><input v-model="companyForm.phone" class="ce-input" /></div>
        <div class="ce-row"><label>开户行</label><input v-model="companyForm.bank" class="ce-input" /></div>
        <div class="ce-row"><label>账号</label><input v-model="companyForm.account" class="ce-input" /></div>
        <div class="ce-row top"><label>备注</label><textarea v-model="companyForm.remark" class="ce-textarea" rows="2"></textarea></div>
        <label class="ce-default"><input type="checkbox" v-model="companyForm.is_default" /> 设为默认（开票时默认用这一套）</label>
        <footer class="ce-foot">
          <button class="ce-btn" @click="copyCompanyInfo">📋 复制开票资料</button>
          <button class="ce-btn primary" :disabled="saving" @click="saveCompany">{{ saving ? '保存中…' : '保存' }}</button>
        </footer>
      </div>
    </van-popup>

    <header class="cd-header">
      <button class="back-btn" @click="goBack">‹</button>
      <h3>公司资料</h3>
      <span class="cd-sub">客户发来的开票资料 / 证照，自己公司的营业执照…都放这儿</span>
      <div class="cd-actions">
        <button class="view-btn" :class="{ active: tab === 'customer' }" @click="tab = 'customer'">客户资料</button>
        <button class="view-btn" :class="{ active: tab === 'self' }" @click="tab = 'self'">自己公司</button>
      </div>
    </header>

    <!-- ===== 客户资料 ===== -->
    <div v-if="tab === 'customer'" class="cd-body">
      <aside class="cd-side">
        <div class="side-search">
          <input v-model="custKeyword" class="side-input" placeholder="搜索客户…" @input="loadCustomerOptions" />
        </div>
        <div class="side-list">
          <div v-for="c in filteredCustomers" :key="c.name" class="side-item" :class="{ active: c.name === ownerName }" @click="selectCustomer(c.name)">
            <span class="side-name" :title="c.name">{{ c.name }}</span>
            <span v-if="c.doc_count" class="side-count">{{ c.doc_count }}</span>
          </div>
          <div v-if="!filteredCustomers.length" class="side-empty">没有匹配的客户</div>
        </div>
      </aside>
      <section class="cd-main">
        <div class="main-head">
          <span class="main-title">{{ ownerName || '请选择客户' }}</span>
          <span v-if="docs.length" class="main-count">{{ docs.length }} 份资料</span>
          <button class="up-btn" :disabled="!ownerName" @click="pickFiles('开票资料')">＋ 上传资料</button>
        </div>
        <p class="main-tip">
          支持 <b>图片 / PDF / OFD / Word / Excel / WPS / txt</b>（单个不超过 {{ maxSizeMb }}MB，一次最多 9 个）。
          开票时对方发来的「开票信息.jpg」直接传这儿，以后不用翻聊天记录。<br />
          💡 <b>可以把文件拖进来</b>，也可以 <b>Ctrl+V 直接粘贴截图</b>（微信截图后按 Ctrl+V 就行）。
        </p>
        <div v-if="!docs.length" class="main-empty">还没有资料 —— 点右上「＋ 上传资料」</div>
        <div v-else class="doc-grid">
          <div v-for="d in docs" :key="d.id" class="doc-card">
            <div class="doc-thumb" @click="preview(d)">
              <img v-if="d.is_image" :src="d.url" :alt="d.title" loading="lazy" />
              <span v-else class="doc-icon">{{ fileIcon(d.ext) }}</span>
            </div>
            <div class="doc-meta">
              <div class="doc-title" :title="d.file_name">{{ d.title || d.file_name }}</div>
              <div class="doc-sub">
                <span v-if="d.category" class="doc-cat">{{ d.category }}</span>
                <span>{{ fmtSize(d.size) }}</span>
                <span class="doc-time">{{ (d.created_at || '').slice(0, 10) }}</span>
              </div>
            </div>
            <div class="doc-ops">
              <button class="op" title="预览" @click="preview(d)">👁</button>
              <a class="op" :href="d.url" :download="d.file_name" title="下载">⬇</a>
              <button v-if="canCopyFile" class="op" title="复制文件（可直接粘到微信）" @click="copyDoc(d)">📋</button>
              <button class="op" title="在资源管理器里定位" @click="locateDoc(d)">📁</button>
              <button class="op danger" title="删除" @click="removeDoc(d)">🗑</button>
            </div>
          </div>
        </div>
      </section>
    </div>

    <!-- ===== 自己公司 ===== -->
    <div v-else class="cd-body">
      <section class="cd-main full">
        <div class="main-head">
          <span class="main-title">自己公司（{{ companies.length }} 家抬头）</span>
          <button class="up-btn" @click="openCompany(null)">＋ 新增主体</button>
        </div>
        <p class="main-tip">营业执照、开户许可证、开票资料图片等都能传；开票资料字段可一键复制发给客户。</p>
        <div v-if="!companies.length" class="main-empty">还没有主体 —— 点「＋ 新增主体」把公司抬头建起来</div>
        <div v-for="c in companies" :key="c.id" class="comp-card">
          <div class="comp-head">
            <span class="comp-name">{{ c.name }}</span>
            <span v-if="c.is_default" class="comp-default">默认</span>
            <span class="comp-count">{{ c.doc_count || 0 }} 份资料</span>
            <div class="comp-ops">
              <button class="op" title="编辑开票资料" @click="openCompany(c)">✎</button>
              <button class="op danger" title="删除主体" @click="removeCompany(c)">🗑</button>
            </div>
          </div>
          <div class="comp-fields">
            <span v-if="c.tax_no">税号 {{ c.tax_no }}</span>
            <span v-if="c.address">地址 {{ c.address }}</span>
            <span v-if="c.phone">电话 {{ c.phone }}</span>
            <span v-if="c.bank">开户行 {{ c.bank }}</span>
            <span v-if="c.account">账号 {{ c.account }}</span>
            <span v-if="c.remark" class="comp-remark">{{ c.remark }}</span>
            <span v-if="!c.tax_no && !c.address && !c.phone && !c.bank && !c.account" class="comp-hint">还没填开票资料，点 ✎ 填一下</span>
          </div>
          <div class="comp-docs">
            <!-- 分类在**上传时**选：开票资料/营业执照/开户许可证…（默认营业执照，自己公司最常传这个） -->
            <select v-model="uploadCategory[c.id]" class="cat-select">
              <option v-for="cat in categories" :key="cat" :value="cat">{{ cat }}</option>
            </select>
            <button class="mini-up" @click="pickSelfFiles(c)">＋ 上传资料</button>
            <button class="mini-up" @click="copyCompanyInfo(c)">📋 复制开票资料</button>
          </div>
          <!-- 本主体的资料（按主体分开存，多抬头不会串） -->
          <div v-if="(selfDocsMap[c.id] || []).length" class="doc-grid small">
            <div v-for="d in selfDocsMap[c.id]" :key="d.id" class="doc-card">
              <div class="doc-thumb" @click="preview(d)">
                <img v-if="d.is_image" :src="d.url" :alt="d.title" loading="lazy" />
                <span v-else class="doc-icon">{{ fileIcon(d.ext) }}</span>
              </div>
              <div class="doc-meta">
                <div class="doc-title" :title="d.file_name">{{ d.title || d.file_name }}</div>
                <div class="doc-sub">
                  <span v-if="d.category" class="doc-cat">{{ d.category }}</span>
                  <span>{{ fmtSize(d.size) }}</span>
                  <span class="doc-time">{{ (d.created_at || '').slice(0, 10) }}</span>
                </div>
              </div>
              <div class="doc-ops">
                <button class="op" title="预览" @click="preview(d)">👁</button>
                <a class="op" :href="d.url" :download="d.file_name" title="下载">⬇</a>
                <button v-if="canCopyFile" class="op" title="复制文件（可直接粘到微信）" @click="copyDoc(d)">📋</button>
                <button class="op" title="在资源管理器里定位" @click="locateDoc(d)">📁</button>
                <button class="op danger" title="删除" @click="removeDoc(d)">🗑</button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showConfirmDialog, showNotify, showSuccessToast } from 'vant'
import {
  fetchCompanyDocs, fetchCompanyDocsSummary, deleteCompanyDoc, uploadCompanyDocs,
  fetchCompanyProfiles, saveCompanyProfile, deleteCompanyProfile, fetchMaterialCustomers,
  copyCompanyDoc, openCompanyDoc
} from '../utils/api.js'

const route = useRoute()
const router = useRouter()

const tab = ref('customer')
const ownerName = ref('')
const docs = ref([])
/** 自己公司的资料按**主体 id** 分开存 —— 用一个共享数组会让多家抬头的资料互相串 */
const selfDocsMap = ref({})
const uploadCategory = ref({})
const categories = ref(['营业执照', '开票资料', '开户许可证', '一般纳税人证明', '合同', '其它'])
const companies = ref([])
const customerOptions = ref([])
const custKeyword = ref('')
const maxSizeMb = ref(20)
const showPreview = ref(false)
const previewDoc = ref(null)
const showCompany = ref(false)
const companyForm = ref({ id: 0, name: '', tax_no: '', address: '', phone: '', bank: '', account: '', remark: '', is_default: false })
const saving = ref(false)

const fileIcon = (ext) => ({ pdf: '📕', doc: '📘', docx: '📘', xls: '📗', xlsx: '📗', txt: '📄', csv: '📄' }[String(ext || '').toLowerCase()] || '📎')
const fmtSize = (n) => {
  const b = Number(n) || 0
  if (b < 1024) return b + ' B'
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB'
  return (b / 1024 / 1024).toFixed(1) + ' MB'
}
const goBack = () => router.back()

const filteredCustomers = computed(() => {
  const kw = custKeyword.value.trim()
  if (!kw) return customerOptions.value
  return customerOptions.value.filter(c => c.name.includes(kw))
})

async function loadSummary() {
  try {
    const r = await fetchCompanyDocsSummary()
    companies.value = r.data.companies || []
    categories.value = r.data.categories || categories.value
    maxSizeMb.value = r.data.max_size_mb || 20
    // 每个主体的上传分类默认「营业执照」（自己公司最常传的就是它）
    for (const c of companies.value) if (!uploadCategory.value[c.id]) uploadCategory.value[c.id] = '营业执照'
    // 存过资料的客户排前面，再并上客户列表（这样没存过资料的客户也能选中去上传）
    const saved = r.data.customers || []
    const savedMap = new Map(saved.map(c => [c.name, c.doc_count]))
    const all = await fetchMaterialCustomers().catch(() => ({ data: [] }))
    const names = new Set([...saved.map(c => c.name), ...((all.data || []).map(c => c.customer || c.name || c))])
    customerOptions.value = [...names].filter(Boolean).map(name => ({ name, doc_count: savedMap.get(name) || 0 }))
      .sort((a, b) => (b.doc_count - a.doc_count) || a.name.localeCompare(b.name, 'zh'))
    await loadSelfDocsAll()
  } catch (e) {
    showNotify({ type: 'danger', message: '读取汇总失败：' + e.message })
  }
}

async function loadDocs() {
  if (!ownerName.value) { docs.value = []; return }
  try {
    const r = await fetchCompanyDocs('customer', ownerName.value)
    docs.value = r.data || []
  } catch (e) { showNotify({ type: 'danger', message: '读取资料失败：' + e.message }) }
}
async function selectCustomer(name) {
  ownerName.value = name
  await loadDocs()
}
/** 逐个主体拉各自的资料（主体通常就一两家，开销可忽略） */
async function loadSelfDocsAll() {
  const map = {}
  for (const c of companies.value) {
    try {
      const r = await fetchCompanyDocs('self', c.name)
      map[c.id] = r.data || []
    } catch { map[c.id] = [] }
  }
  selfDocsMap.value = map
}

/**
 * 动态建一个文件选择框（不常驻页面，避免每次渲染都挂一个用不上的 input）。
 * **挂到 DOM 再 click**：脱离文档的 input 在部分环境里 click() 不弹窗，
 * 而且真机验证脚本也需要能在 DOM 里找到它（否则没法喂文件）。
 */
const ACCEPT = '.jpg,.jpeg,.png,.gif,.webp,.bmp,.heic,.heif,.tif,.tiff,.pdf,.ofd,.doc,.docx,.xls,.xlsx,.wps,.et,.dps,.txt,.csv'
function makeFileInput(onFiles) {
  const input = document.createElement('input')
  input.type = 'file'
  input.multiple = true
  input.accept = ACCEPT
  input.style.display = 'none'
  input.onchange = () => {
    const files = [...(input.files || [])]
    input.remove()
    if (files.length) onFiles(files)
  }
  document.body.appendChild(input)
  input.click()
  return input
}

/** 统一的「拿到文件 → 按当前归属上传」入口，拖拽/粘贴/选择三条路都走它（逻辑只有一份） */
async function uploadFiles(files, ownerType, ownerNameVal, category) {
  if (!ownerNameVal) { showNotify({ type: 'danger', message: '请先选择客户或主体' }); return }
  try {
    await uploadCompanyDocs({ ownerType, ownerName: ownerNameVal, category: category || '', files })
    showSuccessToast(`已上传 ${files.length} 个文件`)
    if (ownerType === 'self') await loadSelfDocsAll(); else await loadDocs()
    await loadSummary()
  } catch (e) {
    showNotify({ type: 'danger', message: e?.response?.data?.msg || ('上传失败：' + e.message) })
  }
}

// ===== 拖拽上传 =====
const dragging = ref(false)
let dragDepth = 0
function onDragOver(e) {
  // 只在真的拖了文件时才亮遮罩（拖选中文字不该触发）
  if (!e.dataTransfer?.types?.includes('Files')) return
  dragDepth++
  dragging.value = true
}
function onDragLeave() {
  dragDepth = Math.max(0, dragDepth - 1)
  if (!dragDepth) dragging.value = false
}
function onDrop(e) {
  dragDepth = 0
  dragging.value = false
  const files = [...(e.dataTransfer?.files || [])]
  if (!files.length) return
  // 拖到哪个 tab 就归到哪一类（客户资料 / 自己公司），归属用当前选中的
  const type = tab.value === 'self' ? 'self' : 'customer'
  uploadFiles(files, type, ownerName.value, type === 'self' ? (uploadCategory.value[currentCompanyId.value] || '营业执照') : '开票资料')
}
const currentCompanyId = computed(() => companies.value.find(c => c.name === ownerName.value)?.id || 0)

// ===== 粘贴上传（微信截图 → Ctrl+V）=====
function onPaste(e) {
  const items = [...(e.clipboardData?.items || [])]
  const files = []
  for (const it of items) {
    if (it.kind !== 'file') continue
    const f = it.getAsFile()
    if (f) files.push(f)
  }
  if (!files.length) return
  e.preventDefault()
  const type = tab.value === 'self' ? 'self' : 'customer'
  if (!ownerName.value) return showNotify({ type: 'danger', message: '请先选择客户或主体，再粘贴' })
  // 粘贴来的图多半是「开票资料」；自己公司则按卡片上选的分类
  uploadFiles(files, type, ownerName.value, type === 'self' ? (uploadCategory.value[currentCompanyId.value] || '营业执照') : '开票资料')
}

function pickFiles(category) {
  if (!ownerName.value) return showNotify({ type: 'danger', message: '请先选择客户' })
  // ⚠️ 防呆：`@click="pickFiles"` 会把**点击事件对象**当参数传进来，
  //    于是分类被存成「[object PointerEvent]」（截图里抓到过）。只接受字符串。
  const cat = typeof category === 'string' ? category : ''
  makeFileInput((files) => uploadFiles(files, 'customer', ownerName.value, cat))
}

/** 自己公司的上传（归属类型 self；分类取卡片上选的那个） */
function pickSelfFiles(company) {
  makeFileInput((files) => uploadFiles(files, 'self', company.name, uploadCategory.value[company.id] || '营业执照'))
}

function preview(d) { previewDoc.value = d; showPreview.value = true }

// 复制文件到系统剪贴板（桌面版/本机浏览器才显示按钮）
const canCopyFile = !!window.electronAPI || ['localhost', '127.0.0.1'].includes(location.hostname)
async function copyDoc(d) {
  try {
    await copyCompanyDoc(d.id)
    showSuccessToast('已复制「' + (d.file_name || d.title) + '」，可粘贴到微信')
  } catch (e) { showNotify({ type: 'danger', message: '复制失败：' + (e.message || '未知错误') }) }
}
async function locateDoc(d) {
  try {
    await openCompanyDoc(d.id)
  } catch (e) { showNotify({ type: 'danger', message: '打开位置失败：' + (e.message || '未知错误') }) }
}

async function removeDoc(d) {
  try {
    await showConfirmDialog({ title: '删除资料', message: `确定删除「${d.title || d.file_name}」？删掉后文件也会一起删。` })
  } catch { return }
  try {
    await deleteCompanyDoc(d.id)
    showSuccessToast('已删除')
    if (d.owner_type === 'self') await loadSelfDocsAll()
    else await loadDocs()
    await loadSummary()
  } catch (e) { showNotify({ type: 'danger', message: '删除失败：' + e.message }) }
}

function openCompany(c) {
  companyForm.value = c
    ? { id: c.id, name: c.name, tax_no: c.tax_no || '', address: c.address || '', phone: c.phone || '', bank: c.bank || '', account: c.account || '', remark: c.remark || '', is_default: !!c.is_default }
    : { id: 0, name: '', tax_no: '', address: '', phone: '', bank: '', account: '', remark: '', is_default: false }
  showCompany.value = true
}
async function saveCompany() {
  if (!companyForm.value.name.trim()) return showNotify({ type: 'danger', message: '主体名称不能为空' })
  saving.value = true
  try {
    await saveCompanyProfile(companyForm.value)
    showSuccessToast('已保存')
    showCompany.value = false
    await loadSummary()
  } catch (e) { showNotify({ type: 'danger', message: e?.response?.data?.msg || ('保存失败：' + e.message) }) }
  finally { saving.value = false }
}
async function removeCompany(c) {
  try {
    await showConfirmDialog({ title: '删除主体', message: `确定删除主体「${c.name}」？` })
  } catch { return }
  try {
    await deleteCompanyProfile(c.id)
    showSuccessToast('已删除')
    await loadSummary()
  } catch (e) { showNotify({ type: 'danger', message: e?.response?.data?.msg || ('删除失败：' + e.message) }) }
}
/** 一键复制开票资料（发微信给客户/填单子时直接贴） */
async function copyCompanyInfo(c) {
  const src = c || companyForm.value
  const text = [
    `公司名称：${src.name || ''}`,
    `纳税人识别号：${src.tax_no || ''}`,
    `地址：${src.address || ''}`,
    `电话：${src.phone || ''}`,
    `开户行：${src.bank || ''}`,
    `账号：${src.account || ''}`,
    src.remark ? `备注：${src.remark}` : ''
  ].filter(Boolean).join('\n')
  try {
    await navigator.clipboard.writeText(text)
    showSuccessToast('开票资料已复制')
  } catch {
    showNotify({ type: 'danger', message: '复制失败，请手动选择文本' })
  }
}

onMounted(async () => {
  // 粘贴监听挂在 document 上：他截图后随手 Ctrl+V，不该要求先点某个输入框
  document.addEventListener('paste', onPaste)
  await loadSummary()
  const c = String(route.query.customer || '').trim()
  if (c) { tab.value = 'customer'; await selectCustomer(c) }
  else if (customerOptions.value.length) await selectCustomer(customerOptions.value[0].name)
})
onUnmounted(() => { document.removeEventListener('paste', onPaste) })
</script>

<style scoped>
.cd-page { display: flex; flex-direction: column; height: 100vh; background: #f7f8fa; position: relative; }
/* 拖拽提示遮罩：整页覆盖，松手即传 */
.drop-mask { position: fixed; inset: 0; z-index: 3000; background: rgba(22,119,255,.08); border: 3px dashed var(--color-primary, #1989fa); display: flex; align-items: center; justify-content: center; pointer-events: none; }
.drop-box { background: #fff; border-radius: 12px; padding: 28px 40px; text-align: center; box-shadow: 0 8px 30px rgba(0,0,0,.12); }
.drop-icon { font-size: 40px; }
.drop-text { margin-top: 8px; font-size: 15px; font-weight: 600; color: #323233; }
.drop-hint { margin-top: 6px; font-size: 12px; color: #969799; }
.cd-header { display: flex; align-items: center; gap: 10px; padding: 10px 16px; background: #fff; border-bottom: 1px solid #ebedf0; }
.cd-header h3 { font-size: 16px; margin: 0; color: #323233; }
.cd-sub { font-size: 12px; color: #969799; }
.cd-actions { margin-left: auto; display: flex; gap: 8px; }
.back-btn { width: 28px; height: 28px; border: none; background: #f2f3f5; border-radius: 6px; cursor: pointer; font-size: 16px; color: #646566; }
.view-btn { height: 30px; padding: 0 14px; font-size: 12px; border: 1px solid #dcdee0; background: #fff; color: #323233; border-radius: 6px; cursor: pointer; }
.view-btn.active { border-color: var(--color-primary, #1989fa); color: #fff; background: var(--color-primary, #1989fa); }
.cd-body { flex: 1; display: flex; min-height: 0; }
.cd-side { width: 260px; background: #fff; border-right: 1px solid #ebedf0; display: flex; flex-direction: column; min-height: 0; }
.side-search { padding: 10px; }
.side-input { width: 100%; height: 32px; border: 1px solid #dcdee0; border-radius: 6px; padding: 0 8px; font-size: 13px; }
.side-list { flex: 1; overflow-y: auto; }
.side-item { display: flex; align-items: center; gap: 8px; padding: 9px 12px; cursor: pointer; font-size: 13px; color: #323233; border-bottom: 1px solid #f7f8fa; }
.side-item:hover { background: #f7f8fa; }
.side-item.active { background: #e8f3ff; color: #1677ff; font-weight: 600; }
.side-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.side-count { background: #eef4ff; color: #3b7ddd; border-radius: 8px; padding: 0 6px; font-size: 11px; }
.side-empty { padding: 24px; text-align: center; color: #969799; font-size: 12px; }
.cd-main { flex: 1; padding: 12px 16px; overflow-y: auto; }
.cd-main.full { padding: 12px 16px; }
.main-head { display: flex; align-items: center; gap: 10px; }
.main-title { font-size: 15px; font-weight: 600; color: #323233; }
.main-count { font-size: 12px; color: #969799; }
.up-btn { margin-left: auto; height: 30px; padding: 0 14px; font-size: 12px; border: none; border-radius: 6px; background: var(--color-primary, #1989fa); color: #fff; cursor: pointer; }
.up-btn:disabled { opacity: .5; cursor: not-allowed; }
.main-tip { margin: 8px 0 12px; font-size: 12px; color: #969799; line-height: 1.7; }
.main-empty { padding: 40px; text-align: center; color: #969799; font-size: 13px; }
.doc-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; }
.doc-grid.small { margin-top: 10px; }
.doc-card { background: #fff; border: 1px solid #ebedf0; border-radius: 8px; overflow: hidden; display: flex; flex-direction: column; }
.doc-thumb { height: 120px; display: flex; align-items: center; justify-content: center; background: #fafafa; cursor: pointer; overflow: hidden; }
.doc-thumb img { width: 100%; height: 100%; object-fit: contain; }
.doc-icon { font-size: 38px; }
.doc-meta { padding: 8px; }
.doc-title { font-size: 12px; color: #323233; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.doc-sub { margin-top: 3px; display: flex; gap: 6px; font-size: 11px; color: #969799; align-items: center; }
.doc-cat { background: #eef4ff; color: #3b7ddd; border-radius: 4px; padding: 0 4px; }
.doc-time { margin-left: auto; }
.doc-ops { display: flex; gap: 4px; padding: 0 6px 6px; }
.op { border: 1px solid #ebedf0; background: #fff; border-radius: 4px; cursor: pointer; font-size: 12px; padding: 1px 6px; color: #646566; text-decoration: none; }
.op.danger { color: #e53935; border-color: #ffd6d5; }
.comp-card { background: #fff; border: 1px solid #ebedf0; border-radius: 8px; padding: 12px; margin-bottom: 10px; }
.comp-head { display: flex; align-items: center; gap: 8px; }
.comp-name { font-size: 14px; font-weight: 600; color: #323233; }
.comp-default { font-size: 11px; background: #07c160; color: #fff; border-radius: 4px; padding: 0 5px; }
.comp-count { font-size: 11px; color: #969799; }
.comp-ops { margin-left: auto; display: flex; gap: 4px; }
.comp-fields { margin-top: 6px; display: flex; flex-wrap: wrap; gap: 10px; font-size: 12px; color: #646566; }
.comp-hint { color: #c8c9cc; }
.comp-docs { margin-top: 8px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.cat-select { height: 24px; font-size: 12px; border: 1px solid #dcdee0; border-radius: 6px; padding: 0 4px; color: #323233; }
.mini-up { height: 24px; padding: 0 10px; font-size: 12px; border: 1px dashed #b8d4ff; background: #fff; color: #1677ff; border-radius: 6px; cursor: pointer; }
.comp-doc-hint { font-size: 11px; color: #c8c9cc; }
.pv { padding: 12px 14px; }
.pv-head { display: flex; align-items: center; gap: 10px; }
.pv-title { font-size: 14px; font-weight: 600; color: #323233; }
.pv-open { font-size: 12px; color: #1677ff; text-decoration: none; }
.pv-close { margin-left: auto; cursor: pointer; color: #969799; }
.pv-img { display: block; max-width: 100%; max-height: 70vh; margin: 12px auto 0; object-fit: contain; }
.pv-file { text-align: center; padding: 40px 0; }
.pv-icon { font-size: 54px; }
.pv-name { margin-top: 10px; font-size: 13px; color: #323233; }
.pv-hint { margin-top: 6px; font-size: 12px; color: #969799; }
.ce { padding: 14px 16px 12px; }
.ce-head { display: flex; align-items: center; }
.ce-title { font-size: 16px; font-weight: 600; color: #323233; }
.ce-close { margin-left: auto; cursor: pointer; color: #969799; }
.ce-row { display: flex; align-items: center; gap: 8px; margin-top: 10px; }
.ce-row.top { align-items: flex-start; }
.ce-row label { width: 96px; flex-shrink: 0; font-size: 13px; color: #323233; }
.ce-input { flex: 1; height: 32px; border: 1px solid #dcdee0; border-radius: 6px; padding: 0 8px; font-size: 13px; }
.ce-textarea { flex: 1; border: 1px solid #dcdee0; border-radius: 6px; padding: 6px 8px; font-size: 13px; font-family: inherit; }
.ce-default { display: flex; align-items: center; gap: 6px; margin-top: 10px; font-size: 12px; color: #323233; }
.ce-foot { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
.ce-btn { height: 32px; padding: 0 14px; font-size: 13px; border: 1px solid #dcdee0; background: #fff; border-radius: 6px; cursor: pointer; color: #323233; }
.ce-btn.primary { background: var(--color-primary, #1989fa); border-color: var(--color-primary, #1989fa); color: #fff; }
</style>
