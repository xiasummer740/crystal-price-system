p="server/src/routes/materials.js"
s=open(p,encoding="utf-8").read()
# INSERT 两处：加 lead_time
s=s.replace("INSERT INTO customer_materials (customer, date, customer_code, jkx_code, price, cost_price, material_code, material_name, factory, status, customer_desc, remark, alternates, spec_document)",
            "INSERT INTO customer_materials (customer, date, customer_code, jkx_code, price, cost_price, material_code, material_name, factory, lead_time, status, customer_desc, remark, alternates, spec_document)",1)
s=s.replace("VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)\n  `, [\n    b.customer || '',\n    b.date || '',\n    b.customer_code || '',\n    b.jkx_code || '',\n    b.price || '',\n    b.cost_price || '',\n    b.material_code || '',\n    b.material_name || '',\n    b.factory || '',\n    b.status || '报价',",
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)\n  `, [\n    b.customer || '',\n    b.date || '',\n    b.customer_code || '',\n    b.jkx_code || '',\n    b.price || '',\n    b.cost_price || '',\n    b.material_code || '',\n    b.material_name || '',\n    b.factory || '',\n    b.lead_time || '',\n    b.status || '报价',",1)

# 第二处批量/另一个 insert
s=s.replace("INSERT INTO customer_materials (customer, date, customer_code, jkx_code, price, cost_price, material_code, material_name, factory, status, customer_desc, remark, alternates, spec_document, remark_images)",
            "INSERT INTO customer_materials (customer, date, customer_code, jkx_code, price, cost_price, material_code, material_name, factory, lead_time, status, customer_desc, remark, alternates, spec_document, remark_images)",1)
s=s.replace("VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)\n  `, [\n    b.customer || '',\n    b.date || '',\n    b.customer_code || '',\n    b.jkx_code || '',\n    b.price || '',\n    b.cost_price || '',\n    b.material_code || '',\n    b.material_name || '',\n    b.factory || '',\n    b.status || '报价',",
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)\n  `, [\n    b.customer || '',\n    b.date || '',\n    b.customer_code || '',\n    b.jkx_code || '',\n    b.price || '',\n    b.cost_price || '',\n    b.material_code || '',\n    b.material_name || '',\n    b.factory || '',\n    b.lead_time || '',\n    b.status || '报价',",1)

# UPDATE
s=s.replace("UPDATE customer_materials SET customer=?, date=?, customer_code=?, jkx_code=?, price=?, cost_price=?, material_code=?, material_name=?, factory=?, status=?,","UPDATE customer_materials SET customer=?, date=?, customer_code=?, jkx_code=?, price=?, cost_price=?, material_code=?, material_name=?, factory=?, lead_time=?, status=?,",1)
s=s.replace("    b.factory ?? existing.factory,\n    b.status ?? existing.status,","    b.factory ?? existing.factory,\n    b.lead_time ?? existing.lead_time ?? '',\n    b.status ?? existing.status,",1)
open(p,"w",encoding="utf-8",newline="").write(s)
print("materials ok")
