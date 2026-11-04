p="server/src/routes/customerFiles.js"
s=open(p,encoding="utf-8").read()
anchor="// 重命名文件（保留原扩展名，没写扩展名时自动补）"
add='''// 重命名文件夹
router.post('/rename-folder', (req, res) => {
  try {
    const customer = String(req.body?.customer || '').trim()
    const oldName = String(req.body?.folder || '').trim()
    const newName = safeName(req.body?.newName)
    const oldHit = folderAbs(customer, oldName)
    const newHit = folderAbs(customer, newName)
    if (!customer || !oldHit || !newHit || !newName) return res.status(400).json({ code: 1, msg: '参数不合法' })
    if (!fs.existsSync(oldHit.abs)) return res.status(404).json({ code: 1, msg: '文件夹不存在' })
    if (oldHit.abs === newHit.abs) return res.json({ code: 0, data: { name: newHit.name } })
    if (fs.existsSync(newHit.abs)) return res.status(400).json({ code: 1, msg: '已有同名文件夹' })
    fs.renameSync(oldHit.abs, newHit.abs)
    res.json({ code: 0, data: { name: newHit.name } })
  } catch (e) {
    res.status(500).json({ code: 1, msg: '重命名文件夹失败: ' + e.message })
  }
})

'''
assert anchor in s
s=s.replace(anchor, add+anchor,1)
open(p,"w",encoding="utf-8",newline="").write(s)
print("server ok")
