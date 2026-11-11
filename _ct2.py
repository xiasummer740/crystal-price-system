p="server/src/routes/companyDocs.js"
s=open(p,encoding="utf-8").read()

# shape 带 title
s=s.replace("  folder_id: r.folder_id || 0,","  title: r.title || '',\n  folder_id: r.folder_id || 0,",1)

# docs 过滤 title
s=s.replace('''  if (req.query.folder_id !== undefined) {
    sql += ' AND folder_id = ?'
    params.push(Number(req.query.folder_id) || 0)
  }''','''  if (req.query.folder_id !== undefined) {
    sql += ' AND folder_id = ?'
    params.push(Number(req.query.folder_id) || 0)
  }
  if (req.query.title !== undefined && req.query.title !== null) {
    sql += ' AND title = ?'
    params.push(String(req.query.title))
  }''',1)

# folders 过滤 title + 统计
s=s.replace('''    const folders = queryAll(
      'SELECT * FROM company_doc_folders WHERE owner_type = ? AND owner_name = ? ORDER BY name DESC',
      [ownerType, ownerName]
    )''','''    let folderSql = 'SELECT * FROM company_doc_folders WHERE owner_type = ? AND owner_name = ?'
    const folderParams = [ownerType, ownerName]
    const titleFilter = req.query.title !== undefined && req.query.title !== null ? String(req.query.title) : null
    if (titleFilter !== null) { folderSql += ' AND title = ?'; folderParams.push(titleFilter) }
    folderSql += ' ORDER BY name DESC'
    const folders = queryAll(folderSql, folderParams)
    const statTitle = titleFilter !== null ? ' AND title = ?' : ''
    const statParams = titleFilter !== null ? [ownerType, ownerName, titleFilter] : [ownerType, ownerName]''',1)
s=s.replace('''         FROM company_docs WHERE owner_type = ? AND owner_name = ?
        GROUP BY folder_id`,
      [ownerType, ownerName]''','''         FROM company_docs WHERE owner_type = ? AND owner_name = ?${statTitle}
        GROUP BY folder_id`,
      statParams''',1)
open(p,"w",encoding="utf-8",newline="").write(s)
print("route part1 ok")
