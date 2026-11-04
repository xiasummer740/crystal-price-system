p="server/src/routes/prices.js"
s=open(p,encoding="utf-8").read()
s=s.replace("b.price_with_tax??null,b.price_without_tax??null,b.currency||'CNY'", "(b.currency==='USD'?null:(b.price_with_tax??null)),b.price_without_tax??null,b.currency||'CNY'",1)
s=s.replace('''  const values = fields.map(f => {
    if (f === 'remark_images') return Array.isArray(req.body[f]) ? JSON.stringify(req.body[f]) : (existing[f] || '[]')
    return req.body[f] ?? existing[f]
  })''','''  const values = fields.map(f => {
    if (f === 'remark_images') return Array.isArray(req.body[f]) ? JSON.stringify(req.body[f]) : (existing[f] || '[]')
    return req.body[f] ?? existing[f]
  })
  // 美元报价只有未税价，不允许存含税价
  if (values[fields.indexOf('currency')] === 'USD') values[fields.indexOf('price_with_tax')] = null''',1)
open(p,"w",encoding="utf-8",newline="").write(s)
print("prices ok")
