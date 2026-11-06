p="server/src/routes/materials.js"
s=open(p,encoding="utf-8").read()
s=s.replace("(a.material_code || a.material_name || a.factory || a.cost_price || a.lead_time)","(a.jkx_code || a.material_code || a.material_name || a.factory || a.cost_price || a.lead_time)")
open(p,"w",encoding="utf-8",newline="").write(s)
print("server ok")
