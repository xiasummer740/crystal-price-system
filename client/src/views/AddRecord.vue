<template>
  <div class="page-container">
    <div class="page-header"><van-icon name="arrow-left" class="back-btn" @click="goBack" />{{ isEdit ? '编辑报价' : '新增报价' }}</div>
    <div class="page-content">
      <van-form @submit="onSubmit">
        <van-cell-group inset title="物料信息">
          <van-field v-model="form.material_code" label="物料编码" placeholder="输入编码自动匹配" @change="onCodeChange" />
          <van-field v-model="form.material_name" label="物料名称" placeholder="物料名称" :readonly="isEdit" />
          <van-field v-model="form.material_spec" label="物料规格" placeholder="如：SMD3225" :readonly="isEdit" />
          <!-- 品类：快捷选填 -->
          <div class="sug-wrapper">
            <van-field v-model="form.category" label="物料品类" placeholder="如：贴片晶振" @focus="openSug('category')" @input="filterSug('category')" :readonly="isEdit" />
            <div class="sug-drop" v-if="activeSug==='category' && sugFiltered.category.length">
              <div v-for="v in sugFiltered.category" :key="v" class="sug-item" @click="pickSug('category',v)">{{ v }}</div>
            </div>
          </div>
          <!-- 编辑模式提示 -->
          <div v-if="isEdit" style="padding:8px 16px 12px;font-size:12px;color:#e6a23c;background:#fffbe6;border-radius:0 0 6px 6px">
            ⚠️ 修改产品参数请回到首页 → 点击物料编码 → 在弹窗中点击「✎ 产品参数」统一修改
          </div>
        </van-cell-group>

        <van-cell-group v-if="!isEdit" inset title="技术参数">
          <!-- 品牌：快捷选填 -->
          <div class="sug-wrapper">
            <van-field v-model="form.brand" label="品牌" placeholder="如：TXC" @focus="openSug('brand')" @input="filterSug('brand')" />
            <div class="sug-drop" v-if="activeSug==='brand' && sugFiltered.brand.length">
              <div v-for="v in sugFiltered.brand" :key="v" class="sug-item" @click="pickSug('brand',v)">{{ v }}</div>
            </div>
          </div>
          <!-- 尺寸：快捷选填 -->
          <div class="sug-wrapper">
            <van-field v-model="form.dimension" label="尺寸规格" placeholder="如：3.2×2.5mm" @focus="openSug('dimension')" @input="filterSug('dimension')" />
            <div class="sug-drop" v-if="activeSug==='dimension' && sugFiltered.dimension.length">
              <div v-for="v in sugFiltered.dimension" :key="v" class="sug-item" @click="pickSug('dimension',v)">{{ v }}</div>
            </div>
          </div>
          <!-- PIN脚：快捷选填 -->
          <div class="sug-wrapper">
            <van-field v-model="form.pin_count" label="PIN脚" placeholder="如：4PIN" @focus="openSug('pin_count')" @input="filterSug('pin_count')" />
            <div class="sug-drop" v-if="activeSug==='pin_count' && sugFiltered.pin_count.length">
              <div v-for="v in sugFiltered.pin_count" :key="v" class="sug-item" @click="pickSug('pin_count',v)">{{ v }}</div>
            </div>
          </div>
          <!-- 频点：快捷选填 -->
          <div class="sug-wrapper">
            <van-field v-model="form.frequency" label="频点" placeholder="如：32.768KHz" @focus="openSug('frequency')" @input="filterSug('frequency')" />
            <div class="sug-drop" v-if="activeSug==='frequency' && sugFiltered.frequency.length">
              <div v-for="v in sugFiltered.frequency" :key="v" class="sug-item" @click="pickSug('frequency',v)">{{ v }}</div>
            </div>
          </div>
          <!-- 负载：快捷选填 -->
          <div class="sug-wrapper">
            <van-field v-model="form.load_cap" label="负载" placeholder="如：12.5pF" @focus="openSug('load_cap')" @input="filterSug('load_cap')" />
            <div class="sug-drop" v-if="activeSug==='load_cap' && sugFiltered.load_cap.length">
              <div v-for="v in sugFiltered.load_cap" :key="v" class="sug-item" @click="pickSug('load_cap',v)">{{ v }}</div>
            </div>
          </div>
          <!-- 电压：快捷选填 -->
          <div class="sug-wrapper">
            <van-field v-model="form.voltage" label="电压" placeholder="如：3.3V" @focus="openSug('voltage')" @input="filterSug('voltage')" />
            <div class="sug-drop" v-if="activeSug==='voltage' && sugFiltered.voltage.length">
              <div v-for="v in sugFiltered.voltage" :key="v" class="sug-item" @click="pickSug('voltage',v)">{{ v }}</div>
            </div>
          </div>
          <!-- 模式：快捷选填 -->
          <div class="sug-wrapper">
            <van-field v-model="form.mode" label="模式" placeholder="如：基频" @focus="openSug('mode')" @input="filterSug('mode')" />
            <div class="sug-drop" v-if="activeSug==='mode' && sugFiltered.mode.length">
              <div v-for="v in sugFiltered.mode" :key="v" class="sug-item" @click="pickSug('mode',v)">{{ v }}</div>
            </div>
          </div>
          <!-- 频偏：快捷选填 -->
          <div class="sug-wrapper">
            <van-field v-model="form.freq_tol" label="频偏" placeholder="如：±20ppm" @focus="openSug('freq_tol')" @input="filterSug('freq_tol')" />
            <div class="sug-drop" v-if="activeSug==='freq_tol' && sugFiltered.freq_tol.length">
              <div v-for="v in sugFiltered.freq_tol" :key="v" class="sug-item" @click="pickSug('freq_tol',v)">{{ v }}</div>
            </div>
          </div>
          <van-field v-model="form.temperature" label="温度" readonly is-link placeholder="选择温度范围" @click="showTempPicker=true" />
          <van-popup v-model:show="showTempPicker" position="bottom" round>
            <van-picker :columns="tempOptions" @confirm="onTempConfirm" @cancel="showTempPicker=false" />
          </van-popup>
        </van-cell-group>

        <van-cell-group inset title="价格信息">
          <van-field v-model.number="form.price_with_tax" label="含税价" placeholder="如：1.5000" type="number" :rules="[{ validator: v => v===null||v===''||v>=0, message:'价格不能为负' }]" @change="onPriceWithTaxChange" />
          <van-field v-model.number="form.price_without_tax" label="未税价" placeholder="如：1.2000" type="number" :rules="[{ validator: v => v===null||v===''||v>=0, message:'价格不能为负' }]" @change="onPriceWithoutTaxChange" />
          <van-field v-model="form.currency" label="币种" readonly is-link placeholder="CNY" @click="showCurrencyPicker=true" />
        </van-cell-group>

        <van-cell-group inset title="工厂与人员">
          <!-- 工厂：快捷选填 -->
          <div class="sug-wrapper">
            <van-field v-model="form.factory_code" label="工厂编号" placeholder="如：F01" @focus="openSug('factory')" @input="filterSug('factory')" />
            <div class="sug-drop" v-if="activeSug==='factory' && sugFiltered.factory.length">
              <div v-for="v in sugFiltered.factory" :key="v" class="sug-item" @click="pickSug('factory',v)">{{ v }}</div>
            </div>
          </div>
          <!-- 报价人：快捷选填 -->
          <div class="sug-wrapper">
            <van-field v-model="form.quoter" label="报价人" placeholder="如：张三" @focus="openSug('quoter')" @input="filterSug('quoter')" />
            <div class="sug-drop" v-if="activeSug==='quoter' && sugFiltered.quoter.length">
              <div v-for="v in sugFiltered.quoter" :key="v" class="sug-item" @click="pickSug('quoter',v)">{{ v }}</div>
            </div>
          </div>
        </van-cell-group>

        <van-cell-group inset title="其他信息">
          <!-- 交期：快捷选填 -->
          <div class="sug-wrapper">
            <van-field v-model="form.standard_lead_time" label="标准交期" placeholder="如：7天" @focus="openSug('leadTime')" @input="filterSug('leadTime')" />
          <van-field v-model="form.min_package" label="最小包装" placeholder="如：3000 pcs" />
            <div class="sug-drop" v-if="activeSug==='leadTime' && sugFiltered.leadTime.length">
              <div v-for="v in sugFiltered.leadTime" :key="v" class="sug-item" @click="pickSug('leadTime',v)">{{ v }}</div>
            </div>
          </div>
          <div class="spec-zone" @dragenter.prevent="dragOver=true" @dragover.prevent="dragOver=true" @dragleave.prevent="dragOver=false" @drop.prevent="onSpecDrop" :class="{'drag-active':dragOver}">
            <van-cell title="规格书" class="spec-field">
              <template #value>
                <a v-if="form.spec_document" :href="form.spec_document" target="_blank" class="spec-link" @click.prevent="window.electronAPI?.openExternal?.(form.spec_document) || window.open(form.spec_document, '_blank')">{{ specDisplayName(form.spec_document) }}</a>
                <span v-else class="spec-placeholder">粘贴链接 / 拖入文件 / 上传</span>
              </template>
              <template #right-icon>
                <van-button v-if="form.spec_document" size="small" type="danger" plain style="margin-left:6px;font-size:11px" @click="form.spec_document=''">删除</van-button>
                <van-button size="small" type="primary" style="margin-left:4px;font-size:11px" @click="pickSpecFile">上传</van-button>
              </template>
            </van-cell>
            <input ref="specFileInput" type="file" hidden @change="onSpecUpload" />
          </div>
          <van-field v-model="form.first_inquiry_customer" label="初次询价客户" placeholder="如：某某科技" />
          <van-field v-model="form.remarks" label="备注" placeholder="其他备注" type="textarea" rows="2" autosize />
        </van-cell-group>

        <div style="margin:20px 16px;display:flex;flex-direction:column;gap:10px">
          <van-button round block type="primary" native-type="submit" :loading="submitting">{{ isEdit ? '保存修改' : '提交记录' }}</van-button>
          <van-button v-if="isEdit" round block plain type="primary" :loading="submittingNew" @click="onSubmitNew">另存为新记录（保留原记录）</van-button>
        </div>
      </van-form>

      <van-popup v-model:show="showCurrencyPicker" position="bottom" round>
        <van-picker :columns="currencies" @confirm="onCurrencyConfirm" @cancel="showCurrencyPicker=false" />
      </van-popup>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import { usePriceStore } from '../stores/price.js'
import { showToast, showLoadingToast, closeToast, showConfirmDialog } from 'vant'
import { http } from '../utils/api.js'

const route = useRoute()
const router = useRouter()
const store = usePriceStore()
const isEdit = computed(() => !!route.params.id)
const submitting = ref(false)
const submittingNew = ref(false)
const showCurrencyPicker = ref(false)
const showTempPicker = ref(false)
const currencies = [{ text: '人民币 (CNY)', value: 'CNY' }, { text: '美元 (USD)', value: 'USD' }]
const tempOptions = [{ text: '-20/70℃', value: '-20/70℃' },{ text: '-40~85℃', value: '-40~85℃' },{ text: '-40/105℃', value: '-40/105℃' },{ text: '-40/125℃', value: '-40/125℃' },{ text: '-55/150℃', value: '-55/150℃' }]

const form = ref({
  material_code:'', material_name:'', material_spec:'', category:'',
  brand:'', dimension:'', pin_count:'', frequency:'', load_cap:'', voltage:'', mode:'', freq_tol:'', temperature:'',
  price_with_tax:null, price_without_tax:null, currency:'CNY',
  factory_code:'', quoter:'', standard_lead_time:'', min_package:'', spec_document:'',
  first_inquiry_customer:'', remarks:''
})

// ===== 未保存检测 =====
const formDirty = ref(false)
watch(form, () => { formDirty.value = true }, { deep: true })
onBeforeRouteLeave((_to, _from, next) => {
  if (!formDirty.value) return next()
  showConfirmDialog({ title: '未保存', message: '有未保存的修改，确定离开吗？' })
    .then(() => next())
    .catch(() => next(false))
})
function onBeforeUnload(e) {
  if (formDirty.value) { e.preventDefault(); e.returnValue = '' }
}
onMounted(() => window.addEventListener('beforeunload', onBeforeUnload))
onUnmounted(() => window.removeEventListener('beforeunload', onBeforeUnload))

// 统一返回：router.push 触发 onBeforeRouteLeave 守卫检测未保存
function specDisplayName(url) {
  if (!url) return ''
  try {
    const name = url.replace('/api/specs/', '')
    return decodeURIComponent(name)
  } catch { return url }
}
function goBack() {
  router.push('/')
}

// ===== 快捷选填 =====
const sugAll = ref({ category:[], factory:[], quoter:[], leadTime:[], brand:[], dimension:[], pin_count:[], frequency:[], load_cap:[], voltage:[], mode:[], freq_tol:[], temperature:[] })
const sugFiltered = ref({ category:[], factory:[], quoter:[], leadTime:[], brand:[], dimension:[], pin_count:[], frequency:[], load_cap:[], voltage:[], mode:[], freq_tol:[], temperature:[] })
const activeSug = ref(null)

async function loadSuggestions() {
  try { const r = await http.get('/prices/form-suggestions'); if (r?.data) { sugAll.value = r.data; sugFiltered.value = { ...r.data } } } catch { /* 静默失败，不影响用户操作 */ }
}
function fieldKey(field) {
  const map = { leadTime: 'standard_lead_time', factory: 'factory_code' }
  return map[field] || field
}
function openSug(field) {
  activeSug.value = field
  // 根据当前输入框的值过滤
  const val = (form.value[fieldKey(field)] || '').toLowerCase()
  sugFiltered.value[field] = (sugAll.value[field] || []).filter(v => v.toLowerCase().includes(val))
}
function filterSug(field) {
  if (activeSug.value !== field) return
  const val = (form.value[fieldKey(field)] || '').toLowerCase()
  sugFiltered.value[field] = (sugAll.value[field] || []).filter(v => v.toLowerCase().includes(val))
}
function pickSug(field, val) {
  form.value[fieldKey(field)] = val
  activeSug.value = null
}

// 点击外部关闭下拉
function onClickOutside(e) {
  if (!e.target.closest('.sug-wrapper')) activeSug.value = null
}
onMounted(() => document.addEventListener('click', onClickOutside))
onUnmounted(() => document.removeEventListener('click', onClickOutside))

// ===== 物料编码自动匹配 =====
let lookupTimer = null
function onCodeChange() {
  const code = form.value.material_code?.trim()
  if (!code || isEdit.value) return
  clearTimeout(lookupTimer)
  lookupTimer = setTimeout(async () => {
    try {
      const res = await http.get(`/prices/lookup-material/${encodeURIComponent(code)}`)
      if (res?.data) {
        const d = res.data
        if (!form.value.material_name) form.value.material_name = d.material_name || ''
        if (!form.value.material_spec) form.value.material_spec = d.material_spec || ''
        if (!form.value.category) form.value.category = d.category || ''
        if (!form.value.brand) form.value.brand = d.brand || ''
        if (!form.value.dimension) form.value.dimension = d.dimension || ''
        if (!form.value.pin_count) form.value.pin_count = d.pin_count || ''
        if (!form.value.frequency) form.value.frequency = d.frequency || ''
        if (!form.value.load_cap) form.value.load_cap = d.load_cap || ''
        if (!form.value.voltage) form.value.voltage = d.voltage || ''
        if (!form.value.mode) form.value.mode = d.mode || ''
        if (!form.value.freq_tol) form.value.freq_tol = d.freq_tol || ''
      }
    } catch {}
  }, 400)
}

// ===== 规格书上传 + 拖入 =====
const specFileInput = ref(null)
const dragOver = ref(false)
function pickSpecFile() { specFileInput.value?.click() }
function onSpecDrop(e) { dragOver.value=false; const file=e.dataTransfer?.files?.[0]; if(file) uploadSpecFile(file) }
async function onSpecUpload(e) { const file=e.target.files[0]; if(file) uploadSpecFile(file); specFileInput.value.value='' }
async function uploadSpecFile(file) {
  const fd=new FormData(); fd.append('file',file)
  try { const r=await http.post('/upload-spec',fd); form.value.spec_document=r.data.url; showToast('上传成功') } catch { showToast('上传失败') }
}

function onCurrencyConfirm({ selectedOptions }) { form.value.currency = selectedOptions[0].value; showCurrencyPicker.value = false }
function onTempConfirm({ selectedOptions }) { form.value.temperature = selectedOptions[0].value; showTempPicker.value = false }
// 自动计算含税↔未税
const autoTaxRate = () => Number(localStorage.getItem('crystal_taxRate')) || 13
function onPriceWithTaxChange() { const v = form.value.price_with_tax; if (v && !form.value.price_without_tax) { form.value.price_without_tax = parseFloat((v / (1 + autoTaxRate()/100)).toFixed(4)) } }
function onPriceWithoutTaxChange() { const v = form.value.price_without_tax; if (v && !form.value.price_with_tax) { form.value.price_with_tax = parseFloat((v * (1 + autoTaxRate()/100)).toFixed(4)) } }

// 加载表单数据
async function loadFormData() {
  if (isEdit.value) {
    showLoadingToast({ message:'加载中...', forbidClick:true })
    try {
      const data = await store.loadDetail(route.params.id)
      form.value = {
        material_code:data.material_code, material_name:data.material_name,
        material_spec:data.material_spec||'', category:data.category||'',
        brand:data.brand||'', dimension:data.dimension||'', pin_count:data.pin_count||'', frequency:data.frequency||'',
        load_cap:data.load_cap||'', voltage:data.voltage||'', mode:data.mode||'', freq_tol:data.freq_tol||'', temperature:data.temperature||'',
        price_with_tax:data.price_with_tax, price_without_tax:data.price_without_tax,
        currency:data.currency, factory_code:data.factory_code||'',
        quoter:data.quoter||'', standard_lead_time:data.standard_lead_time||'', min_package:data.min_package||'',
        spec_document:data.spec_document||'', first_inquiry_customer:data.first_inquiry_customer||'',
        remarks:data.remarks||''
      }
    } finally { closeToast() }
  } else {
    const q = route.query
    if (q.code) form.value.material_code = q.code
    if (q.name) form.value.material_name = q.name
    if (q.spec) form.value.material_spec = q.spec
    if (q.cat) form.value.category = q.cat
    if (q.brand) form.value.brand = q.brand
    if (q.dim) form.value.dimension = q.dim
    if (q.pin) form.value.pin_count = q.pin
    if (q.freq) form.value.frequency = q.freq
    if (q.load) form.value.load_cap = q.load
    if (q.volt) form.value.voltage = q.volt
    if (q.mode) form.value.mode = q.mode
    if (q.ftol) form.value.freq_tol = q.ftol
  }
}

// ===== 加载 =====
onMounted(() => { loadSuggestions(); loadFormData() })
watch(() => route.params.id, () => { loadFormData() })

// ===== 提交 =====
async function onSubmit() {
  submitting.value = true
  try {
    if (isEdit.value) { await store.edit(route.params.id, form.value); showToast('修改成功') }
    else { await store.add(form.value); showToast('新增成功') }
    formDirty.value = false
    router.push('/')
  } catch (e) { showToast(e.message||'操作失败') } finally { submitting.value = false }
}
async function onSubmitNew() {
  submittingNew.value = true
  try { await store.add(form.value); formDirty.value = false; showToast('新记录已创建，原记录保留'); router.push('/') }
  catch (e) { showToast(e.message||'操作失败') } finally { submittingNew.value = false }
}
</script>

<style scoped>
.sug-wrapper { position:relative }
.sug-drop { position:absolute; top:100%; left:0; right:0; background:#fff; border:1px solid #e8e8e8; border-radius:6px; box-shadow:0 4px 16px rgba(0,0,0,.1); z-index:999; max-height:180px; overflow-y:auto }
.sug-item { padding:8px 14px; font-size:13px; color:#323233; cursor:pointer; border-bottom:1px solid #f5f5f5 }
.sug-item:last-child { border-bottom:none }
.sug-item:hover { background:rgba(var(--color-primary-rgb),.04); color:var(--color-primary) }
/* 让 sug-drop 不被 cell-group 的 overflow:hidden 裁剪 */
:deep(.van-cell-group--inset) { overflow: visible !important }
.spec-zone { border-radius:6px; transition:all .2s; border:2px solid transparent }
.spec-zone.drag-active { border-color:var(--color-primary); background:rgba(var(--color-primary-rgb),.04) }
.spec-field :deep(.van-cell__value){flex:1;overflow:hidden;text-overflow:ellipsis}
.spec-link{color:var(--color-primary);text-decoration:none;font-size:12px}
.spec-link:hover{text-decoration:underline}
.spec-placeholder{color:#bbb;font-size:12px}
</style>
