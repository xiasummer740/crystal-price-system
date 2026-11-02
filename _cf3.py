p="server/src/routes/customerFiles.js"
s=open(p,encoding="utf-8").read()
old='''    if (!fs.existsSync(hit.abs)) return res.status(404).json({ code: 1, msg: '文件夹不存在' })
    if (fs.readdirSync(hit.abs).length) return res.status(400).json({ code: 1, msg: '文件夹里还有文件，先删文件' })
    fs.rmdirSync(hit.abs)'''
new='''    if (!fs.existsSync(hit.abs)) return res.status(404).json({ code: 1, msg: '文件夹不存在' })
    const entries = fs.readdirSync(hit.abs)
    if (entries.length && !req.body?.force) {
      return res.status(400).json({ code: 1, msg: `文件夹里还有 ${entries.length} 个文件`, needForce: true })
    }
    // force=1：连文件一起删（用户已二次确认）
    fs.rmSync(hit.abs, { recursive: true, force: true })'''
assert old in s
s=s.replace(old,new,1)
open(p,"w",encoding="utf-8",newline="").write(s)
print("server ok")
