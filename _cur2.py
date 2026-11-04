p="client/src/views/Materials.vue"
s=open(p,encoding="utf-8").read()
s=s.replace('''  const cur = q.currency && q.currency !== 'CNY' ? ' ' + q.currency : ''
  const tax = which === 'tax' ? '含税' : '未税'
  return `${v}${cur} ${tax}`
}''','''  const cur = q.currency && q.currency !== 'CNY' ? ' ' + q.currency : ''
  return `${v}${cur}`
}
function moneyLabel(q, which) {
  const m = moneyText(q, which)
  return m ? `${m} ${which === 'tax' ? '含税' : '未税'}` : ''
}''',1)
s=s.replace("return moneyText(q, 'tax') || moneyText(q, 'notax') || String(q.price ?? '')","return moneyLabel(q, 'tax') || moneyLabel(q, 'notax') || String(q.price ?? '')",1)
s=s.replace("const text = moneyText(quoteRef.value, which) || quotePriceText(quoteRef.value)","const text = moneyLabel(quoteRef.value, which) || quotePriceText(quoteRef.value)",1)
open(p,"w",encoding="utf-8",newline="").write(s)
print("ok")
