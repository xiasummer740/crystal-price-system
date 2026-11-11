p="client/src/views/OrderForm.vue"
s=open(p,encoding="utf-8").read()

# 模板：抬头选择 + 管理弹层
old='''        <div class="grid-2">
          <label class="field">
            <span>乙方名称</span>'''
new='''        <div class="title-bar">
          <label class="field title-select">
            <span>下单抬头</span>
            <select v-model="selectedTitleId" @change="onTitleChange">
              <option value="">（不用抬头，手填下方信息）</option>
              <option v-for="t in titles" :key="t.id" :value="t.id">{{ t.title }}{{ t.is_default ? '（默认）' : '' }}</option>
            </select>
          </label>
          <button type="button" class="title-manage" :disabled="!selectedCustomer" @click="openTitleMgr">管理抬头</button>
        </div>

        <div class="grid-2">
          <label class="field">
            <span>乙方名称</span>'''
assert old in s
s=s.replace(old,new,1)

# 管理弹层（放在 buyer section 结束前，找 </section> 第一次出现位置在 template 顶部）
old2='''      </section>
'''
# 在第一个 </section> 前插入弹层
idx=s.find(old2)
popup='''
        <div v-if="showTitleMgr" class="title-mask" @click.self="showTitleMgr = false">
          <div class="title-modal">
            <h4>抬头管理 · {{ selectedCustomer }}</h4>
            <div v-for="t in titles" :key="t.id" class="title-row">
              <div class="title-info">
                <b>{{ t.title }}</b><span v-if="t.is_default" class="title-def">默认</span>
                <div class="title-sub">{{ t.tax_no || '未填税号' }} · {{ t.address || '未填地址' }}</div>
              </div>
              <button type="button" @click="editTitle(t)">编辑</button>
              <button type="button" class="danger" @click="removeTitle(t)">删除</button>
            </div>
            <div v-if="!titles.length" class="title-empty">还没有抬头，下面新增一个</div>
            <div class="title-form">
              <input v-model="titleForm.title" placeholder="抬头全称（开票名称）" />
              <input v-model="titleForm.tax_no" placeholder="税号" />
              <input v-model="titleForm.address" placeholder="地址" />
              <input v-model="titleForm.phone" placeholder="电话" />
              <input v-model="titleForm.contact" placeholder="联系人" />
              <label class="title-default"><input type="checkbox" v-model="titleForm.is_default" /> 设为默认</label>
            </div>
            <div class="title-btns">
              <button type="button" @click="showTitleMgr = false">关闭</button>
              <button type="button" class="primary" @click="saveTitle">{{ titleForm.id ? '保存修改' : '新增抬头' }}</button>
            </div>
          </div>
        </div>
'''
s=s[:idx]+popup+s[idx:]

# imports
s=s.replace("  fetchAllCustomerNames\n} from '../utils/api.js'","  fetchAllCustomerNames,\n  fetchCustomerTitles,\n  createCustomerTitle,\n  updateCustomerTitle,\n  deleteCustomerTitle\n} from '../utils/api.js'",1)

# 状态 + 函数：插在 loadCustomer 前
old3='''async function loadCustomer(name) {'''
new3='''const titles = ref([])
const selectedTitleId = ref('')
const showTitleMgr = ref(false)
const titleForm = reactive({ id: 0, title: '', tax_no: '', address: '', phone: '', contact: '', is_default: false })

async function loadTitles(name) {
  titles.value = []
  selectedTitleId.value = ''
  if (!name) return
  try {
    const r = await fetchCustomerTitles(name)
    titles.value = r.data || []
    const def = titles.value.find(t => t.is_default) || titles.value[0]
    if (def) {
      selectedTitleId.value = def.id
      // 只有当买家名称还是客户名/为空时才用抬头覆盖，避免盖掉已保存的联系人
      if (!buyer.name || buyer.name === name) applyTitle(def)
    }
  } catch {}
}
function applyTitle(t) {
  if (!t) return
  if (t.title) buyer.name = t.title
  if (t.address) buyer.address = t.address
  if (t.phone) buyer.phone = t.phone
  if (t.contact) buyer.contact = t.contact
}
function onTitleChange() {
  const t = titles.value.find(x => x.id === selectedTitleId.value)
  if (t) applyTitle(t)
}
function openTitleMgr() {
  showTitleMgr.value = true
  titleForm.id = 0
  titleForm.title = ''
  titleForm.tax_no = ''
  titleForm.address = ''
  titleForm.phone = ''
  titleForm.contact = ''
  titleForm.is_default = false
}
function editTitle(t) {
  titleForm.id = t.id
  titleForm.title = t.title
  titleForm.tax_no = t.tax_no || ''
  titleForm.address = t.address || ''
  titleForm.phone = t.phone || ''
  titleForm.contact = t.contact || ''
  titleForm.is_default = !!t.is_default
}
async function saveTitle() {
  if (!titleForm.title.trim()) return showToast('请填抬头全称')
  const payload = { customer: selectedCustomer.value, ...titleForm }
  try {
    if (titleForm.id) await updateCustomerTitle(titleForm.id, payload)
    else await createCustomerTitle(payload)
    showToast('已保存')
    titleForm.id = 0
    titleForm.title = ''
    titleForm.tax_no = ''
    titleForm.address = ''
    titleForm.phone = ''
    titleForm.contact = ''
    titleForm.is_default = false
    await loadTitles(selectedCustomer.value)
  } catch (e) {
    showToast('保存失败: ' + (e?.response?.data?.msg || e.message))
  }
}
async function removeTitle(t) {
  try { await deleteCustomerTitle(t.id) } catch {}
  await loadTitles(selectedCustomer.value)
}

async function loadCustomer(name) {'''
assert old3 in s
s=s.replace(old3,new3,1)

# loadCustomer 末尾加载抬头
s=s.replace('''    orderNo.value = d.nextOrderNo || ''
    orderNoTouched.value = false''','''    orderNo.value = d.nextOrderNo || ''
    orderNoTouched.value = false
    await loadTitles(name)''',1)

# clearCustomer 清空
s=s.replace('''  buyer.fax = ''
  materials.value = []''','''  buyer.fax = ''
  titles.value = []
  selectedTitleId.value = ''
  materials.value = []''',1)

# CSS
css='''
.title-bar { display: flex; align-items: flex-end; gap: 10px; margin-bottom: 10px; }
.title-select { flex: 1; }
.title-manage { border: 1px solid #d0d5dd; background: #fff; border-radius: 6px; padding: 8px 12px; font-size: 13px; cursor: pointer; }
.title-mask { position: fixed; inset: 0; background: rgba(15,23,42,.45); z-index: 4000; display: flex; align-items: center; justify-content: center; }
.title-modal { width: min(620px, 94vw); max-height: 80vh; overflow: auto; background: #fff; border-radius: 10px; padding: 16px; }
.title-modal h4 { margin: 0 0 10px; font-size: 15px; }
.title-row { display: flex; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px dashed #eef0f3; }
.title-info { flex: 1; min-width: 0; }
.title-def { margin-left: 6px; background: #e6f4ff; color: #1677ff; border-radius: 8px; padding: 0 6px; font-size: 10px; }
.title-sub { font-size: 11px; color: #98a2b3; margin-top: 2px; }
.title-row button { border: 1px solid #d0d5dd; background: #fff; border-radius: 5px; padding: 3px 8px; font-size: 12px; cursor: pointer; }
.title-row button.danger { color: #d92d20; border-color: #f3c1c1; }
.title-empty { color: #98a2b3; font-size: 12px; padding: 8px 0; }
.title-form { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px; }
.title-form input:not([type=checkbox]) { border: 1px solid #d0d5dd; border-radius: 6px; padding: 6px 9px; font-size: 12px; }
.title-default { display: flex; align-items: center; gap: 6px; font-size: 12px; }
.title-btns { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
.title-btns button { border: 1px solid #d0d5dd; background: #fff; border-radius: 6px; padding: 6px 12px; font-size: 13px; cursor: pointer; }
.title-btns button.primary { background: #00794f; border-color: #00794f; color: #fff; }
'''
idx2=s.rfind("</style>")
s=s[:idx2]+css+"\n"+s[idx2:]
open(p,"w",encoding="utf-8",newline="").write(s)
print("ok")
