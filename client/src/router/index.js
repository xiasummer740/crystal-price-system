import { createRouter, createWebHashHistory } from 'vue-router'
import Dashboard from '../views/Dashboard.vue'
import AddRecord from '../views/AddRecord.vue'
import RecordList from '../views/RecordList.vue'
import RecordDetail from '../views/RecordDetail.vue'
import MobileHome from '../views/MobileHome.vue'
import Trash from '../views/Trash.vue'
import Samples from '../views/Samples.vue'
import Translator from '../views/Translator.vue'

const routes = [
  { path: '/', name: 'Dashboard', component: Dashboard, meta: { title: '晶振报价系统' } },
  { path: '/add', name: 'AddRecord', component: AddRecord, meta: { title: '新增报价' } },
  { path: '/edit/:id', name: 'EditRecord', component: AddRecord, meta: { title: '编辑报价' } },
  { path: '/list', name: 'RecordList', component: RecordList, meta: { title: '记录列表' } },
  { path: '/detail/:id', name: 'RecordDetail', component: RecordDetail, meta: { title: '报价详情' } },
  { path: '/mobile', name: 'MobileHome', component: MobileHome, meta: { title: '报价查询' } },
  { path: '/trash', name: 'Trash', component: Trash, meta: { title: '回收站' } },
  { path: '/samples', name: 'Samples', component: Samples, meta: { title: '样品登记' } },
  { path: '/translator', name: 'Translator', component: Translator, meta: { title: '规格书翻译' } }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

router.beforeEach((to, from, next) => {
  document.title = to.meta?.title || '晶振报价系统'
  next()
})

router.onError((err) => {
  console.error('[Router Error]', err)
})

export default router
