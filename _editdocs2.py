p = r"server/src/routes/companyDocs.js"
s = open(p, encoding="utf-8").read()
anchor = "// ===== 上传（可多文件；归属与分类走 query）====="
add = '''// ===== 资料文件夹（日期+自定义）=====
const todayTag = () => {
  const d = new Date()
  const p = (n) => String(n).padStart(2, "0")
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`
}

router.get('/folders', (req, res) => {
  try {
    const ownerType = req.query.owner_type === 'self' ? 'self' : 'customer'
    const ownerName = String(req.query.owner_name || '').trim()
    if (!ownerName) return res.status(400).json({ code: 1, msg: '缺少归属名' })
    const folders = queryAll(
      'SELECT * FROM company_doc_folders WHERE owner_type = ? AND owner_name = ? ORDER BY name DESC',
      [ownerType, ownerName]
    )
    const stats = queryAll(
      `SELECT folder_id,
              COUNT(*) AS total,
              SUM(CASE WHEN expires_at <> '' AND expires_at < date('now') THEN 1 ELSE 0 END) AS expired,
              SUM(CASE WHEN expires_at <> '' AND expires_at >= date('now') AND expires_at <= date('now','+30 day') THEN 1 ELSE 0 END) AS expiring
         FROM company_docs WHERE owner_type = ? AND owner_name = ?
        GROUP BY folder_id`,
      [ownerType, ownerName]
    )
    const byId = new Map(stats.map(x => [Number(x.folder_id) || 0, x]))
    const out = folders.map(f => {
      const st = byId.get(f.id) || {}
      return { id: f.id, name: f.name, created_at: f.created_at, total: st.total || 0, expired: st.expired || 0, expiring: st.expiring || 0 }
    })
    const un = byId.get(0) || {}
    res.json({
      code: 0,
      data: {
        folders: out,
        uncategorized: { id: 0, name: '未分类', total: un.total || 0, expired: un.expired || 0, expiring: un.expiring || 0 }
      }
    })
  } catch (e) {
    res.status(500).json({ code: 1, msg: '读取文件夹失败: ' + e.message })
  }
})

router.post('/folders', (req, res) => {
  try {
    const ownerType = req.body?.owner_type === 'self' ? 'self' : 'customer'
    const ownerName = String(req.body?.owner_name || '').trim()
    const raw = String(req.body?.name || '').trim()
    if (!ownerName) return res.status(400).json({ code: 1, msg: '缺少归属名' })
    const name = safeName(raw || `${todayTag()}-新文件夹`, 80)
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
    res.json({ code: 0, data: { id: r.lastInsertRowid, name } })
  } catch (e) {
    res.status(500).json({ code: 1, msg: '新建文件夹失败: ' + e.message })
  }
})

router.delete('/folders/:id', (req, res) => {
  try {
    const id = Number(req.params.id)
    const f = queryOne('SELECT * FROM company_doc_folders WHERE id = ?', [id])
    if (!f) return res.status(404).json({ code: 1, msg: '文件夹不存在' })
    const n = queryOne('SELECT COUNT(*) AS c FROM company_docs WHERE folder_id = ?', [id])?.c || 0
    if (n > 0) return res.status(400).json({ code: 1, msg: '文件夹里还有文件，先删文件' })
    execute('DELETE FROM company_doc_folders WHERE id = ?', [id])
    saveNow()
    try {
      const dir = path.join(ownerDir(f.owner_type, f.owner_name), f.name)
      if (fs.existsSync(dir) && !fs.readdirSync(dir).length) fs.rmdirSync(dir)
    } catch {}
    res.json({ code: 0 })
  } catch (e) {
    res.status(500).json({ code: 1, msg: '删除文件夹失败: ' + e.message })
  }
})

// ===== 单个文件设置过期时间（体系证书年审）=====
router.post('/docs/:id/expiry', (req, res) => {
  try {
    const id = Number(req.params.id)
    const row = queryOne('SELECT * FROM company_docs WHERE id = ?', [id])
    if (!row) return res.status(404).json({ code: 1, msg: '资料不存在' })
    const v = String(req.body?.expires_at || '').trim()
    if (v && !/^\\d{4}-\\d{2}-\\d{2}$/.test(v)) return res.status(400).json({ code: 1, msg: '日期格式应为 YYYY-MM-DD' })
    execute('UPDATE company_docs SET expires_at = ? WHERE id = ?', [v, id])
    saveNow()
    res.json({ code: 0, data: { id, expires_at: v } })
  } catch (e) {
    res.status(500).json({ code: 1, msg: '保存过期时间失败: ' + e.message })
  }
})

'''
assert anchor in s
s = s.replace(anchor, add + anchor, 1)
open(p, "w", encoding="utf-8", newline="").write(s)
print("ok")
