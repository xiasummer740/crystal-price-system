p="client/src/router/index.js"
s=open(p,encoding="utf-8").read()
s=s.replace("""  { path: '/map-addresses', name: 'MapAddresses', component: () => import('../views/MapAddresses.vue'), meta: { title: '地图地址' } },""","""  { path: '/map-addresses', name: 'MapAddresses', component: () => import('../views/MapAddresses.vue'), meta: { title: '地图地址' } },
  { path: '/coverage', name: 'CoverageBoard', component: () => import('../views/CoverageBoard.vue'), meta: { title: '覆盖看板' } },""")
open(p,"w",encoding="utf-8",newline="").write(s)
print("router ok")
