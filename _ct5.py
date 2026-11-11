p="server/src/routes/companyDocs.js"
s=open(p,encoding="utf-8").read()
s=s.replace("  if (req.query.title !== undefined && req.query.title !== null) {\n    sql += ' AND title = ?'\n    params.push(String(req.query.title))","  if (req.query.title !== undefined && req.query.title !== null) {\n    sql += ' AND billing_title = ?'\n    params.push(String(req.query.title))",1)
open(p,"w",encoding="utf-8",newline="").write(s)
print("ok")
