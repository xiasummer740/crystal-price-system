<template>
  <van-popup :show="show" position="bottom" round :style="{ height: '86%' }" @update:show="v => emit('update:show', v)">
    <div class="mtl">
      <header class="mtl-head">
        <div class="mtl-title">物料进展</div>
        <div class="mtl-close" @click="emit('update:show', false)">✕</div>
      </header>

      <div v-if="loading" class="mtl-empty">加载中…</div>
      <div v-else-if="!data" class="mtl-empty">读不到这条物料</div>

      <template v-else>
        <!-- 抬头：这条物料是谁的、当前走到哪一步 -->
        <div class="mtl-card">
          <div class="mtl-name">{{ data.material.material_name || '（未填物料名称）' }}</div>
          <div class="mtl-sub">
            <span class="mtl-cust">👤 {{ data.material.customer || '未指定客户' }}</span>
            <span v-if="data.material.jkx_code" class="mtl-code">晶科鑫 {{ data.material.jkx_code }}</span>
            <span v-if="data.material.customer_code" class="mtl-code">客户编码 {{ data.material.customer_code }}</span>
          </div>
          <div class="mtl-now">
            <span class="mtl-status" :style="{ background: statusColor(data.material.status) }">{{ data.material.status || '未设状态' }}</span>
            <span v-if="data.material.price" class="mtl-price">报价 {{ data.material.price }}</span>
            <span v-if="data.material.cost_price" class="mtl-price">成本 {{ data.material.cost_price }}</span>
          </div>
          <div class="mtl-stats">
            共 {{ data.stats.total }} 条 ·
            <span v-if="data.stats.quotes">报价 {{ data.stats.quotes }} 次 ·</span>
            <span v-if="data.stats.samples">送样 {{ data.stats.samples }} 次 ·</span>
            <span v-if="data.stats.notes">关联记事 {{ data.stats.notes }} 条 ·</span>
            流水 {{ data.stats.events }} 条
            <template v-if="data.stats.first_seen_at"><br>最早可追到 {{ data.stats.first_seen_at }}</template>
          </div>
        </div>

        <!-- 时间线：只放这个物料自己的事实（报价/改价/送样/规格书/状态流转/被关联的记事）。
             祥哥 2026-10-14 明确要求：**客户级记事不进这里**，只有他主动关联过的记事才出现在下面。 -->
        <div v-if="!data.items.length" class="mtl-empty">还没有任何进展记录</div>
        <div v-else class="mtl-list">
          <div v-for="(it, i) in data.items" :key="i" class="mtl-item" :class="{ clickable: it.kind === 'note' }" @click="onItemClick(it)">
            <div class="mtl-dot" :style="{ background: kindColor(it) }"></div>
            <div class="mtl-body">
              <div class="mtl-line">
                <span class="mtl-tag" :style="{ color: kindColor(it), borderColor: kindColor(it) }">{{ tagOf(it) }}</span>
                <span class="mtl-text">{{ labelOf(it) }}</span>
              </div>
              <div class="mtl-time">
                {{ it.at || '时间未知' }}
                <span v-if="it.kind === 'note'" class="mtl-go">点开这条记事 ›</span>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </van-popup>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { showNotify } from 'vant'
import { fetchMaterialTimeline, getMaterialStatusConfig } from '../utils/api.js'

// 状态色的**唯一来源在服务端**（前端不抄一份，否则服务端加了新状态这里就静默不对色）
const statusConfig = ref({})
onMounted(async () => {
  try {
    const r = await getMaterialStatusConfig()
    statusConfig.value = r.data || {}
  } catch { /* 拿不到就用中性灰兜底，不影响时间线内容 */ }
})

const props = defineProps({
  show: Boolean,
  materialId: { type: Number, default: 0 }
})
const emit = defineEmits(['update:show'])
const router = useRouter()

const data = ref(null)
const loading = ref(false)

const KIND_COLOR = {
  created: '#8c8c8c',
  status: '#722ed1',
  price: '#fa8c16',
  cost_price: '#fa8c16',
  quote: '#1677ff',
  price_log: '#fa8c16',
  sample: '#13c2c2',
  spec: '#52c41a',
  note: '#d48806'
}
const kindColor = (it) => KIND_COLOR[it.kind === 'event' ? it.type : it.kind] || '#8c8c8c'
const statusColor = (s) => statusConfig.value[s]?.color || '#8c8c8c'

const SOURCE_TAG = {
  created: '建档', status: '状态流转', price: '报价变化', cost_price: '成本变化', spec: '规格书',
  code: '编码变更', customer: '客户变更', factory: '工厂变更',
  quote: '报价', price_log: '改价', sample: '送样', note: '记事'
}
const tagOf = (it) => SOURCE_TAG[it.kind === 'event' ? it.type : it.kind] || '进展'

/** 一行说清「发生了什么」——带 old→new 的都要把两边都显示出来 */
function labelOf(it) {
  const arrow = (a, b) => (a || b) ? `${a || '（空）'} → ${b || '（空）'}` : ''
  if (it.kind === 'event') {
    switch (it.type) {
      case 'created': return `建档（状态 ${it.new_value || '未设'}）`
      case 'status': return `状态：${arrow(it.old_value, it.new_value)}`
      case 'price': return `报价：${arrow(it.old_value, it.new_value)}`
      case 'cost_price': return `成本价：${arrow(it.old_value, it.new_value)}`
      case 'spec': return it.new_value ? '上传了规格书' : '移除了规格书'
      case 'code': return `${it.field === 'jkx_code' ? '晶科鑫料号' : it.field === 'customer_code' ? '客户物料编码' : '物料编码'}：${arrow(it.old_value, it.new_value)}`
      case 'customer': return `客户：${arrow(it.old_value, it.new_value)}`
      case 'factory': return `工厂：${arrow(it.old_value, it.new_value)}`
      default: return `${it.field || '字段'}：${arrow(it.old_value, it.new_value)}`
    }
  }
  if (it.kind === 'quote') return `报价 ${it.new_value || '（未填价格）'}${it.note ? ' · ' + it.note : ''}`
  if (it.kind === 'price_log') return `${it.note || it.field}：${arrow(it.old_value, it.new_value)}`
  if (it.kind === 'sample') return it.note || '送样登记'
  if (it.kind === 'spec') return it.note || '规格书已归档'
  if (it.kind === 'note') return it.note || '关联记事'
  return it.note || ''
}

async function load() {
  if (!props.materialId) return
  loading.value = true
  data.value = null
  try {
    const r = await fetchMaterialTimeline(props.materialId)
    data.value = r.data
  } catch (e) {
    showNotify({ type: 'danger', message: '读取进展失败：' + e.message })
  } finally {
    loading.value = false
  }
}
watch(() => props.show, (v) => { if (v) load() })
watch(() => props.materialId, () => { if (props.show) load() })

// 关联记事可点开 —— 只有显式关联过的那条会在列表里
function onItemClick(it) {
  if (it.kind !== 'note' || !it.ref_id) return
  emit('update:show', false)
  router.push(`/notes/${it.ref_id}`)
}
</script>

<style scoped>
.mtl { display: flex; flex-direction: column; height: 100%; }
.mtl-head { display: flex; align-items: center; padding: 14px 16px 4px; }
.mtl-title { font-size: 16px; font-weight: 600; color: #323233; }
.mtl-close { margin-left: auto; color: #969799; font-size: 16px; padding: 2px 6px; cursor: pointer; }
.mtl-empty { padding: 30px; text-align: center; color: #969799; font-size: 13px; }
.mtl-card { margin: 0 16px 8px; padding: 12px; background: #f7f8fa; border-radius: 10px; }
.mtl-name { font-size: 14px; color: #323233; font-weight: 600; line-height: 1.5; word-break: break-all; }
.mtl-sub { margin-top: 4px; font-size: 11px; color: #969799; display: flex; flex-wrap: wrap; gap: 8px; }
.mtl-now { margin-top: 8px; display: flex; align-items: center; gap: 10px; }
.mtl-status { color: #fff; font-size: 11px; padding: 2px 8px; border-radius: 10px; }
.mtl-price { font-size: 12px; color: #323233; }
.mtl-stats { margin-top: 8px; font-size: 11px; color: #969799; line-height: 1.7; }
.mtl-list { flex: 1; overflow-y: auto; padding: 4px 16px 24px; }
.mtl-item { display: flex; gap: 10px; padding: 10px 0; border-bottom: 1px solid #f2f3f5; }
.mtl-item.clickable { cursor: pointer; }
.mtl-item.clickable:hover { background: #fafafa; }
.mtl-dot { width: 8px; height: 8px; border-radius: 50%; margin-top: 6px; flex-shrink: 0; }
.mtl-body { flex: 1; min-width: 0; }
.mtl-line { display: flex; align-items: baseline; gap: 6px; flex-wrap: wrap; }
.mtl-tag { font-size: 10px; border: 1px solid; border-radius: 4px; padding: 0 4px; flex-shrink: 0; }
.mtl-text { font-size: 13px; color: #323233; word-break: break-all; }
.mtl-time { margin-top: 2px; font-size: 11px; color: #c8c9cc; }
.mtl-go { color: var(--color-primary, #1989fa); margin-left: 6px; }
</style>
