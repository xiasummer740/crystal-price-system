<template>
  <van-popup :show="show" position="bottom" round :style="{ height: '80%' }" @update:show="v => emit('update:show', v)">
    <div class="st">
      <header class="st-head">
        <span class="st-title">待跟进（超期提醒）</span>
        <span class="st-count" v-if="enabled">超期 {{ data?.count || 0 }} 项</span>
        <span class="st-close" @click="emit('update:show', false)">✕</span>
      </header>

      <!-- 设置：默认**不提醒**（阈值全 0），由用户自己定各阶段多少天算超期 -->
      <div class="st-cfg">
        <div class="st-cfg-row">
          <label class="st-switch">
            <input type="checkbox" v-model="enabled" /> 启用超期提醒
          </label>
          <span class="st-hint">不启用时只显示「停留天数」，不会标红</span>
        </div>
        <div class="st-thresholds">
          <div v-for="st in statusOrder" :key="st" class="st-th">
            <span class="st-th-name" :style="{ color: colorOf(st) }">{{ st }}</span>
            <input class="st-th-input" type="number" min="0" step="5" v-model.number="thresholds[st]" :disabled="st === terminal" />
            <span class="st-th-unit">天</span>
          </div>
          <div class="st-th st-th-note">
            <span>「{{ terminal }}」是终态，不参与提醒；填 0 = 该阶段不提醒</span>
          </div>
        </div>
        <div class="st-cfg-actions">
          <button class="st-btn primary" :disabled="saving" @click="save">{{ saving ? '保存中…' : '保存设置' }}</button>
          <button class="st-btn" :disabled="loading" @click="load">刷新</button>
        </div>
      </div>

      <!-- 清单 -->
      <div v-if="loading" class="st-empty">加载中…</div>
      <div v-else-if="!enabled" class="st-empty">超期提醒未启用 —— 勾选上面的开关并填好阈值，就能看到该跟进的物料。</div>
      <div v-else-if="!data?.list?.length" class="st-empty">当前没有超期物料 🎉</div>
      <div v-else class="st-list">
        <div v-for="it in data.list" :key="it.id" class="st-row" @click="emit('open', it)">
          <div class="st-row-main">
            <div class="st-name">{{ it.material_name || '（未命名物料）' }}</div>
            <div class="st-meta">
              <span class="st-cust">{{ it.customer || '未指定客户' }}</span>
              <span v-if="it.jkx_code" class="st-code">晶科鑫 {{ it.jkx_code }}</span>
              <span class="st-status" :style="{ color: colorOf(it.status) }">{{ it.status }}</span>
            </div>
          </div>
          <div class="st-days">
            <b>{{ it.dwell_days }}</b> 天
            <div class="st-days-sub">阈值 {{ it.threshold }} 天{{ it.dwell_exact ? ' · 精确' : ' · 估算' }}</div>
            <div class="st-days-from">自 {{ (it.dwell_from || '').slice(0, 10) }}</div>
          </div>
        </div>
      </div>
    </div>
  </van-popup>
</template>

<script setup>
import { ref, watch } from 'vue'
import { showNotify, showSuccessToast } from 'vant'
import { fetchStaleMaterials, saveAppSettings } from '../utils/api.js'

const props = defineProps({
  show: Boolean,
  statusOrder: { type: Array, default: () => [] },
  statusConfig: { type: Object, default: () => ({}) }
})
const emit = defineEmits(['update:show', 'open', 'changed'])

const data = ref(null)
const loading = ref(false)
const saving = ref(false)
const enabled = ref(false)
const thresholds = ref({})
const terminal = ref('下批量')
const colorOf = (st) => props.statusConfig[st]?.color || '#8c8c8c'

async function load() {
  loading.value = true
  try {
    const r = await fetchStaleMaterials()
    const d = r.data || {}
    data.value = d
    terminal.value = d.terminal_status || '下批量'
    // ⚠️ 服务端存的阈值是权威值；本地按状态清单补齐缺失项（新加了状态也要有输入框）
    enabled.value = !!d.enabled
    const th = { ...(d.thresholds || {}) }
    for (const st of props.statusOrder) if (th[st] === undefined) th[st] = 0
    thresholds.value = th
  } catch (e) {
    showNotify({ type: 'danger', message: '读取待跟进失败：' + e.message })
  } finally {
    loading.value = false
  }
}
watch(() => props.show, (v) => { if (v) load() })

async function save() {
  saving.value = true
  try {
    const payload = { enabled: !!enabled.value, thresholds: {} }
    for (const [k, v] of Object.entries(thresholds.value || {})) payload.thresholds[k] = Math.max(0, Number(v) || 0)
    // app_settings 存字符串；material_stale 这个键由服务端读（utils/materialDwell.readStaleSettings）
    await saveAppSettings({ material_stale: JSON.stringify(payload) })
    showSuccessToast('已保存')
    emit('changed')
    await load()
  } catch (e) {
    showNotify({ type: 'danger', message: '保存失败：' + e.message })
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.st { display: flex; flex-direction: column; height: 100%; }
.st-head { display: flex; align-items: center; gap: 8px; padding: 14px 16px 6px; }
.st-title { font-size: 16px; font-weight: 600; color: #323233; }
.st-count { font-size: 12px; color: #e53935; }
.st-close { margin-left: auto; color: #969799; font-size: 16px; padding: 2px 6px; cursor: pointer; }
.st-cfg { margin: 0 16px 8px; padding: 10px; background: #f7f8fa; border-radius: 8px; }
.st-cfg-row { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.st-switch { font-size: 13px; color: #323233; display: flex; align-items: center; gap: 6px; cursor: pointer; }
.st-hint { font-size: 11px; color: #969799; }
.st-thresholds { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
.st-th { display: flex; align-items: center; gap: 4px; font-size: 12px; color: #323233; }
.st-th-name { font-weight: 600; }
.st-th-input { width: 62px; height: 28px; font-size: 12px; border: 1px solid #dcdee0; border-radius: 6px; padding: 0 6px; text-align: right; }
.st-th-input:disabled { background: #f2f3f5; color: #c8c9cc; }
.st-th-unit { color: #969799; }
.st-th-note { font-size: 11px; color: #969799; }
.st-cfg-actions { margin-top: 10px; display: flex; gap: 8px; }
.st-btn { height: 30px; padding: 0 14px; font-size: 12px; border: 1px solid #dcdee0; background: #fff; border-radius: 6px; cursor: pointer; color: #323233; }
.st-btn.primary { background: var(--color-primary, #1989fa); border-color: var(--color-primary, #1989fa); color: #fff; }
.st-btn:disabled { opacity: .6; cursor: not-allowed; }
.st-empty { padding: 30px; text-align: center; color: #969799; font-size: 13px; }
.st-list { flex: 1; overflow-y: auto; padding: 0 16px 20px; }
.st-row { display: flex; gap: 10px; padding: 10px 0; border-bottom: 1px solid #f2f3f5; cursor: pointer; }
.st-row:hover { background: #fafafa; }
.st-row-main { flex: 1; min-width: 0; }
.st-name { font-size: 13px; color: #323233; word-break: break-all; }
.st-meta { margin-top: 3px; display: flex; flex-wrap: wrap; gap: 8px; font-size: 11px; color: #969799; }
.st-cust { max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.st-code { color: #576b95; }
.st-status { font-weight: 600; }
.st-days { flex-shrink: 0; text-align: right; font-size: 12px; color: #323233; }
.st-days b { color: #e53935; font-size: 15px; }
.st-days-sub, .st-days-from { font-size: 10px; color: #969799; margin-top: 2px; }
</style>
