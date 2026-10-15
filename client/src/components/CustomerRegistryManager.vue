<template>
  <van-popup :show="show" position="bottom" round :style="{ height: '80%' }" @update:show="v => emit('update:show', v)">
    <div class="crm">
      <header class="crm-head">
        <span class="crm-title">客户名册管理</span>
        <span class="crm-total">名册共 {{ total }} 条</span>
        <span class="crm-close" @click="emit('update:show', false)">✕</span>
      </header>

      <!-- 为什么要有这一段提示：祥哥 2026-10-14 就是「找不到地方删」才来问的。
           根因是页面显示的是「并集」而不是一份能单独删的名单，必须写在界面上，
           否则下一个人还会以为「删了怎么又回来了」。 -->
      <p class="crm-tip">
        这里的名字来自 <b>名册 ∪ 客户物料 ∪ 报价的首次询价客户 ∪ 记事 ∪ 地图</b> 的并集。
        <br>· <b>无引用</b>的名字才能直接删；
        <br>· <b>有引用</b>的（说明源头某张表还写着它）请用「合并到…」改成正确全名 ——
        那样才会连报价/客户物料/记事/地图里的写法一起改掉，否则删了也会再冒出来。
      </p>

      <van-search v-model="keyword" placeholder="搜索名字" @update:model-value="load" />

      <div v-if="loading" class="crm-empty">加载中…</div>
      <div v-else-if="!rows.length" class="crm-empty">没有匹配的名字</div>

      <div v-else class="crm-list">
        <div v-for="row in rows" :key="row.name" class="crm-row">
          <div class="crm-row-top">
            <div class="crm-name">{{ row.name }}</div>
            <div class="crm-actions">
              <button class="mini" @click="openProfile(row)" title="填写账期 / 对账付款时间 / 备注">账期 ✎</button>
              <button class="mini" @click="startMerge(row)">合并到…</button>
              <button class="mini danger" :disabled="!row.deletable || row.has_profile"
                :title="row.has_profile ? '该客户填过账期/备注资料，删名册会连资料一起删；请先清空账期资料' : ''"
                @click="doDelete(row)">删除</button>
            </div>
          </div>
          <div class="crm-meta">
            <span class="tag">{{ sourceLabel(row.source) }}</span>
            <!-- 账期一列：客户主数据的集中地，方便逐户巡检；没填过的不显示，避免刷屏 -->
            <span v-if="row.payment_terms" class="terms">账期 {{ row.payment_terms }}</span>
            <span v-if="row.schedule && row.schedule.statement_date" class="terms"
              :class="{ warn: row.schedule.manual_expired || row.schedule.due_passed_days > 0 }">
              下次对账 {{ row.schedule.statement_date }}
            </span>
            <span v-if="row.has_profile" class="ref">有账期资料</span>
            <span v-if="row.refs.materials" class="ref">客户物料 {{ row.refs.materials }}</span>
            <span v-if="row.refs.quotes" class="ref">报价 {{ row.refs.quotes }}</span>
            <span v-if="row.refs.notes" class="ref">记事 {{ row.refs.notes }}</span>
            <span v-if="row.refs.map" class="ref">地图 {{ row.refs.map }}</span>
            <span v-if="row.ref_total === 0" class="ok">无引用，可直接删</span>
            <span v-if="row.created_at" class="time">{{ row.created_at }}</span>
          </div>

          <!-- 合并面板：先预览影响、再确认，绝不「点一下就改」 -->
          <div v-if="mergeFrom === row.name" class="crm-merge">
            <van-field v-model="mergeTo" placeholder="输入正确的全名，例如：深圳市国润聚源科技有限公司" clearable />
            <div v-if="suggestions.length" class="crm-sug">
              <span class="sug-label">可选：</span>
              <span v-for="s in suggestions" :key="s.name" class="sug" @click="mergeTo = s.name">{{ s.name }}</span>
            </div>
            <div v-if="preview" class="crm-preview">
              将改动 <b>{{ preview.total }}</b> 处：{{ previewText }}
              <div v-if="preview.conflicts.length" class="crm-conflict">⚠️ {{ preview.conflicts[0].reason }}</div>
            </div>
            <div class="crm-merge-btns">
              <button class="mini" :disabled="!mergeTo" @click="doPreview">预览影响</button>
              <button class="mini primary" :disabled="!mergeTo || (preview && preview.conflicts.length)" @click="doMerge">确认合并</button>
              <button class="mini" @click="cancelMerge">取消</button>
            </div>
          </div>
        </div>
      </div>

      <!-- 账期 / 对账付款资料编辑（与「客户物料」页头那条是同一个组件，口径不会两边不一致） -->
      <CustomerProfileEditor v-model:show="showProfile" :customer="profileCustomer" @saved="load" />
    </div>
  </van-popup>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { showConfirmDialog, showNotify, showSuccessToast } from 'vant'
import { fetchCustomerRegistry, previewCustomerMerge, mergeCustomerName, deleteCustomerName, suggestCustomers } from '../utils/api.js'
import CustomerProfileEditor from './CustomerProfileEditor.vue'

const props = defineProps({ show: Boolean })
const emit = defineEmits(['update:show', 'changed'])

const rows = ref([])
const total = ref(0)
const keyword = ref('')
const loading = ref(false)
const mergeFrom = ref('')
const mergeTo = ref('')
const preview = ref(null)
const suggestions = ref([])
// 账期资料编辑（名册管理里也能改 —— 客户主数据的集中地）
const showProfile = ref(false)
const profileCustomer = ref('')
function openProfile(row) {
  profileCustomer.value = row.name
  showProfile.value = true
}

const SOURCE_LABEL = {
  manual: '手工录入',
  excel: 'Excel 导入',
  sync: '启动回填',
  merge: '合并而来'
}
const sourceLabel = (s) => SOURCE_LABEL[s] || s || '未知'

const previewText = computed(() => {
  if (!preview.value) return ''
  return preview.value.tables.filter(t => t.count > 0).map(t => `${t.label} ${t.count}`).join('、') || '（没有来源引用）'
})

async function load() {
  loading.value = true
  try {
    const r = await fetchCustomerRegistry({ keyword: keyword.value.trim() })
    // ⚠️ api.js 的响应拦截器已经 return res.data ⇒ 这里拿到的就是响应体，
    //    候选在 r.data（**不是** r.data.data —— 多取一层恒为 undefined，名册会永远空白）
    rows.value = r.data || []
    total.value = r.registry_total || rows.value.length
  } catch (e) {
    showNotify({ type: 'danger', message: '读取名册失败：' + e.message })
    rows.value = []
  } finally {
    loading.value = false
  }
}

watch(() => props.show, (v) => { if (v) load() })

async function startMerge(row) {
  mergeFrom.value = row.name
  mergeTo.value = ''
  preview.value = null
  suggestions.value = []
  try {
    const r = await suggestCustomers(row.name)
    suggestions.value = (r.data || []).filter(s => s.name !== row.name).slice(0, 6)
  } catch { /* 联想拿不到不影响合并 */ }
}
function cancelMerge() {
  mergeFrom.value = ''
  mergeTo.value = ''
  preview.value = null
}

async function doPreview() {
  try {
    const r = await previewCustomerMerge(mergeFrom.value, mergeTo.value)
    preview.value = r.data
  } catch (e) {
    showNotify({ type: 'danger', message: e.message })
  }
}

async function doMerge() {
  try {
    await showConfirmDialog({
      title: '确认合并',
      message: `把「${mergeFrom.value}」的所有引用改成「${mergeTo.value}」？\n\n` +
        `会改：${previewText.value || '（请先点「预览影响」）'}\n` +
        '报价记录、客户物料、记事、地图客户里写着旧名字的地方都会一起改掉；记录本身不会删。',
      confirmButtonText: '确认合并',
      cancelButtonText: '再想想'
    })
  } catch { return }   // 用户取消
  try {
    const r = await mergeCustomerName(mergeFrom.value, mergeTo.value)
    showSuccessToast(r.msg || '已合并')
    cancelMerge()
    await load()
    emit('changed')
  } catch (e) {
    showNotify({ type: 'danger', message: e.message, duration: 6000 })
  }
}

async function doDelete(row) {
  if (!row.deletable) {
    const d = Object.entries(row.refs).filter(([, v]) => v > 0)
      .map(([k, v]) => `${({ materials: '客户物料', quotes: '报价', notes: '记事', map: '地图客户' })[k] || k} ${v} 条`).join('、')
    showNotify({ type: 'warning', message: `「${row.name}」还在被引用（${d}），不能只从名册删。请用「合并到…」改成正确全名。`, duration: 6000 })
    return
  }
  try {
    await showConfirmDialog({
      title: '确认删除',
      message: `从名册里删除「${row.name}」？\n\n它没有任何来源引用，删了就彻底不在了（这个操作不可撤销）。`,
      confirmButtonText: '删除',
      cancelButtonText: '取消'
    })
  } catch { return }
  try {
    const r = await deleteCustomerName(row.name)
    showSuccessToast(r.msg || '已删除')
    await load()
    emit('changed')
  } catch (e) {
    showNotify({ type: 'danger', message: e.message, duration: 6000 })
  }
}

// 供验证脚本/自动化用：把内部动作挂到 window，便于 CDP 直接驱动
// （不这么做就只能靠点 DOM，而名册弹窗里的按钮没有稳定类名可点）
defineExpose({ load, startMerge, doPreview, doMerge })
if (typeof window !== 'undefined') window.__customerRegistry = { load, startMerge, doPreview, doMerge, doDelete, rows, preview }
</script>

<style scoped>
.crm { display: flex; flex-direction: column; height: 100%; }
.crm-head { display: flex; align-items: center; gap: 8px; padding: 14px 16px 6px; }
.crm-title { font-size: 16px; font-weight: 600; color: #323233; }
.crm-total { font-size: 12px; color: #969799; }
.crm-close { margin-left: auto; color: #969799; font-size: 16px; padding: 2px 6px; cursor: pointer; }
.crm-tip { margin: 0 16px 4px; padding: 8px 10px; font-size: 11px; line-height: 1.6; color: #6b7280; background: #f7f8fa; border-radius: 8px; }
.crm-tip b { color: #323233; }
.crm-empty { padding: 30px; text-align: center; color: #969799; font-size: 13px; }
.crm-list { flex: 1; overflow-y: auto; padding: 0 12px 20px; }
.crm-row { padding: 10px 6px; border-bottom: 1px solid #f2f3f5; }
.crm-row-top { display: flex; align-items: flex-start; gap: 8px; }
.crm-name { flex: 1; font-size: 13px; color: #323233; word-break: break-all; line-height: 1.5; }
.crm-actions { display: flex; gap: 6px; flex-shrink: 0; }
.mini { border: 1px solid #dcdee0; background: #fff; color: #323233; font-size: 11px; padding: 3px 8px; border-radius: 6px; cursor: pointer; }
.mini:hover { border-color: var(--color-primary, #1989fa); color: var(--color-primary, #1989fa); }
.mini:disabled { opacity: .45; cursor: not-allowed; }
.mini.danger { color: #e53935; border-color: #ffd6d5; }
.mini.primary { background: var(--color-primary, #1989fa); border-color: var(--color-primary, #1989fa); color: #fff; }
.crm-meta { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; font-size: 11px; color: #969799; align-items: center; }
.crm-meta .tag { background: #eef4ff; color: #3b7ddd; border-radius: 4px; padding: 1px 5px; }
.crm-meta .ref { color: #e08a00; }
.crm-meta .ok { color: #07c160; }
.crm-meta .terms { color: #1a6fb0; background: #f0f7ff; border-radius: 4px; padding: 1px 5px; }
.crm-meta .terms.warn { color: #e53935; background: #fff1f0; }
.crm-meta .time { color: #c8c9cc; margin-left: auto; }
.crm-merge { margin-top: 8px; padding: 8px; background: #f7f8fa; border-radius: 8px; }
.crm-sug { margin-top: 6px; font-size: 11px; color: #969799; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.crm-sug .sug { background: #fff; border: 1px solid #e5e6eb; border-radius: 4px; padding: 2px 6px; cursor: pointer; color: #323233; }
.crm-preview { margin-top: 6px; font-size: 11px; color: #323233; }
.crm-conflict { color: #e53935; margin-top: 4px; }
.crm-merge-btns { display: flex; gap: 6px; margin-top: 8px; }
</style>
