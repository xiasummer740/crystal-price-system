<template>
  <div class="cm-page">
    <header class="cm-header">
      <button class="cm-back" @click="goBack">‹</button>
      <h3>佣金 / 回扣</h3>
      <span class="cm-customer">{{ customer || '未选择客户' }}</span>
      <div class="cm-actions">
        <button class="cm-btn" @click="addRow">＋ 新增行</button>
        <button class="cm-btn" :disabled="!customer" @click="openMaterialPicker">📦 从物料添加</button>
        <button class="cm-btn" @click="showHistory = !showHistory">历史佣金单</button>
        <button class="cm-btn primary" :disabled="!customer || !rows.length" @click="saveSheet">保存</button>
        <button class="cm-btn" :disabled="!sheetId" @click="exportExcel">📗 导出 Excel</button>
        <button class="cm-btn" :disabled="!sheetId" @click="exportDocx">📄 回扣备案表</button>
        <button class="cm-btn" :disabled="!rows.length" @click="exportImage">🖼 生成图片</button>
      </div>
    </header>

    <main class="cm-main">
      <section class="cm-settings">
        <label>点数(%)<input v-model.number="points" type="number" step="0.5" @input="recalcAll" /></label>
        <label>税率(%)<input v-model.number="taxRate" type="number" step="0.5" @input="recalcAll" /></label>
        <label>开始<input v-model="periodStart" type="date" /></label>
        <label>结束<input v-model="periodEnd" type="date" /></label>
        <label>部门<input v-model="department" placeholder="代理部" /></label>
        <label>业务<input v-model="business" placeholder="夏祥" /></label>
        <button class="cm-link" @click="showBank = !showBank">{{ showBank ? '收起收款信息' : '收款信息' }}</button>
      </section>

      <section v-if="showBank" class="cm-settings bank">
        <label>开户行<input v-model="bankName" /></label>
        <label>户名<input v-model="accountName" /></label>
        <label>账号<input v-model="accountNo" /></label>
      </section>

      <section class="cm-table-wrap">
        <table class="cm-table">
          <thead>
            <tr>
              <th style="width:26%">名称</th>
              <th style="width:10%">数量</th>
              <th style="width:12%">下单价格</th>
              <th style="width:12%">报价</th>
              <th style="width:9%">税率</th>
              <th style="width:13%">含税总金额</th>
              <th style="width:12%">回扣</th>
              <th>备注</th>
              <th style="width:44px"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(r, i) in rows" :key="i">
              <td><input v-model="r.name" placeholder="规格型号 / 名称" /></td>
              <td><input v-model.number="r.qty" type="number" min="0" @input="recalcRow(r)" /></td>
              <td>
                <input v-model.number="r.order_price" type="number" step="0.0001" :title="r.order_manual ? '手工价格' : '报价 × (1+点数)'"
                  @input="r.order_manual = true; recalcRow(r)" />
              </td>
              <td><input v-model.number="r.quote" type="number" step="0.0001" @input="autoOrder(r); recalcRow(r)" /></td>
              <td><input v-model.number="r.tax_rate" type="number" step="0.5" @input="r.tax_manual = true; recalcRow(r)" /></td>
              <td><span class="cm-amount">{{ Number(r.total_amount || 0).toFixed(2) }}</span></td>
              <td>
                <input v-model.number="r.rebate" type="number" step="0.01" :title="r.rebate_manual ? '手工回扣' : '(下单价-报价)×数量÷(1+税率)'"
                  @input="r.rebate_manual = true" />
              </td>
              <td><input v-model="r.remark" placeholder="备注" /></td>
              <td><button class="cm-del" @click="rows.splice(i, 1)">×</button></td>
            </tr>
            <tr v-if="!rows.length">
              <td colspan="8" class="cm-empty">点「＋ 新增行」或「从物料添加」开始</td>            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td><b>合计</b></td>
              <td><b>{{ totalQty }}</b></td>
              <td colspan="3"></td>
              <td><b>{{ totalAmount.toFixed(2) }}</b></td>
              <td><b class="cm-total">{{ totalRebate.toFixed(2) }}</b></td>
              <td colspan="2"></td>
            </tr>
          </tfoot>
        </table>
      </section>

      <p class="cm-hint">下单价格默认 = 报价 × (1 + 点数%)，可手工改；回扣默认 = 含税总金额 × 点数% ÷ (1 + 税率)，也可手工改。</p>
    </main>

    <!-- 物料选择 -->
    <div v-if="showMaterials" class="cm-mask" @click.self="showMaterials = false">
      <div class="cm-modal">
        <h4>从客户物料添加 <small>{{ customer }}</small></h4>
        <input v-model="materialKw" class="cm-input" placeholder="搜索料号/名称…" />
        <div class="cm-mat-list">
          <label v-for="m in filteredMaterials" :key="m.id" class="cm-mat-item">
            <input type="checkbox" :value="m.id" v-model="pickedIds" />
            <span class="cm-mat-name">{{ m.material_name || m.material_code }}</span>
            <span class="cm-mat-price">{{ m.price }}</span>
          </label>
          <div v-if="!filteredMaterials.length" class="cm-empty">没有物料</div>
        </div>
        <div class="cm-modal-btns">
          <button @click="showMaterials = false">取消</button>
          <button class="primary" @click="addPickedMaterials">添加所选</button>
        </div>
      </div>
    </div>

    <!-- 历史 -->
    <div v-if="showHistory" class="cm-mask" @click.self="showHistory = false">
      <div class="cm-modal">
        <h4>历史佣金单</h4>
        <div class="cm-hist-list">
          <div v-for="s in sheets" :key="s.id" class="cm-hist-item">
            <div class="cm-hist-main" @click="loadSheet(s)">
              <b>{{ s.period_start || '?' }} ~ {{ s.period_end || '?' }}</b>
              <span>{{ s.total_qty }} 只 · 回扣 {{ Number(s.total_rebate).toFixed(2) }}</span>
            </div>
            <button @click="removeSheet(s)">删除</button>
          </div>
          <div v-if="!sheets.length" class="cm-empty">还没有保存过</div>
        </div>
        <div class="cm-modal-btns"><button @click="showHistory = false">关闭</button></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast } from 'vant'
import {
  fetchCommissionProfile, saveCommissionProfile,
  fetchCommissionSheets, fetchCommissionSheet, saveCommissionSheet, deleteCommissionSheet, commissionXlsxUrl, commissionDocxUrl,
  fetchMaterials
} from '../utils/api.js'

const route = useRoute()
const router = useRouter()
const customer = ref(String(route.query.customer || ''))
const sheetId = ref(0)
const points = ref(3)
const taxRate = ref(13)
const periodStart = ref('')
const periodEnd = ref('')
const department = ref('代理部')
const business = ref('夏祥')
const bankName = ref('深圳农商银行')
const accountName = ref('张建庭')
const accountNo = ref('6230 3518 8891 2769')
const showBank = ref(false)
const rows = ref([])
const sheets = ref([])
const showHistory = ref(false)
const showMaterials = ref(false)
const materialKw = ref('')
const materials = ref([])
const pickedIds = ref([])

const totalQty = computed(() => rows.value.reduce((s, r) => s + Number(r.qty || 0), 0))
const totalAmount = computed(() => rows.value.reduce((s, r) => s + Number(r.total_amount || 0), 0))
const totalRebate = computed(() => rows.value.reduce((s, r) => s + Number(r.rebate || 0), 0))
const filteredMaterials = computed(() => {
  const kw = materialKw.value.trim().toLowerCase()
  if (!kw) return materials.value
  return materials.value.filter(m => `${m.material_name || ''} ${m.material_code || ''} ${m.jkx_code || ''}`.toLowerCase().includes(kw))
})

const num = (v) => {
  const n = Number(String(v ?? '').replace(/[^\d.\-]/g, ''))
  return Number.isFinite(n) ? n : 0
}
const round2 = (n) => Math.round(n * 100) / 100

function autoOrder(r) {
  if (r.order_manual) return
  r.order_price = Math.round(num(r.quote) * (1 + num(points.value) / 100) * 100) / 100
}
function recalcRow(r) {
  if (!r.order_manual) autoOrder(r)
  r.total_amount = round2(num(r.order_price) * num(r.qty))
  if (!r.rebate_manual) {
    const tax = r.tax_rate === undefined || r.tax_rate === '' ? num(taxRate.value) : num(r.tax_rate)
    r.rebate = round2(num(r.total_amount) * num(points.value) / 100 / (1 + tax / 100))
  }
}
function recalcAll() {
  for (const r of rows.value) recalcRow(r)
}
function addRow() {
  rows.value.push({ name: '', qty: 0, order_price: '', quote: '', tax_rate: taxRate.value, total_amount: 0, rebate: '', remark: '', order_manual: false, rebate_manual: false })
}
async function openMaterialPicker() {
  materialKw.value = ''
  pickedIds.value = []
  try {
    const r = await fetchMaterials({ customer: customer.value, pageSize: 500 })
    materials.value = (r.data?.list || []).map(m => ({ ...m, price_num: num(m.price) }))
    showMaterials.value = true
  } catch (e) { showToast('读取物料失败: ' + (e.message || '未知错误')) }
}
function addPickedMaterials() {
  const picked = materials.value.filter(m => pickedIds.value.includes(m.id))
  for (const m of picked) {
    const quote = num(m.price)
    rows.value.push({
      name: m.material_name || m.material_code || '',
      qty: 0,
      order_price: Math.round(quote * (1 + num(points.value) / 100) * 100) / 100,
      quote,
      tax_rate: taxRate.value,
      total_amount: 0,
      rebate: 0,
      remark: '',
      order_manual: false,
      rebate_manual: false
    })
  }
  showMaterials.value = false
  showToast(`已添加 ${picked.length} 条`)
}
function goBack() { router.back() }

async function loadProfile() {
  if (!customer.value) return
  try {
    const r = await fetchCommissionProfile(customer.value)
    const d = r.data || {}
    points.value = d.points ?? 3
    taxRate.value = d.tax_rate ?? 13
    department.value = d.department || '代理部'
    business.value = d.business || '夏祥'
    bankName.value = d.bank_name || ''
    accountName.value = d.account_name || ''
    accountNo.value = d.account_no || ''
  } catch {}
}
async function loadSheets() {
  if (!customer.value) return
  try { const r = await fetchCommissionSheets(customer.value); sheets.value = r.data || [] } catch {}
}
async function saveSheet() {
  if (!customer.value) return showToast('缺少客户')
  try {
    await saveCommissionProfile({
      customer: customer.value, points: points.value, tax_rate: taxRate.value,
      department: department.value, business: business.value,
      bank_name: bankName.value, account_name: accountName.value, account_no: accountNo.value
    })
    const r = await saveCommissionSheet({
      id: sheetId.value || undefined,
      customer: customer.value,
      period_start: periodStart.value, period_end: periodEnd.value,
      points: points.value, tax_rate: taxRate.value,
      rows: rows.value
    })
    sheetId.value = r.data.id
    showToast('已保存佣金单')
    loadSheets()
  } catch (e) { showToast('保存失败: ' + (e?.response?.data?.msg || e.message)) }
}
function exportExcel() {
  if (!sheetId.value) return showToast('请先保存')
  window.open(commissionXlsxUrl(sheetId.value), '_blank')
}
function exportDocx() {
  if (!sheetId.value) return showToast('请先保存')
  window.open(commissionDocxUrl(sheetId.value), '_blank')
}
function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function buildPrintHtml() {
  const list = rows.value.map(r => `<tr>
    <td class="name">${esc(r.name)}</td>
    <td>${Number(r.qty || 0)}</td>
    <td>${Number(r.order_price || 0).toFixed(4)}</td>
    <td>${Number(r.quote || 0).toFixed(4)}</td>
    <td>${Number(r.tax_rate || 0)}%</td>
    <td>${Number(r.total_amount || 0).toFixed(2)}</td>
    <td class="rebate">${Number(r.rebate || 0).toFixed(2)}</td>
    <td>${esc(r.remark || '')}</td>
  </tr>`).join('')
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: A4; margin: 12mm; }
    body { font-family: "Microsoft YaHei", "微软雅黑", sans-serif; color: #1f2937; margin: 0; padding: 10px 18px; background: #fff; }
    h2 { text-align: center; font-size: 20px; margin: 0 0 6px; }
    .meta { text-align: center; color: #667085; font-size: 12px; margin-bottom: 12px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border: 1px solid #98a2b3; padding: 6px 8px; text-align: center; }
    th { background: #eaf2ff; font-weight: 600; }
    td.name { text-align: left; }
    td.rebate { color: #d46b08; font-weight: 600; }
    tfoot td { font-weight: 700; background: #fafafa; }
  </style></head><body>
  <h2>${esc(customer.value)} 佣金明细</h2>
  <div class="meta">统计期间：${esc(periodStart.value || '-')} ~ ${esc(periodEnd.value || '-')}　点数：${points.value}%　税率：${taxRate.value}%　制表日期：${new Date().toLocaleDateString('zh-CN')}</div>
  <table>
    <thead><tr><th style="width:30%">名称</th><th>数量</th><th>下单价格</th><th>报价</th><th>税率</th><th>含税总金额</th><th>回扣</th><th>备注</th></tr></thead>
    <tbody>${list}</tbody>
    <tfoot><tr><td>合计</td><td>${totalQty.value}</td><td colspan="3"></td><td>${totalAmount.value.toFixed(2)}</td><td class="rebate">${totalRebate.value.toFixed(2)}</td><td></td></tr></tfoot>
  </table>
  </body></html>`
}
async function exportImage() {
  if (!window.electronAPI?.captureHtml) return showToast('生成图片需要在桌面程序里使用')
  try {
    const p = await window.electronAPI.captureHtml({ html: buildPrintHtml(), fileName: `佣金明细-${customer.value}.png` })
    if (p) showToast('图片已保存：' + p)
  } catch (e) { showToast('生成图片失败: ' + (e.message || '未知错误')) }
}
async function loadSheet(s) {
  try {
    const r = await fetchCommissionSheet(s.id)
    const d = r.data
    sheetId.value = d.id
    periodStart.value = d.period_start || ''
    periodEnd.value = d.period_end || ''
    points.value = d.points
    taxRate.value = d.tax_rate
    rows.value = (d.rows || []).map(x => ({
      ...x,
      total_amount: x.total_amount ?? Math.round(Number(x.order_price || 0) * Number(x.qty || 0) * 100) / 100,
      order_manual: true,
      rebate_manual: false
    }))
    recalcAll()
    showHistory.value = false
    showToast('已载入佣金单')
  } catch { showToast('载入失败') }
}
async function removeSheet(s) {
  try { await deleteCommissionSheet(s.id); showToast('已删除'); loadSheets() } catch { showToast('删除失败') }
}

onMounted(async () => {
  if (customer.value) {
    await loadProfile()
    await loadSheets()
  }
})
</script>

<style scoped>
.cm-page { min-height: 100vh; background: #f0f2f5; display: flex; flex-direction: column; }
.cm-header { display: flex; align-items: center; gap: 10px; padding: 10px 18px; background: #fff; border-bottom: 1px solid #e8e8e8; flex-wrap: wrap; }
.cm-back { border: none; background: #f5f6f8; border-radius: 50%; width: 30px; height: 30px; font-size: 18px; cursor: pointer; }
.cm-header h3 { margin: 0; font-size: 16px; }
.cm-customer { color: #667085; font-size: 13px; flex: 1; }
.cm-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.cm-btn { border: 1px solid #d0d5dd; background: #fff; border-radius: 6px; padding: 6px 12px; font-size: 13px; cursor: pointer; }
.cm-btn.primary { background: #00794f; border-color: #00794f; color: #fff; }
.cm-btn:disabled { opacity: .5; cursor: not-allowed; }
.cm-main { padding: 14px 18px 40px; }
.cm-settings { display: flex; align-items: flex-end; gap: 12px; background: #fff; border-radius: 10px; padding: 12px 14px; margin-bottom: 10px; flex-wrap: wrap; }
.cm-settings label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: #667085; }
.cm-settings input { border: 1px solid #d0d5dd; border-radius: 6px; padding: 6px 8px; font-size: 13px; width: 130px; }
.cm-settings.bank { margin-top: -4px; }
.cm-link { border: none; background: transparent; color: #1677ff; font-size: 12px; cursor: pointer; margin-left: auto; }
.cm-table-wrap { background: #fff; border-radius: 10px; overflow: auto; padding: 4px 0; }
.cm-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.cm-table th, .cm-table td { border-bottom: 1px solid #eef0f3; padding: 4px 6px; text-align: left; }
.cm-table th { background: #f8fafc; color: #475467; font-weight: 600; font-size: 12px; }
.cm-table input { width: 100%; border: 1px solid transparent; background: transparent; padding: 5px 4px; font-size: 13px; outline: none; }
.cm-table input:focus { border-color: #1677ff; background: #fff; border-radius: 4px; }
.cm-del { border: none; background: #fff1f0; color: #d92d20; border-radius: 4px; width: 24px; height: 24px; cursor: pointer; }
.cm-total { color: #d46b08; }
.cm-amount { display: inline-block; padding: 5px 4px; color: #1f2937; }
.cm-empty { text-align: center; color: #98a2b3; padding: 18px 0; }
.cm-hint { color: #98a2b3; font-size: 12px; margin-top: 8px; }
.cm-mask { position: fixed; inset: 0; background: rgba(15,23,42,.45); z-index: 4000; display: flex; align-items: center; justify-content: center; }
.cm-modal { width: min(640px, 94vw); max-height: 80vh; background: #fff; border-radius: 10px; padding: 16px; display: flex; flex-direction: column; }
.cm-modal h4 { margin: 0 0 10px; font-size: 15px; }
.cm-modal h4 small { color: #98a2b3; font-size: 11px; font-weight: normal; }
.cm-input { border: 1px solid #d0d5dd; border-radius: 6px; padding: 7px 9px; font-size: 13px; }
.cm-mat-list { flex: 1; overflow: auto; margin-top: 10px; border-top: 1px solid #eef0f3; }
.cm-mat-item { display: flex; align-items: center; gap: 8px; padding: 7px 4px; border-bottom: 1px dashed #eef0f3; font-size: 13px; }
.cm-mat-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cm-mat-price { color: #667085; }
.cm-modal-btns { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
.cm-modal-btns button { border: 1px solid #d0d5dd; background: #fff; border-radius: 6px; padding: 6px 12px; cursor: pointer; }
.cm-modal-btns button.primary { background: #00794f; border-color: #00794f; color: #fff; }
.cm-hist-list { overflow: auto; }
.cm-hist-item { display: flex; gap: 8px; align-items: center; padding: 8px 0; border-bottom: 1px dashed #eef0f3; }
.cm-hist-main { flex: 1; cursor: pointer; }
.cm-hist-main b { font-size: 13px; }
.cm-hist-main span { display: block; font-size: 12px; color: #98a2b3; margin-top: 2px; }
.cm-hist-item button { border: 1px solid #f3c1c1; color: #d92d20; background: #fff; border-radius: 5px; padding: 3px 8px; font-size: 12px; cursor: pointer; }
</style>
