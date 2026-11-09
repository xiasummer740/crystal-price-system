p="client/src/views/Materials.vue"
s=open(p,encoding="utf-8").read()
s=s.replace("  selectedCustomer.value = name\n  customerQuery.value = name","  selectedCustomer.value = name\n  try { sessionStorage.setItem('mat_last_customer', name) } catch {}\n  customerQuery.value = name",1)
s=s.replace("function clearCustomer() {\n  selectedCustomer.value = ''\n  customerQuery.value = ''","function clearCustomer() {\n  selectedCustomer.value = ''\n  try { sessionStorage.removeItem('mat_last_customer') } catch {}\n  customerQuery.value = ''",1)
s=s.replace("function goMapAddresses() {\n  if (!selectedCustomer.value) return\n  router.push({ path: '/map-addresses', query: { q: selectedCustomer.value } })\n}","function goMapAddresses() {\n  if (!selectedCustomer.value) return\n  router.push({ path: '/map-addresses', query: { q: selectedCustomer.value, from: 'materials', customer: selectedCustomer.value } })\n}",1)
s=s.replace("  await loadCustomerList()\n  // 待跟进计数","  await loadCustomerList()\n  // 从地图/别处返回时恢复客户，避免又要重新搜索\n  try {\n    const want = String(route.query.customer || sessionStorage.getItem('mat_last_customer') || '').trim()\n    if (want) selectCustomer(want)\n  } catch {}\n  // 待跟进计数",1)
open(p,"w",encoding="utf-8",newline="").write(s)
print("materials ok")
