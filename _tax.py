p="client/src/views/Materials.vue"
s=open(p,encoding="utf-8").read()

# 报价显示：带含税/未税
s=s.replace('''<b>{{ quoteRef.date }}</b> · 报价 <b class="qr-price">{{ quoteRef.price }}</b>''','''<b>{{ quoteRef.date }}</b> · 报价 <b class="qr-price">{{ quotePriceText(quoteRef) }}</b>''',1)

# 函数
s=s.replace('''function useQuoteCost() {
  if (!quoteRef.value) return
  form.value.cost_price = String(quoteRef.value.price ?? '')
  showToast('已带入成本价 ' + form.value.cost_price)
}''','''function quotePriceText(q) {
  if (!q) return ''
  const hasTax = q.price_with_tax !== null && q.price_with_tax !== undefined && q.price_with_tax !== ''
  const noTax = q.price_without_tax !== null && q.price_without_tax !== undefined && q.price_without_tax !== ''
  const label = hasTax ? '含税' : (noTax ? '未税' : '')
  return String(q.price ?? '') + label
}
function useQuoteCost() {
  if (!quoteRef.value) return
  form.value.cost_price = quotePriceText(quoteRef.value)
  showToast('已带入成本价 ' + form.value.cost_price)
}''',1)

# 悬停提示也带含税
s=s.replace("return `最近报价：${q.date}\\n报价：${q.price}\\n工厂：${q.factory || '-'}\\n报价人：${q.quoter || '-'}\\n（点击可复制成本价）`", "return `最近报价：${q.date}\\n报价：${quotePriceText(q)}\\n工厂：${q.factory || '-'}\\n报价人：${q.quoter || '-'}\\n（点击可复制成本价）`",1)
open(p,"w",encoding="utf-8",newline="").write(s)
print("ok")
