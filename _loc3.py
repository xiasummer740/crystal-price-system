p="electron/main.js"
s=open(p,encoding="utf-8").read()
s=s.replace("ipcMain.handle('open-external', (_, url) => { shell.openExternal(url) })","ipcMain.handle('open-external', (_, url) => { shell.openExternal(url) })\n// 在资源管理器里精确选中文件（比 explorer /select 更稳，支持中文/空格路径）\nipcMain.handle('reveal-path', (_, p) => { if (p) shell.showItemInFolder(String(p)) })",1)
open(p,"w",encoding="utf-8",newline="").write(s)
print("main ok")
