<template>
  <div class="mm">
    <!-- 时间范围：本月 / 上月 / 自定义 -->
    <div class="mm-bar">
      <button v-for="t in ranges" :key="t.key" class="mm-tab" :class="{ active: rangeKey === t.key }" @click="switchRange(t.key)">{{ t.label }}</button>
      <template v-if="rangeKey === 'custom'">
        <input class="mm-date" type="date" v-model="customStart" @change="load" />
        <span class="mm-to">~</span>
        <input class="mm-date" type="date" v-model="customEnd" @change="load" />
      </template>
      <span class="mm-range">{{ data?.range?.start }} ~ {{ data?.range?.end }}</span>
      <button class="mm-export" :disabled="!data?.customers?.length" @click="exportCsv">导出 CSV</button>
    </div>

    <div v-if="loading" class="mm-empty">加载中…</div>
    <div v-else-if="!data" class="mm-empty">读不到汇总数据</div>

    <template v-else>
      <div class="mm-scroll">
        <table class="mm-tbl">
          <thead>
            <tr>
              <th class="col-cust">客户</th>
              <th title="本月新增的报价记录条数（可追溯到历史）">报价</th>
              <th title="本月报价记录发生字段变更的次数（可追溯到历史）">改价</th>
              <th title="本月把物料状态往下推进的次数（自 v1.0.223 起才有）">状态推进</th>
              <th title="记事里关联物料时填的数量合计（自 v1.0.223 起才有）">下单量</th>
              <th title="同上">备货量</th>
              <th title="同上">送样量</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in data.customers" :key="r.customer">
              <td class="col-cust" :title="r.customer">{{ r.customer }}</td>
              <td>{{ r.quotes || '' }}</td>
              <td>{{ r.price_changes || '' }}</td>
              <td>
                {{ r.advances || '' }}
                <span v-if="r.advances" class="mm-badge" :title="advanceDetail(r)">{{ advanceDetail(r) }}</span>
              </td>
              <td>{{ r.order_qty ? fmt(r.order_qty) : '' }}</td>
              <td>{{ r.stock_qty ? fmt(r.stock_qty) : '' }}</td>
              <td>{{ r.sample_qty ? fmt(r.sample_qty) : '' }}</td>
            </tr>
            <tr v-if="!data.customers.length"><td colspan="7" class="mm-none">这个区间没有任何物料活动</td></tr>
          </tbody>
          <tfoot v-if="data.customers.length">
            <tr>
              <td class="col-cust">合计</td>
              <td>{{ data.totals.quotes }}</td>
              <td>{{ data.totals.price_changes }}</td>
              <td>{{ data.totals.advances }}</td>
              <td>{{ data.totals.order_qty ? fmt(data.totals.order_qty) : '—' }}</td>
              <td>{{ data.totals.stock_qty ? fmt(data.totals.stock_qty) : '—' }}</td>
              <td>{{ data.totals.sample_qty ? fmt(data.totals.sample_qty) : '—' }}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <!-- 口径说明：数字会被质疑，所以把「怎么算的」和「哪几项历史不全」直接写在页面上 -->
      <div class="mm-notes">
        <div class="mm-notes-title">口径说明</div>
        <div v-for="(n, i) in data.notes" :key="i" class="mm-note">· {{ n }}</div>
        <div v-if="data.samples_registered" class="mm-note mm-strong">
          · 本月样品登记表共 {{ data.samples_registered }} 条（该表没有客户列，无法归到客户头上，故只给全局数）
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { showNotify } from 'vant'
import { fetchMaterialMonthly } from '../utils/api.js'

const ranges = [
  { key: 'this', label: '本月' },
  { key: 'last', label: '上月' },
  { key: 'custom', label: '自定义' }
]
const rangeKey = ref('this')
const customStart = ref('')
const customEnd = ref('')
const data = ref(null)
const loading = ref(false)

const pad = (n) => String(n).padStart(2, '0')
const fmtDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
function monthBounds(offset = 0) {
  const now = new Date()
  const first = new Date(now.getFullYear(), now.getMonth() + offset, 1)
  const last = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0)
  return { start: fmtDate(first), end: fmtDate(last) }
}
function currentRange() {
  if (rangeKey.value === 'last') return monthBounds(-1)
  if (rangeKey.value === 'custom') return { start: customStart.value, end: customEnd.value }
  return monthBounds(0)
}
function switchRange(k) {
  rangeKey.value = k
  if (k === 'custom' && !customStart.value) {
    const m = monthBounds(0)
    customStart.value = m.start
    customEnd.value = m.end
  }
  load()
}
async function load() {
  const { start, end } = currentRange()
  if (!start || !end) return
  loading.value = true
  try {
    const r = await fetchMaterialMonthly({ start, end })
    data.value = r.data
  } catch (e) {
    showNotify({ type: 'danger', message: '读取月度汇总失败：' + e.message })
    data.value = null
  } finally {
    loading.value = false
  }
}
onMounted(load)

const fmt = (n) => Number(n).toLocaleString('zh-CN')
const advanceDetail = (r) => Object.entries(r.advance_by_status || {}).map(([k, v]) => `${k} ${v}`).join(' / ')

/** 导出 CSV（带 BOM，Excel 直接打开不乱码）——不依赖后端导出，口径与页面完全一致 */
function exportCsv() {
  if (!data.value) return
  const head = ['客户', '报价次数', '改价次数', '状态推进', '推进明细', '下单量', '备货量', '送样量']
  const lines = [head.join(',')]
  for (const r of data.value.customers) {
    lines.push([
      `"${String(r.customer).replace(/"/g, '""')}"`, r.quotes || 0, r.price_changes || 0, r.advances || 0,
      `"${advanceDetail(r)}"`, r.order_qty || 0, r.stock_qty || 0, r.sample_qty || 0
    ].join(','))
  }
  const t = data.value.totals
  lines.push(['"合计"', t.quotes, t.price_changes, t.advances, '""', t.order_qty, t.stock_qty, t.sample_qty].join(','))
  lines.push('')
  for (const n of data.value.notes || []) lines.push(`"${String(n).replace(/"/g, '""')}"`)
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `物料月度汇总_${data.value.range.start}_${data.value.range.end}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}
</script>

<style scoped>
.mm { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.mm-bar { display: flex; align-items: center; gap: 8px; padding: 10px 16px; flex-wrap: wrap; }
.mm-tab { height: 28px; padding: 0 12px; font-size: 12px; border: 1px solid #dcdee0; background: #fff; border-radius: 6px; cursor: pointer; color: #323233; }
.mm-tab.active { border-color: var(--color-primary, #1989fa); color: #fff; background: var(--color-primary, #1989fa); }
.mm-date { height: 28px; font-size: 12px; border: 1px solid #dcdee0; border-radius: 6px; padding: 0 6px; }
.mm-to { color: #969799; }
.mm-range { font-size: 12px; color: #969799; }
.mm-export { margin-left: auto; height: 28px; padding: 0 12px; font-size: 12px; border: 1px solid #b8d4ff; color: #1677ff; background: #fff; border-radius: 6px; cursor: pointer; }
.mm-export:disabled { opacity: .5; cursor: not-allowed; }
.mm-empty { padding: 40px; text-align: center; color: #969799; }
.mm-scroll { flex: 1; overflow: auto; padding: 0 16px; min-height: 0; }
.mm-tbl { width: 100%; border-collapse: collapse; font-size: 12px; }
.mm-tbl th, .mm-tbl td { border-bottom: 1px solid #f2f3f5; padding: 7px 8px; text-align: right; white-space: nowrap; }
.mm-tbl th { background: #fafafa; color: #646566; font-weight: 500; position: sticky; top: 0; z-index: 1; }
.mm-tbl .col-cust { text-align: left; max-width: 320px; overflow: hidden; text-overflow: ellipsis; }
.mm-tbl tfoot td { font-weight: 600; background: #fafafa; }
.mm-none { text-align: center; color: #969799; padding: 24px; }
.mm-badge { color: #969799; font-size: 11px; margin-left: 4px; }
.mm-notes { flex-shrink: 0; margin: 10px 16px 14px; padding: 10px; background: #f7f8fa; border-radius: 8px; font-size: 11px; color: #6b7280; line-height: 1.8; }
.mm-notes-title { font-weight: 600; color: #323233; margin-bottom: 4px; }
.mm-strong { color: #e08a00; }
</style>
