p="client/src/views/Materials.vue"
s=open(p,encoding="utf-8").read()
s=s.replace('''        <button class="registry-btn" title="管理客户名册：删除没人用的名字 / 把简写合并到正确全名" @click="showRegistry = true">名册管理</button>''','''        <button v-if="selectedCustomer" class="registry-btn switch-btn" title="清空当前选择，回到客户列表重新选" @click="clearCustomer">切换客户</button>
        <button class="registry-btn" title="管理客户名册：删除没人用的名字 / 把简写合并到正确全名" @click="showRegistry = true">名册管理</button>''',1)
s=s.replace(".registry-btn:hover { background: #fff; border-color: var(--color-primary); color: var(--color-primary); }",".registry-btn:hover { background: #fff; border-color: var(--color-primary); color: var(--color-primary); }\n.switch-btn { color: #00794f; }",1)
open(p,"w",encoding="utf-8",newline="").write(s)
print("ok")
