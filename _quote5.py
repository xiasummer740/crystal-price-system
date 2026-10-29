p="client/src/views/Materials.vue"
s=open(p,encoding="utf-8").read()
s=s.replace('''<SuggestField plain input-class="f-input" v-model="form.material_code" :options="matOpts.codes"
                  :drop-width="560" placeholder="物料编码（可联想）" @select="onPickMatCode" />''','''<SuggestField plain input-class="f-input" v-model="form.material_code" :options="matOpts.codes"
                  :drop-width="560" placeholder="物料编码（可联想）" @select="onPickMatCode"
                  @input="onCodeTyped" @blur="onCodeTyped" />''',1)
s=s.replace('''function scheduleQuoteRef() {
  clearTimeout(quoteTimer)
  quoteTimer = setTimeout(() => {
    if (!showForm.value) return
    const code = String(form.value.material_code || form.value.jkx_code || '').trim()
    loadQuoteRef(code)
  }, 300)
}''','''function scheduleQuoteRef(code) {
  clearTimeout(quoteTimer)
  quoteTimer = setTimeout(() => {
    if (!showForm.value) return
    const c = String(code ?? form.value.material_code ?? form.value.jkx_code ?? '').trim()
    loadQuoteRef(c)
  }, 300)
}
function onCodeTyped(e) {
  scheduleQuoteRef(e?.target?.value)
}''',1)
open(p,"w",encoding="utf-8",newline="").write(s)
print("ok")
