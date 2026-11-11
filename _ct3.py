p="server/src/routes/companyDocs.js"
s=open(p,encoding="utf-8").read()

# helper
s=s.replace('''export function ownerDir(ownerType, ownerName) {''','''function folderDir(ownerType, ownerName, title, name) {
  const base = ownerDir(ownerType, ownerName)
  const t = safeName(title || '', 60)
  return t ? path.join(base, t, name) : path.join(base, name)
}

export function ownerDir(ownerType, ownerName) {''',1)

# upload destination：取 folder 的 title
s=s.replace('''      const folderId = Number(req.query?.folder_id) || 0
      let sub = ''
      if (folderId) {
        const f = queryOne('SELECT name FROM company_doc_folders WHERE id = ? AND owner_type = ? AND owner_name = ?', [folderId, ownerType, ownerName])
        if (f) sub = safeName(f.name)
      }
      const dir = path.join(ownerDir(ownerType, ownerName), sub)''','''      const folderId = Number(req.query?.folder_id) || 0
      let sub = ''
      let subTitle = String(req.query?.title || '')
      if (folderId) {
        const f = queryOne('SELECT name, title FROM company_doc_folders WHERE id = ? AND owner_type = ? AND owner_name = ?', [folderId, ownerType, ownerName])
        if (f) { sub = safeName(f.name); subTitle = f.title || '' }
      }
      const dir = sub ? folderDir(ownerType, ownerName, subTitle, sub) : ownerDir(ownerType, ownerName)
      req._docTitle = subTitle''',1)

# upload insert title
s=s.replace('''       relOf(f.path), ext, f.size || 0, f.mimetype || '', note,
       Number(req.query?.folder_id) || 0, String(req.query?.expires_at || '').slice(0, 10)]''','''       relOf(f.path), ext, f.size || 0, f.mimetype || '', note,
       Number(req.query?.folder_id) || 0, String(req.query?.expires_at || '').slice(0, 10), req._docTitle || '']''',1)
s=s.replace("INSERT INTO company_docs (owner_type, owner_name, category, title, file_name, file_path, ext, size, mime, note, folder_id, expires_at)\n       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)","INSERT INTO company_docs (owner_type, owner_name, category, title, file_name, file_path, ext, size, mime, note, folder_id, expires_at, doc_title)\n       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",1)

# 新建 folder with title
s=s.replace('''    const name = safeName(raw || `${todayTag()}-新文件夹`, 80)
    if (!name) return res.status(400).json({ code: 1, msg: '文件夹名不合法' })
    const exists = queryOne(
      'SELECT id FROM company_doc_folders WHERE owner_type = ? AND owner_name = ? AND name = ?',
      [ownerType, ownerName, name]
    )
    if (exists) return res.status(400).json({ code: 1, msg: '文件夹「' + name + '」已存在' })
    const r = execute(
      'INSERT INTO company_doc_folders (owner_type, owner_name, name) VALUES (?, ?, ?)',
      [ownerType, ownerName, name]
    )
    saveNow()
    try { fs.mkdirSync(path.join(ownerDir(ownerType, ownerName), name), { recursive: true }) } catch {}
    res.json({ code: 0, data: { id: r.lastInsertRowid, name } })''','''    const name = safeName(raw || `${todayTag()}-新文件夹`, 80)
    const title = safeName(String(req.body?.title || ''), 60)
    if (!name) return res.status(400).json({ code: 1, msg: '文件夹名不合法' })
    const exists = queryOne(
      'SELECT id FROM company_doc_folders WHERE owner_type = ? AND owner_name = ? AND name = ? AND IFNULL(title, \\'\\') = ?',
      [ownerType, ownerName, name, title]
    )
    if (exists) return res.status(400).json({ code: 1, msg: '文件夹「' + name + '」已存在' })
    const r = execute(
      'INSERT INTO company_doc_folders (owner_type, owner_name, name, title) VALUES (?, ?, ?, ?)',
      [ownerType, ownerName, name, title]
    )
    saveNow()
    try { fs.mkdirSync(folderDir(ownerType, ownerName, title, name), { recursive: true }) } catch {}
    res.json({ code: 0, data: { id: r.lastInsertRowid, name } })''',1)

# 删除 folder dir 用 title
s=s.replace("const dir = path.join(ownerDir(f.owner_type, f.owner_name), f.name)","const dir = folderDir(f.owner_type, f.owner_name, f.title, f.name)",1)

open(p,"w",encoding="utf-8",newline="").write(s)
print("ok")
