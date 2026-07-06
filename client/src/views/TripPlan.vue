<template>
  <div class="trip-page">
    <!-- 头部 -->
    <header class="trip-header">
      <div class="header-left">
        <router-link to="/map-addresses" class="back-link">‹ 返回地图</router-link>
        <h3>📅 行程规划</h3>
      </div>
      <div class="header-right">
        <button class="hdr-btn" @click="showPlanForm = true" v-if="!currentPlan">➕ 新建行程</button>
        <button class="hdr-btn" @click="savePlan" v-else :disabled="saving">{{ saving ? '保存中…' : '💾 保存' }}</button>
        <button class="hdr-btn" @click="clearPlan" v-if="currentPlan">✕ 关闭</button>
      </div>
    </header>

    <div class="trip-body">
      <!-- 左侧：行程列表 -->
      <div class="plan-list" v-if="!currentPlan">
        <div class="date-nav">
          <input v-model="filterDate" type="date" class="date-input" @change="loadPlans" />
          <span class="date-badge">{{ plans.length }} 个行程</span>
        </div>

        <div class="plan-cards" v-if="plans.length">
          <div v-for="p in plans" :key="p.id" class="plan-card" @click="openPlan(p)">
            <div class="pc-date">{{ formatDate(p.plan_date) }}</div>
            <div class="pc-title">{{ p.title || '未命名行程' }}</div>
            <div class="pc-meta">
              <span>📍 {{ p.point_count || 0 }} 个地点</span>
            </div>
          </div>
        </div>
        <div v-else class="plan-empty">
          <p>{{ filterDate ? '该日期暂无行程' : '选择一个日期查看或新建行程' }}</p>
          <button class="create-btn" @click="showPlanForm = true">➕ 新建行程</button>
        </div>

        <!-- 全部行程 -->
        <div class="all-plans">
          <div class="ap-header" @click="showAllPlans = !showAllPlans">
            <span>📋 全部行程</span>
            <span class="ap-toggle">{{ showAllPlans ? '▲' : '▼' }}</span>
          </div>
          <div v-if="showAllPlans" class="ap-list">
            <div v-for="p in allPlans" :key="p.id" class="ap-item" @click="openPlan(p)">
              <span class="ap-date">{{ formatDate(p.plan_date) }}</span>
              <span class="ap-title">{{ p.title || '未命名' }}</span>
              <span class="ap-count">{{ p.point_count }}点</span>
            </div>
            <div v-if="!allPlans.length" class="ap-empty">暂无行程</div>
          </div>
        </div>
      </div>

      <!-- 右侧：当前行程 -->
      <div class="plan-editor" v-if="currentPlan">
        <div class="editor-header">
          <div class="eh-info">
            <input v-model="editTitle" class="edit-title" placeholder="行程标题（可选）" />
            <input v-model="editDate" type="date" class="edit-date" />
          </div>
        </div>

        <!-- 途经点列表 -->
        <div class="point-list">
          <div class="pl-header">
            <span>📍 途经点 ({{ points.length }})</span>
            <button class="add-point-btn" @click="showAddPoint = true">＋ 添加</button>
          </div>

          <draggable v-model="points" :group="'points'" @end="onReorder" handle=".drag-handle" item-key="id" class="point-draggable">
            <template #item="{ element: pt, index }">
              <div class="point-item" :class="{ active: activePoint === pt.id }" @click="activePoint = pt.id">
                <span class="drag-handle" title="拖拽排序">⠿</span>
                <span class="pt-order">{{ index + 1 }}</span>
                <div class="pt-info">
                  <span class="pt-name">{{ pt.customer_name }}</span>
                  <span class="pt-addr" v-if="pt.address">{{ truncate(pt.address, 40) }}</span>
                  <span class="pt-contact" v-if="pt.contact_name || pt.contact_phone">{{ pt.contact_name }} {{ pt.contact_phone }}</span>
                  <span class="pt-notes" v-if="pt.notes">{{ pt.notes }}</span>
                </div>
                <div class="pt-actions">
                  <button class="pt-btn" @click.stop="editPoint(pt)">✏️</button>
                  <button class="pt-btn del" @click.stop="removePoint(pt)">×</button>
                </div>
              </div>
            </template>
          </draggable>

          <div v-if="!points.length" class="pl-empty">
            暂无途经点，点击「添加」从客户中选择
          </div>
        </div>

        <!-- 地图和路线 -->
        <div class="route-preview" ref="routeMapContainer">
          <div class="route-loading" v-if="routeLoading">
            <van-loading size="16" /> 计算路线中...
          </div>
          <div class="route-info" v-if="routeSummary">
            <span class="ri-icon">🚗</span>
            <span class="ri-text">{{ routeSummary.distance }}</span>
            <span class="ri-sep">·</span>
            <span class="ri-text">{{ routeSummary.time }}</span>
            <button class="ri-nav" @click="openExternalNav">📱 手机导航</button>
          </div>
          <div class="route-hint" v-if="!routeSummary && points.length < 2">
            至少添加 2 个途经点才能规划路线
          </div>
        </div>

        <!-- 行程备注 -->
        <van-field v-model="editNotes" label="备注" placeholder="行程备注" type="textarea" rows="2" />
      </div>
    </div>

    <!-- ===== 新建行程弹出层 ===== -->
    <van-popup v-model:show="showPlanForm" round position="bottom" :style="{ height: 'auto' }" closeable>
      <div class="form-wrap">
        <h3>新建行程</h3>
        <van-field v-model="newPlanDate" label="日期" type="date" required />
        <van-field v-model="newPlanTitle" label="标题" placeholder="行程标题（可选）" />
        <div class="form-btns">
          <van-button round plain type="default" @click="showPlanForm = false">取消</van-button>
          <van-button round type="primary" @click="createPlan">创建</van-button>
        </div>
      </div>
    </van-popup>

    <!-- ===== 添加途经点 ===== -->
    <van-popup v-model:show="showAddPoint" round position="bottom" :style="{ height: '65%' }" closeable>
      <div class="form-wrap">
        <h3>添加途经点</h3>
        <van-field v-model="pointSearchKw" label="搜索客户" placeholder="搜索客户名" clearable @input="onPointSearch" />
        <div class="point-search-results" v-if="pointSearchResults.length">
          <div v-for="c in pointSearchResults" :key="c.id" class="ps-item" @click="addPointFromCustomer(c)">
            <span class="ps-name">{{ c.name }}</span>
            <span class="ps-addr" v-if="c.address">{{ truncate(c.address, 30) }}</span>
            <span class="ps-add">＋</span>
          </div>
        </div>
        <div class="point-search-empty" v-else-if="pointSearchKw && !pointSearchResults.length">
          无匹配客户，可手动添加
        </div>
        <van-field v-model="manualPointName" label="客户名" placeholder="输入客户名" />
        <van-field v-model="manualPointAddress" label="地址" placeholder="地址" />
        <van-field v-model="manualPointContact" label="联系人" placeholder="联系人" />
        <van-field v-model="manualPointPhone" label="电话" placeholder="电话" />
        <van-field v-model="manualPointNotes" label="备注" placeholder="拜访事项" type="textarea" rows="2" />
        <div class="form-btns">
          <van-button round plain type="default" @click="showAddPoint = false">取消</van-button>
          <van-button round type="primary" @click="addManualPoint">手动添加</van-button>
        </div>
      </div>
    </van-popup>

    <!-- ===== 编辑途经点 ===== -->
    <van-popup v-model:show="showEditPoint" round position="bottom" :style="{ height: 'auto' }" closeable>
      <div class="form-wrap">
        <h3>编辑途经点</h3>
        <van-field v-model="editPointForm.customer_name" label="客户名" />
        <van-field v-model="editPointForm.address" label="地址" />
        <van-field v-model="editPointForm.contact_name" label="联系人" />
        <van-field v-model="editPointForm.contact_phone" label="电话" />
        <van-field v-model="editPointForm.notes" label="拜访事项" type="textarea" rows="2" />
        <div class="form-btns">
          <van-button round plain type="default" @click="showEditPoint = false">取消</van-button>
          <van-button round type="primary" @click="savePointEdit">保存</van-button>
        </div>
      </div>
    </van-popup>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast, showConfirmDialog } from 'vant'
import {
  fetchMapCustomers, fetchTripPlans, getTripPlan, createTripPlan, updateTripPlan, deleteTripPlan,
  getTripPoints, createTripPoint, updateTripPoint, deleteTripPoint, reorderTripPoints
} from '../utils/api.js'
import draggable from 'vuedraggable'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet-routing-machine'
import 'leaflet-routing-machine/dist/leaflet-routing-machine.css'

// ====== Leaflet 图标修复 ======
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png'
})

const route = useRoute()
const router = useRouter()

// ====== 状态 ======
const filterDate = ref(new Date().toISOString().slice(0, 10))
const plans = ref([])
const allPlans = ref([])
const showAllPlans = ref(false)
const currentPlan = ref(null)
const editTitle = ref('')
const editDate = ref('')
const editNotes = ref('')
const points = ref([])
const activePoint = ref(null)
const saving = ref(false)
const routeLoading = ref(false)
const routeSummary = ref(null)

// 表单
const showPlanForm = ref(false)
const newPlanDate = ref(new Date().toISOString().slice(0, 10))
const newPlanTitle = ref('')

const showAddPoint = ref(false)
const pointSearchKw = ref('')
const pointSearchResults = ref([])
const manualPointName = ref('')
const manualPointAddress = ref('')
const manualPointContact = ref('')
const manualPointPhone = ref('')
const manualPointNotes = ref('')

const showEditPoint = ref(false)
const editPointForm = ref({ customer_name: '', address: '', contact_name: '', contact_phone: '', notes: '' })
let editingPointId = null

// 地图
const routeMapContainer = ref(null)
let routeMap = null
let routeControl = null

// ====== 工具函数 ======
function truncate(s, len) {
  if (!s) return ''
  return s.length > len ? s.slice(0, len) + '…' : s
}
function formatDate(d) {
  if (!d) return ''
  const weekdays = ['日', '一', '二', '三', '四', '五', '六']
  const date = new Date(d)
  if (isNaN(date.getTime())) return d
  return `${date.getMonth() + 1}月${date.getDate()}日 周${weekdays[date.getDay()]}`
}

// ====== 加载行程列表 ======
async function loadPlans() {
  try {
    const r = await fetchTripPlans({ date: filterDate.value })
    plans.value = r.data || []
  } catch { plans.value = [] }
}

async function loadAllPlans() {
  try {
    const r = await fetchTripPlans()
    allPlans.value = r.data || []
  } catch { allPlans.value = [] }
}

// ====== 行程 CRUD ======
function createPlan() {
  if (!newPlanDate.value) return showToast('请选择日期')
  currentPlan.value = { id: null, plan_date: newPlanDate.value }
  editTitle.value = newPlanTitle.value || ''
  editDate.value = newPlanDate.value
  editNotes.value = ''
  points.value = []
  showPlanForm.value = false
  routeSummary.value = null
  initRouteMap()
}

async function savePlan() {
  saving.value = true
  try {
    if (currentPlan.value?.id) {
      await updateTripPlan(currentPlan.value.id, {
        title: editTitle.value,
        plan_date: editDate.value,
        notes: editNotes.value
      })
      // 更新行程点
      for (const pt of points.value) {
        if (pt._new) {
          const r = await createTripPoint({
            plan_id: currentPlan.value.id,
            customer_name: pt.customer_name,
            address: pt.address || '',
            latitude: pt.latitude,
            longitude: pt.longitude,
            contact_name: pt.contact_name || '',
            contact_phone: pt.contact_phone || '',
            notes: pt.notes || '',
            sort_order: pt.sort_order || 0
          })
          pt.id = r.data.id
          pt._new = false
        } else if (pt._dirty) {
          await updateTripPoint(pt.id, {
            customer_name: pt.customer_name,
            address: pt.address,
            latitude: pt.latitude,
            longitude: pt.longitude,
            contact_name: pt.contact_name,
            contact_phone: pt.contact_phone,
            notes: pt.notes,
            sort_order: pt.sort_order
          })
          pt._dirty = false
        }
      }
      // 重排序
      await reorderTripPoints(currentPlan.value.id, points.value.map(p => p.id))
      showToast('已保存')
    } else {
      // 新建
      const r = await createTripPlan({ title: editTitle.value, plan_date: editDate.value, notes: editNotes.value })
      currentPlan.value.id = r.data.id
      for (const pt of points.value) {
        await createTripPoint({
          plan_id: currentPlan.value.id,
          customer_name: pt.customer_name,
          address: pt.address || '',
          latitude: pt.latitude,
          longitude: pt.longitude,
          contact_name: pt.contact_name || '',
          contact_phone: pt.contact_phone || '',
          notes: pt.notes || '',
          sort_order: pt.sort_order || 0
        })
      }
      showToast('已创建')
    }
    await loadPlans()
    await loadAllPlans()
  } catch (e) {
    showToast('保存失败: ' + (e.message || ''))
  } finally {
    saving.value = false
  }
}

function clearPlan() {
  currentPlan.value = null
  points.value = []
  routeSummary.value = null
  if (routeControl && routeMap) {
    routeMap.removeControl(routeControl)
    routeControl = null
  }
  if (routeMap) {
    routeMap.remove()
    routeMap = null
  }
}

async function openPlan(p) {
  try {
    const r = await getTripPlan(p.id)
    currentPlan.value = { id: r.data.id, plan_date: r.data.plan_date }
    editTitle.value = r.data.title || ''
    editDate.value = r.data.plan_date || ''
    editNotes.value = r.data.notes || ''
    points.value = (r.data.points || []).map((pt, i) => ({ ...pt, sort_order: i }))
    routeSummary.value = null
    nextTick(() => initRouteMap())
    // 加载所有行程（用于侧边列表）
    await loadAllPlans()
  } catch (e) {
    showToast('加载行程失败')
  }
}

async function deletePlan(p) {
  try {
    await showConfirmDialog({ title: '确认删除', message: `确定删除「${p.title || '未命名'}」行程？` })
    await deleteTripPlan(p.id)
    if (currentPlan.value?.id === p.id) clearPlan()
    await loadPlans()
    await loadAllPlans()
    showToast('已删除')
  } catch (e) {
    if (e === 'cancel' || e?.message?.includes('cancel')) return
  }
}

// ====== 途经点管理 ======
let pointSearchTimer = null
async function onPointSearch() {
  clearTimeout(pointSearchTimer)
  const kw = pointSearchKw.value.trim()
  if (!kw) { pointSearchResults.value = []; return }
  pointSearchTimer = setTimeout(async () => {
    try {
      const r = await fetchMapCustomers({ keyword: kw })
      pointSearchResults.value = (r.data || []).slice(0, 10)
    } catch { pointSearchResults.value = [] }
  }, 300)
}

function addPointFromCustomer(c) {
  points.value.push({
    id: Date.now() + Math.random(),
    _new: true,
    customer_id: c.id,
    customer_name: c.name,
    address: c.address || '',
    latitude: c.latitude,
    longitude: c.longitude,
    contact_name: '',
    contact_phone: c.phone || '',
    notes: '',
    sort_order: points.value.length
  })
  showToast('已添加：' + c.name)
  routeSummary.value = null
  calcRoute()
}

function addManualPoint() {
  if (!manualPointName.value) return showToast('请输入客户名')
  points.value.push({
    id: Date.now() + Math.random(),
    _new: true,
    customer_name: manualPointName.value,
    address: manualPointAddress.value || '',
    latitude: null,
    longitude: null,
    contact_name: manualPointContact.value || '',
    contact_phone: manualPointPhone.value || '',
    notes: manualPointNotes.value || '',
    sort_order: points.value.length
  })
  manualPointName.value = ''
  manualPointAddress.value = ''
  manualPointContact.value = ''
  manualPointPhone.value = ''
  manualPointNotes.value = ''
  showToast('已添加')
  routeSummary.value = null
  calcRoute()
}

function removePoint(pt) {
  const idx = points.value.findIndex(p => p.id === pt.id)
  if (idx >= 0) points.value.splice(idx, 1)
  routeSummary.value = null
  calcRoute()
}

function editPoint(pt) {
  editingPointId = pt.id
  editPointForm.value = {
    customer_name: pt.customer_name || '',
    address: pt.address || '',
    contact_name: pt.contact_name || '',
    contact_phone: pt.contact_phone || '',
    notes: pt.notes || ''
  }
  showEditPoint.value = true
}

function savePointEdit() {
  const pt = points.value.find(p => p.id === editingPointId)
  if (!pt) return
  pt.customer_name = editPointForm.value.customer_name
  pt.address = editPointForm.value.address
  pt.contact_name = editPointForm.value.contact_name
  pt.contact_phone = editPointForm.value.contact_phone
  pt.notes = editPointForm.value.notes
  if (!pt._new) pt._dirty = true
  showEditPoint.value = false
  routeSummary.value = null
  calcRoute()
}

function onReorder() {
  points.value.forEach((p, i) => p.sort_order = i)
  routeSummary.value = null
  calcRoute()
}

// ====== 路线规划地图 ======
function initRouteMap() {
  if (!routeMapContainer.value) return
  if (routeMap) routeMap.remove()

  try {
    routeMap = L.map(routeMapContainer.value, {
      center: [30.5, 114.3],
      zoom: 7,
      zoomControl: false,
      attributionControl: false
    })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19
    }).addTo(routeMap)
    setTimeout(() => routeMap.invalidateSize(), 200)
    calcRoute()
  } catch (e) {
    console.error('路线地图初始化失败', e)
  }
}

function calcRoute() {
  if (!routeMap) return
  if (routeControl) {
    routeMap.removeControl(routeControl)
    routeControl = null
  }

  const waypoints = points.value
    .filter(p => p.latitude && p.longitude)
    .map(p => L.latLng(p.latitude, p.longitude))

  if (waypoints.length < 2) {
    // 显示简单标记
    for (const p of points.value) {
      if (p.latitude && p.longitude) {
        L.marker([p.latitude, p.longitude])
          .addTo(routeMap)
          .bindPopup(p.customer_name)
      }
    }
    if (waypoints.length === 1) {
      routeMap.setView(waypoints[0], 14)
    }
    routeSummary.value = null
    return
  }

  routeLoading.value = true
  try {
    routeControl = L.Routing.control({
      waypoints,
      language: 'zh-CN',
      routeWhileDragging: false,
      showAlternatives: false,
      lineOptions: { styles: [{ color: '#00695c', weight: 4, opacity: 0.8 }] },
      createMarker: (i, wp) => {
        const name = points.value[i]?.customer_name || `第${i+1}站`
        return L.marker(wp.latLng, {
          icon: L.divIcon({
            className: 'route-marker',
            html: `<div class="rm-pin">${i + 1}</div>`,
            iconSize: [24, 24],
            iconAnchor: [12, 24]
          })
        }).bindPopup(name)
      }
    }).addTo(routeMap)

    routeControl.on('routesfound', (e) => {
      const routes = e.routes
      if (routes.length > 0) {
        const r = routes[0]
        const dist = (r.summary.totalDistance / 1000).toFixed(1)
        const minutes = Math.round(r.summary.totalTime / 60)
        const hours = Math.floor(minutes / 60)
        const mins = minutes % 60
        routeSummary.value = {
          distance: `${dist} km`,
          time: hours > 0 ? `${hours}h${mins}min` : `${mins}min`,
          raw: r
        }
      }
      routeLoading.value = false
    })
    routeControl.on('routingerror', () => {
      routeLoading.value = false
      showToast('路线计算失败，请检查地址坐标')
    })
  } catch (e) {
    routeLoading.value = false
  }
}

// ====== 外部导航 ======
function openExternalNav() {
  if (points.value.length < 1) return
  const first = points.value[0]
  const last = points.value[points.value.length - 1]
  const via = points.value.slice(1, -1)

  // 优先用高德地图
  let url
  if (first.latitude && last.latitude) {
    // 有坐标 → 使用坐标导航
    const viaStr = via.filter(v => v.latitude).map(v => `${v.latitude},${v.longitude}`).join(';')
    if (viaStr) {
      url = `https://uri.amap.com/navigation?to=${last.longitude},${last.latitude}&via=${viaStr}`
    } else {
      url = `https://uri.amap.com/navigation?to=${last.longitude},${last.latitude}`
    }
  } else {
    // 无坐标 → 使用搜索
    url = `https://uri.amap.com/search?keyword=${encodeURIComponent(last.customer_name || '')}`
  }
  window.open(url, '_blank')
}

// ====== 监听路由参数（从地图页面添加客户到行程） ======
onMounted(async () => {
  await loadPlans()
  await loadAllPlans()

  // 处理路由参数：从地图页面添加客户到行程
  if (route.query.add) {
    try {
      const data = JSON.parse(route.query.add)
      // 如果有当前行程则添加到当前行程，否则新建
      if (currentPlan.value) {
        points.value.push({
          id: Date.now() + Math.random(),
          _new: true,
          customer_id: data.customer_id,
          customer_name: data.customer_name,
          address: data.address || '',
          latitude: data.latitude,
          longitude: data.longitude,
          contact_phone: data.contact_phone || '',
          notes: '',
          sort_order: points.value.length
        })
        showToast('已添加到行程')
      } else {
        // 新建行程并带这个客户
        newPlanDate.value = new Date().toISOString().slice(0, 10)
        newPlanTitle.value = data.customer_name + ' 拜访'
        showPlanForm.value = true
        // 建完行程后再添加客户（在 savePlan 后处理）
      }
    } catch {}
  }
})

onUnmounted(() => {
  if (routeControl && routeMap) routeMap.removeControl(routeControl)
  if (routeMap) routeMap.remove()
})
</script>

<style scoped>
.trip-page { display: flex; flex-direction: column; height: 100vh; background: #f0f2f5; }
.trip-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 16px; height: 48px;
  background: linear-gradient(135deg, #e0f7fa 0%, #b2dfdb 100%);
  flex-shrink: 0;
  z-index: 10;
}
.header-left { display: flex; align-items: center; gap: 8px; }
.header-left h3 { font-size: 16px; font-weight: 600; margin: 0; color: #00695c; }
.back-link { color: #00695c; text-decoration: none; font-size: 14px; }
.back-link:hover { text-decoration: underline; }
.header-right { display: flex; gap: 6px; }
.hdr-btn {
  padding: 5px 12px; border-radius: 6px; font-size: 12px; cursor: pointer;
  border: 1px solid rgba(0,0,0,0.08); background: rgba(255,255,255,0.7);
  color: #00695c; font-family: inherit; white-space: nowrap; transition: all .15s;
}
.hdr-btn:hover { background: #fff; border-color: #00695c; }
.hdr-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.trip-body { flex: 1; display: flex; overflow: hidden; }

/* 左侧行程列表 */
.plan-list { width: 320px; min-width: 320px; background: #fff; display: flex; flex-direction: column; border-right: 1px solid #e0e0e0; }
.date-nav { display: flex; align-items: center; gap: 8px; padding: 12px 16px; border-bottom: 1px solid #f0f0f0; }
.date-input { padding: 6px 10px; border: 1px solid #e0e0e0; border-radius: 6px; font-size: 13px; font-family: inherit; outline: none; }
.date-input:focus { border-color: #00695c; }
.date-badge { font-size: 12px; color: #999; }
.plan-cards { flex: 1; overflow-y: auto; padding: 8px; }
.plan-card {
  padding: 12px; border-radius: 8px; border: 1px solid #f0f0f0;
  cursor: pointer; margin-bottom: 6px; transition: all .15s;
}
.plan-card:hover { border-color: #b2dfdb; background: #f0f7fa; }
.pc-date { font-size: 14px; font-weight: 700; color: #00695c; }
.pc-title { font-size: 13px; color: #333; margin: 2px 0; }
.pc-meta { font-size: 11px; color: #999; display: flex; gap: 8px; }
.plan-empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #999; font-size: 13px; gap: 12px; }
.create-btn { padding: 8px 20px; border-radius: 6px; border: none; background: #00695c; color: #fff; font-size: 13px; cursor: pointer; font-family: inherit; }
.create-btn:hover { background: #004d40; }
.all-plans { border-top: 1px solid #f0f0f0; }
.ap-header { display: flex; justify-content: space-between; padding: 10px 16px; cursor: pointer; font-size: 12px; color: #666; }
.ap-header:hover { background: #f5f5f5; }
.ap-toggle { font-size: 10px; color: #bbb; }
.ap-list { max-height: 200px; overflow-y: auto; }
.ap-item { display: flex; align-items: center; gap: 8px; padding: 8px 16px; cursor: pointer; font-size: 12px; }
.ap-item:hover { background: #f0f7fa; }
.ap-date { color: #00695c; font-weight: 600; min-width: 80px; }
.ap-title { flex: 1; color: #333; }
.ap-count { font-size: 10px; color: #999; }
.ap-empty { padding: 12px 16px; color: #999; font-size: 12px; text-align: center; }

/* 右侧行程编辑器 */
.plan-editor { flex: 1; display: flex; flex-direction: column; padding: 16px; overflow-y: auto; }
.editor-header { margin-bottom: 12px; }
.eh-info { display: flex; align-items: center; gap: 12px; }
.edit-title { flex: 1; padding: 8px 12px; border: 1px solid #e0e0e0; border-radius: 8px; font-size: 16px; font-weight: 600; font-family: inherit; outline: none; }
.edit-title:focus { border-color: #00695c; }
.edit-date { padding: 6px 10px; border: 1px solid #e0e0e0; border-radius: 6px; font-size: 13px; font-family: inherit; outline: none; }

/* 途经点列表 */
.point-list { flex: 1; min-height: 200px; }
.pl-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; font-size: 14px; font-weight: 600; color: #333; }
.add-point-btn { padding: 4px 12px; border-radius: 4px; font-size: 11px; cursor: pointer; border: 1px solid #00695c; background: #fff; color: #00695c; font-family: inherit; }
.add-point-btn:hover { background: #e0f7fa; }
.point-draggable { min-height: 60px; }
.point-item {
  display: flex; align-items: center; gap: 8px; padding: 8px 10px;
  margin-bottom: 4px; border: 1px solid #f0f0f0; border-radius: 6px;
  background: #fff; cursor: pointer; transition: all .15s;
}
.point-item:hover { border-color: #b2dfdb; }
.point-item.active { border-color: #00695c; background: #f0f7fa; }
.drag-handle { cursor: grab; color: #ccc; font-size: 16px; padding: 0 4px; user-select: none; }
.drag-handle:active { cursor: grabbing; }
.pt-order { width: 20px; height: 20px; border-radius: 50%; background: #00695c; color: #fff; font-size: 10px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.pt-info { flex: 1; min-width: 0; }
.pt-name { display: block; font-size: 13px; font-weight: 600; color: #333; }
.pt-addr { display: block; font-size: 11px; color: #888; }
.pt-contact { display: block; font-size: 10px; color: #aaa; }
.pt-notes { display: block; font-size: 10px; color: #e6a23c; }
.pt-actions { display: flex; gap: 4px; flex-shrink: 0; }
.pt-btn { background: transparent; border: none; cursor: pointer; font-size: 12px; color: #999; padding: 2px 4px; }
.pt-btn:hover { color: #00695c; }
.pt-btn.del:hover { color: #e53935; }
.pl-empty { padding: 20px; text-align: center; color: #999; font-size: 12px; }

/* 路线预览 */
.route-preview {
  height: 220px; border: 1px solid #e0e0e0; border-radius: 8px;
  overflow: hidden; position: relative; margin: 12px 0;
}
.route-loading { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; gap: 8px; background: rgba(255,255,255,0.8); z-index: 10; font-size: 12px; color: #666; }
.route-info {
  position: absolute; top: 8px; left: 8px; background: rgba(255,255,255,0.95);
  padding: 6px 12px; border-radius: 6px; font-size: 12px; color: #333;
  display: flex; align-items: center; gap: 6px; z-index: 10; box-shadow: 0 1px 4px rgba(0,0,0,0.1);
}
.ri-icon { font-size: 14px; }
.ri-text { font-weight: 600; }
.ri-sep { color: #ddd; }
.ri-nav {
  padding: 3px 8px; border-radius: 4px; font-size: 10px; cursor: pointer;
  border: 1px solid #00695c; background: #fff; color: #00695c; font-family: inherit; margin-left: 4px;
}
.ri-nav:hover { background: #e0f7fa; }
.route-hint { position: absolute; bottom: 8px; left: 8px; font-size: 11px; color: #999; background: rgba(255,255,255,0.8); padding: 4px 8px; border-radius: 4px; }

/* 表单 */
.form-wrap { padding: 16px 20px 24px; }
.form-wrap h3 { font-size: 18px; font-weight: 600; margin: 0 0 12px; }
.form-btns { display: flex; gap: 12px; margin-top: 16px; }
.form-btns .van-button { flex: 1; }

/* 添加途经点搜索 */
.point-search-results { max-height: 200px; overflow-y: auto; margin-bottom: 8px; border: 1px solid #f0f0f0; border-radius: 6px; }
.ps-item { display: flex; align-items: center; gap: 8px; padding: 10px 12px; cursor: pointer; border-bottom: 1px solid #f5f5f5; }
.ps-item:last-child { border-bottom: none; }
.ps-item:hover { background: #f0f7fa; }
.ps-name { font-weight: 600; font-size: 13px; color: #333; }
.ps-addr { flex: 1; font-size: 11px; color: #888; }
.ps-add { color: #00695c; font-weight: 700; font-size: 16px; }
.point-search-empty { text-align: center; color: #999; font-size: 12px; padding: 12px; }
</style>

<style>
/* 路线标记 */
.route-marker { background: transparent !important; border: none !important; }
.rm-pin {
  width: 22px; height: 22px; border-radius: 50%;
  background: #00695c; color: #fff;
  font-size: 11px; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
  border: 2px solid #fff; box-shadow: 0 1px 4px rgba(0,0,0,0.3);
}
</style>
