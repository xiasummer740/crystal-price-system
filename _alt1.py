p="server/src/routes/materials.js"
s=open(p,encoding="utf-8").read()
s=s.replace("? JSON.stringify(b.alternates.filter(a => a && (a.material_name || a.factory)))","? JSON.stringify(b.alternates.filter(a => a && (a.material_code || a.material_name || a.factory || a.cost_price || a.lead_time)))",1)
s=s.replace("? JSON.stringify(b.alternates.filter(a => a && (a.material_name || a.factory)))","? JSON.stringify(b.alternates.filter(a => a && (a.material_code || a.material_name || a.factory || a.cost_price || a.lead_time)))",1)
open(p,"w",encoding="utf-8",newline="").write(s)
print("server ok")
