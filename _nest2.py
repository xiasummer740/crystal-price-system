p="client/src/components/CustomerFiles.vue"
s=open(p,encoding="utf-8").read()

# 工具栏加子文件夹
s=s.replace('''          <button class="cf-btn primary" @click="startNew">＋ 新建文件夹</button>''','''          <button class="cf-btn primary" @click="startNew">＋ 新建文件夹</button>
          <button v-if="activeFolder" class="cf-btn" @click="startSub">＋ 子文件夹</button>''',1)

# 文件夹列表：path + 缩进
s=s.replace('''            <button v-for="f in folders" :key="f.name" class="cf-folder" :class="{ on: f.name === activeFolder }" @click="activeFolder = f.name">
              <span class="cf-folder-name">📁 {{ f.name }}</span>
              <em>{{ f.files.length }}</em>
            </button>''','''            <button v-for="f in folders" :key="f.path" class="cf-folder" :class="{ on: f.path === activeFolder }"
              :style="{ paddingLeft: (10 + depthOf(f.path) * 14) + 'px' }" @click="activeFolder = f.path">
              <span class="cf-folder-name">📁 {{ f.name }}</span>
              <em>{{ f.files.length }}</em>
            </button>''',1)

# 新建标题显示父级
s=s.replace('''              <div class="cf-new-title">新建文件夹</div>''','''              <div class="cf-new-title">新建文件夹<span v-if="newFolder.parent" class="cf-new-parent">（在 {{ newFolder.parent }} 下）</span></div>''',1)

# activeFiles 用 path
s=s.replace("const activeFiles = computed(() => folders.value.find(f => f.name === activeFolder.value)?.files || [])","const activeFiles = computed(() => folders.value.find(f => f.path === activeFolder.value)?.files || [])\nfunction depthOf(p) { return String(p || '').split('/').length - 1 }",1)

# newFolder 状态加 parent
s=s.replace("const newFolder = reactive({ open: false, code: '', suffix: '', name: '', manual: false })","const newFolder = reactive({ open: false, code: '', suffix: '', name: '', parent: '', manual: false })",1)

# startNew 重置 parent；新增 startSub
s=s.replace('''function startNew() {
  newFolder.open = true
  newFolder.code = ''
  newFolder.suffix = ''
  newFolder.name = today6.value
  newFolder.manual = false
}''','''function startNew() {
  newFolder.open = true
  newFolder.parent = ''
  newFolder.code = ''
  newFolder.suffix = ''
  newFolder.name = today6.value
  newFolder.manual = false
}
function startSub() {
  newFolder.open = true
  newFolder.parent = activeFolder.value
  newFolder.code = ''
  newFolder.suffix = ''
  newFolder.name = activeFolder.value + '/' + today6.value
  newFolder.manual = false
}''',1)

# applyTemplate 带父级
s=s.replace("newFolder.name = today6.value + (newFolder.code || '') + (newFolder.suffix || '')","newFolder.name = (newFolder.parent ? newFolder.parent + '/' : '') + today6.value + (newFolder.code || '') + (newFolder.suffix || '')",1)

# createFolder 后 activeFolder 已是 path
s=s.replace("activeFolder.value = r.data.name","activeFolder.value = r.data.name",1)

# load 默认选中第一个 path
s=s.replace("if (!folders.value.find(f => f.name === activeFolder.value)) {\n      activeFolder.value = folders.value[0]?.name || ''\n    }","if (!folders.value.find(f => f.path === activeFolder.value)) {\n      activeFolder.value = folders.value[0]?.path || ''\n    }",1)

# fileUrl 支持多级
s=s.replace('''  return `/api/cust/${encodeURIComponent(props.customer)}/${encodeURIComponent('客户文件')}/${encodeURIComponent(activeFolder.value)}/${encodeURIComponent(name)}`''','''  const folderPath = String(activeFolder.value || '').split('/').map(encodeURIComponent).join('/')
  return `/api/cust/${encodeURIComponent(props.customer)}/${encodeURIComponent('客户文件')}/${folderPath}/${encodeURIComponent(name)}`''',1)

# CSS 父级提示
css='''
.cf-new-parent { color: #98a2b3; font-size: 11px; font-weight: normal; margin-left: 4px; }
'''
idx=s.rfind("</style>")
s=s[:idx]+css+"\n"+s[idx:]
open(p,"w",encoding="utf-8",newline="").write(s)
print("client ok")
