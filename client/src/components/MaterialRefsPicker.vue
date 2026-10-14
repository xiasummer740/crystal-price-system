<template>
  <div class="mrp">
    <div class="mrp-head">
      <span class="mrp-title">关联物料</span>
      <span class="mrp-hint">（记「某物料下单/备货/送样多少」时挂上它，物料进展里就能看到这条记事）</span>
    </div>

    <div v-if="!customer" class="mrp-note">先选客户，才能挑这家客户的物料。</div>
    <template v-else>
      <div v-if="loading" class="mrp-note">加载该客户的物料…</div>
      <div v-else-if="!options.length" class="mrp-note">这家客户还没有客户物料记录（先去「客户物料」页建）。</div>

      <div v-for="(row, i) in rows" :key="i" class="mrp-row">
        <div class="mrp-line">
          <select class="mrp-sel" v-model="row.material_id" @change="onPick(i)">
            <option :value="0">— 选择物料 —</option>
            <option v-for="m in options" :key="m.id" :value="m.id">{{ label(m) }}</option>
          </select>
          <button class="mrp-del" title="删掉这一行" @click="removeRow(i)">✕</button>
        </div>
        <div class="mrp-line">
          <select class="mrp-sel small" v-model="row.action">
            <option v-for="a in ACTIONS" :key="a" :value="a">{{ a }}</option>
          </select>
          <input class="mrp-qty" v-model="row.quantity" placeholder="数量" />
          <input class="mrp-unit" v-model="row.unit" placeholder="单位" />
        </div>
      </div>

      <button class="mrp-add" :disabled="!options.length" @click="addRow">＋ 添加物料</button>
    </template>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { fetchMaterials } from '../utils/api.js'

// 动作清单：祥哥 2026-10-14 提的场景是「下单多少、备货多少、什么物料要送样品」
const ACTIONS = ['下单', '备货', '送样', '报价', '其它']

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  customer: { type: String, default: '' }
})
const emit = defineEmits(['update:modelValue'])

const options = ref([])
const loading = ref(false)
// 内部维护一份可编辑行；对外的 modelValue 只收「选了物料」的行（空行不往上传）
const rows = ref([])

function label(m) {
  const parts = [m.material_name || '（未命名物料）']
  if (m.jkx_code) parts.push(`晶科鑫 ${m.jkx_code}`)
  if (m.customer_code) parts.push(`客户编码 ${m.customer_code}`)
  return parts.join(' · ')
}

function fromModel(v) {
  rows.value = (Array.isArray(v) ? v : []).map(r => ({
    material_id: Number(r?.material_id) || 0,
    action: ACTIONS.includes(r?.action) ? r.action : '下单',
    quantity: String(r?.quantity ?? ''),
    unit: String(r?.unit || ''),
    name: r?.name || '', jkx_code: r?.jkx_code || '', material_code: r?.material_code || '', customer_code: r?.customer_code || ''
  }))
}
fromModel(props.modelValue)

/** 行内选项变了 → 把物料快照字段补齐，再往上传 */
function sync() {
  const out = rows.value
    .filter(r => Number(r.material_id) > 0)
    .map(r => {
      const m = options.value.find(x => Number(x.id) === Number(r.material_id))
      return {
        material_id: Number(r.material_id),
        // 快照：物料以后改名/被删，这条记事仍看得懂记的是哪个料
        name: m?.material_name || r.name || '',
        jkx_code: m?.jkx_code || r.jkx_code || '',
        material_code: m?.material_code || r.material_code || '',
        customer_code: m?.customer_code || r.customer_code || '',
        action: r.action || '下单',
        quantity: String(r.quantity || '').trim(),
        unit: String(r.unit || '').trim()
      }
    })
  emit('update:modelValue', out)
}
function onPick() { sync() }
function addRow() {
  rows.value.push({ material_id: 0, action: '下单', quantity: '', unit: '' })
}
function removeRow(i) {
  rows.value.splice(i, 1)
  sync()
}

// 客户变了 → 重新拉该客户的物料；已经选过的行保留（等新列表回来后按 id 重新匹配）
watch(() => props.customer, async (c) => {
  if (!c) { options.value = []; return }
  loading.value = true
  try {
    const r = await fetchMaterials({ customer: c, pageSize: 500 })
    options.value = r.data?.list || r.data || []
  } catch {
    options.value = []
  } finally {
    loading.value = false
  }
}, { immediate: true })

// 外部塞进来的初值（编辑记事时）—— 只在长度/内容真的不同时同步，避免把用户正在输的清掉
watch(() => props.modelValue, (v) => {
  const a = JSON.stringify((v || []).map(x => [x.material_id, x.action, x.quantity, x.unit]))
  const b = JSON.stringify(rows.value.filter(r => r.material_id > 0).map(x => [x.material_id, x.action, x.quantity, x.unit]))
  if (a !== b) fromModel(v)
})

// ⚠️ 任何一处改动都要往上传 —— 只靠「选物料时同步」会丢掉后填的动作/数量/单位。
//    2026-10-14 真机验证抓到的真缺陷：选了物料、填了「下单 5000」，存进去只有「下单」，
//    数量 5000 丢了（时间线和记事详情都显示不出数量）。
//    用 deep watch 统一处理：改动作、改数量、改单位都会触发。
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
.mrp-sel { flex: 1; min-width: 0; height: 32px; font-size: 12px; color: #323233; border: 1px solid #dcdee0; border-radius: 6px; padding: 0 6px; background: #fff; }
.mrp-sel.small { flex: 0 0 88px; }
.mrp-qty, .mrp-unit { height: 32px; font-size: 12px; border: 1px solid #dcdee0; border-radius: 6px; padding: 0 8px; }
.mrp-qty { flex: 1; min-width: 0; }
.mrp-unit { flex: 0 0 68px; }
.mrp-del { flex: 0 0 30px; height: 32px; border: 1px solid #ffd6d5; background: #fff; color: #e53935; border-radius: 6px; cursor: pointer; }
.mrp-add { margin-top: 8px; width: 100%; height: 32px; font-size: 12px; color: var(--color-primary, #1989fa); background: #fff; border: 1px dashed #b8d4ff; border-radius: 6px; cursor: pointer; }
.mrp-add:disabled { opacity: .5; cursor: not-allowed; }
</style>
