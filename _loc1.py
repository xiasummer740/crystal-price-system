p="server/src/routes/customerFiles.js"
s=open(p,encoding="utf-8").read()
anchor="router.post('/open', (req, res) => {"
add='''// 返回文件绝对路径（桌面端用 shell.showItemInFolder 精确定位）
router.post('/path', (req, res) => {
  try {
    const customer = String(req.body?.customer || '').trim()
    const hit = folderAbs(customer, req.body?.folder)
    const name = safeName(req.body?.name)
    if (!customer || !hit || !name) return res.status(400).json({ code: 1, msg: '参数不合法' })
    const target = path.join(hit.abs, name)
    if (!target.startsWith(hit.root + path.sep) || !fs.existsSync(target)) return res.status(404).json({ code: 1, msg: '文件不存在' })
    res.json({ code: 0, data: { path: target } })
  } catch (e) {
    res.status(500).json({ code: 1, msg: '读取路径失败: ' + e.message })
  }
})

'''
assert anchor in s
s=s.replace(anchor,add+anchor,1)
open(p,"w",encoding="utf-8",newline="").write(s)
print("server ok")
