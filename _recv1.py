p = r"server/src/routes/materials.js"
s = open(p, encoding="utf-8").read()
old = """  const data = [
    ...sites.map((x) => ({ type: 'site', label: x.name || '收货点', address: x.address, contact: [x.contact_name, x.contact_phone].filter(Boolean).join(' '), is_default: !!x.is_default })),
    ...purchasers.map((x) => ({ type: 'purchaser', label: x.name ? x.name + ' 收件地址' : '联系人地址', address: x.address, contact: x.phone || '', is_default: false }))
  ]"""
new = """  const data = [
    ...sites.map((x) => ({
      type: 'site',
      label: x.name || '收货点',
      name: x.contact_name || x.name || '',
      phone: x.contact_phone || '',
      address: x.address,
      is_default: !!x.is_default
    })),
    ...purchasers.map((x) => ({
      type: 'purchaser',
      label: '联系人',
      name: x.name || '',
      phone: x.phone || '',
      address: x.address,
      is_default: false
    }))
  ]"""
assert old in s
s = s.replace(old, new, 1)
open(p, "w", encoding="utf-8", newline="").write(s)
print("ok")
