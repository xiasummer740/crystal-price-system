<template>
  <div class="order-page">
    <header class="page-header">
      <button class="back-btn" @click="goBack">‹</button>
      <h3>生成订单</h3>
      <span class="test-badge">测试版</span>
      <span class="header-hint" v-if="selectedCustomer">客户管理 / {{ selectedCustomer }} / 订单</span>
      <div class="header-actions">
        <button v-if="isElectron" class="ghost-btn" :disabled="!selectedCustomer" @click="openOrderFolder">📁 订单文件夹</button>
        <button class="ghost-btn" :disabled="savingDefaults" @click="saveDefaults">{{ savingDefaults ? '保存中…' : '💾 保存默认' }}</button>
        <button class="ghost-btn" :disabled="previewLoading" @click="openPreview">{{ previewLoading ? '预览中…' : '👁 预览' }}</button>
        <button class="primary-btn" :disabled="generating" @click="generate">
          {{ generating ? '生成中…' : '🧾 生成订单文件' }}
        </button>
      </div>
    </header>

    <main class="order-main">
      <!-- ① 客户 -->
      <section class="card">
        <div class="card-head">
          <h4>客户（乙方）</h4>
          <span class="card-tip">选中客户后自动带出地址 / 联系人 / 该客户物料</span>
        </div>
        <div class="customer-select-wrap" :class="{ focused: showCustomerDropdown }">
          <span class="cs-label">👤 客户</span>
          <input
            ref="customerInputRef"
            v-model="customerQuery"
            class="customer-input"
            placeholder="搜索或选择客户…"
            @input="showCustomerDropdown = true"
            @focus="showCustomerDropdown = true"
            @blur="onCustomerBlur"
            @keydown.down.prevent="moveCustomer(1)"
            @keydown.up.prevent="moveCustomer(-1)"
            @keydown.enter.prevent="pickHighlighted"
          />
          <span v-if="selectedCustomer" class="cs-clear" @click="clearCustomer">×</span>
          <span v-else class="cs-arrow">▾</span>
          <div class="customer-dropdown" v-if="showCustomerDropdown">
            <div
              v-for="(c, idx) in filteredCustomers"
              :key="c"
              class="cd-item"
              :class="{ active: idx === customerIndex }"
              @mousedown.prevent="selectCustomer(c)"
            >
              <span class="cd-name">👤 {{ c }}</span>
            </div>
            <div v-if="!filteredCustomers.length" class="cd-empty">
              {{ customerQuery ? '无匹配客户' : '暂无客户数据' }}
            </div>
          </div>
        </div>

        <div class="grid-2">
          <label class="field">
            <span>乙方名称</span>
            <input v-model="buyer.name" placeholder="客户公司全称" />
          </label>
          <label class="field">
            <span>联系人</span>
            <input v-model="buyer.contact" placeholder="采购联系人" />
          </label>
          <label class="field span-2">
            <span>地址</span>
            <input v-model="buyer.address" placeholder="客户收货/开票地址" />
          </label>
          <label class="field">
            <span>电话</span>
            <input v-model="buyer.phone" placeholder="联系电话" />
          </label>
          <label class="field">
            <span>传真</span>
            <input v-model="buyer.fax" placeholder="传真（可空）" />
          </label>
        </div>
      </section>

      <div class="cols">
        <!-- ② 我方 + 印章 -->
        <section class="card">
          <div class="card-head">
            <h4>我方（甲方）</h4>
          </div>
          <div class="grid-2">
            <label class="field span-2">
              <span>公司名称</span>
              <input v-model="supplier.name" />
            </label>
            <label class="field span-2">
              <span>地址</span>
              <input v-model="supplier.address" />
            </label>
            <label class="field">
              <span>联系人</span>
              <input v-model="supplier.contact" />
            </label>
            <label class="field">
              <span>电话</span>
              <input v-model="supplier.phone" />
            </label>
            <label class="field span-2">
              <span>邮箱</span>
              <input v-model="supplier.email" />
            </label>
          </div>

          <div class="seal-row">
            <div class="seal-preview" :class="{ off: !showSeal }">
              <img v-if="seal.url" :src="seal.url" alt="公章" />
              <span v-else class="seal-empty">无印章</span>
            </div>
            <div class="seal-info">
              <div class="seal-title">公章（贴到「供方签章」处）</div>
              <div class="seal-sub">{{ seal.custom ? '当前使用：自己上传的印章' : '当前使用：系统内置公司公章（晶科鑫）' }}</div>
              <div class="seal-btns">
                <label class="mini-btn">
                  上传印章
                  <input ref="sealInput" type="file" accept="image/png,image/jpeg,image/webp" hidden @change="onSealFile" />
                </label>
                <button class="mini-btn" :disabled="!seal.custom" @click="resetSeal">恢复默认</button>
                <label class="switch">
                  <input type="checkbox" v-model="showSeal" />
                  <span>显示公章</span>
                </label>
              </div>
            </div>
          </div>
        </section>

        <!-- ③ 订单信息 + 条款 -->
        <section class="card">
          <div class="card-head"><h4>订单信息</h4></div>
          <div class="grid-2">
            <label class="field">
              <span>客户简称（文件名用，2~4 字都行）</span>
              <input v-model="fileShort" maxlength="10" placeholder="如 奥斯普" />
            </label>
            <label class="field">
              <span>单号前缀（字母）</span>
              <input v-model="shortName" maxlength="6" placeholder="如 ASP" />
            </label>
            <label class="field">
              <span>单号</span>
              <input v-model="orderNo" placeholder="ASP261022001" @input="orderNoTouched = true" />
            </label>
            <label class="field">
              <span>签约日期</span>
              <input v-model="signDate" type="date" />
            </label>
            <label class="field">
              <span>签约代表</span>
              <input v-model="signRep" placeholder="我方签字人" />
            </label>
            <p class="hint span-2">
              文件名 = 客户简称 + 「-晶科鑫订单」 + 单号；单号 = 前缀 + 年月日 + 001~999 顺序号。<br>
              简称 2 个字（国润）、3 个字（奥斯普）、4 个字都行，按客户记住；不确定就用默认建议值。
            </p>
          </div>

          <div class="card-head sub">
            <h4>条款（六~九可改）</h4>
          </div>
          <div class="grid-2">
            <label class="field">
              <span>运输方式</span>
              <input v-model="terms.deliveryPlace" />
            </label>
            <label class="field">
              <span>运费承担</span>
              <input v-model="terms.freight" />
            </label>
            <label class="field">
              <span>验收/异议期限</span>
              <input v-model="terms.acceptance" />
            </label>
            <label class="field">
              <span>结算方式及期限</span>
              <input v-model="terms.settlement" />
            </label>
          </div>
        </section>
      </div>

      <!-- ④ 物料明细 -->
      <section class="card">
        <div class="card-head">
          <h4>物料明细</h4>
          <div class="head-tools">
            <div class="price-mode" title="单价和金额按哪种口径显示（不做换算）">
              <button :class="{ active: priceMode === '含税' }" @click="priceMode = '含税'">含税</button>
              <button :class="{ active: priceMode === '未税' }" @click="priceMode = '未税'">未税</button>
            </div>
            <span class="card-tip">{{ items.length }} 条 · 合计 {{ money(totalAmount) }} 元</span>
            <button class="mini-btn" @click="addItem">＋ 添加物料</button>
          </div>
        </div>

        <div class="items">
          <div class="item" v-for="(item, idx) in items" :key="item.key">
            <div class="item-head">
              <span class="item-no">#{{ idx + 1 }}</span>
              <select class="mat-select" v-model="item.materialId" @change="onMaterialPick(item)">
                <option value="">— 选该客户物料（也可手填）—</option>
                <option v-for="m in materials" :key="m.id" :value="m.id">
                  {{ m.jkx_code || m.material_code }} · {{ shortText(m.material_name) }}
                </option>
              </select>
              <button class="del-btn" :disabled="items.length === 1" @click="removeItem(idx)" title="删除这一条">✕</button>
            </div>
            <div class="grid-2">
              <label class="field">
                <span>货品编码（默认 1、2、3…可改）</span>
                <input v-model="item.code" placeholder="1" @input="item.codeAuto = false" />
              </label>
              <label class="field">
                <span>数量 PCS</span>
                <input v-model="item.qty" type="number" min="1" step="1" placeholder="1000" />
              </label>
              <label class="field span-2">
                <span>产品规格（型号/品牌 + 规格描述，可换行）</span>
                <textarea v-model="item.spec" rows="2" placeholder="SJK-7K32768K0135GRC9/TAIJING&#10;1610,32.768KHz,9pF…"></textarea>
              </label>
              <label class="field">
                <span>单价（{{ priceMode }}）</span>
                <input v-model="item.price" type="number" min="0" step="0.0001" placeholder="0.82" />
              </label>
              <label class="field">
                <span>交货时间（可留空 / 2周 / 2-3周）</span>
                <input v-model="item.deliveryDate" placeholder="2026/10/29 或 2周 / 2-3周，可留空" />
              </label>
              <label class="field span-2">
                <span>备注</span>
                <input v-model="item.remark" placeholder="编带 / 特殊要求…" />
              </label>
            </div>
            <div class="item-sum">金额：<b>{{ money(lineAmount(item)) }}</b> 元</div>
          </div>
        </div>
      </section>

      <!-- ⑤ 生成结果 -->
      <section class="card result-card" v-if="result">
        <div class="card-head">
          <h4>✅ 订单已生成</h4>
          <span class="card-tip">单号 {{ result.orderNo }}</span>
        </div>
        <div class="result-file">{{ result.fileName }}</div>
        <div class="result-file" v-if="result.pdfName">
          📄 <a :href="previewLink(result.pdfName)" target="_blank" class="pdf-link">{{ result.pdfName }}</a>
        </div>
        <div class="pdf-err" v-if="result.pdfError">PDF 没生成：{{ result.pdfError }}（xlsx 已生成，可先用 Excel 打开另存为 PDF）</div>
        <div class="result-path">保存位置：{{ result.relPath }}</div>
        <div class="result-actions">
          <a v-if="result.pdfName" class="mini-btn" :href="previewLink(result.pdfName)" target="_blank">预览 PDF</a>
          <button v-if="result.pdfName && canCopyFile" class="mini-btn" @click="copyFile(result.pdfName)">复制 PDF 文件</button>
          <a v-if="result.pdfName" class="mini-btn" :href="downloadUrl(result.pdfName)" target="_blank">下载 PDF</a>
          <a class="mini-btn" :href="downloadUrl(result.fileName)" target="_blank">下载 Excel</a>
        </div>
      </section>

      <div class="submit-bar">
        <div class="file-preview">
          <span class="fp-label">将保存为</span>
          <code>{{ fileNamePreview }}</code>
        </div>
        <button class="save-btn" :disabled="previewLoading" @click="openPreview">
          {{ previewLoading ? '预览中…' : '👁 预览' }}
        </button>
        <button class="primary-btn big" :disabled="generating" @click="generate">
          {{ generating ? '生成中…' : '生成订单文件' }}
        </button>
      </div>

      <!-- ⑥ 历史订单 -->
      <section class="card" v-if="selectedCustomer">
        <div class="card-head">
          <h4>该客户的历史订单</h4>
          <span class="card-tip">{{ recent.length }} 份</span>
        </div>
        <div class="history" v-if="recent.length">
          <div class="history-item" v-for="o in recent" :key="o.stem">
            <span class="hi-date">{{ o.date }}</span>
            <a class="hi-model hi-file" :href="historyUrl(o)" target="_blank">{{ o.pdf || o.xlsx }}</a>
            <button v-if="o.pdf && canCopyFile" class="hi-copy" @click="copyFile(o.pdf)" title="复制文件，可直接粘到微信">复制</button>
          </div>
        </div>
        <div class="empty" v-else>还没有生成过订单</div>
      </section>
    </main>

    <!-- 预览浮层：默认左侧小窗，点一下放大，点空白处关闭 -->
    <div v-if="previewOpen" class="pv-overlay" @click="closePreview">
      <div class="pv-panel" :class="{ expanded: previewExpanded }" @click.stop="previewExpanded = !previewExpanded">
        <div v-if="previewLoading" class="pv-loading">正在生成预览…</div>
        <iframe v-else :key="previewExpanded ? 'expanded' : 'small'"
          :src="previewUrl + (previewExpanded ? '#zoom=100' : '#view=FitH')"
          class="pv-frame" title="订单预览"></iframe>
        <div v-if="!previewExpanded && !previewLoading" class="pv-hit"></div>
        <div class="pv-bar">
          <span>{{ previewLoading ? '合同渲染中' : (previewExpanded ? '点空白处关闭' : '点击预览可放大') }}</span>
          <button @click.stop="closePreview">关闭</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast } from 'vant'
import {
  fetchOrderOptions,
  generateOrder,
  previewOrder,
  fetchOrderList,
  openOrderPath,
  uploadOrderSeal,
  resetOrderSeal,
  saveOrderDefaults,
  orderDownloadUrl,
  orderPreviewUrl,
  copyOrderFile,
  fetchAllCustomerNames
} from '../utils/api.js'

const route = useRoute()
const router = useRouter()
const isElectron = !!window.electronAPI

const customers = ref([])
const customerQuery = ref('')
const selectedCustomer = ref('')
const showCustomerDropdown = ref(false)
const customerIndex = ref(-1)
const customerInputRef = ref(null)

const supplier = reactive({ name: '', address: '', contact: '', phone: '', email: '' })
const buyer = reactive({ name: '', address: '', contact: '', phone: '', fax: '' })
const terms = reactive({ deliveryPlace: '快 递', freight: '由甲方承担', acceptance: '收到货15天内', settlement: '现金' })

const orderNo = ref('')
const shortName = ref('')
const fileShort = ref('')
const orderNoTouched = ref(false)
const signDate = ref('')
const signRep = ref('')
const priceMode = ref('含税')
const showSeal = ref(true)
const seal = reactive({ url: '', custom: false })
const sealInput = ref(null)

const materials = ref([])
const recent = ref([])
const items = ref([])
const generating = ref(false)
const savingDefaults = ref(false)
const previewOpen = ref(false)
const previewExpanded = ref(false)
const previewLoading = ref(false)
const previewUrl = ref('')
const result = ref(null)

let keySeq = 0
function newItem() {
  keySeq += 1
  return {
    key: keySeq,
    materialId: '',
    jkx_code: '',
    // 货品编码默认就是行号 1、2、3…（祥哥习惯），手改后 codeAuto 置 false 不再自动改；
    // 具体值由 renumberAutoCodes() 统一填，避免 reset 时拿到旧数组长度
    code: '',
    codeAuto: true,
    spec: '',
    qty: '',
    price: '',
    deliveryDate: '',
    remark: ''
  }
}

const filteredCustomers = computed(() => {
  const kw = customerQuery.value.trim().toLowerCase()
  const list = kw ? customers.value.filter(c => c.toLowerCase().includes(kw)) : customers.value
  return list.slice(0, 60)
})

const totalAmount = computed(() => items.value.reduce((sum, it) => sum + lineAmount(it), 0))
const totalQty = computed(() => items.value.reduce((sum, it) => sum + (Number(it.qty) || 0), 0))

const fileNamePreview = computed(() => {
  if (!orderNo.value) return '（选客户后自动生成）'
  return `${fileShort.value || shortName.value || '客户'}-晶科鑫订单${orderNo.value}.xlsx`
})

function lineAmount(item) {
  const q = Number(item.qty) || 0
  const p = Number(item.price) || 0
  return Math.round(q * p * 100) / 100
}

// 单号 = 公司简称 + 年月日 + 001~999（用户手改过单号就不再自动覆盖）
function refreshOrderNo() {
  if (orderNoTouched.value) return
  const short = String(shortName.value || '').trim()
  if (!short) { orderNo.value = ''; return }
  const m = String(orderNo.value || '').match(/^(.*?)(\d{6})(\d{3})$/)
  const seq = m ? m[3] : '001'
  const ymd = String(signDate.value || '').replace(/\D/g, '').slice(2, 8)
  orderNo.value = `${short}${ymd}${seq}`
}
watch(shortName, v => {
  const s = String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
  if (s !== v) shortName.value = s
})
watch([shortName, signDate], refreshOrderNo)

function money(n) {
  return (Number(n) || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function shortText(name) {
  const s = String(name || '')
  return s.length > 26 ? s.slice(0, 26) + '…' : s
}
function downloadUrl(name) {
  return orderDownloadUrl(selectedCustomer.value, name)
}
/** 浏览器内预览（PDF 直接打开；xlsx 不支持预览） */
function previewLink(name) {
  return orderPreviewUrl(selectedCustomer.value, name)
}
/** 历史订单：优先给 PDF 预览，没 PDF 就下载 Excel */
function historyUrl(o) {
  return o.pdf ? previewLink(o.pdf) : downloadUrl(o.xlsx)
}
/** 复制文件到系统剪贴板（粘到微信/QQ 直接是文件，不是路径） */
async function copyFile(name) {
  if (!name) return
  try {
    await copyOrderFile(selectedCustomer.value, name)
    showToast('已复制「' + name + '」，可直接粘贴到微信')
  } catch (e) {
    showToast('复制失败: ' + (e.message || '未知错误'))
  }
}
// 浏览器 Clipboard 不支持文件，走服务端 PowerShell；手机浏览器没法复制电脑上的文件
const canCopyFile = isElectron || ['localhost', '127.0.0.1'].includes(location.hostname)

async function loadBase() {
  try {
    const r = await fetchOrderOptions('')
    const d = r.data || {}
    Object.assign(supplier, d.supplier || {})
    Object.assign(terms, d.terms || {})
    signDate.value = d.today || ''
    seal.url = d.seal?.url || ''
    seal.custom = !!d.seal?.custom
    resetItems()
  } catch (e) {
    showToast('读取默认信息失败: ' + (e.message || '未知错误'))
    resetItems()
  }
}

async function loadCustomer(name) {
  selectedCustomer.value = name
  customerQuery.value = name
  showCustomerDropdown.value = false
  result.value = null
  try {
    const r = await fetchOrderOptions(name)
    const d = r.data || {}
    buyer.name = d.buyer?.name || name
    buyer.address = d.buyer?.address || ''
    buyer.contact = d.buyer?.contact || ''
    buyer.phone = d.buyer?.phone || ''
    buyer.fax = d.buyer?.fax || ''
    materials.value = d.materials || []
    recent.value = d.recent || []
    shortName.value = d.shortName || ''
    fileShort.value = d.fileShort || ''
    priceMode.value = d.priceMode === '未税' ? '未税' : '含税'
    orderNo.value = d.nextOrderNo || ''
    orderNoTouched.value = false
    Object.assign(terms, d.terms || {})
    // 签约日期默认当天（祥哥 2026-10-22）：每次选客户都带今天，页面上仍可改
    if (d.today) signDate.value = d.today
    // 只带出默认值，不覆盖用户改过的我方信息；首次进来才有空值
    if (!supplier.name) Object.assign(supplier, d.supplier || {})
    resetItems()
  } catch (e) {
    showToast('读取客户资料失败: ' + (e.message || '未知错误'))
  }
}

function selectCustomer(name) {
  loadCustomer(name)
}

function clearCustomer() {
  selectedCustomer.value = ''
  customerQuery.value = ''
  buyer.name = ''
  buyer.address = ''
  buyer.contact = ''
  buyer.phone = ''
  buyer.fax = ''
  materials.value = []
  recent.value = []
  shortName.value = ''
  fileShort.value = ''
  orderNo.value = ''
  orderNoTouched.value = false
  result.value = null
  resetItems()
  nextTick(() => customerInputRef.value?.focus())
}

function onCustomerBlur() {
  setTimeout(() => { showCustomerDropdown.value = false }, 180)
}
function moveCustomer(step) {
  if (!showCustomerDropdown.value) { showCustomerDropdown.value = true; return }
  const n = filteredCustomers.value.length
  if (!n) return
  customerIndex.value = (customerIndex.value + step + n) % n
}
function pickHighlighted() {
  const c = filteredCustomers.value[customerIndex.value]
  if (c) selectCustomer(c)
}

function onMaterialPick(item) {
  const m = materials.value.find(x => String(x.id) === String(item.materialId))
  if (!m) return
  item.jkx_code = m.jkx_code || m.material_code || ''
  // 货品编码不再自动填客户料号：默认保持行号 1、2、3…，用户自己改
  const head = [m.jkx_code, m.factory].filter(Boolean).join('/')
  item.spec = [head, m.material_name].filter(Boolean).join('\n')
  if (!item.qty && m.qty) item.qty = m.qty
  if (m.price_num) item.price = String(m.price_num)
  if (!item.deliveryDate) item.deliveryDate = signDate.value
}

/** 自动编号：只重排没被手改过的行（手改过的保留） */
function renumberAutoCodes() {
  items.value.forEach((it, i) => { if (it.codeAuto) it.code = String(i + 1) })
}

/** 重置为一条空白物料（并立刻补上行号 1） */
function resetItems() {
  items.value = [newItem()]
  renumberAutoCodes()
}

function addItem() {
  items.value.push(newItem())
  renumberAutoCodes()
}
function removeItem(idx) {
  if (items.value.length <= 1) return
  items.value.splice(idx, 1)
  renumberAutoCodes()
}

async function onSealFile(e) {
  const file = e.target.files?.[0]
  if (!file) return
  const fd = new FormData()
  fd.append('file', file, file.name)
  try {
    const r = await uploadOrderSeal(fd)
    seal.url = r.data.url
    seal.custom = true
    showToast('印章已更新')
  } catch (err) {
    showToast('上传失败: ' + (err.message || '未知错误'))
  } finally {
    e.target.value = ''
  }
}

async function resetSeal() {
  try {
    const r = await resetOrderSeal()
    seal.url = r.data.url
    seal.custom = false
    showToast('已恢复默认印章')
  } catch (e) {
    showToast('操作失败: ' + (e.message || '未知错误'))
  }
}

async function saveDefaults() {
  if (savingDefaults.value) return
  savingDefaults.value = true
  try {
    const payload = { supplier: { ...supplier }, terms: { ...terms } }
    if (selectedCustomer.value) {
      // 选了客户：乙方信息 / 条款 / 简称绑定到这个客户，下次选它自动带出
      payload.customer = selectedCustomer.value
      payload.buyer = { ...buyer }
      payload.shortName = shortName.value
      payload.fileShort = fileShort.value
      payload.priceMode = priceMode.value
    }
    await saveOrderDefaults(payload)
    showToast(selectedCustomer.value
      ? `已保存：乙方信息 / 条款绑定到「${selectedCustomer.value}」`
      : '已保存甲方信息与条款为默认')
  } catch (e) {
    showToast('保存失败: ' + (e.message || '未知错误'))
  } finally {
    savingDefaults.value = false
  }
}

function validate() {
  if (!selectedCustomer.value) return '请先选择客户'
  if (!String(shortName.value || '').trim()) return '请填写单号前缀（字母，如 ASP）'
  if (!String(fileShort.value || '').trim()) return '请填写客户简称（文件名用，如 奥斯普）'
  if (!items.value.length) return '请至少添加一条物料'
  for (let i = 0; i < items.value.length; i++) {
    const it = items.value[i]
    if (!String(it.spec || '').trim() && !String(it.code || '').trim()) return `第 ${i + 1} 条物料没填型号/规格`
    if (!(Number(it.qty) > 0)) return `第 ${i + 1} 条物料的数量必须大于 0`
    if (Number(it.price) < 0 || it.price === '') return `第 ${i + 1} 条物料的单价不能为空`
  }
  return ''
}

function buildPayload() {
  return {
    customer: selectedCustomer.value,
    shortName: shortName.value,
    fileShort: fileShort.value,
    priceMode: priceMode.value,
    orderNo: orderNo.value,
    signDate: signDate.value,
    supplier: { ...supplier },
    buyer: { ...buyer },
    terms: { ...terms },
    sign: { supplierRep: signRep.value || supplier.contact },
    showSeal: showSeal.value,
    items: items.value.map(it => ({
      jkx_code: it.jkx_code,
      code: it.code,
      spec: it.spec,
      qty: Number(it.qty),
      price: Number(it.price),
      deliveryDate: it.deliveryDate,
      remark: it.remark
    }))
  }
}

async function generate() {
  const msg = validate()
  if (msg) return showToast(msg)
  generating.value = true
  try {
    const payload = buildPayload()
    const r = await generateOrder(payload)
    result.value = r.data
    showToast('订单已生成')
    try {
      const list = await fetchOrderList(selectedCustomer.value)
      recent.value = list.data || []
      // 下一单的单号顺延（否则连开两张会重号）
      const opt = await fetchOrderOptions(selectedCustomer.value)
      if (opt.data?.nextOrderNo) {
        shortName.value = opt.data.shortName || shortName.value
        fileShort.value = opt.data.fileShort || fileShort.value
        orderNo.value = opt.data.nextOrderNo
        orderNoTouched.value = false
      }
    } catch { /* 刷新历史失败不影响生成结果 */ }
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
  } catch (e) {
    showToast('生成失败: ' + (e.message || '未知错误'))
  } finally {
    generating.value = false
  }
}

async function openPreview() {
  const msg = validate()
  if (msg) return showToast(msg)
  if (previewLoading.value) return
  // 先清掉上一份
  if (previewUrl.value) { URL.revokeObjectURL(previewUrl.value); previewUrl.value = '' }
  previewOpen.value = true
  previewExpanded.value = false
  previewLoading.value = true
  try {
    const blob = await previewOrder(buildPayload())
    previewUrl.value = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }))
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
  previewExpanded.value = false
}

// 预览打开时按 ESC 直接关（放大后空白处很小，键盘更顺手）
function onPreviewKeydown(e) {
  if (e.key === 'Escape' && previewOpen.value) {
    e.stopPropagation()
    closePreview()
  }
}

async function openOrderFolder() {
  try {
    await openOrderPath(selectedCustomer.value, '', 'folder')
  } catch (e) {
    showToast('打开失败: ' + (e.message || '未知错误'))
  }
}

function goBack() {
  router.back()
}

onMounted(async () => {
  window.addEventListener('keydown', onPreviewKeydown)
  try {
    const r = await fetchAllCustomerNames()
    customers.value = r.data || []
  } catch { /* 客户列表读不到时仍可手填客户名 */ }
  await loadBase()
  const preset = String(route.query.customer || '').trim()
  if (preset) await loadCustomer(preset)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onPreviewKeydown)
  closePreview()
})
</script>

<style scoped>
.order-page { min-height: 100vh; background: #f0f2f5; }
.page-header { background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); color: #e8e8e8; padding: 10px 20px; display: flex; align-items: center; gap: 10px; position: sticky; top: 0; z-index: 99; }
.page-header h3 { font-size: 16px; font-weight: 600; }
.back-btn { background: none; border: none; color: #e8e8e8; font-size: 24px; line-height: 1; cursor: pointer; padding: 0 2px; }
.test-badge { font-size: 11px; background: #fa8c16; color: #fff; border-radius: 10px; padding: 2px 8px; }
.header-hint { font-size: 12px; color: #9aa4b2; margin-left: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.header-actions { margin-left: auto; display: flex; gap: 8px; }

.order-main { max-width: 1100px; margin: 0 auto; padding: 14px 16px 40px; }
.cols { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.card { background: #fff; border-radius: 10px; padding: 14px 16px 16px; box-shadow: 0 1px 4px rgba(0, 0, 0, .06); margin-bottom: 14px; }
.card-head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.card-head h4 { font-size: 15px; color: #1f2937; }
.card-head.sub { margin-top: 16px; }
.card-tip { font-size: 12px; color: #8c98a8; }
.head-tools { margin-left: auto; display: flex; align-items: center; gap: 10px; }

.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 14px; }
.span-2 { grid-column: span 2; }
.field { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: #667085; min-width: 0; }
.field input, .field textarea { width: 100%; min-width: 0; border: 1px solid #d8dde5; border-radius: 6px; padding: 8px 10px; font-size: 13px; color: #1f2937; background: #fff; outline: none; font-family: inherit; resize: vertical; }
.field input:focus, .field textarea:focus { border-color: var(--color-primary); box-shadow: 0 0 0 2px rgba(0, 135, 113, .1); }
.hint { font-size: 12px; color: #8c98a8; line-height: 1.6; margin: 0; }

.customer-select-wrap { position: relative; display: flex; align-items: center; gap: 8px; border: 1px solid #d8dde5; border-radius: 8px; padding: 6px 10px; background: #fafbfc; margin-bottom: 12px; }
.customer-select-wrap.focused { border-color: var(--color-primary); background: #fff; }
.cs-label { font-size: 12px; color: #667085; white-space: nowrap; }
.customer-input { flex: 1; border: none; background: transparent; font-size: 14px; outline: none; color: #1f2937; }
.cs-clear, .cs-arrow { color: #98a2b3; cursor: pointer; font-size: 16px; }
.customer-dropdown { position: absolute; left: 0; right: 0; top: 100%; margin-top: 4px; background: #fff; border: 1px solid #e4e7ec; border-radius: 8px; box-shadow: 0 8px 24px rgba(0, 0, 0, .12); max-height: 280px; overflow-y: auto; z-index: 20; }
.cd-item { padding: 9px 12px; font-size: 13px; cursor: pointer; }
.cd-item:hover, .cd-item.active { background: #f0f9f7; color: var(--color-primary); }
.cd-empty { padding: 12px; font-size: 13px; color: #98a2b3; text-align: center; }

.seal-row { display: flex; gap: 14px; align-items: center; margin-top: 14px; padding-top: 12px; border-top: 1px dashed #e4e7ec; }
.seal-preview { width: 92px; height: 92px; border-radius: 50%; border: 1px dashed #d0d5dd; display: flex; align-items: center; justify-content: center; background: #fff; flex-shrink: 0; }
.seal-preview.off { opacity: .25; }
.seal-preview img { width: 88px; height: 88px; object-fit: contain; }
.seal-empty { font-size: 12px; color: #98a2b3; }
.seal-info { flex: 1; }
.seal-title { font-size: 13px; color: #344054; font-weight: 500; }
.seal-sub { font-size: 12px; color: #8c98a8; margin: 3px 0 8px; }
.seal-btns { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.switch { display: flex; align-items: center; gap: 4px; font-size: 12px; color: #475467; cursor: pointer; }

.mini-btn { border: 1px solid #d0d5dd; background: #fff; color: #344054; font-size: 12px; padding: 6px 10px; border-radius: 6px; cursor: pointer; white-space: nowrap; text-decoration: none; display: inline-flex; align-items: center; }
.mini-btn:hover:not(:disabled) { border-color: var(--color-primary); color: var(--color-primary); }
.mini-btn:disabled { opacity: .45; cursor: not-allowed; }
.link-btn { margin-left: auto; border: none; background: none; color: var(--color-primary); font-size: 12px; cursor: pointer; }
.ghost-btn { background: rgba(255, 255, 255, .1); border: 1px solid rgba(255, 255, 255, .25); color: #e8e8e8; font-size: 12px; padding: 6px 12px; border-radius: 6px; cursor: pointer; }
.ghost-btn:disabled { opacity: .4; cursor: not-allowed; }
.primary-btn { background: var(--color-primary); border: none; color: #fff; padding: 7px 14px; border-radius: 6px; font-size: 13px; cursor: pointer; }
.primary-btn:disabled { opacity: .6; cursor: wait; }
.primary-btn.big { padding: 11px 24px; font-size: 15px; }
.save-btn { background: #fff; border: 1px solid var(--color-primary); color: var(--color-primary); padding: 10px 18px; border-radius: 6px; font-size: 14px; cursor: pointer; white-space: nowrap; }
.save-btn:disabled { opacity: .6; cursor: wait; }

.items { display: flex; flex-direction: column; gap: 12px; }
.item { border: 1px solid #e4e7ec; border-radius: 8px; padding: 10px 12px 8px; background: #fcfdfe; }
.item-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.item-no { font-size: 12px; color: #98a2b3; }
.mat-select { flex: 1; min-width: 0; border: 1px solid #d8dde5; border-radius: 6px; padding: 7px 8px; font-size: 13px; background: #fff; color: #1f2937; }
.del-btn { border: none; background: #fff1f0; color: #cf1322; width: 26px; height: 26px; border-radius: 6px; cursor: pointer; }
.del-btn:disabled { opacity: .35; cursor: not-allowed; }
.item-sum { text-align: right; font-size: 12px; color: #667085; margin-top: 6px; }
.item-sum b { color: #b42318; font-size: 14px; }

.price-mode { display: inline-flex; border: 1px solid #d0d5dd; border-radius: 6px; overflow: hidden; }
.price-mode button { border: none; background: #fff; color: #667085; font-size: 12px; padding: 5px 12px; cursor: pointer; }
.price-mode button + button { border-left: 1px solid #d0d5dd; }
.price-mode button.active { background: var(--color-primary); color: #fff; }
.pdf-err { font-size: 12px; color: #b42318; background: #fff1f0; border-radius: 6px; padding: 6px 8px; margin: 6px 0; word-break: break-all; }
.hi-file { color: var(--color-primary); text-decoration: none; }
.hi-copy { border: 1px solid #d0d5dd; background: #fff; color: #475467; font-size: 12px; border-radius: 6px; padding: 3px 10px; cursor: pointer; }
.hi-copy:hover { border-color: var(--color-primary); color: var(--color-primary); }
.pdf-link { color: var(--color-primary); text-decoration: none; }

.submit-bar { display: flex; align-items: center; gap: 16px; background: #fff; border-radius: 10px; padding: 12px 16px; box-shadow: 0 1px 4px rgba(0, 0, 0, .06); margin-bottom: 14px; }
.file-preview { flex: 1; min-width: 0; font-size: 12px; color: #667085; }
.fp-label { margin-right: 6px; }
.file-preview code { background: #f2f4f7; color: #344054; padding: 3px 6px; border-radius: 4px; word-break: break-all; }

.result-card { border: 1px solid #b7eb8f; background: #f6ffed; }
.result-file { font-size: 15px; font-weight: 600; color: #1f2937; word-break: break-all; }
.result-path { font-size: 12px; color: #667085; margin: 6px 0 10px; word-break: break-all; }
.result-actions { display: flex; gap: 8px; flex-wrap: wrap; }

.history { display: flex; flex-direction: column; }
.history-item { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px dashed #eef0f3; font-size: 13px; }
.history-item:last-child { border-bottom: none; }
.hi-date { color: #667085; font-family: ui-monospace, Consolas, monospace; }
.hi-model { flex: 1; color: #1f2937; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hi-qty { color: #475467; }
.hi-link { color: var(--color-primary); text-decoration: none; font-size: 12px; }
.empty { font-size: 13px; color: #98a2b3; padding: 6px 0; }

@media (max-width: 820px) {
  .cols { grid-template-columns: 1fr; }
  .header-hint { display: none; }
  .header-actions .ghost-btn { display: none; }
  .submit-bar { flex-direction: column; align-items: stretch; }
  .page-header { padding: 10px 12px; }
  .order-main { padding: 10px 10px 30px; }
}
.pv-overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, .45); z-index: 300; }
.pv-panel { position: absolute; left: 12px; top: 12px; bottom: 12px; width: 42%; min-width: 320px; background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 12px 40px rgba(0, 0, 0, .35); display: flex; flex-direction: column; transition: all .18s ease; }
.pv-panel.expanded { left: 2%; top: 2%; right: 2%; bottom: 2%; width: auto; }
.pv-frame { flex: 1; border: none; width: 100%; height: 100%; background: #f5f5f5; }
.pv-hit { position: absolute; left: 0; right: 0; top: 0; bottom: 34px; cursor: zoom-in; }
.pv-bar { position: absolute; left: 0; right: 0; bottom: 0; height: 34px; display: flex; align-items: center; justify-content: space-between; padding: 0 10px; background: #1f2937; color: #e5e7eb; font-size: 12px; }
.pv-bar button { border: none; background: #374151; color: #fff; border-radius: 5px; padding: 4px 10px; cursor: pointer; }
.pv-loading { flex: 1; display: flex; align-items: center; justify-content: center; color: #667085; font-size: 14px; }
</style>
