<template>
  <van-popup :show="show" position="center" round :style="{ width: '520px', maxWidth: '94vw' }"
    @update:show="v => emit('update:show', v)">
    <div class="cpe">
      <header class="cpe-head">
        <span class="cpe-title">账期 / 对账付款</span>
        <span class="cpe-cust" :title="customer">{{ customer || '（未选客户）' }}</span>
        <span class="cpe-close" @click="emit('update:show', false)">✕</span>
      </header>

      <div class="cpe-body">
        <div class="cpe-row">
          <label>账期</label>
          <input class="cpe-input" v-model="form.payment_terms" list="cpe-terms" placeholder="如：当月结30天（可直接输入，也可选）" />
          <datalist id="cpe-terms">
            <option v-for="p in presets" :key="p" :value="p" />
          </datalist>
        </div>

        <div class="cpe-row">
          <label>每月对账日</label>
          <input class="cpe-input num" type="number" min="0" max="31" v-model.number="form.statement_day" placeholder="0" />
          <span class="cpe-unit">号（填 0 = 不设）</span>
        </div>

        <div class="cpe-row">
          <label>对账后付款</label>
          <input class="cpe-input num" type="number" min="0" max="365" v-model.number="form.payment_days" placeholder="0" />
          <span class="cpe-unit">天（填 0 = 不显示应付日）</span>
        </div>

        <div class="cpe-row">
          <label>下次对账日</label>
          <input class="cpe-input date" type="date" v-model="form.next_statement_date" />
          <button v-if="form.next_statement_date" class="cpe-clear" @click="form.next_statement_date = ''" title="清空 = 回到按「每月对账日」自动算">清除</button>
          <span class="cpe-unit">留空 = 按上面的「每月对账日」自动算</span>
        </div>

        <!-- 两种口径的优先级必须写在界面上：否则用户会奇怪「为什么我改了每月对账日却没变」 -->
        <p class="cpe-hint">
          上方填了具体日期时，**以它为准**（页头会标「手动指定」）；留空则按「每月对账日」自动滚动，
          月底自动顺延到下个月（每月 31 号在小月会落到该月最后一天）。
        </p>

        <div class="cpe-row top">
          <label>备注</label>
          <textarea class="cpe-textarea" v-model="form.pay_remark" rows="3" maxlength="500"
            placeholder="如：每月 5 号发对账单，李经理签收后 30 天付款；走承兑需提前说"></textarea>
        </div>
      </div>

      <footer class="cpe-foot">
        <button class="cpe-btn" @click="emit('update:show', false)">取消</button>
        <button class="cpe-btn primary" :disabled="saving" @click="save">{{ saving ? '保存中…' : '保存' }}</button>
      </footer>
    </div>
  </van-popup>
</template>

<script setup>
import { ref, watch } from 'vue'
import { showNotify, showSuccessToast } from 'vant'
import { fetchCustomerProfile, saveCustomerProfile } from '../utils/api.js'

const props = defineProps({
  show: Boolean,
  customer: { type: String, default: '' }
})
const emit = defineEmits(['update:show', 'saved'])

const form = ref({ payment_terms: '', statement_day: 0, payment_days: 0, next_statement_date: '', pay_remark: '' })
const presets = ref([])
const saving = ref(false)
const loading = ref(false)

async function load() {
  if (!props.customer) return
  loading.value = true
  try {
    const r = await fetchCustomerProfile(props.customer)
    const d = r.data || {}
    form.value = {
      payment_terms: d.payment_terms || '',
      statement_day: Number(d.statement_day) || 0,
      payment_days: Number(d.payment_days) || 0,
      next_statement_date: d.next_statement_date || '',
      pay_remark: d.pay_remark || ''
    }
    presets.value = d.presets || []
  } catch (e) {
    showNotify({ type: 'danger', message: '读取账期资料失败：' + e.message })
  } finally {
    loading.value = false
  }
}
// 每次打开都重新读：客户可能在别处改过（名册管理里也能改）
watch(() => props.show, (v) => { if (v) load() })

async function save() {
  if (!props.customer) return showNotify({ type: 'danger', message: '请先选择客户' })
  saving.value = true
  try {
    const r = await saveCustomerProfile({
      name: props.customer,
      payment_terms: form.value.payment_terms,
      statement_day: Number(form.value.statement_day) || 0,
      payment_days: Number(form.value.payment_days) || 0,
      next_statement_date: form.value.next_statement_date || '',
      pay_remark: form.value.pay_remark
    })
    showSuccessToast('已保存')
    emit('saved', r.data)
    emit('update:show', false)
  } catch (e) {
    // 服务端对非法日期会返回明确原因（例如格式不对），原样显示给用户
    showNotify({ type: 'danger', message: e?.response?.data?.msg || ('保存失败：' + e.message) })
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.cpe { padding: 14px 16px 12px; }
.cpe-head { display: flex; align-items: baseline; gap: 8px; }
.cpe-title { font-size: 16px; font-weight: 600; color: #323233; }
.cpe-cust { font-size: 12px; color: #646566; max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cpe-close { margin-left: auto; color: #969799; cursor: pointer; padding: 2px 6px; }
.cpe-body { margin-top: 12px; }
.cpe-row { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; flex-wrap: wrap; }
.cpe-row.top { align-items: flex-start; }
.cpe-row label { width: 84px; flex-shrink: 0; font-size: 13px; color: #323233; }
.cpe-input { flex: 1; min-width: 140px; height: 32px; font-size: 13px; border: 1px solid #dcdee0; border-radius: 6px; padding: 0 8px; }
.cpe-input.num { flex: 0 0 76px; min-width: 76px; text-align: right; }
.cpe-input.date { flex: 0 0 150px; min-width: 150px; }
.cpe-unit { font-size: 11px; color: #969799; }
.cpe-clear { height: 28px; padding: 0 10px; font-size: 12px; border: 1px solid #dcdee0; background: #fff; border-radius: 6px; cursor: pointer; color: #646566; }
.cpe-hint { margin: 4px 0 10px; padding: 8px; background: #f7f8fa; border-radius: 6px; font-size: 11px; color: #6b7280; line-height: 1.7; }
.cpe-textarea { flex: 1; min-width: 200px; font-size: 13px; border: 1px solid #dcdee0; border-radius: 6px; padding: 6px 8px; font-family: inherit; resize: vertical; }
.cpe-foot { display: flex; justify-content: flex-end; gap: 8px; margin-top: 6px; }
.cpe-btn { height: 32px; padding: 0 16px; font-size: 13px; border: 1px solid #dcdee0; background: #fff; border-radius: 6px; cursor: pointer; color: #323233; }
.cpe-btn.primary { background: var(--color-primary, #1989fa); border-color: var(--color-primary, #1989fa); color: #fff; }
.cpe-btn:disabled { opacity: .6; cursor: not-allowed; }
</style>
