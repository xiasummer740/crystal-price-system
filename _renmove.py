p = r"server/src/routes/companyDocs.js"
s = open(p, encoding="utf-8").read()
anchor = "// ===== 上传（可多文件；归属与分类走 query）====="
add = '''// ===== 文件夹重命名（磁盘目录 + 库里 file_path 一起改）=====
router.post('/folders/:id/rename', (req, res) => {
  try {
    const id = Number(req.params.id)
    const f = queryOne('SELECT * FROM company_doc_folders WHERE id = ?', [id])
    if (!f) return res.status(404).json({ code: 1, msg: '文件夹不存在' })
    const name = safeName(String(req.body?.name || '').trim(), 80)
    if (!name) return res.status(400).json({ code: 1, msg: '文件夹名不合法' })
    if (name === f.name) return res.json({ code: 0, data: { id, name } })
    const dup = queryOne(
      'SELECT id FROM company_doc_folders WHERE owner_type = ? AND owner_name = ? AND name = ? AND id <> ?',
      [f.owner_type, f.owner_name, name, id]
    )
    if (dup) return res.status(400).json({ code: 1, msg: '已经有同名文件夹了' })

    const base = ownerDir(f.owner_type, f.owner_name)
    const oldDir = path.join(base, f.name)
    const newDir = path.join(base, name)
    if (fs.existsSync(newDir)) return res.status(400).json({ code: 1, msg: '磁盘上已有同名文件夹' })
    if (fs.existsSync(oldDir)) {
      try { fs.renameSync(oldDir, newDir) }
      catch (e) { return res.status(500).json({ code: 1, msg: '改名失败（文件可能被占用）: ' + e.message }) }
    }

    execute('UPDATE company_doc_folders SET name = ? WHERE id = ?', [name, id])
    // 文件夹里每个文件的相对路径也要跟着改
    const docs = queryAll('SELECT id, file_path FROM company_docs WHERE folder_id = ?', [id])
    for (const d of docs) {
      const absOld = absOf(d.file_path)
      const relNew = relOf(path.join(newDir, path.basename(absOld)))
      execute('UPDATE company_docs SET file_path = ? WHERE id = ?', [relNew, d.id])
    }
    saveNow()
    res.json({ code: 0, data: { id, name } })
  } catch (e) {
    res.status(500).json({ code: 1, msg: '重命名失败: ' + e.message })
  }
})

// ===== 文件移动到别的文件夹（folder_id=0 → 未分类）=====
router.post('/docs/:id/move', (req, res) => {
  try {
    const id = Number(req.params.id)
    const doc = queryOne('SELECT * FROM company_docs WHERE id = ?', [id])
    if (!doc) return res.status(404).json({ code: 1, msg: '资料不存在' })
    const targetId = Number(req.body?.folder_id) || 0
    if (targetId === Number(doc.folder_id || 0)) return res.json({ code: 0, data: { id } })
    let targetName = ''
    if (targetId) {
      const tf = queryOne('SELECT * FROM company_doc_folders WHERE id = ?', [targetId])
      if (!tf) return res.status(404).json({ code: 1, msg: '目标文件夹不存在' })
      if (tf.owner_type !== doc.owner_type || tf.owner_name !== doc.owner_name) {
        return res.status(400).json({ code: 1, msg: '不能移到别的客户/主体的文件夹' })
      }
      targetName = tf.name
    }
    const absOld = absOf(doc.file_path)
    if (!fs.existsSync(absOld)) return res.status(404).json({ code: 1, msg: '文件不存在（可能被手工删了）' })
    const targetDir = path.join(ownerDir(doc.owner_type, doc.owner_name), targetName)
    fs.mkdirSync(targetDir, { recursive: true })
    let dest = path.join(targetDir, path.basename(absOld))
    const ext = path.extname(dest); const stem = path.basename(dest, ext)
    let i = 1
    while (fs.existsSync(dest)) dest = path.join(targetDir, `${stem}_${i++}${ext}`)
    try { fs.renameSync(absOld, dest) }
    catch (e) { return res.status(500).json({ code: 1, msg: '移动失败（文件可能被占用）: ' + e.message }) }
    execute('UPDATE company_docs SET folder_id = ?, file_path = ? WHERE id = ?', [targetId, relOf(dest), id])
    saveNow()
    res.json({ code: 0, data: { id, folder_id: targetId } })
  } catch (e) {
    res.status(500).json({ code: 1, msg: '移动失败: ' + e.message })
  }
})

'''
assert anchor in s
s = s.replace(anchor, add + anchor, 1)
open(p, "w", encoding="utf-8", newline="").write(s)
print("ok")
