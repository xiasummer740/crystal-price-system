p="client/src/views/Materials.vue"
s=open(p,encoding="utf-8").read()
s=s.replace('''                @mousedown.prevent="selectCustomer(c.name, customerQuery)">
                <span class="cd-name">👤 {{ c.name }}</span>
                <span class="cd-hint">新建</span>''','''                @mousedown.prevent="selectCustomer(c.customer || c.name, customerQuery, c.name)">
                <span class="cd-name">{{ c.is_title ? '🏷' : '👤' }} {{ c.name }}</span>
                <span class="cd-hint">{{ c.is_title ? '抬头' : '新建' }}</span>''',1)
s=s.replace('''function selectCustomer(name, carryKeyword) {
  selectedCustomer.value = name
  try { sessionStorage.setItem('mat_last_customer', name) } catch {}
  customerQuery.value = name''','''function selectCustomer(name, carryKeyword, displayName) {
  selectedCustomer.value = name
  try { sessionStorage.setItem('mat_last_customer', name) } catch {}
  customerQuery.value = displayName || name''',1)
open(p,"w",encoding="utf-8",newline="").write(s)
print("client ok")
