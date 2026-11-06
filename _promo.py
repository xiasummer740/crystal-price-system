p="client/src/views/Materials.vue"
s=open(p,encoding="utf-8").read()

# 卡片：规格书提示 + 转正按钮
s=s.replace('''                  <div class="alt-card-meta">
                    <span>成本：{{ alt.cost_price || '-' }}</span>
                    <span>交期：{{ alt.lead_time || '-' }}</span>
                  </div>''','''                  <div class="alt-card-meta">
                    <span>成本：{{ alt.cost_price || '-' }}</span>
                    <span>交期：{{ alt.lead_time || '-' }}</span>
                    <span v-if="alt.spec_document" class="alt-card-spec">📄 规格书</span>
                  </div>''',1)
s=s.replace('''                  <button type="button" class="alt-op" @click="openAltEditor(i)">编辑</button>
                  <button type="button" class="alt-op danger" @click="removeAlternate(i)">删除</button>''','''                  <button type="button" class="alt-op" @click="openAltEditor(i)">编辑</button>
                  <button type="button" class="alt-op primary" @click="promoteAlternate(i)" title="客户确认后转成正式物料">转正</button>
                  <button type="button" class="alt-op danger" @click="removeAlternate(i)">删除</button>''',1)

# 编辑弹窗：规格书 + 转正
s=s.replace('''                  <label>交期<input v-model="altEditor.data.lead_time" class="f-input" placeholder="如 7天 / 4-6周" /></label>
                </div>''','''                  <label>交期<input v-model="altEditor.data.lead_time" class="f-input" placeholder="如 7天 / 4-6周" /></label>
                  <label class="alt-spec-field">规格书
                    <span v-if="altEditor.data.spec_document" class="alt-spec-row">
                      <a :href="altEditor.data.spec_document" target="_blank">{{ specName(altEditor.data.spec_document) }}</a>
                      <button type="button" class="alt-op" @click="altEditor.data.spec_document = ''">移除</button>
                    </span>
                    <button v-else type="button" class="alt-op" @click="altSpecInputRef?.click()">上传规格书</button>
                  </label>
                </div>
                <input ref="altSpecInputRef" type="file" hidden accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg" @change="onAltSpecChange" />''',1)

s=s.replace('''                <div class="alt-editor-btns">
                  <button type="button" class="alt-op" @click="altEditor.open = false">取消</button>
                  <button type="button" class="alt-op primary" @click="saveAltEditor">保存</button>
                </div>''','''                <div class="alt-editor-btns">
                  <button type="button" class="alt-op" @click="altEditor.open = false">取消</button>
                  <button type="button" class="alt-op" @click="promoteFromEditor">转为正式物料</button>
                  <button type="button" class="alt-op primary" @click="saveAltEditor">保存</button>
                </div>''',1)

# 默认字段补 spec_document
s=s.replace("form.value.alternates.push({ material_code: '', material_name: '', factory: '', cost_price: '', lead_time: '' })","form.value.alternates.push({ material_code: '', material_name: '', factory: '', cost_price: '', lead_time: '', spec_document: '' })",1)
s=s.replace("cost_price: a.cost_price || '', lead_time: a.lead_time || '' }))","cost_price: a.cost_price || '', lead_time: a.lead_time || '', spec_document: a.spec_document || '' }))",1)

# 状态/函数
s=s.replace("const altEditor = reactive({ open: false, index: -1, data: { material_code: '', material_name: '', factory: '', cost_price: '', lead_time: '' } })","const altEditor = reactive({ open: false, index: -1, data: { material_code: '', material_name: '', factory: '', cost_price: '', lead_time: '', spec_document: '' } })\nconst altSpecInputRef = ref(null)",1)
s=s.replace("  altEditor.data = { material_code: '', material_name: '', factory: '', cost_price: '', lead_time: '', ...form.value.alternates[i] }","  altEditor.data = { material_code: '', material_name: '', factory: '', cost_price: '', lead_time: '', spec_document: '', ...form.value.alternates[i] }",1)

# 函数：规格上传 + 转正
s=s.replace('''function copyAlternate(alt) {''','''async function onAltSpecChange(e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (!file) return
  const fd = new FormData()
  fd.append('file', file)
  try {
    const r = await http.post('/upload-spec?customer=' + encodeURIComponent(selectedCustomer.value || ''), fd)
    const { url, filename, reused } = r.data || {}
    if (url) {
      altEditor.data.spec_document = url + '?name=' + encodeURIComponent(filename || file.name)
      showToast(reused ? '规格书已存在，已复用' : '规格书已上传')
    }
  } catch (err) {
    showToast('上传失败: ' + (err.response?.data?.msg || err.message))
  }
}

async function promoteAlternate(i) {
  const alt = form.value.alternates[i]
  if (!alt) return
  try {
    await showConfirmDialog({
      title: '转为正式物料',
      message: `把备选「${alt.material_code || alt.material_name || ''}」转成一条正式客户物料？`,
      confirmButtonText: '转正',
      confirmButtonColor: '#00794f'
    })
  } catch { return }
  await doPromote(alt, i)
}

function promoteFromEditor() {
  saveAltEditor()
  const alt = form.value.alternates[altEditor.index]
  if (!alt) return
  altEditor.open = false
  doPromote(alt, altEditor.index)
}

async function doPromote(alt, i) {
  // 已保存的记录：直接建一条新物料，再从备选里移除并保存本条
  if (editing.value) {
    try {
      await createMaterial({
        customer: selectedCustomer.value,
        date: new Date().toISOString().slice(0, 10),
        jkx_code: alt.material_code || '',
        material_code: alt.material_code || '',
        material_name: alt.material_name || alt.material_code || '',
        factory: alt.factory || '',
        cost_price: alt.cost_price || '',
        lead_time: alt.lead_time || '',
        status: '报价',
        spec_document: alt.spec_document || ''
      })
      form.value.alternates.splice(i, 1)
      const data = { ...form.value, customer: selectedCustomer.value }
      data.alternates = data.alternates.filter(a => a && (a.material_code || a.material_name || a.factory))
      await updateMaterial(editing.value, data)
      showToast('已转为正式物料')
      await load()
    } catch (e) {
      showToast('转正失败: ' + (e?.response?.data?.msg || e.message || '未知错误'))
    }
    return
  }
  // 未保存的新记录：把备选内容填进主表单，由用户确认后保存
  form.value.material_code = alt.material_code || form.value.material_code
  form.value.material_name = alt.material_name || form.value.material_name
  form.value.factory = alt.factory || form.value.factory
  form.value.cost_price = alt.cost_price || form.value.cost_price
  form.value.lead_time = alt.lead_time || form.value.lead_time
  form.value.spec_document = alt.spec_document || form.value.spec_document
  form.value.alternates.splice(i, 1)
  showToast('已填到主物料，确认后保存')
}

function copyAlternate(alt) {''',1)

# CSS
css='''
.alt-card-spec { color: #1677ff; }
.alt-spec-field { grid-column: 1 / -1; }
.alt-spec-row { display: flex; align-items: center; gap: 8px; font-size: 12px; }
.alt-spec-row a { color: #1677ff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 260px; }
'''
idx=s.rfind("</style>")
s=s[:idx]+css+"\n"+s[idx:]
open(p,"w",encoding="utf-8",newline="").write(s)
print("ok")
