p = r"server/src/routes/materials.js"
s = open(p, encoding="utf-8").read()

old = '''    if (r?.cost_price) return String(r.cost_price)
  }
  return ''
}'''
new = '''    if (r?.cost_price) return String(r.cost_price)
  }
  // 再退一步：样品报价里同物料编码的成本价
  if (materialCode) {
    const sp = queryOne(
      `SELECT cost_price FROM material_samples
        WHERE is_deleted = 0 AND cost_price IS NOT NULL AND cost_price <> '' AND material_code = ?
        ORDER BY updated_at DESC, id DESC LIMIT 1`,
      [materialCode]
    )
    if (sp?.cost_price) return String(sp.cost_price)
  }
  return ''
}'''
assert old in s
s = s.replace(old, new, 1)

# 编辑时：没传成本价才自动补（显式清空则不补）
old2 = '''    b.price ?? existing.price,
    b.cost_price ?? existing.cost_price,'''
new2 = '''    b.price ?? existing.price,
    b.cost_price ?? (existing.cost_price || lookupCostPrice(b.jkx_code ?? existing.jkx_code, b.material_code ?? existing.material_code)),'''
assert old2 in s
s = s.replace(old2, new2, 1)
open(p, "w", encoding="utf-8", newline="").write(s)
print("ok")
