<template>
  <div class="quote-page">
    <header class="page-header">
      <button class="back-btn" @click="goBack">‹</button>
      <h3>生成报价单</h3>
      <span class="header-hint" v-if="form.customer">客户管理 / {{ form.customer }} / 报价单</span>
      <div class="header-actions">
        <button class="ghost-btn" :disabled="previewLoading" @click="openPreview">{{ previewLoading ? '预览中…' : '👁 预览' }}</button>
        <button class="primary-btn" :disabled="generating" @click="generate">{{ generating ? '生成中…' : '🧾 生成报价单' }}</button>
      </div>
    </header>

    <main class="quote-main">
      <!-- 客户 -->
      <section class="card">
        <div class="card-head"><h4>客户（TO）</h4><span class="card-tip">选中客户后自动带出联系人 / 电话 / 该客户物料</span></div>
        <div class="cust-row">
          <label class="field">
            <span>客户</span>
            <input v-model="form.customer" list="quote-customers" placeholder="输入或选择客户" @change="onCustomerChange" />
            <datalist id="quote-customers">
              <option v-for="c in customers" :key="c" :value="c" />
            </datalist>
          </label>
          <label class="field"><span>报价日期</span><input v-model="form.date" type="date" /></label>
          <label class="field"><span>文件名前缀（中文简称）</span><input v-model="form.fileShort" placeholder="奥斯普" /></label>
        </div>
        <div class="cust-row">
          <label class="field"><span>TO（客户全称）</span><input v-model="form.to" placeholder="客户公司全称" /></label>
          <label class="field"><span>ATTN（联系人）</span><input v-model="form.attn" placeholder="联系人" /></label>
          <label class="field"><span>TEL（电话）</span><input v-model="form.tel" placeholder="电话" /></label>
        </div>
      </section>

      <!-- 物料 -->
      <section class="card">
        <div class="card-head">
          <h4>报价明细</h4>
          <span class="card-tip">从客户物料里选，或直接手填</span>
          <button class="mini-btn" @click="addItem">＋ 添加一行</button>
        </div>
        <div class="items">
          <div class="item" v-for="(item, idx) in items" :key="item.key">
            <div class="item-top">
              <span class="item-no">#{{ idx + 1 }}</span>
              <select class="mat-select" v-model="item.matId" @change="pickMaterial(item)">
                <option value="">从该客户物料选择…</option>
                <option v-for="m in materials" :key="m.id" :value="m.id">{{ m.jkx_code || m.material_code }} · {{ shortText(m.material_name) }}</option>
              </select>
              <button v-if="items.length > 1" class="del-item" @click="removeItem(idx)" title="删除这一行">✕</button>
            </div>
            <div class="item-grid">
              <label class="field"><span>客户料号</span><input v-model="item.customer_code" placeholder="客户自己的料号" /></label>
              <label class="field"><span>SJK 料号</span><input v-model="item.jkx_code" placeholder="SJK-…" /></label>
              <label class="field"><span>单价 / 元</span><input v-model="item.price" type="number" min="0" step="0.0001" placeholder="0.82" /></label>
              <label class="field"><span>最小包装量 / 起订量</span><input v-model="item.qty" placeholder="3000" /></label>
              <label class="field"><span>L/T（交期）</span><input v-model="item.lt" placeholder="8-10周" /></label>
              <label class="field span-2"><span>名称 / 频率 / 规格参数 / 品牌</span><textarea v-model="item.spec" rows="2" placeholder="1610,32.768KHz,9pF…"></textarea></label>
              <label class="field span-2"><span>备注</span><input v-model="item.remark" placeholder="编带 / 特殊要求…" /></label>
            </div>
          </div>
        </div>
      </section>

      <div class="submit-bar">
        <div class="file-preview"><span class="fp-label">将保存为</span><code>{{ fileNamePreview }}</code></div>
        <button class="save-btn" :disabled="previewLoading" @click="openPreview">{{ previewLoading ? '预览中…' : '👁 预览' }}</button>
        <button class="primary-btn big" :disabled="generating" @click="generate">{{ generating ? '生成中…' : '生成报价单' }}</button>
      </div>

      <!-- 结果 -->
      <section class="card result-card" v-if="result">
        <div class="card-head"><h4>✅ 报价单已生成</h4><span class="card-tip">{{ result.count }} 条物料</span></div>
        <div class="result-file">{{ result.docxName }}</div>
        <div class="result-file" v-if="result.pdfName">📄 <a :href="pdfLink(result.pdfName)" target="_blank">{{ result.pdfName }}</a></div>
        <div class="pdf-err" v-if="result.pdfError">PDF 没生成：{{ result.pdfError }}（docx 已生成）</div>
        <div class="result-path">保存位置：{{ result.relPath }}</div>
        <div class="result-actions">
          <a v-if="result.pdfName" class="mini-btn" :href="pdfLink(result.pdfName)" target="_blank">预览 PDF</a>
          <button v-if="result.pdfName && canCopyFile" class="mini-btn" @click="copyFile(result.pdfName)">复制 PDF 文件</button>
          <a v-if="result.pdfName" class="mini-btn" :href="downloadLink(result.pdfName)" target="_blank">下载 PDF</a>
          <a class="mini-btn" :href="downloadLink(result.docxName)" target="_blank">下载 Word</a>
        </div>
      </section>

      <!-- 历史 -->
      <section class="card" v-if="form.customer">
        <div class="card-head"><h4>该客户的历史报价单</h4><span class="card-tip">{{ recent.length }} 份</span></div>
        <div class="history" v-if="recent.length">
          <div class="history-item" v-for="o in recent" :key="o.stem">
            <span class="hi-date">{{ o.date }}</span>
            <a class="hi-file" :href="o.pdf ? pdfLink(o.pdf) : downloadLink(o.docx)" target="_blank">{{ o.pdf || o.docx }}</a>
            <button v-if="o.pdf && canCopyFile" class="hi-copy" @click="copyFile(o.pdf)">复制</button>
            <button class="hi-del" @click="removeQuote(o)">删除</button>
          </div>
        </div>
        <div class="empty" v-else>还没有生成过报价单</div>
      </section>
    </main>

    <!-- 预览 -->
    <div v-if="previewOpen" class="pv-overlay" @click="closePreview">
      <div class="pv-panel" @click.stop>
        <div v-if="previewLoading" class="pv-loading">正在生成预览…</div>
        <iframe v-else :src="previewUrl" class="pv-frame" title="报价单预览"></iframe>
        <div class="pv-bar"><span>{{ previewLoading ? '报价单渲染中' : '点空白处关闭' }}</span><button @click.stop="closePreview">关闭</button></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast, showConfirmDialog } from 'vant'
import {
  fetchQuoteOptions, generateQuote, previewQuote, fetchQuoteList,
  fetchAllCustomerNames, quoteDownloadUrl, quotePreviewUrl, copyQuoteFile, deleteQuoteFile
} from '../utils/api.js'

const route = useRoute()
const router = useRouter()
const isElectron = !!window.electronAPI
const canCopyFile = isElectron || ['localhost', '127.0.0.1'].includes(location.hostname)

const customers = ref([])
const materials = ref([])
const recent = ref([])
const generating = ref(false)
const previewLoading = ref(false)
const previewOpen = ref(false)
const previewUrl = ref('')
const result = ref(null)

const form = reactive({ customer: '', date: new Date().toISOString().slice(0, 10), to: '', attn: '', tel: '', fileShort: '' })

function newItem() {
  return { key: Date.now() + '-' + Math.random().toString(36).slice(2, 6), matId: '', customer_code: '', jkx_code: '', spec: '', price: '', qty: '', lt: '', remark: '' }
}
const items = ref([newItem()])

function shortText(s) { return String(s || '').slice(0, 22) }
function goBack() { router.back() }

const fileNamePreview = computed(() => {
  if (!form.customer) return '选择客户后自动生成'
  const ymd = String(form.date || '').replace(/-/g, '').slice(2)
  return `${form.fileShort || '客户简称'}-晶科鑫报价单${ymd}-01.docx / .pdf`
})

async function loadOptions(customer) {
  try {
    const r = await fetchQuoteOptions(customer)
    const d = r.data || {}
    materials.value = d.materials || []
    recent.value = d.recent || []
    form.to = d.buyer?.name || customer
    form.attn = d.buyer?.contact || ''
    form.tel = d.buyer?.phone || ''
    form.fileShort = d.fileShort || ''
    if (d.date) form.date = d.date
  } catch (e) {
    showToast('读取客户资料失败: ' + (e.message || '未知错误'))
  }
}

function onCustomerChange() {
  form.customer = String(form.customer || '').trim()
  if (form.customer) loadOptions(form.customer)
  else { materials.value = []; recent.value = []; result.value = null }
}

function pickMaterial(item) {
  const m = materials.value.find(x => String(x.id) === String(item.matId))
  if (!m) return
  item.customer_code = m.customer_code || ''
  item.jkx_code = m.jkx_code || m.material_code || ''
  if (!item.spec) item.spec = m.material_name || ''
  if (!item.price && m.price_num) item.price = String(m.price_num)
}

function addItem() { items.value.push(newItem()) }
function removeItem(i) { if (items.value.length > 1) items.value.splice(i, 1) }

function buildPayload() {
  return {
    customer: form.customer,
    date: form.date,
    to: form.to,
    attn: form.attn,
    tel: form.tel,
    fileShort: form.fileShort,
    items: items.value.map(it => ({
      customer_code: it.customer_code,
      jkx_code: it.jkx_code,
      spec: it.spec,
      price: it.price === '' ? '' : Number(it.price),
      qty: it.qty,
      lt: it.lt,
      remark: it.remark
    }))
  }
}

function validate() {
  if (!form.customer) return '请先选择客户'
  if (!items.value.some(it => String(it.spec || '').trim() || String(it.jkx_code || '').trim())) return '请至少填一条物料'
  return ''
}

async function openPreview() {
  const msg = validate()
  if (msg) return showToast(msg)
  if (previewLoading.value) return
  if (previewUrl.value) { URL.revokeObjectURL(previewUrl.value); previewUrl.value = '' }
  previewOpen.value = true
  previewLoading.value = true
  try {
    const blob = await previewQuote(buildPayload())
    previewUrl.value = URL.createObjectURL(blob)
  } catch (e) {
    previewOpen.value = false
    showToast('预览失败: ' + (e.message || '未知错误'))
  } finally {
    previewLoading.value = false
  }
}

function closePreview() {
  if (previewUrl.value) { URL.revokeObjectURL(previewUrl.value); previewUrl.value = '' }
  previewOpen.value = false
}

async function generate() {
  const msg = validate()
  if (msg) return showToast(msg)
  generating.value = true
  try {
    const r = await generateQuote(buildPayload())
    result.value = r.data
    showToast('报价单已生成')
    const list = await fetchQuoteList(form.customer)
    recent.value = list.data || []
  } catch (e) {
    showToast('生成失败: ' + (e.message || '未知错误'))
  } finally {
    generating.value = false
  }
}

function pdfLink(name) { return quotePreviewUrl(form.customer, name) }
function downloadLink(name) { return quoteDownloadUrl(form.customer, name) }

async function copyFile(name) {
  try {
    await copyQuoteFile(form.customer, name)
    showToast('已复制「' + name + '」，可粘贴到微信')
  } catch (e) { showToast('复制失败: ' + (e.message || '未知错误')) }
}

async function removeQuote(o) {
  const name = o.pdf || o.docx
  try {
    await showConfirmDialog({ title: '删除报价单', message: `删除「${name}」？Word 和 PDF 会一起删掉，不能恢复。`, confirmButtonText: '删除', confirmButtonColor: '#ee0a24' })
  } catch { return }
  try {
    await deleteQuoteFile(form.customer, name)
    showToast('已删除')
    if (result.value && (result.value.pdfName === name || result.value.docxName === name)) result.value = null
    const list = await fetchQuoteList(form.customer)
    recent.value = list.data || []
  } catch (e) { showToast('删除失败: ' + (e.message || '未知错误')) }
}

onMounted(async () => {
  try {
    const r = await fetchAllCustomerNames()
    customers.value = r.data || []
  } catch {}
  const preset = String(route.query.customer || '').trim()
  if (preset) { form.customer = preset; await loadOptions(preset) }
})

onBeforeUnmount(closePreview)
</script>

<style scoped>
.quote-page { min-height: 100vh; background: #f0f2f5; }
.page-header { background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); color: #e8e8e8; padding: 10px 20px; display: flex; align-items: center; gap: 10px; position: sticky; top: 0; z-index: 99; }
.back-btn { background: rgba(255,255,255,.12); border: none; color: #fff; width: 30px; height: 30px; border-radius: 50%; font-size: 18px; cursor: pointer; }
.page-header h3 { margin: 0; font-size: 16px; }
.header-hint { color: #98a2b3; font-size: 12px; flex: 1; }
.header-actions { display: flex; gap: 8px; margin-left: auto; }
.ghost-btn, .primary-btn { border-radius: 6px; padding: 7px 14px; font-size: 13px; cursor: pointer; border: 1px solid transparent; }
.ghost-btn { background: rgba(255,255,255,.12); color: #e5e7eb; border-color: rgba(255,255,255,.18); }
.primary-btn { background: #00875a; color: #fff; }
.primary-btn:disabled, .ghost-btn:disabled { opacity: .6; cursor: default; }
.quote-main { max-width: 1280px; margin: 0 auto; padding: 14px 16px 80px; }
.card { background: #fff; border-radius: 10px; padding: 14px 16px; margin-bottom: 12px; box-shadow: 0 1px 2px rgba(16,24,40,.05); }
.card-head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.card-head h4 { margin: 0; font-size: 14px; color: #1f2937; }
.card-tip { color: #98a2b3; font-size: 12px; flex: 1; }
.cust-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 8px; }
.field { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: #667085; }
.field input, .field textarea { border: 1px solid #d8dde5; border-radius: 6px; padding: 7px 9px; font-size: 13px; color: #1f2937; outline: none; font-family: inherit; }
.field input:focus, .field textarea:focus { border-color: var(--color-primary); }
.item { border: 1px solid #eef0f3; border-radius: 8px; padding: 10px; margin-bottom: 10px; }
.item-top { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.item-no { color: #98a2b3; font-size: 12px; }
.mat-select { flex: 1; min-width: 0; border: 1px solid #d8dde5; border-radius: 6px; padding: 6px 8px; font-size: 13px; color: #344054; }
.del-item { border: none; background: #fff1f0; color: #d92d20; width: 26px; height: 26px; border-radius: 50%; cursor: pointer; }
.item-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.span-2 { grid-column: span 2; }
.mini-btn { border: 1px solid #d0d5dd; background: #fff; color: #475467; border-radius: 6px; padding: 4px 10px; font-size: 12px; cursor: pointer; text-decoration: none; }
.submit-bar { position: sticky; bottom: 0; background: #fff; border-radius: 10px; padding: 10px 16px; display: flex; align-items: center; gap: 12px; box-shadow: 0 -4px 14px rgba(16,24,40,.06); }
.file-preview { flex: 1; font-size: 12px; color: #667085; overflow: hidden; }
.file-preview code { background: #f2f4f7; padding: 2px 6px; border-radius: 4px; color: #344054; }
.save-btn { border: 1px solid #d0d5dd; background: #fff; border-radius: 6px; padding: 7px 14px; font-size: 13px; cursor: pointer; }
.primary-btn.big { padding: 9px 20px; font-size: 14px; }
.result-file { font-size: 13px; color: #344054; margin: 4px 0; word-break: break-all; }
.result-path { font-size: 12px; color: #98a2b3; margin-top: 4px; }
.result-actions { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
.pdf-err { color: #d92d20; font-size: 12px; margin-top: 6px; }
.history-item { display: flex; align-items: center; gap: 10px; padding: 7px 0; border-bottom: 1px dashed #eef0f3; font-size: 13px; }
.history-item:last-child { border-bottom: none; }
.hi-date { color: #98a2b3; font-size: 12px; width: 92px; }
.hi-file { flex: 1; color: #155eef; text-decoration: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hi-copy, .hi-del { border: 1px solid #d0d5dd; background: #fff; color: #475467; border-radius: 6px; padding: 3px 10px; font-size: 12px; cursor: pointer; }
.hi-del { color: #d92d20; border-color: #f3c1c1; }
.pv-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.55); z-index: 3000; }
.pv-panel { position: absolute; inset: 4%; background: #fff; border-radius: 10px; overflow: hidden; display: flex; flex-direction: column; }
.pv-frame { flex: 1; border: none; width: 100%; height: 100%; }
.pv-bar { height: 34px; background: #1f2937; color: #e5e7eb; display: flex; align-items: center; justify-content: space-between; padding: 0 12px; font-size: 12px; }
.pv-bar button { border: none; background: #374151; color: #fff; border-radius: 5px; padding: 4px 10px; cursor: pointer; }
.pv-loading { flex: 1; display: flex; align-items: center; justify-content: center; color: #667085; }
.empty { color: #98a2b3; font-size: 13px; padding: 14px 0; text-align: center; }
@media (max-width: 900px) {
  .cust-row, .item-grid { grid-template-columns: 1fr; }
  .span-2 { grid-column: auto; }
}
</style>
