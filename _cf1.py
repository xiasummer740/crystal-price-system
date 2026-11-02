p="client/src/components/CustomerFiles.vue"
s=open(p,encoding="utf-8").read()

# 1) 不再全局阻止粘贴；只处理文件粘贴，输入框照常粘贴文字
s=s.replace('<div class="cf-panel" @paste.prevent="onPaste">','<div class="cf-panel" @paste="onPaste">',1)
s=s.replace('''function onPaste(e) {
  if (!props.show) return
  const files = e.clipboardData?.files
  if (files?.length) { e.preventDefault(); doUpload(files) }
}''','''function onPaste(e) {
  if (!props.show) return
  // 输入框/文本域里的粘贴是正常文字粘贴，交给浏览器
  const t = e.target
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
  const files = e.clipboardData?.files
  if (files?.length) { e.preventDefault(); doUpload(files) }
}''',1)

# 2) 删除文件夹：处理“还有文件”的情况，支持强制删除
old='''async function removeFolder(name) {
  try {
    await showConfirmDialog({ title: '删除文件夹', message: `删除空文件夹「${name}」？`, confirmButtonText: '删除', confirmButtonColor: '#ee0a24' })
  } catch { return }
  try {
    await deleteCustomerFolder(props.customer, name)
    showToast('已删除')
    if (activeFolder.value === name) activeFolder.value = ''
    await load()
  } catch (e) { showToast(e.message || '删除失败') }
}'''
new='''async function removeFolder(name) {
  try {
    await showConfirmDialog({ title: '删除文件夹', message: `删除文件夹「${name}」？`, confirmButtonText: '删除', confirmButtonColor: '#ee0a24' })
  } catch { return }
  try {
    await deleteCustomerFolder(props.customer, name)
  } catch (e) {
    const data = e?.response?.data
    // 里面还有文件：再确认一次，连文件一起删
    if (data?.needForce) {
      try {
        await showConfirmDialog({ title: '文件夹不是空的', message: data.msg + '，要连里面的文件一起删除吗？', confirmButtonText: '一起删除', confirmButtonColor: '#ee0a24' })
      } catch { return }
      try {
        await deleteCustomerFolder(props.customer, name, true)
      } catch (e2) {
        showToast(e2?.response?.data?.msg || e2.message || '删除失败')
        return
      }
    } else {
      showToast(data?.msg || e.message || '删除失败')
      return
    }
  }
  showToast('已删除')
  if (activeFolder.value === name) activeFolder.value = ''
  await load()
}'''
assert old in s
s=s.replace(old,new,1)
open(p,"w",encoding="utf-8",newline="").write(s)
print("component ok")
