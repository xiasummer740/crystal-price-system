p="electron/main.js"
s=open(p,encoding="utf-8").read()
s=s.replace("const server = expressApp.listen(port, () => {","const server = expressApp.listen(port, '0.0.0.0', () => {",1)
open(p,"w",encoding="utf-8",newline="").write(s)
print("main ok")
