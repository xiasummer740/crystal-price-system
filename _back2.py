p="client/src/views/MapAddresses.vue"
s=open(p,encoding="utf-8").read()
s=s.replace('''function goBack() {
  if (isStandalone) {
    window.close();
  } else {
    router.back();
  }
}''','''function goBack() {
  if (isStandalone) {
    window.close();
    return;
  }
  // 从客户物料「管理地址」进来的：带着客户名回去，不用重新搜索
  if (String(route_.query?.from || '') === 'materials' && route_.query?.customer) {
    router.push({ path: '/materials', query: { customer: String(route_.query.customer) } });
    return;
  }
  router.back();
}''',1)
s=s.replace('<button class="back-btn" @click="goBack">‹</button>','<button class="back-btn" @click="goBack" :title="route_.query?.from === \'materials\' ? \'返回客户物料\' : \'返回\'">‹</button>',1)
open(p,"w",encoding="utf-8",newline="").write(s)
print("map ok")
