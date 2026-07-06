<template>
  <div class="map-page">
    <!-- 顶部导航 -->
    <header class="map-header">
      <div class="header-left">
        <button class="back-btn" @click="goBack">‹</button>
        <h3>🗺️ 地图地址</h3>
      </div>
      <div class="header-right">
        <div class="search-wrap">
          <input v-model="searchKw" placeholder="搜索客户名/地址/电话" class="search-input" @input="onSearchDebounce" />
          <span v-if="searchKw" class="search-clear" @click="searchKw='';onSearch()">×</span>
        </div>
        <button class="hdr-btn" @click="showImportConfirm" title="从记事导入客户名">👤 导入</button>
        <button class="hdr-btn" @click="handleExport" title="导出 Excel">📥 导出</button>
        <button class="hdr-btn primary" @click="openAddCustomer">➕ 新建客户</button>
        <router-link to="/trip-plans" class="hdr-btn" style="text-decoration:none">📅 行程</router-link>
      </div>
    </header>

    <!-- 主体：左侧列表 + 右侧地图 -->
    <div class="map-body">
      <!-- 左侧客户列表 -->
      <div class="side-panel" :class="{ collapsed: !showSidePanel }">
        <div class="panel-toolbar">
          <span class="panel-title">客户列表 <small>({{ customers.length }})</small></span>
          <button class="panel-toggle" @click="showSidePanel = !showSidePanel">{{ showSidePanel ? '◀' : '▶' }}</button>
        </div>

        <!-- 区域分组筛选 -->
        <div class="region-filter" v-if="regionGroups.length">
          <span v-for="rg in regionGroups" :key="rg.region" class="region-chip" :class="{ active: activeRegion === rg.region }" @click="toggleRegion(rg.region)">
            {{ rg.region }} ({{ rg.count }})
          </span>
          <span v-if="activeRegion" class="region-chip clear" @click="activeRegion = ''">✕ 清除</span>
        </div>

        <!-- 客户列表 -->
        <div class="customer-list" v-if="filteredCustomers.length">
          <div class="customer-group" v-for="region in groupedByRegion" :key="region.name">
            <div class="group-header" v-if="region.name">{{ region.name }}</div>
            <div v-for="c in region.items" :key="c.id" class="customer-card" :class="{ active: selectedCustomer?.id === c.id }" @click="selectCustomer(c)">
              <div class="cc-name">{{ c.name }}</div>
              <div class="cc-addr" v-if="c.address">
                <span class="cc-icon">📍</span>{{ truncate(c.address, 30) }}
              </div>
              <div class="cc-phone" v-if="c.phone">
                <span class="cc-icon">📞</span>{{ c.phone }}
              </div>
              <div class="cc-meta">
                <span v-if="c.purchaser_count > 0">🧑‍💼 {{ c.purchaser_count }}采购</span>
                <span v-if="c.address_count > 0">📮 {{ c.address_count }}地址</span>
                <span v-if="c.latitude && c.longitude" class="cc-pin">🟢 已定位</span>
                <span v-else class="cc-pin muted">⚪ 未定位</span>
              </div>
            </div>
          </div>
        </div>
        <div v-else class="panel-empty">
          <div v-if="loading">加载中...</div>
          <div v-else-if="searchKw">没有匹配的客户</div>
          <div v-else>暂无客户，点「新建客户」或「导入」</div>
        </div>
      </div>

      <!-- 右侧地图 -->
      <div class="map-container" ref="mapContainer">
        <div class="map-loading" v-if="mapLoading">
          <van-loading size="24" />
          <span>加载地图中...</span>
        </div>
        <!-- 地图控件提示 + 确认按钮 -->
        <div class="map-tip" v-if="selectedMode === 'pick'">
          📍 点击地图设置位置，可拖拽标记微调
          <button class="tip-confirm" @click="confirmCoordPick">✅ 确认</button>
          <button class="tip-close" @click="selectedMode = ''">✕</button>
        </div>
        <!-- 地图搜索框（带结果下拉，不拖地图） -->
        <div class="map-search-wrap" v-if="!selectedMode" ref="searchWrapRef" @mousedown.stop>
          <div class="map-search-bar">
            <input ref="searchInputRef" v-model="mapSearchKw" placeholder="🔍 搜索地址、地点…" class="map-search-input"
              @input="onMapSearchInput" @keydown.enter="onSearchKeydown"
              @keydown.down="onSearchKeyNav(1)" @keydown.up="onSearchKeyNav(-1)"
              @focus="onSearchFocus" @mousedown.stop />
            <button class="map-search-btn" @mousedown.stop @click="doMapSearch">搜索</button>
          </div>
          <!-- 搜索结果下拉 -->
          <div class="search-dropdown" v-if="showSearchResults && searchResults.length">
            <div v-for="(r, i) in searchResults" :key="i" class="search-result-item" :class="{ active: searchHighlight === i }" @mousedown.prevent="pickSearchResult(r)">
              <div class="sr-name">{{ r.name }}</div>
              <div class="sr-addr">{{ r.address || '' }}</div>
              <div class="sr-meta">{{ [r.province, r.district, r.business].filter(Boolean).join(' ') }}</div>
              <div class="sr-type" v-if="r.type && r.type !== 'geocode'">{{ r.type.split(';')[0] }}</div>
            </div>
          </div>
          <div class="search-dropdown empty" v-else-if="showSearchResults && searchDone && !searchResults.length">
            <div class="search-result-empty">未找到匹配地点</div>
          </div>
        </div>
        <!-- 图例 -->
        <div class="map-legend">
          <span class="legend-item"><span class="legend-dot" style="background:#00695c"></span>已定位客户</span>
          <span class="legend-item"><span class="legend-dot" style="background:#999"></span>未定位客户</span>
        </div>
      </div>
    </div>

    <!-- ===== 客户详情弹出层 ===== -->
    <van-popup v-model:show="showDetail" round position="bottom" :style="{ height: '75%', maxHeight: '600px' }" closeable @closed="onDetailClosed" safe-area-inset-bottom>
      <div class="detail-wrap" v-if="detailData">
        <!-- 客户基本信息 -->
        <div class="detail-head">
          <div class="dh-title">
            <h3>{{ detailData.customer.name }}</h3>
            <span class="dh-badge" v-if="detailData.customer.latitude">🟢 已定位</span>
            <span class="dh-badge muted" v-else>⚪ 未定位</span>
          </div>
          <div class="dh-info">
            <div v-if="detailData.customer.address" class="dh-row"><span class="dh-label">📍</span>{{ detailData.customer.address }}</div>
            <div v-if="detailData.customer.phone" class="dh-row"><span class="dh-label">📞</span>{{ detailData.customer.phone }}</div>
            <div v-if="detailData.customer.notes" class="dh-row"><span class="dh-label">📝</span>{{ detailData.customer.notes }}</div>
          </div>
          <div class="dh-actions">
            <button class="dh-btn" @click="editCustomer(detailData.customer)">✏️ 编辑</button>
            <button class="dh-btn" @click="locateOnMap(detailData.customer)">📍 定位</button>
            <button class="dh-btn" @click="openAddToTrip(detailData.customer)">📌 添加到行程</button>
            <button class="dh-btn" @click="navigateToCustomer(detailData.customer)">🚗 导航到此</button>
            <button class="dh-btn danger" style="color:#e53935" @click="handleDeleteCustomer(detailData.customer)">🗑️ 删除</button>
          </div>
        </div>

        <!-- 采购联系人 -->
        <div class="detail-section">
          <div class="section-head">
            <span class="section-title">🧑‍💼 采购联系人 ({{ detailData.purchasers.length }})</span>
            <button class="section-add" @click="openAddPurchaser">＋ 添加</button>
          </div>
          <div v-for="p in detailData.purchasers" :key="p.id" class="purchaser-card" :class="{ expanded: expandedPurchaser === p.id }">
            <div class="pc-head" @click="expandedPurchaser = expandedPurchaser === p.id ? null : p.id">
              <span class="pc-name">{{ p.name }}</span>
              <span class="pc-phone" v-if="p.phone">📞 {{ p.phone }}</span>
              <span class="pc-title" v-if="p.title">{{ p.title }}</span>
              <span class="pc-toggle">{{ expandedPurchaser === p.id ? '▼' : '▶' }}</span>
              <button class="pc-edit" @click.stop="editPurchaser(p)">✏️</button>
              <button class="pc-del" @click.stop="handleDeletePurchaser(p)">×</button>
            </div>
            <div class="pc-body" v-if="expandedPurchaser === p.id">
              <!-- 采购下的地址 -->
              <div v-for="a in p.addresses" :key="a.id" class="address-item">
                <div class="ai-left">
                  <span class="ai-label" :class="a.label">{{ a.label || '地址' }}</span>
                  <span class="ai-addr">{{ a.address }}</span>
                  <span class="ai-contact" v-if="a.contact_name">{{ a.contact_name }} {{ a.contact_phone }}</span>
                  <span class="ai-default" v-if="a.is_default">[默认]</span>
                </div>
                <div class="ai-right">
                  <button class="ai-btn" @click="editAddress(a)">✏️</button>
                  <button class="ai-btn" @click="handleDeleteAddress(a)">×</button>
                </div>
              </div>
              <button class="add-addr-btn" @click="openAddAddress(p)">➕ 添加收件地址</button>
            </div>
          </div>
          <!-- 未关联采购的地址 -->
          <div v-for="a in detailData.unassigned" :key="'u'+a.id" class="address-item unassigned">
            <div class="ai-left">
              <span class="ai-label" :class="a.label">{{ a.label || '地址' }}</span>
              <span class="ai-addr">{{ a.address }}</span>
            </div>
            <div class="ai-right">
              <button class="ai-btn" @click="editAddress(a)">✏️</button>
              <button class="ai-btn" @click="handleDeleteAddress(a)">×</button>
            </div>
          </div>
        </div>
      </div>
    </van-popup>

    <!-- ===== 客户表单弹出层 ===== -->
    <van-popup v-model:show="showCustomerForm" round position="bottom" :style="{ height: 'auto', maxHeight: '80%' }" closeable>
      <div class="form-wrap">
        <h3>{{ editingCustomer ? '编辑客户' : '新建客户' }}</h3>
        <van-field v-model="customerForm.name" label="客户名" placeholder="输入客户名" required :rules="[{ required: true }]" />
        <van-field v-model="customerForm.phone" label="电话" placeholder="联系电话" type="tel" />
        <van-field v-model="customerForm.address" label="地址" placeholder="详细地址" @input="onAddressInput" />
        <div class="coord-pick">
          <div class="coord-row">
            <span class="coord-label">坐标</span>
            <input v-model.number="customerForm.latitude" class="coord-input" placeholder="纬度" type="number" step="0.000001" />
            <input v-model.number="customerForm.longitude" class="coord-input" placeholder="经度" type="number" step="0.000001" />
            <button class="coord-btn" @click="startCoordPick">📍 选点</button>
          </div>
          <div class="coord-hint">点击「选点」在地图上标记位置，或直接输入坐标</div>
        </div>
        <van-field v-model="customerForm.notes" label="备注" placeholder="备注信息" type="textarea" rows="3" />
        <div class="form-btns">
          <van-button round plain type="default" @click="showCustomerForm = false">取消</van-button>
          <van-button round type="primary" :loading="saving" @click="saveCustomer">保存</van-button>
        </div>
      </div>
    </van-popup>

    <!-- ===== 采购表单弹出层 ===== -->
    <van-popup v-model:show="showPurchaserForm" round position="bottom" :style="{ height: 'auto' }" closeable>
      <div class="form-wrap">
        <h3>{{ editingPurchaser ? '编辑采购联系人' : '添加采购联系人' }}</h3>
        <van-field v-model="purchaserForm.name" label="姓名" placeholder="输入姓名" required />
        <van-field v-model="purchaserForm.phone" label="电话" placeholder="联系电话" type="tel" />
        <van-field v-model="purchaserForm.title" label="职位" placeholder="如：采购经理" />
        <van-field v-model="purchaserForm.notes" label="备注" placeholder="备注" type="textarea" rows="2" />
        <div class="form-btns">
          <van-button round plain type="default" @click="showPurchaserForm = false">取消</van-button>
          <van-button round type="primary" :loading="saving" @click="savePurchaser">保存</van-button>
        </div>
      </div>
    </van-popup>

    <!-- ===== 地址表单弹出层 ===== -->
    <van-popup v-model:show="showAddressForm" round position="bottom" :style="{ height: 'auto', maxHeight: '80%' }" closeable>
      <div class="form-wrap">
        <h3>{{ editingAddress ? '编辑收件地址' : '添加收件地址' }}</h3>
        <van-field v-model="addressForm.label" label="标签" placeholder="如：办公地址、仓库" />
        <van-field v-model="addressForm.address" label="地址" placeholder="详细地址" required @input="onAddrInput" />
        <van-field v-model="addressForm.contact_name" label="收件人" placeholder="收件人姓名" />
        <van-field v-model="addressForm.contact_phone" label="联系电话" placeholder="收件人电话" type="tel" />
        <div class="coord-pick">
          <div class="coord-row">
            <span class="coord-label">坐标</span>
            <input v-model.number="addressForm.latitude" class="coord-input" placeholder="纬度" type="number" step="0.000001" />
            <input v-model.number="addressForm.longitude" class="coord-input" placeholder="经度" type="number" step="0.000001" />
            <button class="coord-btn" @click="startCoordPick">📍 选点</button>
          </div>
          <div class="coord-hint">点击「选点」在地图上标记位置</div>
        </div>
        <van-field v-model="addressForm.notes" label="备注" placeholder="备注" type="textarea" rows="2" />
        <div class="form-btns">
          <van-button round plain type="default" @click="showAddressForm = false">取消</van-button>
          <van-button round type="primary" :loading="saving" @click="saveAddress">保存</van-button>
        </div>
      </div>
    </van-popup>

  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast, showConfirmDialog, showDialog } from 'vant'
import {
  fetchMapCustomers, getMapCustomer, createMapCustomer, updateMapCustomer, deleteMapCustomer,
  importMapCustomersFromNotes, exportMapAddresses,
  createPurchaser, updatePurchaser, deletePurchaser,
  createAddress, updateAddress, deleteAddress,
  geocodeAddress, reverseGeocode, getAmapKey, poiSearch
} from '../utils/api.js'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import 'leaflet-routing-machine'
import 'leaflet-routing-machine/dist/leaflet-routing-machine.css'

// ====== 修复 Leaflet 默认图标路径 ======
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png'
})

const route_ = useRoute()
// 地理编码包装：自动带高德 Key
function myGeocode(q) { return geocodeAddress(q, getAmapKey()) }
function myReverseGeocode(lat, lng) { return reverseGeocode(lat, lng, getAmapKey()) }
const router = useRouter()
const mapContainer = ref(null)
let map = null
let markerCluster = null
let customerMarkers = {}
let currentRoute = null

// ====== 状态 ======
const isStandalone = ref(route_.query.standalone === '1')
const customers = ref([])
const loading = ref(false)
const mapLoading = ref(true)
const searchKw = ref('')
const activeRegion = ref('')
const showSidePanel = ref(true)
const selectedCustomer = ref(null)
const showDetail = ref(false)
const detailData = ref(null)
const expandedPurchaser = ref(null)
const selectedMode = ref('') // '' | 'pick'
let geocodeTarget = null // 'customer' | 'address'

// 表单
const showCustomerForm = ref(false)
const showPurchaserForm = ref(false)
const showAddressForm = ref(false)
const editingCustomer = ref(null)
const editingPurchaser = ref(null)
const editingAddress = ref(null)
const saving = ref(false)
const customerForm = reactive({ name: '', phone: '', address: '', latitude: null, longitude: null, notes: '' })
const purchaserForm = reactive({ name: '', phone: '', title: '', notes: '' })
const addressForm = reactive({ label: '', address: '', contact_name: '', contact_phone: '', latitude: null, longitude: null, notes: '' })
let addressFormPurchaserId = 0

// ====== 计算属性 ======
const regionGroups = computed(() => {
  const map = {}
  for (const c of customers.value) {
    if (!c.latitude || !c.longitude) continue
    const region = extractRegion(c.address) || '其他'
    if (!map[region]) map[region] = 0
    map[region]++
  }
  return Object.entries(map)
    .map(([region, count]) => ({ region, count }))
    .sort((a, b) => b.count - a.count)
})

const filteredCustomers = computed(() => {
  let list = customers.value
  const kw = searchKw.value.trim().toLowerCase()
  if (kw) {
    list = list.filter(c =>
      c.name.toLowerCase().includes(kw) ||
      (c.address || '').toLowerCase().includes(kw) ||
      (c.phone || '').includes(kw)
    )
  }
  if (activeRegion.value) {
    list = list.filter(c => {
      if (!c.latitude || !c.longitude) return false
      return extractRegion(c.address) === activeRegion.value
    })
  }
  return list
})

const groupedByRegion = computed(() => {
  const groups = {}
  for (const c of filteredCustomers.value) {
    const region = c.latitude && c.longitude ? (extractRegion(c.address) || '未分组') : '未定位'
    if (!groups[region]) groups[region] = []
    groups[region].push(c)
  }
  // 排序：已定位区域优先，区域内按客户名
  const keys = Object.keys(groups).sort((a, b) => {
    if (a === '未定位') return 1
    if (b === '未定位') return -1
    return a.localeCompare(b)
  })
  return keys.map(k => ({ name: k, items: groups[k] }))
})

// ====== 工具函数 ======
function extractRegion(addr) {
  if (!addr) return ''
  const match = addr.match(/([^^省]+省|)([^^市]+市)/)
  return match ? match[0] : ''
}

function truncate(s, len) {
  if (!s) return ''
  return s.length > len ? s.slice(0, len) + '…' : s
}

function goBack() {
  if (isStandalone.value) {
    window.close()
  } else {
    router.push('/')
  }
}

// ====== 坐标转换：WGS84 ↔ GCJ02（高德/国测局坐标） ======
// 高德瓦片用 GCJ02，数据库存 WGS84，展示时转换
const _a = 6378245.0
const _ee = 0.00669342162296594323
function _transformLat(x, y) {
  let ret = -100 + 2*x + 3*y + 0.2*y*y + 0.1*x*y + 0.2*Math.sqrt(Math.abs(x))
  ret += (20*Math.sin(6*x*Math.PI) + 20*Math.sin(2*x*Math.PI)) * 2/3
  ret += (20*Math.sin(y*Math.PI) + 40*Math.sin(y/3*Math.PI)) * 2/3
  ret += (160*Math.sin(y/12*Math.PI) + 320*Math.sin(y*Math.PI/30)) * 2/3
  return ret
}
function _transformLon(x, y) {
  let ret = 300 + x + 2*y + 0.1*x*x + 0.1*x*y + 0.1*Math.sqrt(Math.abs(x))
  ret += (20*Math.sin(6*x*Math.PI) + 20*Math.sin(2*x*Math.PI)) * 2/3
  ret += (20*Math.sin(x*Math.PI) + 40*Math.sin(x/3*Math.PI)) * 2/3
  ret += (150*Math.sin(x/12*Math.PI) + 300*Math.sin(x/30*Math.PI)) * 2/3
  return ret
}
// 是否在中国境内
function _inChina(lat, lng) { return lng > 72 && lng < 137 && lat > 1 && lat < 55 }
// WGS84 → GCJ02（用于展示到高德地图）
function wgs84ToGcj02(lat, lng) {
  if (!_inChina(lat, lng)) return { lat, lng }
  let dLat = _transformLat(lng - 105, lat - 35)
  let dLng = _transformLon(lng - 105, lat - 35)
  const radLat = lat / 180 * Math.PI
  let magic = Math.sin(radLat)
  magic = 1 - _ee * magic * magic
  const sqrtMagic = Math.sqrt(magic)
  dLat = (dLat * 180) / ((_a * (1 - _ee)) / (magic * sqrtMagic) * Math.PI)
  dLng = (dLng * 180) / (_a / sqrtMagic * Math.cos(radLat) * Math.PI)
  return { lat: lat + dLat, lng: lng + dLng }
}
// GCJ02 → WGS84（用于保存从高德获取的坐标到数据库）
function gcj02ToWgs84(lat, lng) {
  if (!_inChina(lat, lng)) return { lat, lng }
  const wgs = wgs84ToGcj02(lat, lng)
  return { lat: 2*lat - wgs.lat, lng: 2*lng - wgs.lng }
}
// 转成高德坐标（数据库 WGS84 → 展示 GCJ02）
function ll(lat, lng) { const c = wgs84ToGcj02(lat, lng); return [c.lat, c.lng] }
// 从高德坐标转回 WGS84（高德 API 返回 → 存数据库）
function fromAmap(lat, lng) { const c = gcj02ToWgs84(lat, lng); return { lat: c.lat, lng: c.lng } }

// ====== 地图初始化 ======
function initMap() {
  if (!mapContainer.value || map) return
  mapLoading.value = true

  try {
    map = L.map(mapContainer.value, {
      center: [30.5, 114.3], // 中国中部
      zoom: 6,
      zoomControl: true,
      attributionControl: true
    })

    // 底图：高德地图瓦片（中国地区详细）+ 坐标偏移转换
    // 高德瓦片公开可用，无需 Key，显示中文路名/POI/建筑轮廓
    L.tileLayer('https://webrd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}', {
      attribution: '&copy; 高德地图 &copy; 晶振报价系统',
      maxZoom: 18
    }).addTo(map)

    // 标记聚合
    markerCluster = L.markerClusterGroup({
      chunkedLoading: true,
      maxClusterRadius: 50,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true
    })
    map.addLayer(markerCluster)

    // 点击地图事件（选点模式）
    map.on('click', (e) => {
      mapClickOnPick(e)
    })

    // 搜索框不触发地图拖拽
    setTimeout(() => {
      const wrap = mapContainer.value?.querySelector('.map-search-wrap')
      if (wrap) {
        L.DomEvent.disableClickPropagation(wrap)
        L.DomEvent.disableScrollPropagation(wrap)
        // 输入框额外拦截 mousedown
        const input = wrap.querySelector('.map-search-input')
        if (input) L.DomEvent.disableClickPropagation(input)
        const btn = wrap.querySelector('.map-search-btn')
        if (btn) L.DomEvent.disableClickPropagation(btn)
      }
    }, 500)

    mapLoading.value = false

    // 延迟加载客户标记
    setTimeout(loadCustomerMarkers, 300)
  } catch (e) {
    console.error('地图初始化失败:', e)
    mapLoading.value = false
    showToast('地图加载失败，请检查网络')
  }
}

// ====== 加载客户标记 ======
function loadCustomerMarkers() {
  if (!markerCluster) return
  markerCluster.clearLayers()
  customerMarkers = {}

  for (const c of customers.value) {
    if (!c.latitude || !c.longitude) continue
    const icon = L.divIcon({
      className: 'custom-marker',
      html: `<div class="marker-pin ${c.address_count > 0 ? 'has-addr' : ''}">${c.name.slice(0, 3)}</div>`,
      iconSize: [60, 28],
      iconAnchor: [30, 28],
      popupAnchor: [0, -30]
    })

    const marker = L.marker(ll(c.latitude, c.longitude), { icon })
    marker.bindPopup(`
      <div class="popup-content">
        <div class="popup-name"><strong>${c.name}</strong></div>
        <div class="popup-addr">${c.address || '未填写地址'}</div>
        <div class="popup-phone">${c.phone || ''}</div>
        <div class="popup-meta">🧑‍💼 ${c.purchaser_count || 0}采购 · 📮 ${c.address_count || 0}地址</div>
        <button class="popup-btn" data-id="${c.id}">查看详情</button>
      </div>
    `)
    marker.on('popupopen', () => {
      setTimeout(() => {
        const btn = document.querySelector('.popup-btn[data-id="' + c.id + '"]')
        if (btn) btn.onclick = () => selectCustomer(c)
      }, 100)
    })

    markerCluster.addLayer(marker)
    customerMarkers[c.id] = marker
  }

  // 自动缩放到所有标记
  if (Object.keys(customerMarkers).length) {
    map.fitBounds(markerCluster.getBounds(), { padding: [30, 30], maxZoom: 14 })
  } else if (customers.value.length) {
    // 有客户但没有坐标的，保持默认视图
  }
}

// ====== 搜索 / 筛选 ======
let searchTimer = null
function onSearchDebounce() {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(onSearch, 300)
}
function onSearch() {
  // 搜索会通过 computed filteredCustomers 自动过滤列表
  // 地图上高亮匹配的客户
  highlightMarkers()
}
function highlightMarkers() {
  const kw = searchKw.value.trim().toLowerCase()
  for (const c of customers.value) {
    const marker = customerMarkers[c.id]
    if (!marker) continue
    if (!kw) {
      marker.setOpacity(1)
    } else {
      const match = c.name.toLowerCase().includes(kw) || (c.address || '').toLowerCase().includes(kw)
      marker.setOpacity(match ? 1 : 0.3)
    }
  }
}

function toggleRegion(region) {
  activeRegion.value = activeRegion.value === region ? '' : region
}

// ====== 客户选择 ======
async function selectCustomer(c) {
  selectedCustomer.value = c
  // 在地图上定位：有坐标直接跳转，无坐标但有地址则自动搜索
  if (c.latitude && c.longitude && map) {
    map.setView(ll(c.latitude, c.longitude), 15)
  } else if (c.address && map) {
    try {
      const r = await myGeocode(c.address)
      const results = r.data || []
      if (results.length) {
        const best = results[0]
        // 在地图上放临时标记（不保存，仅预览）
        if (window._viewMarker) map.removeLayer(window._viewMarker)
        window._viewMarker = L.marker(ll(best.lat, best.lng), {
          icon: L.divIcon({ className: 'search-marker', html: '📍', iconSize: [24, 24], iconAnchor: [12, 24] })
        }).addTo(map)
        map.setView(ll(best.lat, best.lng), 15)
      }
    } catch {}
  }
  // 加载详情
  try {
    const r = await getMapCustomer(c.id)
    detailData.value = r.data
    showDetail.value = true
    expandedPurchaser.value = null
  } catch (e) {
    showToast('加载详情失败')
  }
}

function onDetailClosed() {
  selectedCustomer.value = null
  expandedPurchaser.value = null
}

// ====== 客户增删改 ======
function openAddCustomer() {
  editingCustomer.value = null
  customerForm.name = ''
  customerForm.phone = ''
  customerForm.address = ''
  customerForm.latitude = null
  customerForm.longitude = null
  customerForm.notes = ''
  showCustomerForm.value = true
}

function editCustomer(c) {
  editingCustomer.value = c
  customerForm.name = c.name
  customerForm.phone = c.phone || ''
  customerForm.address = c.address || ''
  customerForm.latitude = c.latitude
  customerForm.longitude = c.longitude
  customerForm.notes = c.notes || ''
  showCustomerForm.value = true
}

async function saveCustomer() {
  if (!customerForm.name) return showToast('客户名不能为空')
  saving.value = true
  try {
    if (editingCustomer.value) {
      await updateMapCustomer(editingCustomer.value.id, { ...customerForm })
      showToast('已更新')
    } else {
      await createMapCustomer({ ...customerForm })
      showToast('已创建')
    }
    showCustomerForm.value = false
    await loadData()
  } catch (e) {
    showToast(e.message || '保存失败')
  } finally {
    saving.value = false
  }
}

async function handleDeleteCustomer(c) {
  try {
    await showConfirmDialog({ title: '确认删除', message: `确定删除客户「${c.name}」？采购信息和地址将一并删除。` })
    await deleteMapCustomer(c.id)
    showToast('已删除')
    showDetail.value = false
    detailData.value = null
    if (selectedCustomer.value?.id === c.id) selectedCustomer.value = null
    await loadData()
  } catch (e) {
    if (e === 'cancel' || e?.message?.includes('cancel')) return
    showToast('删除失败')
  }
}

// ====== 采购增删改 ======
function openAddPurchaser() {
  if (!detailData.value) return
  editingPurchaser.value = null
  purchaserForm.name = ''
  purchaserForm.phone = ''
  purchaserForm.title = ''
  purchaserForm.notes = ''
  showPurchaserForm.value = true
}

function editPurchaser(p) {
  editingPurchaser.value = p
  purchaserForm.name = p.name
  purchaserForm.phone = p.phone || ''
  purchaserForm.title = p.title || ''
  purchaserForm.notes = p.notes || ''
  showPurchaserForm.value = true
}

async function savePurchaser() {
  if (!purchaserForm.name) return showToast('姓名不能为空')
  saving.value = true
  try {
    if (editingPurchaser.value) {
      await updatePurchaser(editingPurchaser.value.id, { ...purchaserForm })
      showToast('已更新')
    } else {
      await createPurchaser({ customer_id: detailData.value.customer.id, ...purchaserForm })
      showToast('已添加')
    }
    showPurchaserForm.value = false
    // 刷新详情
    const r = await getMapCustomer(detailData.value.customer.id)
    detailData.value = r.data
  } catch (e) {
    showToast(e.message || '保存失败')
  } finally {
    saving.value = false
  }
}

async function handleDeletePurchaser(p) {
  try {
    await showConfirmDialog({ title: '确认删除', message: `确定删除采购联系人「${p.name}」？` })
    await deletePurchaser(p.id)
    showToast('已删除')
    const r = await getMapCustomer(detailData.value.customer.id)
    detailData.value = r.data
  } catch (e) {
    if (e === 'cancel' || e?.message?.includes('cancel')) return
  }
}

// ====== 地址增删改 ======
function openAddAddress(p) {
  editingAddress.value = null
  addressFormPurchaserId = p?.id || 0
  addressForm.label = ''
  addressForm.address = ''
  addressForm.contact_name = ''
  addressForm.contact_phone = ''
  addressForm.latitude = null
  addressForm.longitude = null
  addressForm.notes = ''
  showAddressForm.value = true
}

function editAddress(a) {
  editingAddress.value = a
  addressFormPurchaserId = a.purchaser_id || 0
  addressForm.label = a.label || ''
  addressForm.address = a.address || ''
  addressForm.contact_name = a.contact_name || ''
  addressForm.contact_phone = a.contact_phone || ''
  addressForm.latitude = a.latitude
  addressForm.longitude = a.longitude
  addressForm.notes = a.notes || ''
  showAddressForm.value = true
}

async function saveAddress() {
  if (!addressForm.address) return showToast('地址不能为空')
  saving.value = true
  try {
    const data = {
      ...addressForm,
      customer_id: detailData.value.customer.id,
      purchaser_id: addressFormPurchaserId
    }
    if (editingAddress.value) {
      await updateAddress(editingAddress.value.id, data)
      showToast('已更新')
    } else {
      await createAddress(data)
      showToast('已添加')
    }
    showAddressForm.value = false
    const r = await getMapCustomer(detailData.value.customer.id)
    detailData.value = r.data

    // 如果地址有坐标，刷新客户标记
    if (data.latitude && data.longitude) {
      await loadData()
    }
  } catch (e) {
    showToast(e.message || '保存失败')
  } finally {
    saving.value = false
  }
}

async function handleDeleteAddress(a) {
  try {
    await showConfirmDialog({ title: '确认删除', message: '确定删除此地址？' })
    await deleteAddress(a.id)
    showToast('已删除')
    const r = await getMapCustomer(detailData.value.customer.id)
    detailData.value = r.data
    await loadData()
  } catch (e) {
    if (e === 'cancel' || e?.message?.includes('cancel')) return
  }
}

// ====== 地图搜索框（POI + 地址，像手机地图） ======
const mapSearchKw = ref('')
const searchResults = ref([])
const showSearchResults = ref(false)
const searchHighlight = ref(-1)
const searchDone = ref(false)
const searchWrapRef = ref(null)
const searchInputRef = ref(null)
let mapSearchMarker = null
let mapSearchTimer = null

// 光标移到末尾
function onSearchFocus(e) {
  setTimeout(() => {
    const el = e.target
    const len = el.value.length
    el.setSelectionRange(len, len)
  }, 0)
}

function onMapSearchInput() {
  searchDone.value = false
  clearTimeout(mapSearchTimer)
  const kw = mapSearchKw.value.trim()
  if (kw.length < 2) { searchResults.value = []; showSearchResults.value = false; return }
  mapSearchTimer = setTimeout(doPoiSearch, 350)
}

// POI 搜索（优先）+ 降级地理编码
async function doPoiSearch() {
  const kw = mapSearchKw.value.trim()
  if (!kw) return
  const amapKey = getAmapKey()
  try {
    let results = []
    if (amapKey) {
      // 有高德 Key → POI 搜索（像手机版）
      const r = await poiSearch(kw, amapKey)
      results = (r.data || []).map(item => ({
        ...item,
        name: item.name || item.address || kw,
        address: item.address || ''
      }))
    }
    // POI 没结果或没 Key → 降级地理编码
    if (!results.length) {
      const r = await myGeocode(kw)
      results = (r.data || []).map(item => ({
        ...item,
        name: item.address || item.label || kw,
        address: item.label || item.address || ''
      }))
    }
    searchResults.value = results
    showSearchResults.value = results.length > 0
    searchDone.value = true
    searchHighlight.value = -1
    if (results.length) placeSearchMarker(results[0])
    else showToast('未找到匹配地点')
  } catch {
    searchDone.value = true
  }
}

function doMapSearch() {
  doPoiSearch()
}

function placeSearchMarker(result) {
  if (!map || !result.lat || !result.lng) return
  map.setView(ll(result.lat, result.lng), 16)
  if (mapSearchMarker) map.removeLayer(mapSearchMarker)
  mapSearchMarker = L.marker(ll(result.lat, result.lng), {
    icon: L.divIcon({ className: 'search-marker', html: '📍', iconSize: [24, 24], iconAnchor: [12, 24] })
  }).addTo(map)
  const name = result.name || ''
  const addr = result.address || ''
  mapSearchMarker.bindPopup(`<div style="font-size:13px;font-weight:600">${name}</div><div style="font-size:11px;color:#888">${addr}</div>`).openPopup()
}

function pickSearchResult(r) {
  showSearchResults.value = false
  mapSearchKw.value = r.name || ''
  placeSearchMarker(r)
}

function onSearchKeydown(e) {
  if (searchHighlight.value >= 0 && searchResults.value[searchHighlight.value]) {
    pickSearchResult(searchResults.value[searchHighlight.value])
    e.preventDefault()
  } else if (searchResults.value.length) {
    pickSearchResult(searchResults.value[0])
  }
}

function onSearchKeyNav(dir) {
  if (!searchResults.value.length) return
  let idx = searchHighlight.value + dir
  if (idx < 0) idx = searchResults.value.length - 1
  if (idx >= searchResults.value.length) idx = 0
  searchHighlight.value = idx
}

// 点击其他地方关闭搜索结果
function onMapClickCloseSearch(e) {
  if (searchWrapRef.value && !searchWrapRef.value.contains(e.target)) {
    showSearchResults.value = false
  }
}

// ====== 坐标选点（关闭表单 → 全屏地图选点 → 确认后回填） ======
let pickOriginForm = '' // 'customer' | 'address'
function startCoordPick() {
  pickOriginForm = showCustomerForm.value ? 'customer' : 'address'
  selectedMode.value = 'pick'
  // 关闭表单弹窗，让地图全屏可见
  showCustomerForm.value = false
  showAddressForm.value = false
  // 加个延时等弹窗关闭动画完成
  setTimeout(() => {
    const addr = pickOriginForm === 'customer' ? customerForm.address : addressForm.address
    if (addr && addr.length >= 3) {
      doPickGeocode(addr)
    } else {
      centerMapForPick()
    }
  }, 350)
}
async function doPickGeocode(addr) {
  try {
    const r = await myGeocode(addr)
    const results = r.data || []
    if (results.length && map) {
      const best = results[0]
      const isAmap = r.provider === 'amap'
      const slat = isAmap ? fromAmap(best.lat, best.lng).lat : best.lat
      const slng = isAmap ? fromAmap(best.lat, best.lng).lng : best.lng
      setFormCoords(slat, slng)
      placePickMarker(slat, slng)
      map.setView(ll(slat, slng), 16)
      showToast('已定位到：' + (best.label || '').slice(0, 30))
    } else {
      centerMapForPick()
      showToast('未搜到精确位置，请在地图上点击或拖拽')
    }
  } catch {
    centerMapForPick()
  }
}
function centerMapForPick() {
  if (!map) return
  const center = map.getCenter() // GCJ02（高德瓦片坐标）
  const wgs = gcj02ToWgs84(center.lat, center.lng) // 转 WGS84 存数据库
  setFormCoords(wgs.lat, wgs.lng)
  placePickMarker(wgs.lat, wgs.lng)
}
function placePickMarker(lat, lng) {
  if (!map) return
  if (window._pickMarker) map.removeLayer(window._pickMarker)
  window._pickMarker = L.marker(ll(lat, lng), {
    draggable: true,
    icon: L.divIcon({ className: 'pick-marker', html: '📍', iconSize: [24, 24], iconAnchor: [12, 24] })
  }).addTo(map)
  window._pickMarker.on('dragend', () => {
    const pos = window._pickMarker.getLatLng() // GCJ02
    const wgs = gcj02ToWgs84(pos.lat, pos.lng)
    setFormCoords(wgs.lat, wgs.lng)
  })
}
function mapClickOnPick(e) {
  if (selectedMode.value !== 'pick') return
  const { lat, lng } = e.latlng // Leaflet 返回 GCJ02（高德瓦片）
  const wgs = gcj02ToWgs84(lat, lng) // 转 WGS84 存数据库
  setFormCoords(wgs.lat, wgs.lng)
  placePickMarker(wgs.lat, wgs.lng)
}
function setFormCoords(lat, lng) {
  if (pickOriginForm === 'customer') {
    customerForm.latitude = lat
    customerForm.longitude = lng
  } else {
    addressForm.latitude = lat
    addressForm.longitude = lng
  }
}
// 确认选点 → 回填坐标 + 重新打开表单
function confirmCoordPick() {
  selectedMode.value = ''
  // 移除临时标记
  if (window._pickMarker && map) { map.removeLayer(window._pickMarker); window._pickMarker = null }
  // 重新打开对应表单
  if (pickOriginForm === 'customer') {
    showCustomerForm.value = true
  } else {
    showAddressForm.value = true
  }
  showToast('坐标已定位 ✓')
}
// 确认选点（在模板中通过 confirmCoordPick 调用）

// ====== 地址自动搜索定位（表单输入时） ======
let geoAutoTimer = null
async function autoGeocode(val, target) {
  geocodeTarget = target
  if (!val || val.length < 3) {
    if (target === 'customer') { customerForm.latitude = null; customerForm.longitude = null }
    else { addressForm.latitude = null; addressForm.longitude = null }
    return
  }
  clearTimeout(geoAutoTimer)
  geoAutoTimer = setTimeout(async () => {
    try {
      const r = await myGeocode(val)
      const results = r.data || []
      if (results.length) {
        const best = results[0]
        // 高德返回 GCJ02 → 转 WGS84 存数据库
        const isAmap = r.provider === 'amap'
        const saveLat = isAmap ? fromAmap(best.lat, best.lng).lat : best.lat
        const saveLng = isAmap ? fromAmap(best.lat, best.lng).lng : best.lng
        if (target === 'customer') {
          customerForm.latitude = saveLat
          customerForm.longitude = saveLng
        } else {
          addressForm.latitude = saveLat
          addressForm.longitude = saveLng
        }
        // 在地图上显示标记（用 GCJ02 坐标）
        if (map) {
          if (window._geoMarker) map.removeLayer(window._geoMarker)
          window._geoMarker = L.marker(ll(saveLat, saveLng), {
            icon: L.divIcon({ className: 'search-marker', html: '📍', iconSize: [24, 24], iconAnchor: [12, 24] })
          }).addTo(map)
          map.setView(ll(saveLat, saveLng), 15)
        }
      }
    } catch {}
  }, 600)
}

function onAddressInput(val) {
  autoGeocode(val, 'customer')
}
function onAddrInput(val) {
  autoGeocode(val, 'address')
}

// 地图搜索按钮
function showMapSearch() {
  // 如果表单已打开且有地址，自动定位
  const addr = showCustomerForm.value ? customerForm.address : addressForm.value?.address
  if (addr && addr.length >= 3) {
    doMapSearch()
  }
}

// ====== 地图操作 ======
function locateOnMap(c) {
  if (c.latitude && c.longitude && map) {
    map.setView(ll(c.latitude, c.longitude), 16)
    // 闪烁标记
    if (customerMarkers[c.id]) {
      const m = customerMarkers[c.id]
      m.openPopup()
    }
  } else {
    showToast('该客户尚未定位')
  }
}

function navigateToCustomer(c) {
  if (!c.latitude || !c.longitude) {
    showToast('该客户尚未定位，请先设置坐标')
    return
  }
  // 如果已有导航路线，清除
  if (currentRoute && map) {
    map.removeControl(currentRoute)
    currentRoute = null
  }
  // 使用浏览器定位作为起点
  map.locate({ setView: false, enableHighAccuracy: true })
  map.once('locationfound', (e) => {
    const start = e.latlng
    try {
      currentRoute = L.Routing.control({
        waypoints: [
          (() => { const c = wgs84ToGcj02(start.lat, start.lng); return L.latLng(c.lat, c.lng) })(),
          (() => { const c = wgs84ToGcj02(c.latitude, c.longitude); return L.latLng(c.lat, c.lng) })()
        ],
        language: 'zh-CN',
        routeWhileDragging: false,
        showAlternatives: false,
        lineOptions: { styles: [{ color: '#00695c', weight: 4, opacity: 0.8 }] }
      }).addTo(map)
    } catch (e) {
      // 降级：打开外部地图
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${c.latitude},${c.longitude}`, '_blank')
    }
  })
  map.once('locationerror', () => {
    // 定位失败：直接用外部地图
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${c.latitude},${c.longitude}`, '_blank')
  })
  setTimeout(() => map.stopLocate(), 10000)
}

function openAddToTrip(c) {
  showDetail.value = false
  router.push('/trip-plans?add=' + encodeURIComponent(JSON.stringify({
    customer_id: c.id,
    customer_name: c.name,
    address: c.address,
    latitude: c.latitude,
    longitude: c.longitude,
    contact_phone: c.phone
  })))
}

// ====== 导入导出 ======
async function showImportConfirm() {
  try {
    const r = await importMapCustomersFromNotes()
    showToast(r.msg || `导入完成`)
    await loadData()
  } catch (e) {
    showToast(e.message || '导入失败')
  }
}

async function handleExport() {
  try {
    const blob = await exportMapAddresses()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = '客户地址信息.xlsx'
    document.body.appendChild(a); a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    showToast('导出成功')
  } catch (e) {
    showToast('导出失败: ' + (e.message || ''))
  }
}

// ====== 数据加载 ======
async function loadData() {
  loading.value = true
  try {
    const r = await fetchMapCustomers({ keyword: searchKw.value })
    customers.value = r.data || []
  } catch (e) {
    showToast('加载失败')
    customers.value = []
  } finally {
    loading.value = false
  }
  // 更新地图标记
  loadCustomerMarkers()
}

// ====== 生命周期 ======
onMounted(async () => {
  await loadData()
  // 地图在 nextTick 后初始化（DOM 已渲染）
  nextTick(() => {
    setTimeout(initMap, 100)
  })
  // 点击别处关闭搜索结果
  document.addEventListener('mousedown', onMapClickCloseSearch)
})

onUnmounted(() => {
  document.removeEventListener('mousedown', onMapClickCloseSearch)
  if (map) {
    map.remove()
    map = null
  }
  markerCluster = null
  customerMarkers = {}
  currentRoute = null
})
</script>

<style scoped>
.map-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #f0f2f5;
  overflow: hidden;
}

/* ===== 头部 ===== */
.map-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  height: 48px;
  background: linear-gradient(135deg, #e0f7fa 0%, #b2dfdb 100%);
  flex-shrink: 0;
  z-index: 10;
}
.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}
.header-left h3 {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
  color: #00695c;
}
.header-right {
  display: flex;
  align-items: center;
  gap: 6px;
}
.search-wrap {
  position: relative;
  display: flex;
  align-items: center;
  background: #fff;
  border-radius: 6px;
  border: 1px solid #e0e0e0;
  padding: 0 10px;
  height: 32px;
  width: 200px;
}
.search-input {
  flex: 1;
  border: none;
  outline: none;
  font-size: 12px;
  color: #333;
  background: transparent;
  font-family: inherit;
}
.search-input::placeholder { color: #bbb; }
.search-clear {
  color: #bbb;
  cursor: pointer;
  font-size: 14px;
  padding: 2px;
  flex-shrink: 0;
}
.hdr-btn {
  padding: 5px 12px;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  border: 1px solid rgba(0,0,0,0.08);
  background: rgba(255,255,255,0.7);
  color: #00695c;
  font-family: inherit;
  white-space: nowrap;
  transition: all .15s;
}
.hdr-btn:hover {
  background: #fff;
  border-color: #00695c;
}
.hdr-btn.primary {
  background: #00695c;
  color: #fff;
  border-color: #00695c;
}
.hdr-btn.primary:hover {
  background: #004d40;
}
.back-btn {
  background: transparent;
  border: 1px solid rgba(0,0,0,0.08);
  border-radius: 4px;
  color: #00695c;
  font-size: 20px;
  cursor: pointer;
  padding: 2px 8px;
  line-height: 1;
  font-family: inherit;
}
.back-btn:hover { background: rgba(0,0,0,0.05); }

/* ===== 主体 ===== */
.map-body {
  flex: 1;
  display: flex;
  overflow: hidden;
  position: relative;
}

/* ===== 左侧面板 ===== */
.side-panel {
  width: 300px;
  min-width: 300px;
  background: #fff;
  display: flex;
  flex-direction: column;
  border-right: 1px solid #e0e0e0;
  transition: width .2s, min-width .2s;
  overflow: hidden;
}
.side-panel.collapsed {
  width: 40px;
  min-width: 40px;
}
.panel-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px 6px 16px;
  flex-shrink: 0;
}
.panel-title {
  font-size: 14px;
  font-weight: 600;
  color: #333;
  white-space: nowrap;
}
.panel-title small { font-weight: 400; color: #999; font-size: 12px; }
.panel-toggle {
  background: transparent;
  border: none;
  color: #999;
  cursor: pointer;
  font-size: 12px;
  padding: 4px;
  flex-shrink: 0;
}
.panel-toggle:hover { color: #333; }
.side-panel.collapsed .panel-title,
.side-panel.collapsed .region-filter,
.side-panel.collapsed .customer-list { display: none; }

/* 区域筛选 */
.region-filter {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 4px 12px 8px;
  flex-shrink: 0;
  border-bottom: 1px solid #f0f0f0;
}
.region-chip {
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 10px;
  background: #f0f2f5;
  color: #666;
  cursor: pointer;
  white-space: nowrap;
  border: 1px solid transparent;
  transition: all .15s;
}
.region-chip:hover {
  border-color: #b2dfdb;
  color: #00695c;
}
.region-chip.active {
  background: #e0f7fa;
  color: #00695c;
  border-color: #b2dfdb;
  font-weight: 500;
}
.region-chip.clear { color: #e53935; border-color: #ffcdd2; }

/* 客户列表 */
.customer-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}
.customer-group {
  margin-bottom: 2px;
}
.group-header {
  padding: 6px 16px 4px;
  font-size: 11px;
  font-weight: 600;
  color: #999;
  background: #fafafa;
  position: sticky;
  top: 0;
  z-index: 1;
}
.customer-card {
  padding: 10px 16px;
  cursor: pointer;
  border-bottom: 1px solid #f5f5f5;
  transition: background .15s;
}
.customer-card:hover { background: #f0f7fa; }
.customer-card.active {
  background: #e0f7fa;
  border-left: 3px solid #00695c;
}
.cc-name {
  font-size: 14px;
  font-weight: 600;
  color: #333;
  margin-bottom: 2px;
}
.cc-addr, .cc-phone {
  font-size: 11px;
  color: #888;
  margin-bottom: 1px;
  display: flex;
  align-items: center;
  gap: 3px;
}
.cc-icon { flex-shrink: 0; }
.cc-meta {
  display: flex;
  gap: 8px;
  font-size: 10px;
  color: #aaa;
  margin-top: 4px;
}
.cc-pin { color: #52c41a; }
.cc-pin.muted { color: #ccc; }
.panel-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  color: #999;
  padding: 20px;
}

/* ===== 地图容器 ===== */
.map-container {
  flex: 1;
  position: relative;
  min-height: 300px;
}
.map-loading {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: #f5f5f5;
  z-index: 1000;
  color: #999;
  font-size: 13px;
}
.map-tip {
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0,105,92,0.9);
  color: #fff;
  padding: 6px 16px;
  border-radius: 20px;
  font-size: 12px;
  z-index: 1000;
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}
.tip-confirm {
  background: #52c41a;
  border: none;
  color: #fff;
  cursor: pointer;
  font-size: 12px;
  padding: 4px 14px;
  border-radius: 14px;
  font-weight: 600;
  font-family: inherit;
}
.tip-confirm:hover { background: #389e0d; }
.tip-close {
  background: transparent;
  border: none;
  color: #fff;
  cursor: pointer;
  font-size: 14px;
  padding: 0;
}

/* 地图搜索框 */
.map-search-bar {
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 6px;
  z-index: 1000;
  background: rgba(255,255,255,0.95);
  padding: 6px 8px;
  border-radius: 8px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.15);
  width: 340px;
  max-width: 80%;
}
.map-search-input {
  flex: 1;
  border: none;
  outline: none;
  font-size: 13px;
  color: #333;
  background: transparent;
  font-family: inherit;
}
.map-search-input::placeholder { color: #aaa; }
.map-search-btn {
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  border: none;
  background: #00695c;
  color: #fff;
  font-family: inherit;
  white-space: nowrap;
}
.map-search-btn:hover { background: #004d40; }

/* 搜索下拉结果 */
.map-search-wrap {
  position: absolute;
  top: 8px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10000;
  width: 420px;
  max-width: 90%;
}
.search-dropdown {
  background: #fff;
  border-radius: 0 0 10px 10px;
  box-shadow: 0 6px 24px rgba(0,0,0,0.18);
  max-height: 320px;
  overflow-y: auto;
  border: 1px solid #e0e0e0;
  border-top: none;
  position: relative;
  z-index: 10001;
}
.search-dropdown.empty {
  padding: 12px 16px;
  color: #999;
  font-size: 12px;
  text-align: center;
}
.search-result-item {
  padding: 10px 14px;
  cursor: pointer;
  border-bottom: 1px solid #f0f0f0;
  transition: background .08s;
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  position: relative;
}
.search-result-item:last-child { border-bottom: none; }
.search-result-item:hover,
.search-result-item.active { background: #f0f7fa; }
.sr-name { font-size: 13px; font-weight: 600; color: #333; width: 100%; margin-bottom: 1px; }
.sr-addr { font-size: 11px; color: #888; width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sr-meta { font-size: 10px; color: #aaa; margin-top: 2px; }
.sr-type { font-size: 9px; color: #00695c; background: #e0f7fa; padding: 0 5px; border-radius: 3px; position: absolute; right: 10px; top: 10px; max-width: 80px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.map-legend {
  position: absolute;
  bottom: 20px;
  right: 12px;
  background: rgba(255,255,255,0.9);
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 10px;
  color: #666;
  display: flex;
  flex-direction: column;
  gap: 3px;
  z-index: 1000;
  border: 1px solid #eee;
}
.legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
}
.legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}
</style>

<style>
/* 全局样式（unscoped） */
.custom-marker {
  background: transparent !important;
  border: none !important;
}
.marker-pin {
  background: #00695c;
  color: #fff;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 10px;
  font-weight: 600;
  text-align: center;
  white-space: nowrap;
  box-shadow: 0 2px 6px rgba(0,0,0,0.2);
  border: 2px solid #fff;
  cursor: pointer;
  transition: transform .15s;
}
.marker-pin:hover { transform: scale(1.1); }
.marker-pin.has-addr { background: #004d40; }
.pick-marker { font-size: 24px; }
.popup-content {
  min-width: 160px;
  font-family: -apple-system, BlinkMacSystemFont, sans-serif;
}
.popup-name { font-size: 14px; margin-bottom: 4px; color: #333; }
.popup-addr { font-size: 11px; color: #888; margin-bottom: 2px; }
.popup-phone { font-size: 11px; color: #888; margin-bottom: 2px; }
.popup-meta { font-size: 10px; color: #aaa; margin-bottom: 6px; }
.popup-btn {
  background: #00695c;
  color: #fff;
  border: none;
  border-radius: 4px;
  padding: 4px 12px;
  font-size: 11px;
  cursor: pointer;
  font-family: inherit;
}
.popup-btn:hover { background: #004d40; }

/* 详情弹出层 */
.detail-wrap { padding: 0 20px 24px; overflow-y: auto; height: 100%; }
.detail-head { padding: 16px 0 12px; border-bottom: 1px solid #f0f0f0; }
.dh-title { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.dh-title h3 { margin: 0; font-size: 18px; font-weight: 700; color: #333; }
.dh-badge { font-size: 10px; padding: 1px 6px; border-radius: 8px; background: #e8f5e9; color: #2e7d32; }
.dh-badge.muted { background: #f5f5f5; color: #999; }
.dh-info { margin-bottom: 10px; }
.dh-row { display: flex; align-items: center; gap: 6px; font-size: 13px; color: #666; margin-bottom: 4px; }
.dh-label { font-size: 14px; }
.dh-actions { display: flex; flex-wrap: wrap; gap: 6px; }
.dh-btn {
  padding: 5px 12px;
  border-radius: 6px;
  font-size: 11px;
  cursor: pointer;
  border: 1px solid #d9d9d9;
  background: #fff;
  color: #555;
  font-family: inherit;
  transition: all .15s;
}
.dh-btn:hover { color: #00695c; border-color: #00695c; }
.dh-btn.danger:hover { color: #e53935; border-color: #e53935; }

.detail-section { padding: 12px 0; }
.section-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.section-title { font-size: 14px; font-weight: 600; color: #333; }
.section-add {
  padding: 3px 10px;
  border-radius: 4px;
  font-size: 11px;
  cursor: pointer;
  border: 1px solid #00695c;
  background: #fff;
  color: #00695c;
  font-family: inherit;
}

/* 采购卡片 */
.purchaser-card {
  border: 1px solid #f0f0f0;
  border-radius: 8px;
  margin-bottom: 8px;
  overflow: hidden;
}
.purchaser-card.expanded { border-color: #b2dfdb; }
.pc-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  cursor: pointer;
  background: #fafafa;
  transition: background .15s;
}
.pc-head:hover { background: #f0f7fa; }
.pc-name { font-weight: 600; font-size: 13px; color: #333; }
.pc-phone { font-size: 11px; color: #888; }
.pc-title { font-size: 10px; color: #aaa; padding: 1px 6px; background: #f5f5f5; border-radius: 3px; }
.pc-toggle { margin-left: auto; font-size: 10px; color: #bbb; }
.pc-edit, .pc-del {
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 13px;
  color: #999;
  padding: 2px 4px;
}
.pc-edit:hover { color: #00695c; }
.pc-del:hover { color: #e53935; }
.pc-body { padding: 8px 12px 12px; }

/* 地址项 */
.address-item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 6px 0;
  border-bottom: 1px solid #f5f5f5;
}
.address-item:last-child { border-bottom: none; }
.address-item.unassigned { opacity: 0.7; }
.ai-left { flex: 1; min-width: 0; }
.ai-label {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 10px;
  background: #e0f7fa;
  color: #00695c;
  margin-bottom: 2px;
}
.ai-addr { display: block; font-size: 12px; color: #555; margin-bottom: 1px; }
.ai-contact { font-size: 11px; color: #888; }
.ai-default { font-size: 10px; color: #e6a23c; margin-left: 4px; }
.ai-right { display: flex; gap: 4px; flex-shrink: 0; }
.ai-btn {
  background: transparent; border: none; cursor: pointer;
  font-size: 12px; color: #999; padding: 2px 4px;
}
.ai-btn:hover { color: #00695c; }
.add-addr-btn {
  width: 100%;
  padding: 6px;
  margin-top: 6px;
  border: 1px dashed #d9d9d9;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  color: #00695c;
  font-size: 11px;
  font-family: inherit;
}
.add-addr-btn:hover { background: #f0f7fa; border-color: #b2dfdb; }

/* 表单 */
.form-wrap { padding: 16px 20px 24px; }
.form-wrap h3 { font-size: 18px; font-weight: 600; margin: 0 0 12px; }
.form-btns { display: flex; gap: 12px; margin-top: 16px; }
.form-btns .van-button { flex: 1; }

/* 坐标选择 */
.coord-pick { padding: 8px 16px; }
.coord-row { display: flex; align-items: center; gap: 6px; }
.coord-label { font-size: 12px; color: #666; white-space: nowrap; min-width: 36px; }
.coord-input {
  flex: 1;
  padding: 6px 8px;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  font-size: 12px;
  font-family: inherit;
  outline: none;
  max-width: 100px;
}
.coord-input:focus { border-color: #00695c; }
.coord-btn {
  padding: 5px 10px;
  border-radius: 6px;
  font-size: 11px;
  cursor: pointer;
  border: 1px solid #00695c;
  background: #fff;
  color: #00695c;
  font-family: inherit;
  white-space: nowrap;
}
.coord-btn:hover { background: #e0f7fa; }
.coord-hint { font-size: 10px; color: #bbb; margin-top: 4px; }

/* 地理编码搜索 */
.geocode-wrap { padding: 16px 20px 24px; }
.geocode-wrap h4 { font-size: 16px; font-weight: 600; margin: 0 0 12px; }
.geo-item {
  padding: 10px 0;
  border-bottom: 1px solid #f5f5f5;
  cursor: pointer;
}
.geo-item:hover { color: #00695c; }
.geo-label { display: block; font-size: 13px; color: #333; }
.geo-coord { font-size: 10px; color: #999; }
.geo-empty { text-align: center; color: #999; font-size: 13px; padding: 20px 0; }

/* leaflet 弹窗覆盖层 z-index */
.leaflet-popup { z-index: 1001; }
</style>
