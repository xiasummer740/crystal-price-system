p="client/src/views/Materials.vue"
s=open(p,encoding="utf-8").read()

# 成本价输入 + 参考条
old='''              <div class="form-field">
                <label>成本价</label>
                <input v-model="form.cost_price" placeholder="成本价" class="f-input" />
              </div>'''
new='''              <div class="form-field">
                <label>成本价</label>
                <input ref="costInput" v-model="form.cost_price" placeholder="成本价" class="f-input" />
              </div>
              <div v-if="quoteRef" class="quote-ref form-field-full">
                <div class="qr-main">
                  <span class="qr-badge">最近报价</span>
                  <b>{{ quoteRef.date }}</b> · 报价 <b class="qr-price">{{ quoteRef.price }}</b>
                  <span>· {{ quoteRef.factory || '工厂未填' }}</span>
                  <span>· {{ quoteRef.quoter || '报价人未填' }}</span>
                </div>
                <div class="qr-actions">
                  <button type="button" class="qr-btn primary" @click="useQuoteCost">带入成本价</button>
                  <button type="button" class="qr-btn" @click="quoteRef = null">不带入</button>
                  <button type="button" class="qr-btn" @click="focusCost">自定义</button>
                </div>
              </div>'''
assert old in s
s=s.replace(old,new,1)

# 表格成本价 title
old2='''<td class="cell-copy" :style="{ width: colWidths.cost_price + 'px', textAlign: colAligns.cost_price }" @click="copyText(item.cost_price)">{{ item.cost_price }}</td>'''
new2='''<td class="cell-copy cost-cell" :title="costTip(item)" :style="{ width: colWidths.cost_price + 'px', textAlign: colAligns.cost_price }" @click="copyText(item.cost_price)">{{ item.cost_price }}<span v-if="item.latest_quote" class="cost-info">ⓘ</span></td>'''
assert old2 in s
s=s.replace(old2,new2,1)

# 状态/导入
s=s.replace("import { computed, ref, onMounted, nextTick, watch } from 'vue'", "import { computed, ref, onMounted, nextTick, watch } from 'vue'") if False else s
# ensure watch imported
if "watch" not in s.split("from 'vue'")[0][-80:]:
    s=s.replace("import { computed, ref, onMounted, nextTick } from 'vue'","import { computed, ref, onMounted, nextTick, watch } from 'vue'",1)

# 状态 + 函数
s=s.replace("const syncingCost = ref(false)", "const syncingCost = ref(false)\nconst quoteRef = ref(null)\nconst costInput = ref(null)\nlet quoteTimer = null",1)

old3='''// 批量同步成本价（同料号最近一次，不覆盖已填）'''
new3='''// 报价页面参考：按物料编码取最近一条报价
async function loadQuoteRef(code) {
  if (!code) { quoteRef.value = null; return }
  try {
    const r = await fetchLatestQuote(code)
    quoteRef.value = r.data || null
  } catch { quoteRef.value = null }
}
function scheduleQuoteRef() {
  clearTimeout(quoteTimer)
  quoteTimer = setTimeout(() => {
    if (!showForm.value) return
    const code = String(form.value.material_code || form.value.jkx_code || '').trim()
    loadQuoteRef(code)
  }, 300)
}
watch(() => [form.value.material_code, form.value.jkx_code], scheduleQuoteRef)
function useQuoteCost() {
  if (!quoteRef.value) return
  form.value.cost_price = String(quoteRef.value.price ?? '')
  showToast('已带入成本价 ' + form.value.cost_price)
}
function focusCost() {
  costInput.value?.focus()
}
function costTip(item) {
  const q = item.latest_quote
  if (!q) return '报价页面暂无同编码报价'
  return `最近报价：${q.date}\\n报价：${q.price}\\n工厂：${q.factory || '-'}\\n报价人：${q.quoter || '-'}\\n（点击可复制成本价）`
}

// 批量同步成本价（同料号最近一次，不覆盖已填）'''
assert old3 in s
s=s.replace(old3,new3,1)

# openForm 时刷新参考
s=s.replace("""  showForm.value = true
  loadMatSuggestions()""","""  showForm.value = true
  quoteRef.value = null
  const qcode = String(form.value.material_code || form.value.jkx_code || '').trim()
  if (qcode) nextTick(() => loadQuoteRef(qcode))
  loadMatSuggestions()""",1)

# 导入 fetchLatestQuote
s=s.replace("copyMaterialFile, syncMaterialCost", "copyMaterialFile, syncMaterialCost, fetchLatestQuote", 1)

# CSS
css='''
/* 报价参考条 */
.quote-ref { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; background: #f6fffb; border: 1px solid #b7ebd6; border-radius: 8px; padding: 8px 10px; font-size: 12px; color: #344054; }
.qr-main { flex: 1; min-width: 0; }
.qr-badge { background: #d9f7ea; color: #00794f; border-radius: 10px; padding: 1px 8px; font-size: 11px; margin-right: 6px; }
.qr-price { color: #d46b08; }
.qr-actions { display: flex; gap: 6px; }
.qr-btn { border: 1px solid #d0d5dd; background: #fff; border-radius: 6px; padding: 4px 9px; font-size: 12px; cursor: pointer; }
.qr-btn.primary { background: #00794f; border-color: #00794f; color: #fff; }
.cost-cell { cursor: pointer; }
.cost-info { color: #98a2b3; font-size: 10px; margin-left: 3px; }
'''
idx=s.rfind("</style>")
s=s[:idx]+css+"\n"+s[idx:]
open(p,"w",encoding="utf-8",newline="").write(s)
print("ui ok")
