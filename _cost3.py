p="client/src/views/Materials.vue"
s=open(p,encoding="utf-8").read()

# 头部按钮
old = '''          <button class="action-btn" :disabled="!selectedCustomer" @click="showCustomerFiles = true"'''
new = '''          <button class="action-btn" :disabled="!selectedCustomer || syncingCost" @click="syncCost"
            title="把空着的成本价按同料号最近一次记录补上（不覆盖已填）">💰 {{ syncingCost ? '同步中…' : '同步成本价' }}</button>
          <button class="action-btn" :disabled="!selectedCustomer" @click="showCustomerFiles = true"'''
assert old in s
s=s.replace(old,new,1)

# 状态
s=s.replace("const showCustomerFiles = ref(false)", "const showCustomerFiles = ref(false)\nconst syncingCost = ref(false)", 1)

# 导入 showConfirmDialog? already imported from vant at top (showToast, showConfirmDialog) yes
# 函数：放在 load 前
old2 = '''// 加载列表
async function load() {'''
new2 = '''// 批量同步成本价（同料号最近一次，不覆盖已填）
async function syncCost() {
  if (!selectedCustomer.value) return
  try {
    await showConfirmDialog({
      title: '同步成本价',
      message: '把该客户下「成本价为空」的物料，按同一料号最近一次成本价补上。\\n已填的成本价不会被覆盖。',
      confirmButtonText: '开始同步'
    })
  } catch { return }
  syncingCost.value = true
  try {
    const r = await syncMaterialCost(selectedCustomer.value)
    showToast(`已补 ${r.data.updated} 条（空成本共 ${r.data.blanks} 条）`)
    await load()
  } catch (e) {
    showToast('同步失败: ' + (e.message || '未知错误'))
  } finally {
    syncingCost.value = false
  }
}

// 加载列表
async function load() {'''
assert old2 in s
s=s.replace(old2,new2,1)

# 导入 syncMaterialCost
s=s.replace("copyMaterialFile, isLocalFileUrl", "copyMaterialFile, syncMaterialCost, isLocalFileUrl", 1)
open(p,"w",encoding="utf-8",newline="").write(s)
print("ui ok")
