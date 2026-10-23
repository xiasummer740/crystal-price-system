import { createRouter, createWebHashHistory } from 'vue-router'
import Dashboard from '../views/Dashboard.vue'
import AddRecord from '../views/AddRecord.vue'
import RecordList from '../views/RecordList.vue'
import RecordDetail from '../views/RecordDetail.vue'
import MobileHome from '../views/MobileHome.vue'
import Trash from '../views/Trash.vue'
import Samples from '../views/Samples.vue'
import Translator from '../views/Translator.vue'
import Notes from '../views/Notes.vue'
import NoteForm from '../views/NoteForm.vue'
import NoteDetail from '../views/NoteDetail.vue'
import Reports from '../views/Reports.vue'
import CompanyReport from '../views/CompanyReport.vue'

const routes = [
  { path: '/', name: 'Dashboard', component: Dashboard, meta: { title: '晶振报价系统' } },
  { path: '/add', name: 'AddRecord', component: AddRecord, meta: { title: '新增报价' } },
  { path: '/edit/:id', name: 'EditRecord', component: AddRecord, meta: { title: '编辑报价' } },
  { path: '/list', name: 'RecordList', component: RecordList, meta: { title: '记录列表' } },
  { path: '/detail/:id', name: 'RecordDetail', component: RecordDetail, meta: { title: '报价详情' } },
  { path: '/mobile', name: 'MobileHome', component: MobileHome, meta: { title: '报价查询' } },
  { path: '/mobile-materials', name: 'MobileMaterials', component: () => import('../views/MobileMaterials.vue'), meta: { title: '客户物料' } },
  { path: '/trash', name: 'Trash', component: Trash, meta: { title: '回收站' } },
  { path: '/samples', name: 'Samples', component: Samples, meta: { title: '样品登记' } },
  { path: '/translator', name: 'Translator', component: Translator, meta: { title: '规格书翻译' } },
  { path: '/notes', name: 'Notes', component: Notes, meta: { title: '记事便签' } },
  { path: '/notes/add', name: 'AddNote', component: NoteForm, meta: { title: '新增记事' } },
  { path: '/notes/edit/:id', name: 'EditNote', component: NoteForm, meta: { title: '编辑记事' } },
  { path: '/notes/:id', name: 'NoteDetail', component: NoteDetail, meta: { title: '记事详情' } },
  { path: '/reports', name: 'Reports', component: Reports, meta: { title: '总结汇报' } },
  { path: '/reports/company/:customer', name: 'CompanyReport', component: CompanyReport, meta: { title: '公司记事汇总' } },
  { path: '/map-addresses', name: 'MapAddresses', component: () => import('../views/MapAddresses.vue'), meta: { title: '地图地址' } },
  { path: '/performance', name: 'Performance', component: () => import('../views/PerformanceReview.vue'), meta: { title: '绩效明细' } },
  { path: '/materials', name: 'Materials', component: () => import('../views/Materials.vue'), meta: { title: '客户物料' } },
  { path: '/trip-plans', name: 'TripPlans', component: () => import('../views/TripPlan.vue'), meta: { title: '行程规划' } },
  // 公司资料 / 开票资料库：客户发来的开票资料（图片/PDF/Word/Excel）、自己公司的证照（支持多家抬头）
  { path: '/company-docs', name: 'CompanyDocs', component: () => import('../views/CompanyDocs.vue'), meta: { title: '公司资料' } },
  // 手机版同一份数据的只读/可传视图（在外面开发票时用手机就能看）
  { path: '/mobile-docs', name: 'MobileDocs', component: () => import('../views/MobileDocs.vue'), meta: { title: '公司资料' } },
  // 生成订单（供货合同）：选客户 → 带出资料 → 生成到 客户管理/<客户>/订单/
  { path: '/order', name: 'OrderForm', component: () => import('../views/OrderForm.vue'), meta: { title: '生成订单' } },
  { path: '/:pathMatch(.*)*', redirect: '/' }
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
