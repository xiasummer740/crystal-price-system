p="server/src/routes/materials.js"
s=open(p,encoding="utf-8").read()
s=s.replace('''        INSERT INTO customer_materials (customer, date, customer_code, jkx_code, price, cost_price, material_code, material_name, factory, lead_time, status, customer_desc, remark, alternates, spec_document)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''','''        INSERT INTO customer_materials (customer, date, customer_code, jkx_code, price, cost_price, material_code, material_name, factory, lead_time, status, customer_desc, remark, alternates, spec_document)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',1)
s=s.replace('''        String(row['工厂'] || ''),
        String(row['状态'] || '报价'),''','''        String(row['工厂'] || ''),
        String(row['交期'] || ''),
        String(row['状态'] || '报价'),''',1)
s=s.replace('''    INSERT INTO customer_materials (customer, date, customer_code, jkx_code, price, cost_price, material_code, material_name, factory, lead_time, status, customer_desc, remark, alternates, spec_document, remark_images)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''','''    INSERT INTO customer_materials (customer, date, customer_code, jkx_code, price, cost_price, material_code, material_name, factory, lead_time, status, customer_desc, remark, alternates, spec_document, remark_images)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',1)
s=s.replace('''    b.factory || '',
    b.status || '报价',''','''    b.factory || '',
    b.lead_time || '',
    b.status || '报价',''',1)
open(p,"w",encoding="utf-8",newline="").write(s)
print("ok")
