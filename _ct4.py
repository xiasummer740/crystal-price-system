p="server/src/db.js"
s=open(p,encoding="utf-8").read()
s=s.replace("  try { db.run(\"ALTER TABLE company_docs ADD COLUMN title TEXT DEFAULT ''\") } catch {}\n  try { db.run(\"ALTER TABLE company_doc_folders ADD COLUMN title TEXT DEFAULT ''\") } catch {}","  try { db.run(\"ALTER TABLE company_docs ADD COLUMN title TEXT DEFAULT ''\") } catch {}\n  try { db.run(\"ALTER TABLE company_doc_folders ADD COLUMN title TEXT DEFAULT ''\") } catch {}\n  try { db.run(\"ALTER TABLE company_docs ADD COLUMN billing_title TEXT DEFAULT ''\") } catch {}\n  try { db.run(\"ALTER TABLE company_doc_folders ADD COLUMN billing_title TEXT DEFAULT ''\") } catch {}",1)
open(p,"w",encoding="utf-8",newline="").write(s)

p="server/src/routes/companyDocs.js"
s=open(p,encoding="utf-8").read()
s=s.replace("  title: r.title || '',","  billing_title: r.billing_title || '',",1)
s=s.replace("    sql += ' AND title = ?';\n    params.push(String(req.query.title))","    sql += ' AND billing_title = ?';\n    params.push(String(req.query.title))",1)
s=s.replace("if (titleFilter !== null) { folderSql += ' AND title = ?'; folderParams.push(titleFilter) }","if (titleFilter !== null) { folderSql += ' AND billing_title = ?'; folderParams.push(titleFilter) }",1)
s=s.replace("const statTitle = titleFilter !== null ? ' AND title = ?' : ''","const statTitle = titleFilter !== null ? ' AND billing_title = ?' : ''",1)
s=s.replace("SELECT id FROM company_doc_folders WHERE owner_type = ? AND owner_name = ? AND name = ? AND IFNULL(title, '') = ?","SELECT id FROM company_doc_folders WHERE owner_type = ? AND owner_name = ? AND name = ? AND IFNULL(billing_title, '') = ?",1)
s=s.replace("'INSERT INTO company_doc_folders (owner_type, owner_name, name, title) VALUES (?, ?, ?, ?)'","'INSERT INTO company_doc_folders (owner_type, owner_name, name, billing_title) VALUES (?, ?, ?, ?)'",1)
s=s.replace("SELECT name, title FROM company_doc_folders WHERE id = ? AND owner_type = ? AND owner_name = ?","SELECT name, billing_title FROM company_doc_folders WHERE id = ? AND owner_type = ? AND owner_name = ?",1)
s=s.replace("if (f) { sub = safeName(f.name); subTitle = f.title || '' }","if (f) { sub = safeName(f.name); subTitle = f.billing_title || '' }",1)
s=s.replace("folder_id, expires_at, doc_title)\n       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)","folder_id, expires_at, billing_title)\n       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",1)
s=s.replace("const dir = folderDir(f.owner_type, f.owner_name, f.title, f.name)","const dir = folderDir(f.owner_type, f.owner_name, f.billing_title, f.name)",1)
open(p,"w",encoding="utf-8",newline="").write(s)
print("ok")
