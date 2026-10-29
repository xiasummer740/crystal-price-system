p="client/src/views/MapAddresses.vue"
s=open(p,encoding="utf-8").read()

# 头部按钮：覆盖看板
old = '''        <button class="hdr-btn" @click="handleExport" title="导出 Excel">'''
new = '''        <router-link to="/coverage" class="hdr-btn" style="text-decoration:none" title="客户覆盖/定位率统计">📊 覆盖看板</router-link>
        <button class="hdr-btn" @click="handleExport" title="导出 Excel">'''
assert old in s
s=s.replace(old,new,1)

# 附近行加「加入行程」
old2 = '''          <button class="nearby-btn" @click="navCustomer(n.c)">🧭 导航</button>'''
new2 = '''          <button class="nearby-btn" @click="openAddToTrip(n.c)">＋行程</button>
          <button class="nearby-btn" @click="navCustomer(n.c)">🧭 导航</button>'''
assert old2 in s
s=s.replace(old2,new2,1)

# 支持 ?q= 预填搜索
old3 = '''  await loadData();'''
new3 = '''  const q = String(route_.query?.q || '').trim();
  if (q) searchKw.value = q;
  await loadData();'''
assert old3 in s
s=s.replace(old3,new3,1)
open(p,"w",encoding="utf-8",newline="").write(s)
print("map ok")
