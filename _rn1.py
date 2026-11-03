p="server/src/routes/customerFiles.js"
s=open(p,encoding="utf-8").read()
anchor="// 返回文件绝对路径"
add='''// 重命名文件（保留原扩展名，没写扩展名时自动补）
router.post('/rename', (req, res) => {
  try {
    const customer = String(req.body?.customer || '').trim()
    const hit = folderAbs(customer, req.body?.folder)
    const oldName = safeName(req.body?.name)
    let newName = safeName(req.body?.newName)
    if (!customer || !hit || !oldName || !newName) return res.status(400).json({ code: 1, msg: '参数不合法' })
    const oldAbs = path.join(hit.abs, oldName)
    if (!oldAbs.startsWith(hit.root + path.sep) || !fs.existsSync(oldAbs)) return res.status(404).json({ code: 1, msg: '文件不存在' })
    const ext = path.extname(oldName)
    if (ext && !path.extname(newName)) newName += ext
    const newAbs = path.join(hit.abs, newName)
    if (newAbs === oldAbs) return res.json({ code: 0, data: { name: newName } })
    if (fs.existsSync(newAbs)) return res.status(400).json({ code: 1, msg: '同目录下已有同名文件' })
    fs.renameSync(oldAbs, newAbs)
    res.json({ code: 0, data: { name: newName } })
  } catch (e) {
    res.status(500).json({ code: 1, msg: '重命名失败: ' + e.message })
  }
})

'''
assert anchor in s
s=s.replace(anchor, add+anchor,1)
open(p,"w",encoding="utf-8",newline="").write(s)
print("server ok")
