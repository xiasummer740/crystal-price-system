p="client/src/components/CustomerFiles.vue"
s=open(p,encoding="utf-8").read()

s=s.replace('''                  <button class="cf-mini" @click="openFile(f.name)" title="在资源管理器里定位">定位</button>''','''                  <button class="cf-mini" @click="startRename(f.name)" title="直接重命名">重命名</button>
                  <button class="cf-mini" @click="openFile(f.name)" title="在资源管理器里定位">定位</button>''',1)

old='''        <div v-if="uploading" class="cf-uploading">正在上传 {{ uploading }} 个文件…</div>
      </div>
    </div>
  </teleport>'''
new='''        <div v-if="uploading" class="cf-uploading">正在上传 {{ uploading }} 个文件…</div>

        <!-- 重命名文件 -->
        <div v-if="rename.open" class="cf-mask" @click.self="rename.open = false">
          <div class="cf-rename">
            <h4>重命名文件</h4>
            <input v-model="rename.value" class="cf-input" @keyup.enter="doRename" />
            <div class="cf-rename-tip">不写扩展名会自动保留原扩展名</div>
            <div class="cf-rename-btns">
              <button class="cf-btn" @click="rename.open = false">取消</button>
              <button class="cf-btn primary" @click="doRename">保存</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </teleport>'''
assert old in s
s=s.replace(old,new,1)

s=s.replace("deleteCustomerFile, deleteCustomerFolder, copyCustomerFile, openCustomerFile, getCustomerFilePath", "deleteCustomerFile, deleteCustomerFolder, renameCustomerFile, copyCustomerFile, openCustomerFile, getCustomerFilePath",1)
s=s.replace("const newFolder = reactive({ open: false, code: '', suffix: '', name: '', manual: false })", "const newFolder = reactive({ open: false, code: '', suffix: '', name: '', manual: false })\nconst rename = reactive({ open: false, from: '', value: '' })",1)

s=s.replace('''async function copyFile(name) {''','''function startRename(name) {
  rename.open = true
  rename.from = name
  rename.value = name
}
async function doRename() {
  const newName = String(rename.value || '').trim()
  if (!newName) return showToast('文件名不能为空')
  if (newName === rename.from) { rename.open = false; return }
  try {
    await renameCustomerFile(props.customer, activeFolder.value, rename.from, newName)
    showToast('已重命名')
    rename.open = false
    await load()
  } catch (e) {
    showToast(e?.response?.data?.msg || ('重命名失败: ' + (e.message || '未知错误')))
  }
}
async function copyFile(name) {''',1)

css='''
.cf-rename { width: min(420px, 90vw); background: #fff; border-radius: 10px; padding: 16px; box-shadow: 0 18px 50px rgba(0,0,0,.35); }
.cf-rename h4 { margin: 0 0 10px; font-size: 15px; }
.cf-rename-tip { font-size: 11px; color: #98a2b3; margin-top: 6px; }
.cf-rename-btns { display: flex; gap: 8px; justify-content: flex-end; margin-top: 14px; }
.cf-btn { border: 1px solid #d0d5dd; background: #fff; border-radius: 6px; padding: 6px 14px; font-size: 13px; cursor: pointer; }
.cf-btn.primary { background: var(--color-primary, #00794f); border-color: var(--color-primary, #00794f); color: #fff; }
'''
idx=s.rfind("</style>")
s=s[:idx]+css+"\n"+s[idx:]
open(p,"w",encoding="utf-8",newline="").write(s)
print("ok")
