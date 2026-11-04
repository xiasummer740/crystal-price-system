p="server/src/routes/materials.js"
s=open(p,encoding="utf-8").read()
s=s.replace('''    price: q.price_with_tax ?? q.price_without_tax ?? '',
    price_with_tax: q.price_with_tax,''','''    price: (q.currency === 'USD' ? q.price_without_tax : (q.price_with_tax ?? q.price_without_tax)) ?? '',
    price_with_tax: q.currency === 'USD' ? null : q.price_with_tax,''',1)
open(p,"w",encoding="utf-8",newline="").write(s)
print("materials ok")
