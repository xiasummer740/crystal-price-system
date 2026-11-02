p="electron/preload.cjs"
s=open(p,encoding="utf-8").read()
s=s.replace("  openExternal: (url) => ipcRenderer.invoke('open-external', url),","  openExternal: (url) => ipcRenderer.invoke('open-external', url),\n  revealPath: (p) => ipcRenderer.invoke('reveal-path', p),",1)
open(p,"w",encoding="utf-8",newline="").write(s)
print("preload ok")
