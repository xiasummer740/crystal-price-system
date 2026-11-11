p="electron/updater.js"
s=open(p,encoding="utf-8").read()
s=s.replace("      res.on('end', () => { ws.end(); resolve() })\n      res.on('error', reject)\n      ws.on('error', reject)","      res.on('end', () => { ws.end() })\n      ws.on('finish', resolve)\n      res.on('error', reject)\n      ws.on('error', reject)",1)
open(p,"w",encoding="utf-8",newline="").write(s)
print("ok")
