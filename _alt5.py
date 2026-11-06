p="client/src/views/Materials.vue"
s=open(p,encoding="utf-8").read()

# 卡片标题带晶科鑫料号
s=s.replace('''                  <div class="alt-card-title">{{ alt.material_code || '（未填编码）' }}<span v-if="alt.factory" class="alt-card-factory"> · {{ alt.factory }}</span></div>''','''                  <div class="alt-card-title"><span v-if="alt.jkx_code">{{ alt.jkx_code }} · </span>{{ alt.material_code || '（未填编码）' }}<span v-if="alt.factory" class="alt-card-factory"> · {{ alt.factory }}</span></div>''',1)

# 编辑器加晶科鑫料号 + 规格书拖拽区
s=s.replace('''                <div class="alt-editor-grid">
                  <label>备选物料编码<input v-model="altEditor.data.material_code" class="f-input" placeholder="如 6K22032768K..." /></label>''','''                <div class="alt-editor-grid">
                  <label>晶科鑫料号<input v-model="altEditor.data.jkx_code" class="f-input" placeholder="如 SJK-7L32768K..." /></label>
                  <label>备选物料编码<input v-model="altEditor.data.material_code" class="f-input" placeholder="如 6K22032768K..." /></label>''',1)

old_spec='''                  <label class="alt-spec-field">规格书
                    <span v-if="altEditor.data.spec_document" class="alt-spec-row">
                      <a :href="altEditor.data.spec_document" target="_blank">{{ specName(altEditor.data.spec_document) }}</a>
                      <button type="button" class="alt-op" @click="altEditor.data.spec_document = ''">移除</button>
                    </span>
                    <button v-else type="button" class="alt-op" @click="altSpecInputRef?.click()">上传规格书</button>
                  </label>'''
new_spec='''                  <div class="alt-spec-field">
                    <div class="alt-spec-label">规格书</div>
                    <div v-if="altEditor.data.spec_document" class="alt-spec-row">
                      <a :href="altEditor.data.spec_document" target="_blank">{{ specName(altEditor.data.spec_document) }}</a>
                      <button type="button" class="alt-op" @click="altEditor.data.spec_document = ''">移除</button>
                      <button type="button" class="alt-op" @click="altSpecInputRef?.click()">替换</button>
                    </div>
                    <div v-else class="alt-spec-drop" :class="{ drag: altSpecDragging }"
                      @click="altSpecInputRef?.click()"
                      @dragover.prevent="altSpecDragging = true"
                      @dragleave="altSpecDragging = false"
                      @drop.prevent="onAltSpecDrop"
                      @paste="onAltSpecPaste">
                      点击选择 / 拖文件进来 / Ctrl+V 粘贴
                    </div>
                  </div>'''
assert old_spec in s
s=s.replace(old_spec,new_spec,1)

# 默认字段
s=s.replace("{ material_code: '', material_name: '', factory: '', cost_price: '', lead_time: '', spec_document: '' }","{ jkx_code: '', material_code: '', material_name: '', factory: '', cost_price: '', lead_time: '', spec_document: '' }")
s=s.replace("cost_price: a.cost_price || '', lead_time: a.lead_time || '', spec_document: a.spec_document || '' }))","cost_price: a.cost_price || '', lead_time: a.lead_time || '', spec_document: a.spec_document || '', jkx_code: a.jkx_code || '' }))",1)
s=s.replace("altEditor.data = { material_code: '', material_name: '', factory: '', cost_price: '', lead_time: '', spec_document: '', ...form.value.alternates[i] }","altEditor.data = { jkx_code: '', material_code: '', material_name: '', factory: '', cost_price: '', lead_time: '', spec_document: '', ...form.value.alternates[i] }",1)

# 状态
s=s.replace("const altSpecInputRef = ref(null)","const altSpecInputRef = ref(null)\nconst altSpecDragging = ref(false)",1)

# 上传函数复用 + drop/paste
s=s.replace('''async function onAltSpecChange(e) {
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
}''','''async function onAltSpecChange(e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (file) await uploadAltSpec(file)
}
function onAltSpecDrop(e) { altSpecDragging.value = false; const f = e.dataTransfer?.files?.[0]; if (f) uploadAltSpec(f) }
function onAltSpecPaste(e) {
  const f = e.clipboardData?.files?.[0]
  if (!f) return
  e.preventDefault()
  uploadAltSpec(f)
}
async function uploadAltSpec(file) {
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
}''',1)

# 转正用 jkx_code
s=s.replace("        jkx_code: alt.material_code || '',\n        material_code: alt.material_code || '',","        jkx_code: alt.jkx_code || '',\n        material_code: alt.material_code || alt.jkx_code || '',",1)
s=s.replace("  form.value.material_code = alt.material_code || form.value.material_code","  form.value.jkx_code = alt.jkx_code || form.value.jkx_code\n  form.value.material_code = alt.material_code || form.value.material_code",1)

# 复制带晶科鑫
s=s.replace("    alt.material_code ? '编码：' + alt.material_code : '',","    alt.jkx_code ? '晶科鑫料号：' + alt.jkx_code : '',\n    alt.material_code ? '编码：' + alt.material_code : '',",1)

# CSS
css='''
.alt-spec-label { font-size: 12px; color: #667085; margin-bottom: 4px; }
.alt-spec-drop { border: 1.5px dashed #cdd5df; border-radius: 8px; padding: 10px; text-align: center; font-size: 12px; color: #98a2b3; cursor: pointer; }
.alt-spec-drop:hover, .alt-spec-drop.drag { border-color: var(--color-primary, #00794f); background: #f6fffb; color: #00794f; }
'''
idx=s.rfind("</style>")
s=s[:idx]+css+"\n"+s[idx:]
open(p,"w",encoding="utf-8",newline="").write(s)
print("client ok")
