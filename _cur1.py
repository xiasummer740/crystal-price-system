p="client/src/views/Materials.vue"
s=open(p,encoding="utf-8").read()

old='''                  <b>{{ quoteRef.date }}</b> · 报价 <b class="qr-price">{{ quotePriceText(quoteRef) }}</b>
                  <span>&nbsp;· {{ quoteRef.factory || '工厂未填' }}</span>
                  <span>· {{ quoteRef.quoter || '报价人未填' }}</span>'''
new='''                  <b>{{ quoteRef.date }}</b>
                  <span v-if="hasTaxPrice"> · 含税 <b class="qr-price">{{ moneyText(quoteRef, 'tax') }}</b></span>
                  <span v-if="hasNoTaxPrice"> · 未税 <b class="qr-price">{{ moneyText(quoteRef, 'notax') }}</b></span>
                  <span>&nbsp;· {{ quoteRef.factory || '工厂未填' }}</span>
                  <span>· {{ quoteRef.quoter || '报价人未填' }}</span>'''
assert old in s
s=s.replace(old,new,1)

old2='''                  <button type="button" class="qr-btn primary" @click="useQuoteCost">带入成本价</button>
                  <button type="button" class="qr-btn" @click="quoteRef = null">不带入</button>'''
new2='''                  <button v-if="hasTaxPrice" type="button" class="qr-btn primary" @click="useQuoteCost('tax')">带入含税价</button>
                  <button v-if="hasNoTaxPrice" type="button" class="qr-btn" @click="useQuoteCost('notax')">带入未税价</button>
                  <button type="button" class="qr-btn" @click="quoteRef = null">不带入</button>'''
assert old2 in s
s=s.replace(old2,new2,1)

# 计算属性
s=s.replace("const quoteRef = ref(null)","const quoteRef = ref(null)\nconst hasTaxPrice = computed(() => quoteRef.value && quoteRef.value.price_with_tax !== null && quoteRef.value.price_with_tax !== undefined && quoteRef.value.price_with_tax !== '')\nconst hasNoTaxPrice = computed(() => quoteRef.value && quoteRef.value.price_without_tax !== null && quoteRef.value.price_without_tax !== undefined && quoteRef.value.price_without_tax !== '')",1)

# 金额文案：带币种 + 含税/未税
s=s.replace('''function quotePriceText(q) {
  if (!q) return ''
  const hasTax = q.price_with_tax !== null && q.price_with_tax !== undefined && q.price_with_tax !== ''
  const noTax = q.price_without_tax !== null && q.price_without_tax !== undefined && q.price_without_tax !== ''
  const label = hasTax ? '含税' : (noTax ? '未税' : '')
  return String(q.price ?? '') + label
}''','''function moneyText(q, which) {
  if (!q) return ''
  const v = which === 'tax' ? q.price_with_tax : q.price_without_tax
  if (v === null || v === undefined || v === '') return ''
  const cur = q.currency && q.currency !== 'CNY' ? ' ' + q.currency : ''
  const tax = which === 'tax' ? '含税' : '未税'
  return `${v}${cur} ${tax}`
}
function quotePriceText(q) {
  if (!q) return ''
  return moneyText(q, 'tax') || moneyText(q, 'notax') || String(q.price ?? '')
}''',1)

# 带入：按选择的含税/未税
s=s.replace('''function useQuoteCost() {
  if (!quoteRef.value) return
  form.value.cost_price = quotePriceText(quoteRef.value)
  showToast('已带入成本价 ' + form.value.cost_price)
}''','''function useQuoteCost(which = 'tax') {
  if (!quoteRef.value) return
  const text = moneyText(quoteRef.value, which) || quotePriceText(quoteRef.value)
  form.value.cost_price = text
  showToast('已带入成本价 ' + text)
}''',1)

# 悬停提示带币种
s=s.replace("return `最近报价：${q.date}\\n报价：${quotePriceText(q)}\\n工厂：${q.factory || '-'}\\n报价人：${q.quoter || '-'}\\n（点击可复制成本价）`","return `最近报价：${q.date}\\n含税：${moneyText(q, 'tax') || '-'}\\n未税：${moneyText(q, 'notax') || '-'}\\n工厂：${q.factory || '-'}\\n报价人：${q.quoter || '-'}\\n（点击可复制成本价）`",1)
open(p,"w",encoding="utf-8",newline="").write(s)
print("ok")
