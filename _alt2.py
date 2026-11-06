p="client/src/views/Materials.vue"
s=open(p,encoding="utf-8").read()

old='''              <div v-for="(alt, i) in form.alternates" :key="i" class="alt-row">
                <SuggestField plain input-class="f-input alt-input alt-code" v-model="alt.material_code"
                  :options="matOpts.codes" :drop-width="420" placeholder="备选物料编码" @select="opt => onPickAltCode(alt, opt)" />
                <input v-model="alt.material_name" placeholder="备选物料名称" class="f-input alt-input alt-name" />
                <SuggestField plain input-class="f-input alt-input alt-factory-input" v-model="alt.factory"
                  :options="matOpts.factory" placeholder="备选工厂" />
                <input v-model="alt.cost_price" placeholder="备选成本价" class="f-input alt-input alt-price" />
                <button class="alt-del-btn" @click="removeAlternate(i)" title="删除此备选">×</button>
              </div>'''
new='''              <div v-for="(alt, i) in form.alternates" :key="i" class="alt-card">
                <div class="alt-card-main">
                  <div class="alt-card-title">{{ alt.material_code || '（未填编码）' }}<span v-if="alt.factory" class="alt-card-factory"> · {{ alt.factory }}</span></div>
                  <div class="alt-card-name">{{ alt.material_name || '未填名称' }}</div>
                  <div class="alt-card-meta">
                    <span>成本：{{ alt.cost_price || '-' }}</span>
                    <span>交期：{{ alt.lead_time || '-' }}</span>
                  </div>
                </div>
                <div class="alt-card-ops">
                  <button type="button" class="alt-op" @click="copyAlternate(alt)" title="复制完整备选信息">复制</button>
                  <button type="button" class="alt-op" @click="openAltEditor(i)">编辑</button>
                  <button type="button" class="alt-op danger" @click="removeAlternate(i)">删除</button>
                </div>
              </div>'''
assert old in s
s=s.replace(old,new,1)

# 编辑弹层：放在 alternates-section 结束后
old2='''            <!-- 规格书 -->'''
new2='''            <!-- 备选编辑弹层 -->
            <div v-if="altEditor.open" class="alt-editor-mask" @click.self="altEditor.open = false">
              <div class="alt-editor">
                <h4>{{ altEditor.index >= 0 ? '编辑备选物料' : '新增备选物料' }}</h4>
                <div class="alt-editor-grid">
                  <label>备选物料编码<input v-model="altEditor.data.material_code" class="f-input" placeholder="如 6K22032768K..." /></label>
                  <label>备选物料名称<input v-model="altEditor.data.material_name" class="f-input" placeholder="规格/描述" /></label>
                  <label>工厂<input v-model="altEditor.data.factory" class="f-input" placeholder="备选工厂" /></label>
                  <label>成本价<input v-model="altEditor.data.cost_price" class="f-input" placeholder="如 0.18含税" /></label>
                  <label>交期<input v-model="altEditor.data.lead_time" class="f-input" placeholder="如 7天 / 4-6周" /></label>
                </div>
                <div class="alt-editor-tip">主料缺货时临时可用的相近物料，选填</div>
                <div class="alt-editor-btns">
                  <button type="button" class="alt-op" @click="altEditor.open = false">取消</button>
                  <button type="button" class="alt-op primary" @click="saveAltEditor">保存</button>
                </div>
              </div>
            </div>

            <!-- 规格书 -->'''
assert old2 in s
s=s.replace(old2,new2,1)

# 数据默认字段
s=s.replace("form.value.alternates.push({ material_code: '', material_name: '', factory: '', cost_price: '' })","form.value.alternates.push({ material_code: '', material_name: '', factory: '', cost_price: '', lead_time: '' })\n  openAltEditor(form.value.alternates.length - 1)",1)
s=s.replace("alternates: (item.alternates || []).map(a => ({ material_code: a.material_code || '', material_name: a.material_name || '', factory: a.factory || '', cost_price: a.cost_price || '' }))","alternates: (item.alternates || []).map(a => ({ material_code: a.material_code || '', material_name: a.material_name || '', factory: a.factory || '', cost_price: a.cost_price || '', lead_time: a.lead_time || '' }))",1)

# 状态和函数
s=s.replace("const syncingCost = ref(false)","const syncingCost = ref(false)\nconst altEditor = reactive({ open: false, index: -1, data: { material_code: '', material_name: '', factory: '', cost_price: '', lead_time: '' } })",1)

s=s.replace('''function removeAlternate(i) {
  form.value.alternates.splice(i, 1)
}''','''function removeAlternate(i) {
  form.value.alternates.splice(i, 1)
}
function openAltEditor(i) {
  altEditor.index = i
  altEditor.data = { material_code: '', material_name: '', factory: '', cost_price: '', lead_time: '', ...form.value.alternates[i] }
  altEditor.open = true
}
function saveAltEditor() {
  if (altEditor.index < 0) return
  form.value.alternates[altEditor.index] = { ...altEditor.data }
  altEditor.open = false
}
function copyAlternate(alt) {
  const lines = [
    alt.material_code ? '编码：' + alt.material_code : '',
    alt.material_name ? '名称：' + alt.material_name : '',
    alt.factory ? '工厂：' + alt.factory : '',
    alt.cost_price ? '成本：' + alt.cost_price : '',
    alt.lead_time ? '交期：' + alt.lead_time : ''
  ].filter(Boolean)
  const text = lines.join('\\n')
  navigator.clipboard?.writeText(text).then(() => showToast('已复制备选信息')).catch(() => showToast(text))
}''',1)

# 悬停信息补交期
s=s.replace("    if (a.cost_price) parts.push(`成本:${a.cost_price}`)","    if (a.cost_price) parts.push(`成本:${a.cost_price}`)\n    if (a.lead_time) parts.push(`交期:${a.lead_time}`)",1)
s=s.replace("return (item.alternates || []).filter(a => a.material_name).map(a => a.material_name).join('、')","return (item.alternates || []).filter(a => a.material_name || a.material_code).map(a => [a.material_code, a.material_name, a.factory, a.cost_price, a.lead_time].filter(Boolean).join(' ')).join('、')",1)

# CSS
css='''
.alt-card { display: flex; gap: 10px; align-items: center; border: 1px solid #e4e7ec; background: #fbfcfe; border-radius: 8px; padding: 8px 10px; margin-top: 6px; }
.alt-card-main { flex: 1; min-width: 0; }
.alt-card-title { font-size: 13px; color: #1f2937; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.alt-card-factory { color: #667085; font-weight: normal; }
.alt-card-name { font-size: 12px; color: #475467; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.alt-card-meta { font-size: 11px; color: #98a2b3; margin-top: 3px; display: flex; gap: 12px; }
.alt-card-ops { display: flex; gap: 4px; flex: none; }
.alt-op { border: 1px solid #d0d5dd; background: #fff; border-radius: 6px; padding: 3px 8px; font-size: 12px; cursor: pointer; }
.alt-op.danger { color: #d92d20; border-color: #f3c1c1; }
.alt-op.primary { background: #00794f; border-color: #00794f; color: #fff; }
.alt-editor-mask { position: fixed; inset: 0; background: rgba(15,23,42,.45); z-index: 4000; display: flex; align-items: center; justify-content: center; }
.alt-editor { width: min(560px, 92vw); background: #fff; border-radius: 10px; padding: 16px; box-shadow: 0 18px 50px rgba(0,0,0,.35); }
.alt-editor h4 { margin: 0 0 10px; font-size: 15px; }
.alt-editor-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.alt-editor-grid label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: #667085; }
.alt-editor-tip { font-size: 11px; color: #98a2b3; margin-top: 8px; }
.alt-editor-btns { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
'''
idx=s.rfind("</style>")
s=s[:idx]+css+"\n"+s[idx:]
open(p,"w",encoding="utf-8",newline="").write(s)
print("ok")
