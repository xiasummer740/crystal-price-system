<template>
  <div class="mkb">
    <div v-if="loading" class="mkb-empty">加载中…</div>
    <div v-else class="mkb-cols">
      <div v-for="st in statusOrder" :key="st" class="mkb-col">
        <div class="mkb-col-head" :style="{ borderTopColor: colorOf(st) }">
          <span class="mkb-col-name">{{ st }}</span>
          <span class="mkb-col-count">{{ grouped[st]?.length || 0 }}</span>
        </div>
        <div class="mkb-cards">
          <div v-if="!(grouped[st] || []).length" class="mkb-none">—</div>
          <!-- 卡片点击 → 打开编辑弹窗（**不做拖拽改状态**：误拖会直接改真实数据） -->
          <div v-for="it in grouped[st] || []" :key="it.id" class="mkb-card" @click="emit('open', it)">
            <div class="mkb-name" :title="it.material_name">{{ it.material_name || '（未命名物料）' }}</div>
            <div class="mkb-meta">
              <span v-if="!hideCustomer" class="mkb-cust" :title="it.customer">{{ it.customer || '未指定客户' }}</span>
              <span v-if="it.jkx_code" class="mkb-code">{{ it.jkx_code }}</span>
            </div>
            <div class="mkb-foot">
              <span v-if="it.price" class="mkb-price">¥{{ it.price }}</span>
              <span class="mkb-dwell" :class="dwellClass(it)" :title="dwellTitle(it)">
                {{ it.dwell_days != null ? it.dwell_days + ' 天' : '—' }}{{ it.dwell_exact ? '' : '*' }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
    <p class="mkb-tip">
      列顺序取自服务端的物料状态清单（不是前端写死）；<b>*</b> 表示「按上次改动估算」（该物料还没有状态变更记录）。
      点卡片可打开编辑；<b>不支持拖拽改状态</b> —— 避免误拖把真实数据改了。
    </p>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  items: { type: Array, default: () => [] },
  statusOrder: { type: Array, default: () => [] },
  statusConfig: { type: Object, default: () => ({}) },
  loading: Boolean,
  hideCustomer: Boolean
})
const emit = defineEmits(['open'])

const grouped = computed(() => {
  const g = {}
  for (const it of props.items || []) {
    const s = String(it.status || '').trim() || '（未设状态）'
    ;(g[s] = g[s] || []).push(it)
  }
  // 每组里停留久的排前面 —— 看板的意义就是「哪一步卡住了」
  for (const k of Object.keys(g)) g[k].sort((a, b) => (b.dwell_days ?? -1) - (a.dwell_days ?? -1))
  return g
})
const colorOf = (st) => props.statusConfig[st]?.color || '#8c8c8c'
const dwellClass = (it) => {
  const d = it.dwell_days ?? 0
  if (it.is_terminal) return 'done'
  if (d >= 60) return 'red'
  if (d >= 30) return 'orange'
  return 'grey'
}
const dwellTitle = (it) => it.dwell_exact
  ? `自 ${it.dwell_from}（状态变更）算起`
  : `自 ${it.dwell_from}（上次改动）估算 —— 该物料还没有状态变更记录`
</script>

<style scoped>
.mkb { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.mkb-empty { padding: 40px; text-align: center; color: #969799; }
.mkb-cols { flex: 1; display: flex; gap: 10px; overflow-x: auto; padding: 10px 16px 0; min-height: 0; }
.mkb-col { flex: 1 0 210px; display: flex; flex-direction: column; min-height: 0; background: #f7f8fa; border-radius: 10px; }
.mkb-col-head { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-top: 3px solid #ccc; border-radius: 10px 10px 0 0; background: #fff; }
.mkb-col-name { font-size: 13px; font-weight: 600; color: #323233; }
.mkb-col-count { margin-left: auto; font-size: 12px; color: #969799; }
.mkb-cards { flex: 1; overflow-y: auto; padding: 8px; }
.mkb-none { padding: 10px; text-align: center; color: #c8c9cc; font-size: 12px; }
.mkb-card { background: #fff; border: 1px solid #ebedf0; border-radius: 8px; padding: 8px; margin-bottom: 8px; cursor: pointer; transition: box-shadow .15s; }
.mkb-card:hover { box-shadow: 0 2px 10px rgba(0,0,0,.08); }
.mkb-name { font-size: 12px; color: #323233; line-height: 1.5; word-break: break-all; }
.mkb-meta { margin-top: 4px; display: flex; flex-wrap: wrap; gap: 6px; font-size: 11px; color: #969799; }
.mkb-cust { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mkb-code { color: #576b95; }
.mkb-foot { margin-top: 6px; display: flex; align-items: center; gap: 8px; font-size: 11px; }
.mkb-price { color: #e53935; }
.mkb-dwell { margin-left: auto; padding: 0 5px; border-radius: 4px; }
.mkb-dwell.grey { color: #969799; background: #f2f3f5; }
.mkb-dwell.orange { color: #fa8c16; background: #fff7e6; }
.mkb-dwell.red { color: #e53935; background: #fff1f0; }
.mkb-dwell.done { color: #52c41a; background: #f6ffed; }
.mkb-tip { flex-shrink: 0; margin: 8px 16px 10px; font-size: 11px; color: #969799; line-height: 1.7; }
</style>
