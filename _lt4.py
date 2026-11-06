p="server/src/utils/suggest.js"
s=open(p,encoding="utf-8").read()
s=s.replace("    factory: [['customer_materials', 'factory'], ['material_prices', 'factory_code'], ['material_samples', 'factory_code']],\n    customer_code: [['customer_materials', 'customer_code']]",
            "    factory: [['customer_materials', 'factory'], ['material_prices', 'factory_code'], ['material_samples', 'factory_code']],\n    lead_time: [['customer_materials', 'lead_time'], ['material_prices', 'standard_lead_time']],\n    customer_code: [['customer_materials', 'customer_code']]",1)
open(p,"w",encoding="utf-8",newline="").write(s)
print("suggest ok")
