p="client/src/views/Materials.vue"
s=open(p,encoding="utf-8").read()

# 模板：客户栏下加抬头条（插在收货地址前）
old='''      <!-- 收货地址（来自地图地址页，直接在此复制） -->'''
new='''      <!-- 客户抬头（同一客户多家开票主体；物料不变） -->
      <div v-if="selectedCustomer" class="mat-title-bar">
        <span class="mtb-label">抬头</span>
        <span v-for="t in customerTitles" :key="t.id" class="mtb-chip" :class="{ active: t.id === selectedTitleId }"
          :title="t.tax_no || ''" @click="selectedTitleId = t.id">
          {{ t.title }}<em v-if="t.is_default">默认</em>
        </span>
        <span v-if="!customerTitles.length" class="mtb-empty">还没有抬头</span>
        <button class="mtb-btn" @click="openTitleEditor()">＋ 新增抬头</button>
        <button v-if="customerTitles.length" class="mtb-btn" @click="openTitleManager">管理</button>
      </div>

      <!-- 收货地址（来自地图地址页，直接在此复制） -->'''
assert old in s
s=s.replace(old,new,1)

# 弹层：放在收货地址弹层前
old2='''      <van-popup v-model:show="showAddrPanel"'''
new2='''      <div v-if="showTitleEditor" class="mtb-mask" @click.self="showTitleEditor = false">
        <div class="mtb-modal">
          <h4>{{ titleForm.id ? '编辑抬头' : '新增抬头' }}<small> · {{ selectedCustomer }}</small></h4>
          <div class="mtb-form">
            <input v-model="titleForm.title" placeholder="抬头全称（开票名称）" />
            <input v-model="titleForm.tax_no" placeholder="税号" />
            <input v-model="titleForm.address" placeholder="地址" />
            <input v-model="titleForm.phone" placeholder="电话" />
            <input v-model="titleForm.contact" placeholder="联系人" />
            <label class="mtb-default"><input type="checkbox" v-model="titleForm.is_default" /> 设为默认抬头</label>
          </div>
          <div class="mtb-modal-btns">
            <button @click="showTitleEditor = false">取消</button>
            <button class="primary" @click="saveTitle">{{ titleForm.id ? '保存修改' : '创建抬头' }}</button>
          </div>
        </div>
      </div>

      <van-popup v-model:show="showAddrPanel"'''
assert old2 in s
s=s.replace(old2,new2,1)

# imports
s=s.replace("fetchLatestQuote, fetchCustomerAddresses, isLocalFileUrl","fetchLatestQuote, fetchCustomerAddresses, fetchCustomerTitles, createCustomerTitle, updateCustomerTitle, deleteCustomerTitle, isLocalFileUrl",1)

# 状态
s=s.replace("const customerAddresses = ref([])","const customerAddresses = ref([])\nconst customerTitles = ref([])\nconst selectedTitleId = ref(0)\nconst showTitleEditor = ref(false)\nconst titleForm = reactive({ id: 0, title: '', tax_no: '', address: '', phone: '', contact: '', is_default: false })",1)

# 函数：加载/新增/管理
old3='''async function loadCustomerAddresses(name) {'''
new3='''async function loadCustomerTitles(name) {
  customerTitles.value = []
  selectedTitleId.value = 0
  if (!name) return
  try {
    const r = await fetchCustomerTitles(name)
    customerTitles.value = r.data || []
    const def = customerTitles.value.find(t => t.is_default) || customerTitles.value[0]
    if (def) selectedTitleId.value = def.id
  } catch {}
}
function openTitleEditor(t) {
  titleForm.id = t?.id || 0
  titleForm.title = t?.title || ''
  titleForm.tax_no = t?.tax_no || ''
  titleForm.address = t?.address || ''
  titleForm.phone = t?.phone || ''
  titleForm.contact = t?.contact || ''
  titleForm.is_default = !!t?.is_default
  showTitleEditor.value = true
}
function openTitleManager() {
  // 管理 = 编辑默认/第一个抬头；列表在抬头条上直接点选
  const t = customerTitles.value.find(x => x.id === selectedTitleId.value) || customerTitles.value[0]
  if (t) openTitleEditor(t)
}
async function saveTitle() {
  if (!titleForm.title.trim()) return showToast('请填抬头全称')
  const payload = { customer: selectedCustomer.value, ...titleForm }
  try {
    if (titleForm.id) await updateCustomerTitle(titleForm.id, payload)
    else await createCustomerTitle(payload)
    showToast('已保存抬头')
    showTitleEditor.value = false
    titleForm.id = 0
    titleForm.title = ''
    titleForm.tax_no = ''
    titleForm.address = ''
    titleForm.phone = ''
    titleForm.contact = ''
    titleForm.is_default = false
    await loadCustomerTitles(selectedCustomer.value)
  } catch (e) {
    showToast('保存失败: ' + (e?.response?.data?.msg || e.message))
  }
}

async function loadCustomerAddresses(name) {'''
assert old3 in s
s=s.replace(old3,new3,1)

# 选中客户时加载抬头
s=s.replace("  loadCustomerAddresses(name)\n  loadFactories()","  loadCustomerAddresses(name)\n  loadCustomerTitles(name)\n  loadFactories()",1)
# 清空时清掉
s=s.replace("  customerAddresses.value = []\n  list.value = []","  customerAddresses.value = []\n  customerTitles.value = []\n  selectedTitleId.value = 0\n  list.value = []",1)

# CSS
css='''
.mat-title-bar { display: flex; align-items: center; gap: 6px; padding: 6px 16px; background: #fbfcfe; border-bottom: 1px solid #eef0f3; flex-wrap: wrap; font-size: 12px; }
.mtb-label { color: #98a2b3; flex: none; }
.mtb-chip { border: 1px solid #d6e4ff; background: #f2f7ff; color: #1f2937; border-radius: 12px; padding: 2px 10px; cursor: pointer; }
.mtb-chip.active { border-color: #1677ff; background: #e6f0ff; color: #0958d9; }
.mtb-chip em { font-style: normal; font-size: 10px; color: #1677ff; margin-left: 4px; }
.mtb-empty { color: #98a2b3; }
.mtb-btn { border: 1px dashed #b7c7e0; background: #fff; color: #1677ff; border-radius: 12px; padding: 2px 10px; font-size: 12px; cursor: pointer; }
.mtb-mask { position: fixed; inset: 0; background: rgba(15,23,42,.45); z-index: 4000; display: flex; align-items: center; justify-content: center; }
.mtb-modal { width: min(520px, 92vw); background: #fff; border-radius: 10px; padding: 16px; }
.mtb-modal h4 { margin: 0 0 10px; font-size: 15px; }
.mtb-modal h4 small { color: #98a2b3; font-size: 11px; font-weight: normal; }
.mtb-form { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.mtb-form input:not([type=checkbox]) { border: 1px solid #d0d5dd; border-radius: 6px; padding: 7px 9px; font-size: 13px; }
.mtb-default { display: flex; align-items: center; gap: 6px; font-size: 12px; }
.mtb-modal-btns { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
.mtb-modal-btns button { border: 1px solid #d0d5dd; background: #fff; border-radius: 6px; padding: 6px 12px; font-size: 13px; cursor: pointer; }
.mtb-modal-btns button.primary { background: #00794f; border-color: #00794f; color: #fff; }
'''
idx=s.rfind("</style>")
s=s[:idx]+css+"\n"+s[idx:]
open(p,"w",encoding="utf-8",newline="").write(s)
print("ok")
