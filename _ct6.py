p="server/src/routes/companyDocs.js"
s=open(p,encoding="utf-8").read()
s=s.replace("'SELECT id FROM company_doc_folders WHERE owner_type = ? AND owner_name = ? AND name = ? AND id <> ?',\n      [f.owner_type, f.owner_name, name, id]","'SELECT id FROM company_doc_folders WHERE owner_type = ? AND owner_name = ? AND name = ? AND IFNULL(billing_title, \\'\\') = ? AND id <> ?',\n      [f.owner_type, f.owner_name, name, f.billing_title || '', id]",1)
s=s.replace('''    const base = ownerDir(f.owner_type, f.owner_name)
    const oldDir = path.join(base, f.name)
    const newDir = path.join(base, name)''','''    const oldDir = folderDir(f.owner_type, f.owner_name, f.billing_title, f.name)
    const newDir = folderDir(f.owner_type, f.owner_name, f.billing_title, name)''',1)

# move doc: target folder title dir
s=s.replace('''      const tf = queryOne('SELECT * FROM company_doc_folders WHERE id = ?', [targetId])
      if (!tf) return res.status(404).json({ code: 1, msg: '目标文件夹不存在' })
      if (tf.owner_type !== doc.owner_type || tf.owner_name !== doc.owner_name) {
        return res.status(400).json({ code: 1, msg: '不能移到别的客户/主体的文件夹' })
      }
      targetName = tf.name''','''      const tf = queryOne('SELECT * FROM company_doc_folders WHERE id = ?', [targetId])
      if (!tf) return res.status(404).json({ code: 1, msg: '目标文件夹不存在' })
      if (tf.owner_type !== doc.owner_type || tf.owner_name !== doc.owner_name) {
        return res.status(400).json({ code: 1, msg: '不能移到别的客户/主体的文件夹' })
      }
      targetName = tf.name
      targetTitle = tf.billing_title || \'\'''',1)
s=s.replace("    let targetName = ''\n    if (targetId) {","    let targetName = ''\n    let targetTitle = ''\n    if (targetId) {",1)
s=s.replace("const targetDir = path.join(ownerDir(doc.owner_type, doc.owner_name), targetName)","const targetDir = targetName ? folderDir(doc.owner_type, doc.owner_name, targetTitle, targetName) : ownerDir(doc.owner_type, doc.owner_name)",1)
open(p,"w",encoding="utf-8",newline="").write(s)
print("ok")
