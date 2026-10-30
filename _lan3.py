p="server/src/index.js"
s=open(p,encoding="utf-8").read()
s=s.replace("app.listen(PORT, () => {","app.listen(PORT, '0.0.0.0', () => {",1)
old='''    const allowed = ['http://localhost', 'http://127.0.0.1', 'http://192.168.', 'http://10.', 'http://172.']
    if (allowed.some(p => origin.startsWith(p))) return cb(null, true)
    cb(null, false)'''
new='''    try {
      const u = new URL(origin)
      const h = u.hostname
      const ok = h === 'localhost' || h === '127.0.0.1' ||
        /^(10\\.|192\\.168\\.|172\\.(1[6-9]|2\\d|3[01])\\.|100\\.|169\\.254\\.)/.test(h)
      return cb(null, ok)
    } catch { return cb(null, false) }'''
assert old in s
s=s.replace(old,new,1)
open(p,"w",encoding="utf-8",newline="").write(s)
print("server ok")
