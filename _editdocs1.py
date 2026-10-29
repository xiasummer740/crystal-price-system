p = r"server/src/routes/companyDocs.js"
s = open(p, encoding="utf-8").read()

# 1) shape 增加 folder_id / expires_at
s = s.replace("""  note: r.note || '',""", """  note: r.note || '',
  folder_id: r.folder_id || 0,
  expires_at: r.expires_at || '',""")

# 2) upload destination 支持 folder_id
old_dest = """      const ownerName = safeName(String(req.query?.owner_name || '').trim())
      const dir = ownerDir(ownerType, ownerName)
      try { fs.mkdirSync(dir, { recursive: true }) } catch {}
      req._docType = ownerType
      req._docOwner = ownerName
      req._docDir = dir
      cb(null, dir)"""
new_dest = """      const ownerName = safeName(String(req.query?.owner_name || '').trim())
      const folderId = Number(req.query?.folder_id) || 0
      let sub = ''
      if (folderId) {
        const f = queryOne('SELECT name FROM company_doc_folders WHERE id = ? AND owner_type = ? AND owner_name = ?', [folderId, ownerType, ownerName])
        if (f) sub = safeName(f.name)
      }
      const dir = path.join(ownerDir(ownerType, ownerName), sub)
      try { fs.mkdirSync(dir, { recursive: true }) } catch {}
      req._docType = ownerType
      req._docOwner = ownerName
      req._docDir = dir
      req._docFolder = folderId
      cb(null, dir)"""
assert old_dest in s
s = s.replace(old_dest, new_dest)

# 3) /docs 支持 folder_id 过滤
old_docs = """  const rows = queryAll(
    `SELECT * FROM company_docs WHERE owner_type = ? AND owner_name = ? ORDER BY created_at DESC, id DESC`,
    [ownerType, ownerName]
  )"""
new_docs = """  let sql = `SELECT * FROM company_docs WHERE owner_type = ? AND owner_name = ?`
  const params = [ownerType, ownerName]
  if (req.query.folder_id !== undefined) {
    sql += ' AND folder_id = ?'
    params.push(Number(req.query.folder_id) || 0)
  }
  sql += ' ORDER BY created_at DESC, id DESC'
  const rows = queryAll(sql, params)"""
assert old_docs in s
s = s.replace(old_docs, new_docs)

# 4) 上传 insert 带 folder_id / expires_at
old_ins = """    const r = execute(
      `INSERT INTO company_docs (owner_type, owner_name, category, title, file_name, file_path, ext, size, mime, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req._docType, req._docOwner, category, original.slice(0, 200), original.slice(0, 200),
       relOf(f.path), ext, f.size || 0, f.mimetype || '', note]
    )"""
new_ins = """    const r = execute(
      `INSERT INTO company_docs (owner_type, owner_name, category, title, file_name, file_path, ext, size, mime, note, folder_id, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req._docType, req._docOwner, category, original.slice(0, 200), original.slice(0, 200),
       relOf(f.path), ext, f.size || 0, f.mimetype || '', note,
       Number(req.query?.folder_id) || 0, String(req.query?.expires_at || '').slice(0, 10)]
    )"""
assert old_ins in s
s = s.replace(old_ins, new_ins)

open(p, "w", encoding="utf-8", newline="").write(s)
print("ok")
