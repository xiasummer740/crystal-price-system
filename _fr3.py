p="client/src/components/CustomerFiles.vue"
s=open(p,encoding="utf-8").read()

# 底部加“重命名文件夹”
s=s.replace('''              <div class="cf-foot">
                <button class="cf-mini danger" @click="removeFolder(activeFolder)">删除这个空文件夹</button>
              </div>''','''              <div class="cf-foot">
                <button class="cf-mini" @click="startFolderRename" title="重命名当前文件夹">重命名文件夹</button>
                <button class="cf-mini danger" @click="removeFolder(activeFolder)">删除这个空文件夹</button>
              </div>''',1)

# 弹窗标题动态 + mode
s=s.replace('''            <h4>重命名文件</h4>''','''            <h4>{{ rename.mode === 'folder' ? '重命名文件夹' : '重命名文件' }}</h4>''',1)

# 导入
s=s.replace("deleteCustomerFile, deleteCustomerFolder, renameCustomerFile,", "deleteCustomerFile, deleteCustomerFolder, renameCustomerFile, renameCustomerFolder,",1)

# mode 状态
s=s.replace("const rename = reactive({ open: false, from: '', value: '' })", "const rename = reactive({ open: false, mode: 'file', from: '', value: '' })",1)

# 打开重命名：文件
s=s.replace('''function startRename(name) {
  rename.open = true
  rename.from = name
  rename.value = name
}''','''function startRename(name) {
  rename.open = true
  rename.mode = 'file'
  rename.from = name
  rename.value = name
}
function startFolderRename() {
  if (!activeFolder.value) return
  rename.open = true
  rename.mode = 'folder'
  rename.from = activeFolder.value
  rename.value = activeFolder.value
}''',1)

# doRename 支持文件夹
s=s.replace('''  try {
    await renameCustomerFile(props.customer, activeFolder.value, rename.from, newName)
    showToast('已重命名')
    rename.open = false
    await load()
  } catch (e) {
    showToast(e?.response?.data?.msg || ('重命名失败: ' + (e.message || '未知错误')))
  }''','''  try {
    if (rename.mode === 'folder') {
      const r = await renameCustomerFolder(props.customer, rename.from, newName)
      showToast('已重命名文件夹')
      rename.open = false
      activeFolder.value = r.data.name
    } else {
      await renameCustomerFile(props.customer, activeFolder.value, rename.from, newName)
      showToast('已重命名')
      rename.open = false
    }
    await load()
  } catch (e) {
    showToast(e?.response?.data?.msg || ('重命名失败: ' + (e.message || '未知错误')))
  }''',1)

# 确认框 z-index 提高（避免被 cf-mask 3500 盖住）
s=s.replace("showConfirmDialog({ title: '删除文件', message: `删除「${name}」？不能恢复。`, confirmButtonText: '删除', confirmButtonColor: '#ee0a24' })",
            "showConfirmDialog({ title: '删除文件', message: `删除「${name}」？不能恢复。`, confirmButtonText: '删除', confirmButtonColor: '#ee0a24', zIndex: 4000 })",1)
s=s.replace("showConfirmDialog({ title: '删除文件夹', message: `删除文件夹「${name}」？`, confirmButtonText: '删除', confirmButtonColor: '#ee0a24' })",
            "showConfirmDialog({ title: '删除文件夹', message: `删除文件夹「${name}」？`, confirmButtonText: '删除', confirmButtonColor: '#ee0a24', zIndex: 4000 })",1)
s=s.replace("showConfirmDialog({ title: '文件夹不是空的', message: data.msg + '，要连里面的文件一起删除吗？', confirmButtonText: '一起删除', confirmButtonColor: '#ee0a24' })",
            "showConfirmDialog({ title: '文件夹不是空的', message: data.msg + '，要连里面的文件一起删除吗？', confirmButtonText: '一起删除', confirmButtonColor: '#ee0a24', zIndex: 4000 })",1)
open(p,"w",encoding="utf-8",newline="").write(s)
print("component ok")
