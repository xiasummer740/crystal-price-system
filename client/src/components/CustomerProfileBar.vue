<template>
  <!-- 客户账期条：显示在「客户物料」页头（选中客户那一行）。
       **显示与入口是同一处** —— 点整条即可编辑，免得用户「看得到账期却找不到哪儿改」。 -->
  <div v-if="customer" class="cpb" :class="tone" :title="tooltip" @click="open = true">
    <template v-if="!loaded">
      <span class="cpb-dim">账期读取中…</span>
    </template>
    <template v-else-if="!hasAny">
      <span class="cpb-dim">未设置账期</span>
      <span class="cpb-edit">✎ 点击填写</span>
    </template>
    <template v-else>
      <span v-if="data.payment_terms" class="cpb-terms">账期 {{ data.payment_terms }}</span>
      <span v-if="scheduleText" class="cpb-sched">{{ scheduleText }}</span>
      <span v-if="dueText" class="cpb-due">{{ dueText }}</span>
      <span v-if="data.pay_remark" class="cpb-remark" :title="data.pay_remark">📝 {{ data.pay_remark }}</span>
      <span class="cpb-edit">✎</span>
    </template>
  </div>

  <!-- ⚠️ 编辑面板必须放在上面那个可点击 div 的**外面**（同级，不是子元素）：
       放里面时，面板里的点击（✕ / 保存）会冒泡到 `.cpb` 的打开逻辑 ⇒ 面板关不掉、保存后又弹回来。
       试过在 van-popup 上加 @click.stop —— **无效**：Vant Popup 是多根节点组件，
       透传的监听器没有落点（Vue 会警告 Extraneous non-emits event listeners）。结构性隔离才可靠。
       面板是 fixed 定位，放在页头 flex 里不影响布局。 -->
  <CustomerProfileEditor v-if="customer" v-model:show="open" :customer="customer" @saved="onSaved" />
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { fetchCustomerProfile } from '../utils/api.js'
import CustomerProfileEditor from './CustomerProfileEditor.vue'

const props = defineProps({
  customer: { type: String, default: '' }
})
const emit = defineEmits(['loaded'])

const data = ref(null)
const loaded = ref(false)
const open = ref(false)

async function load() {
  if (!props.customer) { data.value = null; loaded.value = false; return }
  loaded.value = false
  try {
    const r = await fetchCustomerProfile(props.customer)
    data.value = r.data || {}
  } catch {
    data.value = {}
  } finally {
    loaded.value = true
    emit('loaded', data.value)
  }
}
watch(() => props.customer, load, { immediate: true })

const hasAny = computed(() => {
  const d = data.value || {}
  return !!(d.payment_terms || d.pay_remark || d.statement_day > 0 || d.payment_days > 0 || d.next_statement_date)
})
const schedule = computed(() => data.value?.schedule || {})

/** 到期口气：手填日期过期=红；距对账 ≤7 天=橙；其余灰。应付日已过也标红（只报事实，不判定他付没付） */
const tone = computed(() => {
  const s = schedule.value
  if (!s.has_schedule) return 'grey'
  if (s.manual_expired) return 'red'
  if (s.due_date && s.due_passed_days > 0) return 'red'
  if (s.days_left != null && s.days_left <= 7) return 'orange'
  return 'grey'
})

const scheduleText = computed(() => {
  const s = schedule.value
  if (!s.has_schedule) return ''
  const when = s.days_left > 0 ? `剩 ${s.days_left} 天` : (s.days_left === 0 ? '就是今天' : '已过期')
  const tag = s.manual ? '手动指定 · ' : ''
  if (s.manual_expired) return `⚠️ 下次对账 ${s.statement_date}（手动指定，已过期 ${Math.abs(s.days_left)} 天，请更新）`
  return `下次对账 ${s.statement_date}（${tag}${when}）`
})
const dueText = computed(() => {
  const s = schedule.value
  if (!s.due_date) return ''
  return s.due_passed_days > 0 ? `应付 ${s.due_date} ⚠️ 已过 ${s.due_passed_days} 天` : `应付 ${s.due_date}`
})
const tooltip = computed(() => {
  const d = data.value || {}
  const bits = []
  if (d.payment_terms) bits.push(`账期：${d.payment_terms}`)
  if (d.statement_day > 0) bits.push(`每月 ${d.statement_day} 号对账`)
  if (d.payment_days > 0) bits.push(`对账后 ${d.payment_days} 天付款`)
  if (d.next_statement_date) bits.push(`手填下次对账日：${d.next_statement_date}`)
  if (d.schedule?.due_date) bits.push(`应付日：${d.schedule.due_date}`)
  if (d.pay_remark) bits.push(`备注：${d.pay_remark}`)
  return bits.length ? bits.join('\n') + '\n（点击修改）' : '点击填写账期 / 对账付款时间 / 备注'
})

function onSaved(payload) {
  if (payload) data.value = payload
  else load()
}
defineExpose({ reload: load })
</script>

<style scoped>
/* 页头里的一条：低调、不抢「客户」选择框的注意力，但信息密度高 */
.cpb {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  height: 30px;
  margin: 0 12px;
  padding: 0 10px;
  border-radius: 6px;
  background: #f7f8fa;
  border: 1px dashed #e5e6eb;
  font-size: 12px;
  color: #646566;
  cursor: pointer;
  overflow: hidden;
  white-space: nowrap;
  transition: background .15s, border-color .15s;
}
.cpb:hover { background: #fff; border-color: var(--color-primary); }
.cpb.grey { color: #646566; }
.cpb.orange { color: #fa8c16; background: #fff7e6; border-color: #ffd591; }
.cpb.red { color: #e53935; background: #fff1f0; border-color: #ffccc7; }
.cpb-dim { color: #a8abb2; }
.cpb-terms { font-weight: 600; }
.cpb-sched { color: inherit; }
.cpb-due { color: inherit; }
.cpb-remark { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; color: #8c8c8c; }
.cpb-edit { margin-left: auto; color: #969799; flex-shrink: 0; }
</style>
