p = r"server/src/routes/materials.js"
s = open(p, encoding="utf-8").read()
start = s.index("  const data = [")
end = s.index("  res.json({ code: 0, data })", start)
new = """  // 同一个地址可能既有「收货点」又有「联系人收件地址」→ 按地址去重，
  // 有人名的联系人优先（姓名/电话更具体），收货点名称作为补充标签
  const norm = (v) => String(v || '').replace(/\\s+/g, '')
  const map = new Map()
  for (const x of sites) {
    const key = norm(x.address)
    if (!key) continue
    map.set(key, {
      type: 'site',
      label: x.name || '收货点',
      name: x.contact_name || '',
      phone: x.contact_phone || '',
      address: x.address,
      is_default: !!x.is_default
    })
  }
  for (const x of purchasers) {
    const key = norm(x.address)
    if (!key) continue
    const hit = map.get(key)
    if (hit) {
      // 联系人的人名/电话覆盖收货点上的「采购部收货」之类
      if (x.name) hit.name = x.name
      if (x.phone) hit.phone = x.phone
      hit.label = hit.label || '联系人'
      hit.type = 'merged'
    } else {
      map.set(key, {
        type: 'purchaser',
        label: '联系人',
        name: x.name || '',
        phone: x.phone || '',
        address: x.address,
        is_default: false
      })
    }
  }
  const data = [...map.values()]
"""
s = s[:start] + new + s[end:]
open(p, "w", encoding="utf-8", newline="").write(s)
print("ok")
