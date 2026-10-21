<template>
  <div class="mrp">
    <div class="mrp-head">
      <span class="mrp-title">关联物料</span>
      <span class="mrp-hint">（记「某物料下单/备货/送样多少」时挂上它，物料进展里就能看到这条记事）</span>
    </div>

    <div v-if="!customer" class="mrp-note">先选客户，才能挑这家客户的物料。</div>
    <template v-else>
      <div v-if="loading" class="mrp-note">加载该客户的物料…</div>
      <div v-else-if="!all.length" class="mrp-note">这家客户还没有客户物料记录（先去「客户物料」页建）。</div>

      <div v-for="(row, i) in rows" :key="i" class="mrp-row">
        <div class="mrp-line">
          <!-- 物料：**输入即筛选**（和客户选择器同一套交互）——
               客户物料动辄几十上百条，纯下拉翻起来太慢；这里一次拉全该客户的物料，
               本地按 料号/编码/名称 过滤，不必每敲一个字都请求后端。
               匹配口径与后端列表接口的 keyword 一致：客户编码 / 晶科鑫料号 / 物料编码 / 物料名称。 -->
          <div class="mrp-pick">
            <input
              class="mrp-input"
              :class="{ picked: row.material_id > 0 }"
              :placeholder="all.length ? '输入料号 / 编码 / 名称筛选物料…' : '暂无可选物料'"
              :disabled="!all.length"
              v-model="row.query"
              @input="onType(i)"
              @focus="onFocus(i)"
              @blur="onBlur(i)"
              @keydown.enter.prevent="pickFirst(i)"
              @keydown.esc="closeList(i)"
            />
            <span v-if="row.material_id > 0 || row.query" class="mrp-clear" title="清空" @mousedown.prevent="clearRow(i)">✕</span>
            <div v-if="openIndex === i" class="mrp-drop">
              <div v-if="!matches(i).length" class="mrp-drop-empty">
                {{ row.query ? '没有匹配的物料' : '输入关键字开始筛选' }}
              </div>
              <div v-for="m in matches(i)" :key="m.id" class="mrp-opt" @mousedown.prevent="pick(i, m)">
                <span class="mrp-opt-name">{{ m.material_name || '（未命名物料）' }}</span>
                <span class="mrp-opt-meta">
                  <span v-if="m.jkx_code">晶科鑫 {{ m.jkx_code }}</span>
                  <span v-if="m.customer_code">客户编码 {{ m.customer_code }}</span>
                  <span v-if="m.material_code">物料编码 {{ m.material_code }}</span>
                  <span v-if="m.status" class="mrp-opt-status">{{ m.status }}</span>
                </span>
              </div>
              <div v-if="loadedTotal > all.length" class="mrp-drop-more">
                只列出前 {{ all.length }} 条（该客户共 {{ loadedTotal }} 条）
              </div>
            </div>
          </div>
          <button class="mrp-del" title="删掉这一行" @mousedown.prevent="removeRow(i)">✕</button>
        </div>
        <div class="mrp-line">
          <select class="mrp-sel small" v-model="row.action">
            <option v-for="a in ACTIONS" :key="a" :value="a">{{ a }}</option>
          </select>
          <input class="mrp-qty" v-model="row.quantity" placeholder="数量" />
          <!-- 单位固定 PCS（v1.0.234，祥哥：不用每次手打） -->
          <span class="mrp-unit mrp-unit-fixed" title="单位固定为 PCS">PCS</span>
        </div>
      </div>

      <button class="mrp-add" :disabled="!all.length" @click="addRow">＋ 添加物料</button>
    </template>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { fetchMaterials } from '../utils/api.js'

// 动作清单：祥哥 2026-10-14 提的场景是「下单多少、备货多少、什么物料要送样品」
const ACTIONS = ['下单', '备货', '送样', '报价', '其它']
const MAX_SHOW = 40          // 下拉最多显示多少条（多了没人翻，靠打字缩范围）
const FETCH_SIZE = 500       // 一次拉全该客户的物料（后端 pageSize 上限就是 500）

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  customer: { type: String, default: '' }
})
const emit = defineEmits(['update:modelValue'])

const all = ref([])          // 该客户的全部物料
const loadedTotal = ref(0)   // 后端报的总数（用于提示「只列了前 N 条」）
const loading = ref(false)
const openIndex = ref(-1)    // 当前展开下拉的行号
const rows = ref([])         // 可编辑行；对外只传「选了物料」的行

function label(m) {
  const parts = [m.material_name || '（未命名物料）']
  if (m.jkx_code) parts.push(`晶科鑫 ${m.jkx_code}`)
  if (m.customer_code) parts.push(`客户编码 ${m.customer_code}`)
  return parts.join(' · ')
}

/** 本地关键字筛选：多关键字以空格分隔，**全部**命中才算（和搜索直觉一致） */
function matches(i) {
  const q = String(rows.value[i]?.query || '').trim().toLowerCase()
  const pool = all.value
  if (!q) return pool.slice(0, MAX_SHOW)
  const tokens = q.split(/\s+/).filter(Boolean)
  const out = []
  for (const m of pool) {
    const hay = [m.material_name, m.jkx_code, m.material_code, m.customer_code, m.customer_desc, m.remark]
      .map(x => String(x || '').toLowerCase()).join(' ')
    if (tokens.every(t => hay.includes(t))) {
      out.push(m)
      if (out.length >= MAX_SHOW) break
    }
  }
  return out
}

function fromModel(v) {
  rows.value = (Array.isArray(v) ? v : []).map(r => ({
    material_id: Number(r?.material_id) || 0,
    action: ACTIONS.includes(r?.action) ? r.action : '下单',
    quantity: String(r?.quantity ?? ''),
    // 单位固定 PCS：旧数据里别的单位（颗/只/…）在编辑时也统一成 PCS，
    // 这样界面上不再出现一个「看起来能改、其实每次都要手打」的输入框。
    unit: 'PCS',
    query: r?.name || r?.jkx_code || '',
    name: r?.name || '', jkx_code: r?.jkx_code || '', material_code: r?.material_code || '', customer_code: r?.customer_code || ''
  }))
}
fromModel(props.modelValue)

/** 行 → 对外模型（只传选了物料的） */
function sync() {
  const out = rows.value
    .filter(r => Number(r.material_id) > 0)
    .map(r => {
      const m = all.value.find(x => Number(x.id) === Number(r.material_id))
      return {
        material_id: Number(r.material_id),
        // 快照：物料以后改名/被删，这条记事仍看得懂记的是哪个料
        name: m?.material_name || r.name || '',
        jkx_code: m?.jkx_code || r.jkx_code || '',
        material_code: m?.material_code || r.material_code || '',
        customer_code: m?.customer_code || r.customer_code || '',
        action: r.action || '下单',
        quantity: String(r.quantity || '').trim(),
        unit: 'PCS'
      }
    })
  emit('update:modelValue', out)
}

// ===== 下拉交互 =====
function onFocus(i) { openIndex.value = i }
// blur 要等 mousedown 选完再关，否则点选项的瞬间列表就没了（选项上用 mousedown.prevent 也是一层保险）
function onBlur(i) { setTimeout(() => { if (openIndex.value === i) openIndex.value = -1 }, 150) }
function closeList(i) { if (openIndex.value === i) openIndex.value = -1 }
function onType(i) {
  // 手动改了文字 ⇒ 之前选中的那个不再算数（避免「显示的和存的不一致」）
  rows.value[i].material_id = 0
  rows.value[i].name = ''
  rows.value[i].jkx_code = ''
  rows.value[i].material_code = ''
  rows.value[i].customer_code = ''
  openIndex.value = i
}
function pick(i, m) {
  const row = rows.value[i]
  row.material_id = Number(m.id)
  row.name = m.material_name || ''
  row.jkx_code = m.jkx_code || ''
  row.material_code = m.material_code || ''
  row.customer_code = m.customer_code || ''
  row.query = label(m)
  openIndex.value = -1
}
function pickFirst(i) {
  const list = matches(i)
  if (list.length) pick(i, list[0])
}
function clearRow(i) {
  const row = rows.value[i]
  row.material_id = 0
  row.query = ''
  row.name = ''
  row.jkx_code = ''
  row.material_code = ''
  row.customer_code = ''
  openIndex.value = i
}
function addRow() {
  rows.value.push({ material_id: 0, action: '下单', quantity: '', unit: 'PCS', query: '' })
  openIndex.value = rows.value.length - 1
}
function removeRow(i) {
  rows.value.splice(i, 1)
  openIndex.value = -1
}

// 客户变了 → 重新拉该客户的物料（已选行保留，等新列表回来后按 id 重新匹配）
watch(() => props.customer, async (c) => {
  if (!c) { all.value = []; loadedTotal.value = 0; return }
  loading.value = true
  try {
    const r = await fetchMaterials({ customer: c, pageSize: FETCH_SIZE })
    all.value = r.data?.list || []
    loadedTotal.value = r.data?.total || all.value.length
  } catch {
    all.value = []
    loadedTotal.value = 0
  } finally {
    loading.value = false
  }
}, { immediate: true })

// 外部塞进来的初值（编辑记事时）—— 内容真不同才同步，别把用户正在输的清掉
watch(() => props.modelValue, (v) => {
  const key = (list) => JSON.stringify((list || []).map(x => [x.material_id, x.action, x.quantity, x.unit]))
  if (key(v) !== key(rows.value.filter(r => r.material_id > 0))) fromModel(v)
})

// ⚠️ 任何一处改动都要往上传 —— 只靠「选物料时同步」会丢掉后填的动作/数量/单位
//    （2026-10-14 真机验证抓到的真缺陷：存进去只有「下单」，数量 5000 丢了）
watch(rows, () => { sync() }, { deep: true })
</script>

<style scoped>
.mrp { margin: 8px 0 4px; padding: 10px; background: #f7f8fa; border-radius: 8px; }
.mrp-head { display: flex; align-items: baseline; gap: 6px; flex-wrap: wrap; }
.mrp-title { font-size: 13px; font-weight: 600; color: #323233; }
.mrp-hint { font-size: 11px; color: #969799; line-height: 1.5; }
.mrp-note { margin-top: 8px; font-size: 12px; color: #969799; }
.mrp-row { margin-top: 8px; padding: 8px; background: #fff; border: 1px solid #ebedf0; border-radius: 8px; }
.mrp-line { display: flex; gap: 6px; align-items: center; }
.mrp-line + .mrp-line { margin-top: 6px; }

/* 物料选择：输入框 + 下拉（输入即筛选） */
.mrp-pick { position: relative; flex: 1; min-width: 0; display: flex; align-items: center; }
.mrp-input { flex: 1; min-width: 0; height: 32px; font-size: 12px; color: #323233; border: 1px solid #dcdee0; border-radius: 6px; padding: 0 24px 0 8px; background: #fff; outline: none; }
.mrp-input:focus { border-color: var(--color-primary, #1989fa); box-shadow: 0 0 0 2px rgba(25,137,250,.12); }
.mrp-input.picked { color: #1677ff; }
.mrp-input:disabled { background: #f7f8fa; color: #c8c9cc; }
.mrp-clear { position: absolute; right: 6px; color: #bbb; font-size: 13px; cursor: pointer; }
.mrp-clear:hover { color: #666; }
.mrp-drop { position: absolute; z-index: 30; top: 34px; left: 0; right: 0; max-height: 260px; overflow-y: auto; background: #fff; border: 1px solid #ebedf0; border-radius: 8px; box-shadow: 0 6px 20px rgba(0,0,0,.12); }
.mrp-drop-empty { padding: 10px; font-size: 12px; color: #969799; text-align: center; }
.mrp-drop-more { padding: 6px 10px; font-size: 11px; color: #969799; border-top: 1px solid #f2f3f5; }
.mrp-opt { padding: 7px 10px; cursor: pointer; border-bottom: 1px solid #f7f8fa; }
.mrp-opt:hover { background: #f0f7ff; }
.mrp-opt-name { display: block; font-size: 12px; color: #323233; word-break: break-all; }
.mrp-opt-meta { display: flex; flex-wrap: wrap; gap: 8px; font-size: 11px; color: #969799; margin-top: 2px; }
.mrp-opt-status { color: #1677ff; }

.mrp-sel { flex: 1; min-width: 0; height: 32px; font-size: 12px; color: #323233; border: 1px solid #dcdee0; border-radius: 6px; padding: 0 6px; background: #fff; }
.mrp-sel.small { flex: 0 0 88px; }
.mrp-qty, .mrp-unit { height: 32px; font-size: 12px; border: 1px solid #dcdee0; border-radius: 6px; padding: 0 8px; box-sizing: border-box; }
.mrp-qty { flex: 1; min-width: 0; }
/* 单位是固定值（PCS），做成不可编辑的灰底块：一眼看出「不用填」，也不会被误改 */
.mrp-unit { flex: 0 0 68px; display: inline-flex; align-items: center; justify-content: center; padding: 0; background: #f5f6f8; color: #646566; font-weight: 600; letter-spacing: .3px; }
.mrp-del { flex: 0 0 30px; height: 32px; border: 1px solid #ffd6d5; background: #fff; color: #e53935; border-radius: 6px; cursor: pointer; }
.mrp-add { margin-top: 8px; width: 100%; height: 32px; font-size: 12px; color: var(--color-primary, #1989fa); background: #fff; border: 1px dashed #b8d4ff; border-radius: 6px; cursor: pointer; }
.mrp-add:disabled { opacity: .5; cursor: not-allowed; }
</style>
