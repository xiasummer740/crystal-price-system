p="client/src/components/CustomerFiles.vue"
s=open(p,encoding="utf-8").read()
s=s.replace('''async function openFile(name) {
  try { await openCustomerFile(props.customer, activeFolder.value, name) }
  catch (e) { showToast('打开失败: ' + (e.message || '未知错误')) }
}''','''async function openFile(name) {
  try {
    // 桌面端：拿绝对路径交给 Electron shell.showItemInFolder，精确定位到文件
    if (window.electronAPI?.revealPath) {
      const r = await getCustomerFilePath(props.customer, activeFolder.value, name)
      await window.electronAPI.revealPath(r.data.path)
      return
    }
    await openCustomerFile(props.customer, activeFolder.value, name)
  } catch (e) { showToast('定位失败: ' + (e?.response?.data?.msg || e.message || '未知错误')) }
}''',1)
# 导入 getCustomerFilePath
s=s.replace("copyCustomerFile, openCustomerFile", "copyCustomerFile, openCustomerFile, getCustomerFilePath",1)
if "getCustomerFilePath" not in s.split("from '../utils/api.js'")[0][-400:]:
    s=s.replace("import { fetchCustomerFiles, mkdirCustomerFolder", "import { fetchCustomerFiles, mkdirCustomerFolder, getCustomerFilePath",1)
open(p,"w",encoding="utf-8",newline="").write(s)
print("component ok")
