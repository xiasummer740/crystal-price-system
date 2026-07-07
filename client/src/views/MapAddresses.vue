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
          <input
            v-model="searchKw"
            placeholder="搜索客户名/地址/电话"
            class="search-input"
            @input="onSearchDebounce"
          />
          <span
            v-if="searchKw"
            class="search-clear"
            @click="
              searchKw = '';
              onSearch();
            "
            >×</span
          >
        </div>
        <button
          class="hdr-btn"
          @click="showImportConfirm"
          title="从记事导入客户名"
        >
          👤 导入
        </button>
        <button class="hdr-btn" @click="handleExport" title="导出 Excel">
          📥 导出
        </button>
        <button class="hdr-btn primary" @click="openAddCustomer">
          ➕ 新建客户
        </button>
        <router-link
          to="/trip-plans"
          class="hdr-btn"
          style="text-decoration: none"
          >📅 行程</router-link
        >
      </div>
    </header>

    <!-- 主体：左侧列表 + 右侧地图 -->
    <div class="map-body">
      <!-- 左侧客户列表 -->
      <div class="side-panel" :class="{ collapsed: !showSidePanel }">
        <div class="panel-toolbar">
          <span class="panel-title"
            >客户列表 <small>({{ customers.length }})</small></span
          >
          <button class="panel-toggle" @click="showSidePanel = !showSidePanel">
            {{ showSidePanel ? "◀" : "▶" }}
          </button>
        </div>

        <!-- 区域分组筛选 -->
        <div class="region-filter" v-if="regionGroups.length">
          <span
            v-for="rg in regionGroups"
            :key="rg.region"
            class="region-chip"
            :class="{ active: activeRegion === rg.region }"
            @click="toggleRegion(rg.region)"
          >
            {{ rg.region }} ({{ rg.count }})
          </span>
          <span
            v-if="activeRegion"
            class="region-chip clear"
            @click="activeRegion = ''"
            >✕ 清除</span
          >
        </div>

        <!-- 客户列表 -->
        <div class="customer-list" v-if="filteredCustomers.length">
          <div
            class="customer-group"
            v-for="region in groupedByRegion"
            :key="region.name"
          >
            <div class="group-header" v-if="region.name">{{ region.name }}</div>
            <div
              v-for="c in region.items"
              :key="c.id"
              class="customer-card"
              :class="{ active: selectedCustomer?.id === c.id }"
            >
              <div class="cc-left" @click="locateCustomer(c)">
                <div class="cc-row1">
                  <div class="cc-name">{{ c.name }}</div>
                  <span v-if="c.latitude && c.longitude" class="cc-badge">已定位</span>
                  <span v-else class="cc-badge muted">未定位</span>
                </div>
                <div class="cc-addr" v-if="c.address">📍 {{ truncate(c.address, 35) }}</div>
                <div class="cc-row2">
                  <span v-if="c.purchaser_count > 0">🧑‍💼 {{ c.purchaser_count }}联系人</span>
                  <span v-if="c.site_count > 0">📍 {{ c.site_count }}收货点</span>
                  <span v-if="c.phone" class="cc-tel">📞 {{ c.phone }}</span>
                </div>
              </div>
              <button class="cc-edit-btn" @click.stop="openCustomerDetail(c)" title="查看详情/编辑">✏️</button>
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
        <div class="map-error" v-else-if="mapError">
          <span class="map-error-icon">⚠️</span>
          <span>{{ mapError }}</span>
        </div>
        <!-- 地图搜索框（选点模式下也保留） -->
        <div
          class="map-search-wrap"
          ref="searchWrapRef"
          @mousedown.stop
        >
          <div class="map-search-bar">
            <input
              ref="searchInputRef"
              v-model="mapSearchKw"
              placeholder="🔍 搜索地址、地点…"
              class="map-search-input"
              @input="onMapSearchInput"
              @keydown.enter="onSearchKeydown"
              @keydown.down="onSearchKeyNav(1)"
              @keydown.up="onSearchKeyNav(-1)"
              @focus="onSearchFocus"
              @mousedown.stop
            />
            <button class="map-search-btn" @mousedown.stop @click="doMapSearch">
              搜索
            </button>
          </div>
          <!-- 搜索结果下拉 -->
          <div
            class="search-dropdown"
            v-if="showSearchResults && searchResults.length"
          >
            <!-- 结果计数 -->
            <div class="sr-count" v-if="searchTotal > 0">
              找到 {{ searchTotal }} 个结果
            </div>
            <div
              v-for="(r, i) in searchResults"
              :key="r.id || i"
              class="search-result-item"
              :class="{ active: searchHighlight === i }"
              @mousedown.prevent="pickSearchResult(r)"
            >
              <div class="sr-left">
                <div class="sr-type-icon">
                  {{ poiTypeIcon(r.type || r.typecode) }}
                </div>
              </div>
              <div class="sr-body">
                <div class="sr-name">{{ r.name }}</div>
                <div class="sr-addr">{{ r.address || r.district || "" }}</div>
                <div class="sr-meta">
                  {{ [r.city, r.district].filter(Boolean).join(" ") }}
                </div>
              </div>
              <div
                class="sr-type"
                v-if="r.typecode || (r.type && r.type !== 'geocode')"
              >
                {{ poiTypeLabel(r.typecode, r.type) }}
              </div>
            </div>
            <!-- 加载更多 -->
            <div
              class="sr-load-more"
              v-if="searchTotal > searchResults.length && !searchLoading"
              @mousedown.prevent="loadMoreResults"
            >
              📄 查看更多结果（{{ searchResults.length }}/{{ searchTotal }}）
            </div>
            <div class="sr-load-more loading" v-if="searchLoading">
              <van-loading size="14" /> 搜索中...
            </div>
          </div>
          <div
            class="search-dropdown empty"
            v-else-if="showSearchResults && searchDone && !searchResults.length"
          >
            <div class="search-result-empty">未找到匹配地点</div>
          </div>
        </div>
        <!-- 图例 -->
        <div class="map-legend">
          <span class="legend-item"
            ><span class="legend-dot" style="background: #00695c"></span
            >已定位客户</span
          >
          <span class="legend-item"
            ><span class="legend-dot" style="background: #999"></span
            >未定位客户</span
          >
        </div>
        <!-- 选点模式底部确认条 -->
        <div class="map-pick-bar" v-if="selectedMode === 'pick'">
          <span class="pick-bar-text">📍 点击地图或搜索结果设置位置，可拖拽标记微调</span>
          <button class="pick-bar-confirm" @click="confirmCoordPick">✅ 确认定位</button>
          <button class="pick-bar-cancel" @click="cancelCoordPick">✕ 取消</button>
        </div>
      </div>
    </div>

    <!-- ===== 客户详情弹出层 ===== -->
    <van-popup
      v-model:show="showDetail"
      round
      position="bottom"
      :style="{ height: '75%', maxHeight: '600px' }"
      closeable
      @closed="onDetailClosed"
      safe-area-inset-bottom
    >
      <div class="detail-wrap" v-if="detailData">
        <!-- 客户信息头 -->
        <div class="dt-header">
          <div class="dt-h-top">
            <h3 class="dt-h-name">{{ detailData.customer.name }}</h3>
            <span class="dt-h-badge" :class="{ active: detailData.customer.latitude }">
              {{ detailData.customer.latitude ? '已定位' : '未定位' }}
            </span>
          </div>
          <div class="dt-h-info">
            <div v-if="detailData.customer.address" class="dt-h-row">
              <span class="dt-h-ico">📍</span>
              <span>{{ detailData.customer.address }}</span>
            </div>
            <div v-if="detailData.customer.phone" class="dt-h-row">
              <span class="dt-h-ico">📞</span>
              <span>{{ detailData.customer.phone }}</span>
            </div>
            <div v-if="detailData.customer.notes" class="dt-h-row notes">
              <span class="dt-h-ico">📝</span>
              <span>{{ detailData.customer.notes }}</span>
            </div>
          </div>
          <div class="dt-h-actions">
            <button class="dt-ha" @click="editCustomer(detailData.customer)">✏️ 编辑</button>
            <button class="dt-ha" @click="locateOnMap(detailData.customer)">📍 定位</button>
            <button class="dt-ha" v-if="detailData.customer.latitude" @click="clearCustomerPosition(detailData.customer)">🚫 清除定位</button>
            <button class="dt-ha" @click="openAddToTrip(detailData.customer)">📌 行程</button>
            <button class="dt-ha" @click="navigateToCustomer(detailData.customer)">🚗 导航</button>
            <button class="dt-ha danger" @click="handleDeleteCustomer(detailData.customer)">🗑️ 删除</button>
          </div>
        </div>

        <!-- Tab 切换 -->
        <div class="dt-tabs">
          <div class="dt-tab" :class="{ active: detailTab === 'contacts' }" @click="detailTab = 'contacts'">
            <span class="dt-tab-icon">👥</span>
            <span>联系人</span>
            <span class="dt-tab-badge">{{ detailData.purchasers.length }}</span>
          </div>
          <div class="dt-tab" :class="{ active: detailTab === 'sites' }" @click="detailTab = 'sites'">
            <span class="dt-tab-icon">📍</span>
            <span>收货点</span>
            <span class="dt-tab-badge">{{ (detailData.sites || []).length }}</span>
          </div>
        </div>

        <!-- 联系人 Tab -->
        <div class="dt-body" v-if="detailTab === 'contacts'">
          <div class="dt-body-head">
            <span>联系人列表</span>
            <button class="dt-add-btn" @click="openAddPurchaser">＋ 添加联系人</button>
          </div>
          <div v-if="detailData.purchasers.length === 0" class="dt-empty">暂无联系人，点击上方按钮添加</div>
          <div v-for="p in detailData.purchasers" :key="p.id" class="contact-card">
            <div class="cc-main" @click="editPurchaser(p)">
              <div class="cc-avatar">{{ p.name.charAt(0) }}</div>
              <div class="cc-body">
                <div class="cc-name">{{ p.name }}</div>
                <div class="cc-meta">
                  <span v-if="p.title" class="cc-role">{{ p.title }}</span>
                  <span v-if="p.phone" class="cc-phone">{{ p.phone }}</span>
                </div>
                <div v-if="getContactSite(p)" class="cc-addr">
                  <span class="cc-addr-site">{{ getContactSite(p).name }}</span>
                  <span class="cc-addr-text">{{ getContactSite(p).address }}</span>
                </div>
              </div>
              <div class="cc-actions">
                <span class="cc-del" @click.stop="handleDeletePurchaser(p)">×</span>
              </div>
            </div>
            <div v-if="p.phone || getContactSite(p)?.address" class="cc-copy-row" @click.stop="copyContactInfo(p)">
              <span class="cc-copy-icon">📋</span>
              <span class="cc-copy-text">复制收件信息</span>
            </div>
          </div>
        </div>

        <!-- 收货点 Tab -->
        <div class="dt-body" v-if="detailTab === 'sites'">
          <div class="dt-body-head">
            <span>收货点列表</span>
            <button class="dt-add-btn" @click="openAddSite">＋ 添加收货点</button>
          </div>
          <div v-if="!detailData.sites || detailData.sites.length === 0" class="dt-empty">暂无收货点，点击上方按钮添加</div>
          <div v-for="s in (detailData.sites || [])" :key="s.id" class="site-card">
            <div class="sc-head">
              <div class="sc-left">
                <span class="sc-type-icon">{{ siteTypeIcon(s.site_type) }}</span>
                <span class="sc-name">{{ s.name }}</span>
                <span class="sc-type-tag">{{ siteTypeLabel(s.site_type) }}</span>
                <span v-if="s.is_default" class="sc-default">默认</span>
              </div>
              <div class="sc-actions">
                <button class="sc-edit" @click="editSite(s)">✏️</button>
                <button class="sc-del" @click="handleDeleteSite(s)">×</button>
              </div>
            </div>
            <div class="sc-body">
              <div v-if="s.address" class="sc-row">
                <span class="sc-row-ico">📍</span>
                <span>{{ s.address }}</span>
              </div>
              <div v-if="s.latitude && s.longitude" class="sc-row sc-coord">
                <span class="sc-row-ico">🎯</span>
                <span class="sc-coord-text">已定位</span>
                <button class="sc-locate" @click="locateSite(s)">查看</button>
                <button class="sc-locate danger" @click="clearSitePosition(s)">清除</button>
              </div>
              <div v-if="getLinkedContacts(s).length" class="sc-row">
                <span class="sc-row-ico">👤</span>
                <span class="sc-linked-contacts">
                  <span v-for="(pc, pci) in getLinkedContacts(s)" :key="pc.id">
                    <template v-if="pci > 0">、</template>
                    {{ pc.name }}<template v-if="pc.phone"> {{ pc.phone }}</template>
                    <template v-if="pc.title"> ({{ pc.title }})</template>
                  </span>
                </span>
              </div>
              <div v-if="s.notes" class="sc-row sc-notes">
                <span class="sc-row-ico">📝</span>
                <span>{{ s.notes }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </van-popup>

    <!-- ===== 客户表单弹出层 ===== -->
    <van-popup
      v-model:show="showCustomerForm"
      round
      position="bottom"
      :style="{ height: 'auto', maxHeight: '80%' }"
      closeable
    >
      <div class="form-wrap">
        <h3>{{ editingCustomer ? "编辑客户" : "新建客户" }}</h3>
        <van-field
          v-model="customerForm.name"
          label="客户名"
          placeholder="输入客户名"
          required
          :rules="[{ required: true }]"
        />
        <van-field
          v-model="customerForm.address"
          label="地址"
          placeholder="详细地址"
          @input="onAddressInput"
        />
        <div class="coord-pick-simple">
          <button class="coord-btn" @click="startCoordPick">📍 在地图选点定位</button>
        </div>
        <van-field
          v-model="customerForm.notes"
          label="备注"
          placeholder="备注信息"
          type="textarea"
          rows="3"
        />

        <!-- 联系人列表（内嵌在编辑表单中） -->
        <div class="inline-section">
          <div class="inline-section-hd">
            <span class="inline-section-title">👥 联系人</span>
            <button class="inline-add-btn" @click="addContact">＋ 添加</button>
          </div>
          <div v-if="customerContacts.length === 0" class="inline-empty">暂无联系人</div>
          <div v-for="(p, pi) in customerContacts" :key="pi" class="inline-contact-row">
            <div class="ic-fields">
              <input v-model="p.name" class="ic-input ic-input-sm" placeholder="姓名" />
              <input v-model="p.phone" class="ic-input ic-input-sm" placeholder="电话" />
              <input v-model="p.address" class="ic-input" placeholder="收件地址" />
            </div>
            <div class="ic-actions">
              <button class="ic-copy" @click="copyInlineContact(p)" title="复制收件信息">📋</button>
              <button class="ic-del" @click="customerContacts.splice(pi, 1)">×</button>
            </div>
          </div>
        </div>

        <div class="form-btns">
          <van-button
            round
            plain
            type="default"
            @click="showCustomerForm = false"
            >取消</van-button
          >
          <van-button
            round
            type="primary"
            :loading="saving"
            @click="saveCustomer"
            >保存</van-button
          >
        </div>
      </div>
    </van-popup>

    <!-- ===== 采购表单弹出层 ===== -->
    <van-popup
      v-model:show="showPurchaserForm"
      round
      position="bottom"
      :style="{ height: 'auto' }"
      closeable
    >
      <div class="form-wrap">
        <h3>{{ editingPurchaser ? "编辑采购联系人" : "添加采购联系人" }}</h3>
        <van-field
          v-model="purchaserForm.name"
          label="姓名"
          placeholder="输入姓名"
          required
        />
        <van-field
          v-model="purchaserForm.phone"
          label="电话"
          placeholder="联系电话"
          type="tel"
        />
        <van-field
          v-model="purchaserForm.title"
          label="职位"
          placeholder="如：采购经理"
        />
        <van-field
          v-model="purchaserForm.notes"
          label="备注"
          placeholder="备注"
          type="textarea"
          rows="2"
        />
        <div class="form-field">
          <span class="form-field-label">默认收货点</span>
          <select v-model.number="purchaserForm.default_site_id" class="form-select">
            <option :value="0">不指定</option>
            <option v-for="s in (detailData?.sites || [])" :key="s.id" :value="s.id">
              {{ s.name }}
            </option>
          </select>
        </div>
        <div class="form-btns">
          <van-button
            round
            plain
            type="default"
            @click="showPurchaserForm = false"
            >取消</van-button
          >
          <van-button
            round
            type="primary"
            :loading="saving"
            @click="savePurchaser"
            >保存</van-button
          >
        </div>
      </div>
    </van-popup>

    <!-- ===== 收货点表单弹出层 ===== -->
    <van-popup
      v-model:show="showSiteForm"
      round
      position="bottom"
      :style="{ height: 'auto', maxHeight: '80%' }"
      closeable
    >
      <div class="form-wrap">
        <h3>{{ editingSite ? "编辑收货点" : "添加收货点" }}</h3>
        <van-field
          v-model="siteForm.site_type"
          label="类型"
          placeholder="输入类型，如：仓库、代工厂、外协厂"
          clearable
        />
        <div class="st-type-chips">
          <span v-for="t in typePresets" :key="t.value"
            class="st-type-chip"
            :class="{ active: siteForm.site_type === t.value }"
            @click="siteForm.site_type = t.value">
            {{ t.label }}
          </span>
        </div>
        <van-field
          v-model="siteForm.address"
          label="地址"
          placeholder="详细地址"
          @input="onSiteAddrInput"
        />
        <div class="coord-pick-simple">
          <button class="coord-btn" @click="startSiteCoordPick">📍 在地图选点定位</button>
        </div>
        <van-field
          v-model="siteForm.notes"
          label="备注"
          placeholder="备注"
          type="textarea"
          rows="2"
        />
        <div class="form-field">
          <label class="form-checkbox">
            <input type="checkbox" v-model="siteForm.is_default" />
            <span>设为默认收货点</span>
          </label>
        </div>
        <div class="form-btns">
          <van-button
            round
            plain
            type="default"
            @click="showSiteForm = false"
            >取消</van-button
          >
          <van-button
            round
            type="primary"
            :loading="saving"
            @click="saveSite"
            >保存</van-button
          >
        </div>
      </div>
    </van-popup>

    <!-- ===== 地址表单弹出层 ===== -->
    <van-popup
      v-model:show="showAddressForm"
      round
      position="bottom"
      :style="{ height: 'auto', maxHeight: '80%' }"
      closeable
    >
      <div class="form-wrap">
        <h3>{{ editingAddress ? "编辑收件地址" : "添加收件地址" }}</h3>
        <van-field
          v-model="addressForm.label"
          label="标签"
          placeholder="如：办公地址、仓库"
        />
        <van-field
          v-model="addressForm.address"
          label="地址"
          placeholder="详细地址"
          required
          @input="onAddrInput"
        />
        <van-field
          v-model="addressForm.contact_name"
          label="收件人"
          placeholder="收件人姓名"
        />
        <van-field
          v-model="addressForm.contact_phone"
          label="联系电话"
          placeholder="收件人电话"
          type="tel"
        />
        <div class="coord-pick-simple">
          <button class="coord-btn" @click="startCoordPick">📍 在地图选点定位</button>
        </div>
        <van-field
          v-model="addressForm.notes"
          label="备注"
          placeholder="备注"
          type="textarea"
          rows="2"
        />
        <div class="form-btns">
          <van-button
            round
            plain
            type="default"
            @click="showAddressForm = false"
            >取消</van-button
          >
          <van-button
            round
            type="primary"
            :loading="saving"
            @click="saveAddress"
            >保存</van-button
          >
        </div>
      </div>
    </van-popup>
  </div>
</template>

<script setup>
import {
  ref,
  reactive,
  computed,
  onMounted,
  onUnmounted,
  nextTick,
  watch,
} from "vue";
import { useRoute, useRouter } from "vue-router";
import { showToast, showConfirmDialog, showDialog } from "vant";
import {
  fetchMapCustomers,
  getMapCustomer,
  createMapCustomer,
  updateMapCustomer,
  deleteMapCustomer,
  importMapCustomersFromNotes,
  exportMapAddresses,
  createPurchaser,
  updatePurchaser,
  deletePurchaser,
  createAddress,
  updateAddress,
  deleteAddress,
  fetchSites,
  createSite,
  updateSite,
  deleteSite,
  geocodeAddress,
  reverseGeocode,
  getAmapKey,
  poiSearch,
} from "../utils/api.js";
import {
  loadAmapScript,
  createAmapMap,
  destroyAmapMap,
  setAmapView,
  addAmapMarker,
  addAmapLabelMarker,
  bindAmapPopup,
  addAmapCluster,
  clearAmapExtraMarkers,
  addAmapRoute,
  onAmapClickForPick,
  searchAmapPoi,
  searchAmapTips,
} from "../utils/amap-map.js";

const route_ = useRoute();
// 地理编码包装：自动带高德 Key
function myGeocode(q) {
  return geocodeAddress(q, getAmapKey());
}
function myReverseGeocode(lat, lng) {
  return reverseGeocode(lat, lng, getAmapKey());
}
const router = useRouter();
const mapContainer = ref(null);
let map = null;
let customerMarkers = {};
let customerInfoWindows = {};
let currentRoute = null;

// ====== 状态 ======
const mapError = ref("");
const isStandalone = ref(route_.query.standalone === "1");
const customers = ref([]);
const loading = ref(false);
const mapLoading = ref(true);
const searchKw = ref("");
const activeRegion = ref("");
const showSidePanel = ref(true);
const selectedCustomer = ref(null);
const showDetail = ref(false);
const detailData = ref(null);
const detailTab = ref('contacts'); // 'contacts' | 'sites'
const expandedPurchaser = ref(null);
const selectedMode = ref(""); // '' | 'pick'
let geocodeTarget = null; // 'customer' | 'address'

// 表单
const showCustomerForm = ref(false);
const showPurchaserForm = ref(false);
const showAddressForm = ref(false);
const showSiteForm = ref(false);
const editingCustomer = ref(null);
const editingPurchaser = ref(null);
const editingAddress = ref(null);
const editingSite = ref(null);
const saving = ref(false);
const customerForm = reactive({
  name: "",
  phone: "",
  address: "",
  latitude: null,
  longitude: null,
  notes: "",
});
const customerContacts = ref([]); // { id, name, phone, title, address, _new }
const purchaserForm = reactive({ name: "", phone: "", title: "", notes: "", default_site_id: 0 });
const addressForm = reactive({
  label: "",
  address: "",
  contact_name: "",
  contact_phone: "",
  latitude: null,
  longitude: null,
  notes: "",
});
let addressFormPurchaserId = 0;
const typePresets = [
  { value: "自有厂区", label: "自有厂区" },
  { value: "代工厂", label: "代工厂" },
  { value: "仓库", label: "仓库" },
  { value: "办事处", label: "办事处" },
];
const siteForm = reactive({
  name: "",
  site_type: "",
  address: "",
  latitude: null,
  longitude: null,
  contact_name: "",
  contact_phone: "",
  is_default: false,
  notes: "",
});

// ====== 计算属性 ======
const regionGroups = computed(() => {
  const map = {};
  for (const c of customers.value) {
    if (!c.latitude || !c.longitude) continue;
    const region = extractRegion(c.address) || "其他";
    if (!map[region]) map[region] = 0;
    map[region]++;
  }
  return Object.entries(map)
    .map(([region, count]) => ({ region, count }))
    .sort((a, b) => b.count - a.count);
});

const filteredCustomers = computed(() => {
  let list = customers.value;
  const kw = searchKw.value.trim().toLowerCase();
  if (kw) {
    list = list.filter(
      (c) =>
        c.name.toLowerCase().includes(kw) ||
        (c.address || "").toLowerCase().includes(kw) ||
        (c.phone || "").includes(kw),
    );
  }
  if (activeRegion.value) {
    list = list.filter((c) => {
      if (!c.latitude || !c.longitude) return false;
      return extractRegion(c.address) === activeRegion.value;
    });
  }
  return list;
});

const groupedByRegion = computed(() => {
  const groups = {};
  for (const c of filteredCustomers.value) {
    const region =
      c.latitude && c.longitude
        ? extractRegion(c.address) || "未分组"
        : "未定位";
    if (!groups[region]) groups[region] = [];
    groups[region].push(c);
  }
  // 排序：已定位区域优先，区域内按客户名
  const keys = Object.keys(groups).sort((a, b) => {
    if (a === "未定位") return 1;
    if (b === "未定位") return -1;
    return a.localeCompare(b);
  });
  return keys.map((k) => ({ name: k, items: groups[k] }));
});

// ====== 工具函数 ======
function extractRegion(addr) {
  if (!addr) return "";
  const match = addr.match(/([^^省]+省|)([^^市]+市)/);
  return match ? match[0] : "";
}

function truncate(s, len) {
  if (!s) return "";
  return s.length > len ? s.slice(0, len) + "…" : s;
}

function goBack() {
  if (isStandalone.value) {
    window.close();
  } else {
    router.push("/");
  }
}

// ====== 坐标转换：WGS84 ↔ GCJ02（高德/国测局坐标） ======
// 高德瓦片用 GCJ02，数据库存 WGS84，展示时转换
const _a = 6378245.0;
const _ee = 0.00669342162296594323;
function _transformLat(x, y) {
  let ret =
    -100 +
    2 * x +
    3 * y +
    0.2 * y * y +
    0.1 * x * y +
    0.2 * Math.sqrt(Math.abs(x));
  ret +=
    ((20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2) / 3;
  ret +=
    ((20 * Math.sin(y * Math.PI) + 40 * Math.sin((y / 3) * Math.PI)) * 2) / 3;
  ret +=
    ((160 * Math.sin((y / 12) * Math.PI) + 320 * Math.sin((y * Math.PI) / 30)) *
      2) /
    3;
  return ret;
}
function _transformLon(x, y) {
  let ret =
    300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  ret +=
    ((20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2) / 3;
  ret +=
    ((20 * Math.sin(x * Math.PI) + 40 * Math.sin((x / 3) * Math.PI)) * 2) / 3;
  ret +=
    ((150 * Math.sin((x / 12) * Math.PI) + 300 * Math.sin((x / 30) * Math.PI)) *
      2) /
    3;
  return ret;
}
// 是否在中国境内
function _inChina(lat, lng) {
  return lng > 72 && lng < 137 && lat > 1 && lat < 55;
}
// WGS84 → GCJ02（用于展示到高德地图）
function wgs84ToGcj02(lat, lng) {
  if (!_inChina(lat, lng)) return { lat, lng };
  let dLat = _transformLat(lng - 105, lat - 35);
  let dLng = _transformLon(lng - 105, lat - 35);
  const radLat = (lat / 180) * Math.PI;
  let magic = Math.sin(radLat);
  magic = 1 - _ee * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180) / (((_a * (1 - _ee)) / (magic * sqrtMagic)) * Math.PI);
  dLng = (dLng * 180) / ((_a / sqrtMagic) * Math.cos(radLat) * Math.PI);
  return { lat: lat + dLat, lng: lng + dLng };
}
// GCJ02 → WGS84（用于保存从高德获取的坐标到数据库）
function gcj02ToWgs84(lat, lng) {
  if (!_inChina(lat, lng)) return { lat, lng };
  const wgs = wgs84ToGcj02(lat, lng);
  return { lat: 2 * lat - wgs.lat, lng: 2 * lng - wgs.lng };
}
// 转成高德坐标（数据库 WGS84 → 展示 GCJ02）
function ll(lat, lng) {
  const c = wgs84ToGcj02(lat, lng);
  return [c.lat, c.lng];
}
// 从高德坐标转回 WGS84（高德 API 返回 → 存数据库）
function fromAmap(lat, lng) {
  const c = gcj02ToWgs84(lat, lng);
  return { lat: c.lat, lng: c.lng };
}

// ====== 地图抽象层（纯高德 JS API） ======
function mapSetView(lat, lng, zoom) {
  if (!map) return;
  setAmapView(map, lat, lng, zoom || 15);
}
function mapAddDivMarker(lat, lng, html, onClick) {
  return addAmapLabelMarker(map, lat, lng, html, onClick);
}
function mapRemoveMarker(marker) {
  if (!marker) return;
  try { map.remove(marker); } catch {}
}
function mapOpenPopup(marker, html) {
  if (!marker || !map) return;
  const info = new AMap.InfoWindow({ content: html, offset: new AMap.Pixel(0, -30) });
  info.open(map, marker.getPosition());
  return info;
}
function mapLocate(successCb, errorCb) {
  AMap.plugin("AMap.Geolocation", () => {
    const geo = new AMap.Geolocation({
      enableHighAccuracy: true,
      timeout: 10000,
    });
    geo.getCurrentPosition((status, result) => {
      if (status === "complete") {
        const wgs = gcj02ToWgs84(result.position.lat, result.position.lng);
        successCb({ lat: wgs.lat, lng: wgs.lng });
      } else errorCb();
    });
  });
}

// ====== 地图初始化（纯高德 JS API，无 Key 提示配置） ======
async function initMap() {
  if (!mapContainer.value || map) return;
  mapLoading.value = true;
  mapError.value = "";

  const amapKey = getAmapKey();
  if (!amapKey) {
    mapError.value = "请先设置高德地图 Key（设置 → 高德地图 Key）";
    mapLoading.value = false;
    return;
  }

  try {
    await loadAmapScript(amapKey);
    map = createAmapMap(mapContainer.value, [114.3, 30.5], 6);
    map.on("click", (e) => {
      if (selectedMode.value !== "pick") return;
      const wgs = gcj02ToWgs84(e.latlng.lat, e.latlng.lng);
      setFormCoords(wgs.lat, wgs.lng);
      placePickMarker(wgs.lat, wgs.lng);
    });
    mapLoading.value = false;
    setTimeout(loadCustomerMarkers, 300);
  } catch (e) {
    console.error("高德地图加载失败:", e);
    mapError.value = "高德地图加载失败，请检查网络与 Key 配置";
    mapLoading.value = false;
    showToast("高德地图加载失败，请确认 Key 已开启「Web端(JS API)」服务");
  }
}

// ====== 加载客户标记（纯高德 JS API） ======
function loadCustomerMarkers() {
  customerMarkers = {};
  customerInfoWindows = {};
  const hasCoords = customers.value.filter((c) => c.latitude && c.longitude);
  if (!hasCoords.length) return;

  if (!map) return;
  const amapMarkers = [];
  for (const c of hasCoords) {
    const gcj = wgs84ToGcj02(c.latitude, c.longitude);
    const marker = addAmapLabelMarker(map, gcj.lat, gcj.lng, c.name, () =>
      locateCustomer(c),
    );
    customerInfoWindows[c.id] = bindAmapPopup(
      marker,
      `
      <div style="min-width:150px;font-family:sans-serif">
        <div style="font-size:14px;font-weight:600;margin-bottom:4px">${c.name}</div>
        <div style="font-size:11px;color:#888">${c.address || ""}</div>
        <div style="font-size:11px;color:#888">${c.phone || ""}</div>
        <div style="font-size:10px;color:#aaa;margin-top:4px">🧑‍💼 ${c.purchaser_count || 0}采购 · 📮 ${c.address_count || 0}地址</div>
        <div style="display:flex;gap:6px;margin-top:6px">
          <button onclick="window._selectMapCustomer(${c.id})" style="flex:1;background:#00695c;color:#fff;border:none;border-radius:4px;padding:4px 12px;font-size:11px;cursor:pointer">查看详情</button>
          <button onclick="window._clearMapMarker(${c.id})" style="background:transparent;color:#e53935;border:1px solid #ffcdd2;border-radius:4px;padding:4px 10px;font-size:11px;cursor:pointer">🗑️清除定位</button>
        </div>
      </div>
    `,
    );
    amapMarkers.push(marker);
    customerMarkers[c.id] = marker;
  }
  window._selectMapCustomer = (id) => {
    const c = customers.value.find((x) => x.id === id);
    if (c) openCustomerDetail(c);
  };
  window._clearMapMarker = (id) => {
    const c = customers.value.find((x) => x.id === id);
    if (c) clearCustomerPosition(c);
  };
  addAmapCluster(map, amapMarkers);
  map.setFitView(amapMarkers, false, [50, 50, 50, 50]);
}

// ====== 搜索 / 筛选 ======
let searchTimer = null;
function onSearchDebounce() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(onSearch, 300);
}
function onSearch() {
  // 搜索会通过 computed filteredCustomers 自动过滤列表
  // 地图上高亮匹配的客户
  highlightMarkers();
}
function highlightMarkers() {
  const kw = searchKw.value.trim().toLowerCase();
  for (const c of customers.value) {
    const marker = customerMarkers[c.id];
    if (!marker) continue;
    const match =
      !kw ||
      c.name.toLowerCase().includes(kw) ||
      (c.address || "").toLowerCase().includes(kw);
    const opacity = match ? 1 : 0.3;
    // 自定义内容标记不支持 setOpacity，直接操作 DOM
    const el = marker.getContent();
    if (el?.style) el.style.opacity = opacity;
  }
}

function toggleRegion(region) {
  activeRegion.value = activeRegion.value === region ? "" : region;
}

// ====== 客户选择 ======
function locateCustomer(c) {
  selectedCustomer.value = c;
  // 在地图上定位：有坐标直接跳转，无坐标但有地址则自动搜索
  if (c.latitude && c.longitude && map) {
    // 转 GCJ02 再定位，避免 WGS84 偏移
    const gcj = wgs84ToGcj02(c.latitude, c.longitude);
    mapSetView(gcj.lat, gcj.lng, 16);
  } else if (c.address && map) {
    (async () => {
      try {
        const r = await myGeocode(c.address);
        const results = r.data || [];
        if (results.length) {
          const best = results[0];
          if (window._viewMarker) map.remove(window._viewMarker);
          const gj = wgs84ToGcj02(best.lat, best.lng);
          window._viewMarker = addAmapMarker(map, gj.lat, gj.lng);
          map.setView([gj.lng, gj.lat], 15);
        }
      } catch {}
    })();
  }
}

async function openCustomerDetail(c) {
  // 直接打开编辑表单，带联系人
  editCustomer(c);
  try {
    const r = await getMapCustomer(c.id);
    customerContacts.value = (r.data?.purchasers || []).map(p => ({
      id: p.id,
      name: p.name,
      phone: p.phone || "",
      title: p.title || "",
      address: p.address || "",
      _new: false,
    }));
  } catch {}
}

function onDetailClosed() {
  expandedPurchaser.value = null;
}

// ====== 客户增删改 ======
function addContact() {
  customerContacts.value.push({ id: 0, name: "", phone: "", title: "", address: "", _new: true });
}
function copyInlineContact(p) {
  const text = [p.name || "", p.phone || "", p.address || ""].filter(Boolean).join("  ");
  if (!text) return showToast("没有可复制的收件信息");
  navigator.clipboard.writeText(text).then(() => {
    showToast("✅ 已复制：" + text.slice(0, 35) + (text.length > 35 ? "…" : ""));
  }).catch(() => showToast("复制失败"));
}

function openAddCustomer() {
  editingCustomer.value = null;
  customerForm.name = "";
  customerForm.phone = "";
  customerForm.address = "";
  customerForm.latitude = null;
  customerForm.longitude = null;
  customerForm.notes = "";
  customerContacts.value = [];
  showCustomerForm.value = true;
}

function editCustomer(c) {
  editingCustomer.value = c;
  customerForm.name = c.name;
  customerForm.phone = c.phone || "";
  customerForm.address = c.address || "";
  customerForm.latitude = c.latitude;
  customerForm.longitude = c.longitude;
  customerForm.notes = c.notes || "";
  customerContacts.value = [];
  showCustomerForm.value = true;
  // 有地址但无坐标时自动静默定位
  if (c.address && c.address.length >= 3 && !c.latitude && !c.longitude) {
    nextTick(() => autoGeocode(c.address, "customer", c.name));
  }
}

async function saveCustomer() {
  if (!customerForm.name) return showToast("客户名不能为空");
  saving.value = true;
  try {
    let cid;
    if (editingCustomer.value) {
      await updateMapCustomer(editingCustomer.value.id, { ...customerForm });
      cid = editingCustomer.value.id;
      showToast("已更新");
    } else {
      const r = await createMapCustomer({ ...customerForm });
      cid = r.data?.id;
      showToast("已创建");
    }
    // 保存联系人
    if (cid) {
      // 新增或更新联系人（姓名、电话、职位、收件地址）
      for (const p of customerContacts.value) {
        const data = {
          customer_id: cid, name: p.name,
          phone: p.phone || "", title: p.title || "",
          address: p.address || "", notes: "",
        };
        if (p._new) {
          await createPurchaser(data);
        } else {
          await updatePurchaser(p.id, data);
        }
      }
    }
    showCustomerForm.value = false;
    await loadData();
  } catch (e) {
    showToast(e.message || "保存失败");
  } finally {
    saving.value = false;
  }
}

async function handleDeleteCustomer(c) {
  try {
    await showConfirmDialog({
      title: "确认删除",
      message: `确定删除客户「${c.name}」？采购信息和地址将一并删除。`,
    });
    await deleteMapCustomer(c.id);
    showToast("已删除");
    showDetail.value = false;
    detailData.value = null;
    if (selectedCustomer.value?.id === c.id) selectedCustomer.value = null;
    await loadData();
  } catch (e) {
    if (e === "cancel" || e?.message?.includes("cancel")) return;
    showToast("删除失败");
  }
}

// ====== 采购增删改 ======
function openAddPurchaser() {
  if (!detailData.value) return;
  editingPurchaser.value = null;
  purchaserForm.name = "";
  purchaserForm.phone = "";
  purchaserForm.title = "";
  purchaserForm.notes = "";
  purchaserForm.default_site_id = 0;
  showPurchaserForm.value = true;
}

function editPurchaser(p) {
  editingPurchaser.value = p;
  purchaserForm.name = p.name;
  purchaserForm.phone = p.phone || "";
  purchaserForm.title = p.title || "";
  purchaserForm.notes = p.notes || "";
  purchaserForm.default_site_id = p.default_site_id || 0;
  showPurchaserForm.value = true;
}

async function savePurchaser() {
  if (!purchaserForm.name) return showToast("姓名不能为空");
  saving.value = true;
  try {
    if (editingPurchaser.value) {
      await updatePurchaser(editingPurchaser.value.id, { ...purchaserForm });
      showToast("已更新");
    } else {
      await createPurchaser({
        customer_id: detailData.value.customer.id,
        ...purchaserForm,
      });
      showToast("已添加");
    }
    showPurchaserForm.value = false;
    // 刷新详情
    const r = await getMapCustomer(detailData.value.customer.id);
    detailData.value = r.data;
  } catch (e) {
    showToast(e.message || "保存失败");
  } finally {
    saving.value = false;
  }
}

async function handleDeletePurchaser(p) {
  try {
    await showConfirmDialog({
      title: "确认删除",
      message: `确定删除采购联系人「${p.name}」？`,
    });
    await deletePurchaser(p.id);
    showToast("已删除");
    const r = await getMapCustomer(detailData.value.customer.id);
    detailData.value = r.data;
  } catch (e) {
    if (e === "cancel" || e?.message?.includes("cancel")) return;
  }
}

// ====== 地址增删改 ======
function openAddAddress(p) {
  editingAddress.value = null;
  addressFormPurchaserId = p?.id || 0;
  addressForm.label = "";
  addressForm.address = "";
  addressForm.contact_name = "";
  addressForm.contact_phone = "";
  addressForm.latitude = null;
  addressForm.longitude = null;
  addressForm.notes = "";
  showAddressForm.value = true;
}

function editAddress(a) {
  editingAddress.value = a;
  addressFormPurchaserId = a.purchaser_id || 0;
  addressForm.label = a.label || "";
  addressForm.address = a.address || "";
  addressForm.contact_name = a.contact_name || "";
  addressForm.contact_phone = a.contact_phone || "";
  addressForm.latitude = a.latitude;
  addressForm.longitude = a.longitude;
  addressForm.notes = a.notes || "";
  showAddressForm.value = true;
  if (a.address && a.address.length >= 3 && !a.latitude && !a.longitude) {
    nextTick(() => autoGeocode(a.address, "address"));
  }
}

async function saveAddress() {
  if (!addressForm.address) return showToast("地址不能为空");
  saving.value = true;
  try {
    const data = {
      ...addressForm,
      customer_id: detailData.value.customer.id,
      purchaser_id: addressFormPurchaserId,
    };
    if (editingAddress.value) {
      await updateAddress(editingAddress.value.id, data);
      showToast("已更新");
    } else {
      await createAddress(data);
      showToast("已添加");
    }
    showAddressForm.value = false;
    const r = await getMapCustomer(detailData.value.customer.id);
    detailData.value = r.data;

    // 如果地址有坐标，刷新客户标记
    if (data.latitude && data.longitude) {
      await loadData();
    }
  } catch (e) {
    showToast(e.message || "保存失败");
  } finally {
    saving.value = false;
  }
}

async function handleDeleteAddress(a) {
  try {
    await showConfirmDialog({ title: "确认删除", message: "确定删除此地址？" });
    await deleteAddress(a.id);
    showToast("已删除");
    const r = await getMapCustomer(detailData.value.customer.id);
    detailData.value = r.data;
    await loadData();
  } catch (e) {
    if (e === "cancel" || e?.message?.includes("cancel")) return;
  }
}

// ====== 收货点（Sites）增删改 ======
function openAddSite() {
  if (!detailData.value) return;
  editingSite.value = null;
  siteForm.name = "";
  siteForm.site_type = "";
  siteForm.address = "";
  siteForm.latitude = null;
  siteForm.longitude = null;
  siteForm.contact_name = "";
  siteForm.contact_phone = "";
  siteForm.is_default = false;
  siteForm.notes = "";
  showSiteForm.value = true;
}

function editSite(s) {
  editingSite.value = s;
  siteForm.name = s.name;
  siteForm.site_type = s.site_type || "";
  siteForm.address = s.address || "";
  siteForm.latitude = s.latitude;
  siteForm.longitude = s.longitude;
  siteForm.contact_name = s.contact_name || "";
  siteForm.contact_phone = s.contact_phone || "";
  siteForm.is_default = !!s.is_default;
  siteForm.notes = s.notes || "";
  showSiteForm.value = true;
  if (s.address && s.address.length >= 3 && !s.latitude && !s.longitude) {
    nextTick(() => autoGeocode(s.address, "site"));
  }
}

async function saveSite() {
  if (!siteForm.site_type) return showToast("请输入类型");
  saving.value = true;
  try {
    // 自动生成名称：类型 + 地址前6个字
    const autoName = siteForm.name || (siteForm.site_type + (siteForm.address ? " · " + siteForm.address.replace(/[省市区县街道]/g,'').slice(0,8) : ""));
    const data = {
      ...siteForm,
      name: autoName,
      customer_id: detailData.value.customer.id,
    };
    if (editingSite.value) {
      await updateSite(editingSite.value.id, data);
      showToast("已更新");
    } else {
      await createSite(data);
      showToast("已添加");
    }
    showSiteForm.value = false;
    const r = await getMapCustomer(detailData.value.customer.id);
    detailData.value = r.data;
    await loadData();
  } catch (e) {
    showToast(e.message || "保存失败");
  } finally {
    saving.value = false;
  }
}

async function handleDeleteSite(s) {
  try {
    await showConfirmDialog({
      title: "确认删除",
      message: `确定删除收货点「${s.name}」？`,
    });
    await deleteSite(s.id);
    showToast("已删除");
    const r = await getMapCustomer(detailData.value.customer.id);
    detailData.value = r.data;
    await loadData();
  } catch (e) {
    if (e === "cancel" || e?.message?.includes("cancel")) return;
  }
}

function locateSite(s) {
  if (!s.latitude || !s.longitude || !map) return showToast("该收货点尚未定位");
  const gcj = wgs84ToGcj02(s.latitude, s.longitude);
  mapSetView(gcj.lat, gcj.lng, 16);
  if (window._viewMarker) map.remove(window._viewMarker);
  window._viewMarker = addAmapMarker(map, gcj.lat, gcj.lng);
  showDetail.value = false;
  setTimeout(() => { showDetail.value = true }, 100);
}

async function clearSitePosition(s) {
  try {
    await updateSite(s.id, { latitude: null, longitude: null });
    showToast("收货点定位已清除");
    const r = await getMapCustomer(detailData.value.customer.id);
    detailData.value = r.data;
    await loadData();
  } catch (e) {
    showToast("清除失败");
  }
}

let pickSiteForm = false;
function startSiteCoordPick() {
  pickSiteForm = true;
  pickOriginForm = "site";
  selectedMode.value = "pick";
  // 清除之前遗留的自动定位标记
  if (window._geoMarker && map) { map.remove(window._geoMarker); window._geoMarker = null; }
  showSiteForm.value = false;
  setTimeout(() => {
    const addr = siteForm.address;
    if (siteForm.latitude && siteForm.longitude) {
      placePickMarker(siteForm.latitude, siteForm.longitude);
      mapSetView(siteForm.latitude, siteForm.longitude, 16);
      showToast("拖拽标记调整位置，或搜索精确定位");
    } else if (addr && addr.length >= 3) {
      doPickGeocode(addr);
    } else {
      centerMapForPick();
    }
  }, 350);
}

function onSiteAddrInput(val) {
  autoGeocode(val, "site");
}

function siteTypeIcon(type) {
  const m = { office: "🏢", oem: "🏭", warehouse: "📦", branch: "🏢", "自有厂区": "🏢", "代工厂": "🏭", "仓库": "📦", "办事处": "🏢" };
  return m[type] || "🏷️";
}
function siteTypeLabel(type) {
  const m = { office: "自有厂区", oem: "代工厂", warehouse: "仓库", branch: "办事处" };
  return m[type] || type || "其他";
}

// 获取联系人关联的默认收货点
function getContactSite(p) {
  if (p.default_site_id === undefined || p.default_site_id === null || p.default_site_id === 0 || !detailData.value?.sites) return null;
  const sid = Number(p.default_site_id);
  return detailData.value.sites.find(s => Number(s.id) === sid) || null;
}

// 获取收货点关联的联系人（哪些联系人把这个收货点设为默认）
function getLinkedContacts(s) {
  if (!detailData.value?.purchasers) return [];
  return detailData.value.purchasers.filter(p => Number(p.default_site_id) === Number(s.id));
}

// 复制收件信息到剪贴板：收件人 电话 地址
function copyContactInfo(p) {
  const text = [p.name || "", p.phone || "", p.address || ""].filter(Boolean).join("  ");
  if (!text) return showToast("没有可复制的收件信息");
  navigator.clipboard.writeText(text).then(() => {
    showToast("✅ 已复制：" + text.slice(0, 35) + (text.length > 35 ? "…" : ""));
  }).catch(() => {
    showToast("复制失败，请手动复制");
  });
}

// ====== 地图搜索框（AutoComplete + 服务器POI搜索，对标高德） ======
const mapSearchKw = ref("");
const searchResults = ref([]);
const showSearchResults = ref(false);
const searchHighlight = ref(-1);
const searchDone = ref(false);
const searchWrapRef = ref(null);
const searchInputRef = ref(null);
const searchTotal = ref(0);
const searchPage = ref(1);
const searchLoading = ref(false);
let mapSearchMarker = null;
let mapSearchTimer = null;
let autoTimer = null;

// 光标移到末尾
function onSearchFocus(e) {
  setTimeout(() => {
    const el = e.target;
    const len = el.value.length;
    el.setSelectionRange(len, len);
  }, 0);
}

// 输入时 → AutoComplete 建议
function onMapSearchInput() {
  searchDone.value = false;
  clearTimeout(autoTimer);
  clearTimeout(mapSearchTimer);
  const kw = mapSearchKw.value.trim();
  if (kw.length < 2) {
    searchResults.value = [];
    showSearchResults.value = false;
    return;
  }
  // 先出 AutoComplete 建议（快）
  autoTimer = setTimeout(async () => {
    if (!window.AMap) return;
    searchAmapTips(kw, (tips) => {
      if (tips.length) {
        searchResults.value = tips.map((t) => ({
          ...t,
          _type: "suggestion",
        }));
        showSearchResults.value = true;
        searchDone.value = false;
      }
    });
  }, 200);
  // 同时准备完整搜索（稍后触发）
  mapSearchTimer = setTimeout(doPoiSearchFromInput, 600);
}

// 输入触发的完整搜索（回车时走这个）
async function doPoiSearchFromInput() {
  const kw = mapSearchKw.value.trim();
  if (!kw || !getAmapKey()) return;
  searchLoading.value = true;
  try {
    // 传城市adcode避免搜索到异地同名结果
    const searchCity = localStorage.getItem('crystal_search_city') || '440300';
    const r = await poiSearch(kw, getAmapKey(), 1, searchCity);
    const list = (r.data || []).map((item) => ({
      ...item,
      _type: "poi",
    }));
    if (list.length) {
      searchResults.value = list;
      searchTotal.value = r.total || list.length;
      searchPage.value = 1;
      showSearchResults.value = true;
      if (list.length) placeSearchMarker(list[0]);
      showPickResultMarkers(list);
    } else {
      // 服务器搜索无结果 → 降级浏览器端 PlaceSearch（不需要 Web服务API 权限）
      let browserResults = [];
      if (window.AMap) {
        await new Promise((resolve) =>
          searchAmapPoi(kw, (res) => {
            browserResults = res;
            resolve();
          }),
        );
      }
      if (browserResults.length) {
        searchResults.value = browserResults.map((item) => ({
          ...item,
          _type: "poi",
        }));
        searchTotal.value = browserResults.length;
        showSearchResults.value = true;
        placeSearchMarker(browserResults[0]);
        showPickResultMarkers(browserResults);
      } else {
        // 还不行 → 地理编码兜底
        const gr = await myGeocode(kw);
        const geoList = (gr.data || []).map((item) => ({
          ...item,
          _type: "poi",
          name: item.address || item.label || kw,
        }));
        if (geoList.length) {
          searchResults.value = geoList;
          searchTotal.value = geoList.length;
          showSearchResults.value = true;
          placeSearchMarker(geoList[0]);
          showPickResultMarkers(geoList);
        }
      }
    }
    searchDone.value = true;
    searchHighlight.value = -1;
  } catch {
    searchDone.value = true;
  } finally {
    searchLoading.value = false;
  }
}

// 选点模式下把搜索结果标到地图上（编号圆点，点击即选）
function showPickResultMarkers(results) {
  clearPickResultMarkers();
  if (!map || !results.length || selectedMode.value !== 'pick') return;
  window._pickResultMarkers = [];
  const maxShow = Math.min(results.length, 5);
  for (let i = 0; i < maxShow; i++) {
    const r = results[i];
    if (!r.lat || !r.lng) continue;
    const el = document.createElement('div');
    el.className = 'pick-result-dot';
    el.textContent = (i + 1).toString();
    const pos = new AMap.LngLat(r.lng, r.lat);
    const marker = new AMap.Marker({ position: pos, content: el, offset: new AMap.Pixel(-11, -11), zIndex: 200 });
    marker.on('click', () => pickSearchResult(r));
    map.add(marker);
    window._pickResultMarkers.push(marker);
  }
}
function clearPickResultMarkers() {
  if (window._pickResultMarkers) {
    window._pickResultMarkers.forEach(m => map?.remove(m));
    window._pickResultMarkers = [];
  }
}

// 搜索按钮 / 回车
function doMapSearch() {
  doPoiSearchFromInput();
}

// 加载更多
async function loadMoreResults() {
  const kw = mapSearchKw.value.trim();
  if (!kw || searchLoading.value) return;
  const nextPage = searchPage.value + 1;
  searchLoading.value = true;
  try {
    const searchCity = localStorage.getItem('crystal_search_city') || '440300';
    const r = await poiSearch(kw, getAmapKey(), nextPage, searchCity);
    const list = (r.data || []).map((item) => ({
      ...item,
      _type: "poi",
    }));
    if (list.length) {
      // 去重
      const existingNames = new Set(searchResults.value.map((x) => x.name));
      for (const item of list) {
        if (!existingNames.has(item.name)) {
          existingNames.add(item.name);
          searchResults.value.push(item);
        }
      }
      searchPage.value = nextPage;
    }
  } catch {} finally {
    searchLoading.value = false;
  }
}

function placeSearchMarker(result) {
  if (!map || !result.lat || !result.lng) return;
  mapSetView(result.lat, result.lng, 16);
  mapRemoveMarker(mapSearchMarker);
  mapSearchMarker = mapAddDivMarker(result.lat, result.lng, "📍");
  mapOpenPopup(
    mapSearchMarker,
    `
    <div style="font-size:13px;font-weight:600">${result.name || ""}</div>
    <div style="font-size:11px;color:#888">${result.address || ""}</div>
  `,
  );
}

function pickSearchResult(r) {
  showSearchResults.value = false;
  mapSearchKw.value = r.name || "";
  // 选点模式下：搜索结果直接替换选点标记 + 更新表单坐标
  if (selectedMode.value === 'pick' && r.lat && r.lng) {
    setFormCoords(r.lat, r.lng);
    placePickMarker(r.lat, r.lng);
    mapSetView(r.lat, r.lng, 16);
  } else {
    placeSearchMarker(r);
  }
}

function onSearchKeydown(e) {
  if (
    searchHighlight.value >= 0 &&
    searchResults.value[searchHighlight.value]
  ) {
    pickSearchResult(searchResults.value[searchHighlight.value]);
    e.preventDefault();
  } else if (searchResults.value.length) {
    pickSearchResult(searchResults.value[0]);
  }
}

function onSearchKeyNav(dir) {
  if (!searchResults.value.length) return;
  let idx = searchHighlight.value + dir;
  if (idx < 0) idx = searchResults.value.length - 1;
  if (idx >= searchResults.value.length) idx = 0;
  searchHighlight.value = idx;
}

// POI 类型标签映射
function poiTypeLabel(typecode, type) {
  const tc = (typecode || "").toString();
  if (tc === "120100" || tc === "120200") return "工业园区";
  if (tc === "150700") return "公交站";
  if (tc === "150904") return "停车场";
  if (tc.startsWith("99")) return "出入口";
  if (tc === "190403") return "建筑物";
  if (tc.startsWith("06")) return "餐饮";
  if (tc.startsWith("05")) return "购物";
  if (type?.includes("工业园区")) return "工业园区";
  if (type?.includes("地名")) return "地址";
  return "地点";
}

function poiTypeIcon(type) {
  const t = (type || "").toLowerCase();
  if (t.includes("公交") || t.includes("bus")) return "🚌";
  if (t.includes("停车场") || t.includes("park")) return "🅿️";
  if (t.includes("餐饮") || t.includes("food") || t.includes("餐")) return "🍽️";
  if (t.includes("购物") || t.includes("shop") || t.includes("mall")) return "🛒";
  if (t.includes("门") || t.includes("出入口")) return "🚪";
  return "📍";
}

// 点击其他地方关闭搜索结果
function onMapClickCloseSearch(e) {
  if (searchWrapRef.value && !searchWrapRef.value.contains(e.target)) {
    showSearchResults.value = false;
  }
}

// ====== 坐标选点（关闭表单 → 全屏地图选点 → 确认后回填） ======
let pickOriginForm = ""; // 'customer' | 'address'
function startCoordPick() {
  pickOriginForm = showCustomerForm.value ? "customer" : "address";
  selectedMode.value = "pick";
  // 清除之前遗留的自动定位标记
  if (window._geoMarker && map) { map.remove(window._geoMarker); window._geoMarker = null; }
  // 关闭表单弹窗，让地图全屏可见
  showCustomerForm.value = false;
  showAddressForm.value = false;
  // 加个延时等弹窗关闭动画完成
  setTimeout(() => {
    const formLat = pickOriginForm === "customer" ? customerForm.latitude : addressForm.latitude;
    const formLng = pickOriginForm === "customer" ? customerForm.longitude : addressForm.longitude;
    const addr = pickOriginForm === "customer" ? customerForm.address : addressForm.address;
    // 已有坐标 → 直接在地图显示，跳过 API 请求
    if (formLat && formLng) {
      placePickMarker(formLat, formLng);
      mapSetView(formLat, formLng, 16);
      showToast("拖拽标记调整位置，或搜索精确定位");
    } else if (addr && addr.length >= 3) {
      doPickGeocode(addr);
    } else {
      centerMapForPick();
    }
  }, 350);
}
async function doPickGeocode(addr) {
  try {
    const r = await myGeocode(addr);
    const results = r.data || [];
    if (results.length && map) {
      const best = results[0];
      const isAmap = r.provider === "amap";
      const slat = isAmap ? fromAmap(best.lat, best.lng).lat : best.lat;
      const slng = isAmap ? fromAmap(best.lat, best.lng).lng : best.lng;
      setFormCoords(slat, slng);
      placePickMarker(slat, slng);
      map.setView(ll(slat, slng), 16);
      showToast("已定位到：" + (best.label || "").slice(0, 30));
    } else {
      centerMapForPick();
      showToast("未搜到精确位置，请在地图上点击或拖拽");
    }
  } catch {
    centerMapForPick();
  }
}
function centerMapForPick() {
  if (!map) return;
  const center = map.getCenter(); // GCJ02（高德瓦片坐标）
  const wgs = gcj02ToWgs84(center.lat, center.lng); // 转 WGS84 存数据库
  setFormCoords(wgs.lat, wgs.lng);
  placePickMarker(wgs.lat, wgs.lng);
}
function placePickMarker(lat, lng) {
  if (!map) return;
  mapRemoveMarker(window._pickMarker);
  // 自定义大号可拖拽标记（一眼可见，不用精准点击）
  const gcj = wgs84ToGcj02(lat, lng);
  const el = document.createElement("div");
  el.className = "pick-marker-dom";
  el.innerHTML = '<div class="pm-pin">📍</div><div class="pm-shadow"></div>';
  window._pickMarker = new AMap.Marker({
    position: [gcj.lng, gcj.lat],
    content: el,
    draggable: true,
    offset: new AMap.Pixel(-18, -48),
    zIndex: 999,
  });
  map.add(window._pickMarker);
  window._pickMarker.on("dragend", (e) => {
    const p = e.target.getPosition();
    const wgs = gcj02ToWgs84(p.lat, p.lng);
    setFormCoords(wgs.lat, wgs.lng);
  });
}
function setFormCoords(lat, lng) {
  if (pickOriginForm === "customer") {
    customerForm.latitude = lat;
    customerForm.longitude = lng;
  } else if (pickOriginForm === "site") {
    siteForm.latitude = lat;
    siteForm.longitude = lng;
  } else {
    addressForm.latitude = lat;
    addressForm.longitude = lng;
  }
}
// 确认选点 → 回填坐标 + 重新打开表单
function confirmCoordPick() {
  selectedMode.value = "";
  clearPickResultMarkers();
  if (window._pickMarker && map) {
    map.remove(window._pickMarker);
    window._pickMarker = null;
  }
  if (pickOriginForm === "customer") {
    showCustomerForm.value = true;
  } else if (pickOriginForm === "site") {
    showSiteForm.value = true;
  } else {
    showAddressForm.value = true;
  }
  showToast("坐标已定位 ✓");
}
function cancelCoordPick() {
  selectedMode.value = "";
  clearPickResultMarkers();
  if (window._pickMarker && map) {
    map.remove(window._pickMarker);
    window._pickMarker = null;
  }
  if (pickOriginForm === "customer") {
    showCustomerForm.value = true;
  } else if (pickOriginForm === "site") {
    showSiteForm.value = true;
  } else {
    showAddressForm.value = true;
  }
}

// ====== 地址自动搜索定位（表单输入时） ======
let geoAutoTimer = null;
async function autoGeocode(val, target, nameHint) {
  geocodeTarget = target;
  // 地址清空时才清坐标；输入过程中不打断已有坐标
  if (!val) {
    if (target === "customer") {
      customerForm.latitude = null;
      customerForm.longitude = null;
    } else if (target === "site") {
      siteForm.latitude = null;
      siteForm.longitude = null;
    } else {
      addressForm.latitude = null;
      addressForm.longitude = null;
    }
    return;
  }
  if (val.length < 3) return; // 太短不查，但保留已有坐标
  clearTimeout(geoAutoTimer);
  geoAutoTimer = setTimeout(async () => {
    try {
      // 带公司名一起查，比纯地址更准
      const query = nameHint ? nameHint + " " + val : val;
      const r = await myGeocode(query);
      const results = r.data || [];
      if (results.length) {
        const best = results[0];
        // 高德返回 GCJ02 → 转 WGS84 存数据库
        const isAmap = r.provider === "amap";
        const saveLat = isAmap ? fromAmap(best.lat, best.lng).lat : best.lat;
        const saveLng = isAmap ? fromAmap(best.lat, best.lng).lng : best.lng;
        if (target === "customer") {
          customerForm.latitude = saveLat;
          customerForm.longitude = saveLng;
        } else if (target === "site") {
          siteForm.latitude = saveLat;
          siteForm.longitude = saveLng;
        } else {
          addressForm.latitude = saveLat;
          addressForm.longitude = saveLng;
        }
        // 表单开着时地图被遮住，只提示不操作地图
        const label = (best.label || best.address || "").slice(0, 25);
        showToast("✓ 已定位：" + label);
      }
    } catch {}
  }, 800); // 800ms 防抖减少频繁请求
}

function onAddressInput(val) {
  autoGeocode(val, "customer", customerForm.name);
}
function onAddrInput(val) {
  autoGeocode(val, "address");
}

// 地图搜索按钮
function showMapSearch() {
  // 如果表单已打开且有地址，自动定位
  const addr = showCustomerForm.value
    ? customerForm.address
    : addressForm.value?.address;
  if (addr && addr.length >= 3) {
    doMapSearch();
  }
}

// ====== 地图操作 ======
function locateOnMap(c) {
  if (c.latitude && c.longitude && map) {
    mapSetView(c.latitude, c.longitude, 16);
    if (customerMarkers[c.id]) {
      try {
        customerMarkers[c.id].openPopup();
      } catch {}
    }
  } else {
    showToast("该客户尚未定位");
  }
}

async function clearCustomerPosition(c) {
  try {
    await updateMapCustomer(c.id, { latitude: null, longitude: null });
    // 移除地图标记
    const m = customerMarkers[c.id];
    if (m) { map.remove(m); delete customerMarkers[c.id]; }
    showToast("定位已清除");
    showDetail.value = false;
    await loadData();
  } catch (e) {
    showToast("清除失败");
  }
}

function navigateToCustomer(c) {
  if (!c.latitude || !c.longitude) {
    showToast("该客户尚未定位，请先设置坐标");
    return;
  }
  if (currentRoute && map) {
    map.remove(currentRoute);
    currentRoute = null;
  }
  mapLocate(
    (start) => {
      addAmapRoute(map, start.lat, start.lng, c.latitude, c.longitude).then(
        (r) => {
          if (r) showToast(`距离 ${r.distance} · 预计 ${r.time}`);
        },
      );
    },
    () => {
      window.open(
        `https://www.google.com/maps/dir/?api=1&destination=${c.latitude},${c.longitude}`,
        "_blank",
      );
    },
  );
}

function openAddToTrip(c) {
  showDetail.value = false;
  router.push(
    "/trip-plans?add=" +
      encodeURIComponent(
        JSON.stringify({
          customer_id: c.id,
          customer_name: c.name,
          address: c.address,
          latitude: c.latitude,
          longitude: c.longitude,
          contact_phone: c.phone,
        }),
      ),
  );
}

// ====== 导入导出 ======
async function showImportConfirm() {
  try {
    const r = await importMapCustomersFromNotes();
    showToast(r.msg || `导入完成`);
    await loadData();
  } catch (e) {
    showToast(e.message || "导入失败");
  }
}

async function handleExport() {
  try {
    const blob = await exportMapAddresses();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "客户地址信息.xlsx";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("导出成功");
  } catch (e) {
    showToast("导出失败: " + (e.message || ""));
  }
}

// ====== 数据加载 ======
async function loadData() {
  loading.value = true;
  try {
    const r = await fetchMapCustomers({ keyword: searchKw.value });
    customers.value = r.data || [];
  } catch (e) {
    showToast("加载失败");
    customers.value = [];
  } finally {
    loading.value = false;
  }
  // 更新地图标记
  loadCustomerMarkers();
}

// ====== 生命周期 ======
onMounted(async () => {
  await loadData();
  // 地图在 nextTick 后初始化（DOM 已渲染）
  nextTick(() => {
    setTimeout(initMap, 100);
  });
  // 点击别处关闭搜索结果
  document.addEventListener("mousedown", onMapClickCloseSearch);
});

onUnmounted(() => {
  document.removeEventListener("mousedown", onMapClickCloseSearch);
  if (map) {
    destroyAmapMap(map);
    map = null;
  }
  customerMarkers = {};
  currentRoute = null;
});
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
.search-input::placeholder {
  color: #bbb;
}
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
  border: 1px solid rgba(0, 0, 0, 0.08);
  background: rgba(255, 255, 255, 0.7);
  color: #00695c;
  font-family: inherit;
  white-space: nowrap;
  transition: all 0.15s;
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
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 4px;
  color: #00695c;
  font-size: 20px;
  cursor: pointer;
  padding: 2px 8px;
  line-height: 1;
  font-family: inherit;
}
.back-btn:hover {
  background: rgba(0, 0, 0, 0.05);
}

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
  transition:
    width 0.2s,
    min-width 0.2s;
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
.panel-title small {
  font-weight: 400;
  color: #999;
  font-size: 12px;
}
.panel-toggle {
  background: transparent;
  border: none;
  color: #999;
  cursor: pointer;
  font-size: 12px;
  padding: 4px;
  flex-shrink: 0;
}
.panel-toggle:hover {
  color: #333;
}
.side-panel.collapsed .panel-title,
.side-panel.collapsed .region-filter,
.side-panel.collapsed .customer-list {
  display: none;
}

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
  transition: all 0.15s;
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
.region-chip.clear {
  color: #e53935;
  border-color: #ffcdd2;
}

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
  padding: 8px 16px 5px;
  font-size: 10px;
  font-weight: 700;
  color: #aaa;
  background: #f7f8fa;
  letter-spacing: 0.5px;
  position: sticky;
  top: 0;
  z-index: 1;
  border-bottom: 1px solid #eee;
}
.customer-card {
  display: flex;
  border-bottom: 1px solid #f0f0f0;
  transition: background 0.12s;
}
.customer-card:hover {
  background: #f5fafb;
}
.customer-card.active {
  background: #e0f7fa;
  border-left: 3px solid #00695c;
}
.cc-left {
  flex: 1;
  padding: 10px 8px 10px 16px;
  cursor: pointer;
  min-width: 0;
}
.cc-row1 {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 3px;
}
.cc-name {
  font-size: 13px;
  font-weight: 600;
  color: #222;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cc-badge {
  flex-shrink: 0;
  font-size: 9px;
  padding: 1px 8px;
  border-radius: 8px;
  background: #e8f5e9;
  color: #2e7d32;
  font-weight: 500;
  line-height: 1.6;
}
.cc-badge.muted {
  background: #f0f0f0;
  color: #bbb;
}
.cc-addr {
  font-size: 11px;
  color: #888;
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cc-row2 {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 14px;
  font-size: 10px;
  color: #999;
  min-height: 16px;
}
.cc-tel {
  color: #bbb;
}
.cc-edit-btn {
  flex-shrink: 0;
  width: 32px;
  background: transparent;
  border: none;
  border-left: 1px solid #f0f0f0;
  cursor: pointer;
  font-size: 13px;
  color: #ddd;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 12px;
  transition: color 0.15s, background 0.15s;
}
.cc-edit-btn:hover {
  background: #e0f7fa;
  color: #00695c;
}
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
/* 选点模式底部确认条 */
.map-pick-bar {
  position: absolute;
  bottom: 40px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.78);
  color: #fff;
  padding: 10px 20px;
  border-radius: 28px;
  font-size: 13px;
  z-index: 1000;
  display: flex;
  align-items: center;
  gap: 14px;
  white-space: nowrap;
  box-shadow: 0 4px 20px rgba(0,0,0,0.3);
  backdrop-filter: blur(6px);
}
.pick-bar-text {
  font-size: 12px;
  color: rgba(255,255,255,0.85);
}
.pick-bar-confirm {
  background: #52c41a;
  border: none;
  color: #fff;
  cursor: pointer;
  font-size: 13px;
  padding: 6px 18px;
  border-radius: 20px;
  font-weight: 600;
  font-family: inherit;
  transition: background 0.15s;
}
.pick-bar-confirm:hover {
  background: #389e0d;
}
.pick-bar-cancel {
  background: transparent;
  border: 1px solid rgba(255,255,255,0.3);
  color: rgba(255,255,255,0.7);
  cursor: pointer;
  font-size: 12px;
  padding: 4px 12px;
  border-radius: 16px;
  font-family: inherit;
  transition: all 0.15s;
}
.pick-bar-cancel:hover {
  background: rgba(255,255,255,0.1);
  color: #fff;
}

/* 地图搜索框 */
.map-search-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(255, 255, 255, 0.95);
  padding: 6px 8px;
  border-radius: 8px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
  position: relative;
  z-index: 1;
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
.map-search-input::placeholder {
  color: #aaa;
}
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
.map-search-btn:hover {
  background: #004d40;
}

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
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.18);
  max-height: 320px;
  overflow-y: auto;
  border: 1px solid #e0e0e0;
  border-top: none;
  position: relative;
  z-index: 10001;
}
.sr-count {
  padding: 6px 14px;
  font-size: 10px;
  color: #999;
  border-bottom: 1px solid #f0f0f0;
  background: #fafafa;
}
.search-dropdown.empty {
  padding: 12px 16px;
  color: #999;
  font-size: 12px;
  text-align: center;
}
.search-result-item {
  padding: 8px 14px;
  cursor: pointer;
  border-bottom: 1px solid #f0f0f0;
  transition: background 0.08s;
  display: flex;
  gap: 8px;
  align-items: flex-start;
  position: relative;
}
.search-result-item:last-child {
  border-bottom: none;
}
.search-result-item:hover,
.search-result-item.active {
  background: #f0f7fa;
}
.sr-left {
  flex-shrink: 0;
  padding-top: 2px;
}
.sr-type-icon {
  font-size: 16px;
  width: 24px;
  text-align: center;
}
.sr-body {
  flex: 1;
  min-width: 0;
}
.sr-name {
  font-size: 13px;
  font-weight: 600;
  color: #333;
  margin-bottom: 1px;
}
.sr-addr {
  font-size: 11px;
  color: #888;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sr-meta {
  font-size: 10px;
  color: #aaa;
  margin-top: 2px;
}
.sr-type {
  font-size: 9px;
  color: #00695c;
  background: #e0f7fa;
  padding: 0 5px;
  border-radius: 3px;
  flex-shrink: 0;
  margin-top: 2px;
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sr-load-more {
  padding: 8px 14px;
  font-size: 11px;
  color: #00695c;
  text-align: center;
  cursor: pointer;
  border-top: 1px solid #f0f0f0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}
.sr-load-more:hover {
  background: #f0f7fa;
}
.sr-load-more.loading {
  color: #999;
  cursor: default;
}

/* map-error overlay */
.map-error {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: #fef6f0;
  z-index: 1000;
  color: #d46b08;
  font-size: 13px;
  padding: 20px;
  text-align: center;
}
.map-error-icon {
  font-size: 32px;
}
.map-legend {
  position: absolute;
  bottom: 20px;
  right: 12px;
  background: rgba(255, 255, 255, 0.9);
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
  padding: 4px 10px;
  border-radius: 14px;
  font-size: 10px;
  font-weight: 600;
  text-align: center;
  white-space: nowrap;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
  border: 2px solid #fff;
  cursor: pointer;
  transition: transform 0.15s;
  line-height: 1;
}
.marker-pin:hover {
  transform: scale(1.1);
}
.marker-pin.has-addr {
  background: #004d40;
}
/* 搜索结果编号圆点（选点模式下显示在地图上，点击即选） */
.pick-result-dot {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #00695c;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid #fff;
  box-shadow: 0 2px 6px rgba(0,0,0,0.3);
  cursor: pointer;
  transition: transform 0.12s;
  user-select: none;
}
.pick-result-dot:hover {
  transform: scale(1.2);
  background: #004d40;
}

/* 大号选点可拖拽标记 */
.pick-marker-dom {
  background: none !important;
  border: none !important;
}
.pick-marker-dom .pm-pin {
  font-size: 30px;
  line-height: 1;
  text-align: center;
  filter: drop-shadow(0 2px 6px rgba(0,0,0,0.4));
  cursor: grab;
  user-select: none;
}
.pick-marker-dom .pm-pin:active {
  cursor: grabbing;
}
.pick-marker-dom .pm-shadow {
  width: 12px;
  height: 4px;
  background: rgba(0,0,0,0.2);
  border-radius: 50%;
  margin: -4px auto 0;
}
.popup-content {
  min-width: 160px;
  font-family: -apple-system, BlinkMacSystemFont, sans-serif;
}
.popup-name {
  font-size: 14px;
  margin-bottom: 4px;
  color: #333;
}
.popup-addr {
  font-size: 11px;
  color: #888;
  margin-bottom: 2px;
}
.popup-phone {
  font-size: 11px;
  color: #888;
  margin-bottom: 2px;
}
.popup-meta {
  font-size: 10px;
  color: #aaa;
  margin-bottom: 6px;
}
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
.popup-btn:hover {
  background: #004d40;
}

/* ===== 详情弹出层（新设计） ===== */
.detail-wrap {
  padding: 0 0 24px;
  overflow-y: auto;
  height: 100%;
  background: #f8f9fc;
}
/* 客户信息头 */
.dt-header {
  background: linear-gradient(135deg, #e0f7fa 0%, #b2dfdb 100%);
  padding: 16px 20px 12px;
  position: sticky;
  top: 0;
  z-index: 5;
}
.dt-h-top {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.dt-h-name {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: #004d40;
}
.dt-h-badge {
  font-size: 9px;
  padding: 2px 8px;
  border-radius: 10px;
  background: #f5f5f5;
  color: #999;
  font-weight: 500;
}
.dt-h-badge.active {
  background: #e8f5e9;
  color: #2e7d32;
}
.dt-h-info {
  margin-bottom: 8px;
}
.dt-h-row {
  font-size: 12px;
  color: #555;
  display: flex;
  align-items: flex-start;
  gap: 4px;
  margin-bottom: 2px;
  line-height: 1.4;
}
.dt-h-row.notes {
  color: #888;
  font-style: italic;
}
.dt-h-ico {
  flex-shrink: 0;
  font-size: 12px;
}
.dt-h-actions {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}
.dt-ha {
  padding: 3px 10px;
  border-radius: 14px;
  font-size: 10px;
  cursor: pointer;
  border: 1px solid rgba(0,0,0,0.08);
  background: rgba(255,255,255,0.8);
  color: #00695c;
  font-family: inherit;
  white-space: nowrap;
  transition: all 0.15s;
}
.dt-ha:hover {
  background: #fff;
  border-color: #00695c;
}
.dt-ha.danger {
  color: #e53935;
}
.dt-ha.danger:hover {
  border-color: #e53935;
  background: #fff;
}
/* Tab 切换 */
.dt-tabs {
  display: flex;
  background: #fff;
  border-bottom: 1px solid #eee;
  position: sticky;
  top: 100px;
  z-index: 4;
}
.dt-tab {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 11px 0;
  font-size: 13px;
  font-weight: 500;
  color: #888;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: all 0.2s;
  position: relative;
}
.dt-tab.active {
  color: #00695c;
  border-bottom-color: #00695c;
  background: #fafffe;
}
.dt-tab-icon {
  font-size: 15px;
}
.dt-tab-badge {
  font-size: 10px;
  background: #e0f7fa;
  color: #00695c;
  padding: 0 6px;
  border-radius: 8px;
  font-weight: 600;
}
.dt-tab.active .dt-tab-badge {
  background: #00695c;
  color: #fff;
}
/* Tab 内容区 */
.dt-body {
  padding: 12px 16px;
}
.dt-body-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
  font-size: 12px;
  color: #888;
}
.dt-add-btn {
  padding: 5px 14px;
  border-radius: 16px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  background: #00695c;
  color: #fff;
  font-family: inherit;
  transition: all 0.15s;
}
.dt-add-btn:hover {
  background: #004d40;
}
.dt-empty {
  text-align: center;
  padding: 24px 0;
  font-size: 12px;
  color: #bbb;
}
/* 联系人卡片 */
.contact-card {
  background: #fff;
  border-radius: 12px;
  margin-bottom: 8px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.04);
  border: 1px solid #f0f0f0;
  overflow: hidden;
  transition: all 0.15s;
}
.contact-card:hover {
  border-color: #b2dfdb;
  box-shadow: 0 2px 8px rgba(0,105,92,0.08);
}
.cc-main {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  cursor: pointer;
}
.cc-avatar {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background: linear-gradient(135deg, #00695c, #26a69a);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  font-weight: 600;
  flex-shrink: 0;
}
.cc-body {
  flex: 1;
  min-width: 0;
}
.cc-name {
  font-size: 14px;
  font-weight: 600;
  color: #333;
  margin-bottom: 2px;
}
.cc-addr {
  margin-top: 4px;
  font-size: 11px;
  color: #888;
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}
.cc-addr-site {
  background: #f0f7fa;
  color: #00695c;
  padding: 0 5px;
  border-radius: 3px;
  font-size: 10px;
}
.cc-addr-text {
  color: #999;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 160px;
}
/* 复制收件信息栏 */
.cc-copy-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 7px 14px;
  border-top: 1px solid #f5f5f5;
  background: #fafffe;
  cursor: pointer;
  transition: all 0.12s;
}
.cc-copy-row:hover {
  background: #e0f7fa;
}
.cc-copy-row:active {
  background: #b2dfdb;
}
.cc-copy-icon {
  font-size: 12px;
}
.cc-copy-text {
  font-size: 11px;
  color: #00695c;
  font-weight: 500;
}
.cc-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.cc-role {
  font-size: 10px;
  color: #00695c;
  background: #e0f7fa;
  padding: 1px 8px;
  border-radius: 8px;
}
.cc-phone {
  font-size: 11px;
  color: #888;
}
.cc-actions {
  flex-shrink: 0;
}
.cc-del {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #f5f5f5;
  color: #ccc;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.15s;
}
.cc-del:hover {
  background: #ffebee;
  color: #e53935;
}
/* 收货点卡片 */
.site-card {
  background: #fff;
  border-radius: 12px;
  padding: 14px;
  margin-bottom: 10px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.04);
  border: 1px solid #f0f0f0;
  transition: all 0.15s;
}
.site-card:hover {
  border-color: #b2dfdb;
  box-shadow: 0 2px 8px rgba(0,105,92,0.08);
}
.sc-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.sc-left {
  display: flex;
  align-items: center;
  gap: 6px;
}
.sc-type-icon {
  font-size: 18px;
}
.sc-name {
  font-size: 15px;
  font-weight: 600;
  color: #333;
}
.sc-type-tag {
  font-size: 9px;
  padding: 1px 6px;
  border-radius: 6px;
  background: #f0f2f5;
  color: #666;
}
.sc-default {
  font-size: 9px;
  padding: 1px 6px;
  border-radius: 6px;
  background: #fff3e0;
  color: #e65100;
  font-weight: 600;
}
.sc-actions {
  display: flex;
  gap: 4px;
}
.sc-edit, .sc-del {
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 13px;
  color: #999;
  padding: 2px 6px;
  border-radius: 4px;
}
.sc-edit:hover { color: #00695c; background: #e0f7fa; }
.sc-del:hover { color: #e53935; background: #ffebee; }
.sc-body {
  padding-left: 24px;
}
.sc-row {
  font-size: 12px;
  color: #666;
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 3px;
  line-height: 1.4;
}
.sc-row-ico {
  flex-shrink: 0;
  font-size: 11px;
  width: 16px;
  text-align: center;
}
.sc-row.sc-coord span {
  color: #888;
  font-family: monospace;
  font-size: 11px;
}
.sc-coord-text {
  color: #888;
  font-size: 11px;
}
.sc-locate {
  margin-left: 6px;
  padding: 1px 8px;
  border-radius: 8px;
  font-size: 9px;
  cursor: pointer;
  border: 1px solid #b2dfdb;
  background: #fff;
  color: #00695c;
  font-family: inherit;
}
.sc-locate:hover {
  background: #e0f7fa;
}
.sc-locate.danger {
  border-color: #ffcdd2;
  color: #e53935;
}
.sc-locate.danger:hover {
  background: #ffebee;
}
.sc-notes {
  color: #aaa;
}

.detail-section {
  padding: 12px 0;
}
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.section-title {
  font-size: 14px;
  font-weight: 600;
  color: #333;
}
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
.purchaser-card.expanded {
  border-color: #b2dfdb;
}
.pc-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  cursor: pointer;
  background: #fafafa;
  transition: background 0.15s;
}
.pc-head:hover {
  background: #f0f7fa;
}
.pc-name {
  font-weight: 600;
  font-size: 13px;
  color: #333;
}
.pc-phone {
  font-size: 11px;
  color: #888;
}
.pc-title {
  font-size: 10px;
  color: #aaa;
  padding: 1px 6px;
  background: #f5f5f5;
  border-radius: 3px;
}
.pc-toggle {
  margin-left: auto;
  font-size: 10px;
  color: #bbb;
}
.pc-edit,
.pc-del {
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 13px;
  color: #999;
  padding: 2px 4px;
}
.pc-edit:hover {
  color: #00695c;
}
.pc-del:hover {
  color: #e53935;
}
.pc-body {
  padding: 8px 12px 12px;
}

/* 地址项 */
.address-item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 6px 0;
  border-bottom: 1px solid #f5f5f5;
}
.address-item:last-child {
  border-bottom: none;
}
.address-item.unassigned {
  opacity: 0.7;
}
.ai-left {
  flex: 1;
  min-width: 0;
}
.ai-label {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 10px;
  background: #e0f7fa;
  color: #00695c;
  margin-bottom: 2px;
}
.ai-addr {
  display: block;
  font-size: 12px;
  color: #555;
  margin-bottom: 1px;
}
.ai-contact {
  font-size: 11px;
  color: #888;
}
.ai-default {
  font-size: 10px;
  color: #e6a23c;
  margin-left: 4px;
}
.ai-right {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}
.ai-btn {
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 12px;
  color: #999;
  padding: 2px 4px;
}
.ai-btn:hover {
  color: #00695c;
}
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
.add-addr-btn:hover {
  background: #f0f7fa;
  border-color: #b2dfdb;
}

/* 表单 */
.form-wrap {
  padding: 16px 20px 24px;
}
.form-wrap h3 {
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 12px;
}
/* 表单内嵌区块（联系人、收件信息） */
.inline-section {
  padding: 4px 16px 8px;
  border-top: 1px solid #f0f0f0;
  margin-top: 4px;
}
.inline-section-hd {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0 4px;
}
.inline-section-title {
  font-size: 13px;
  font-weight: 600;
  color: #444;
}
.inline-add-btn {
  padding: 3px 12px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 600;
  border: 1px solid #00695c;
  background: #fff;
  color: #00695c;
  cursor: pointer;
  font-family: inherit;
}
.inline-add-btn:hover {
  background: #e0f7fa;
}
.inline-empty {
  font-size: 11px;
  color: #bbb;
  padding: 6px 0;
}
.inline-contact-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 0;
  border-bottom: 1px solid #f5f5f5;
}
.inline-contact-row:last-child {
  border-bottom: none;
}
.ic-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}
.ic-copy {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 14px;
  color: #bbb;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.12s;
}
.ic-copy:hover {
  background: #e0f7fa;
  color: #00695c;
}
.ic-fields {
  flex: 1;
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.ic-input {
  flex: 1;
  min-width: 80px;
  padding: 6px 8px;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  font-size: 12px;
  font-family: inherit;
  outline: none;
  background: #fafafa;
}
.ic-input:focus {
  border-color: #00695c;
  background: #fff;
}
.ic-input-sm {
  max-width: 90px;
}
.ic-del {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 14px;
  color: #ccc;
  display: flex;
  align-items: center;
  justify-content: center;
}
.ic-del:hover {
  background: #ffebee;
  color: #e53935;
}

.form-btns {
  display: flex;
  gap: 12px;
  margin-top: 16px;
}
.form-btns .van-button {
  flex: 1;
}

/* 坐标选点（只显示按钮，不显示数值输入框） */
.coord-pick-simple {
  padding: 6px 16px 10px;
}
.coord-btn {
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  border: 1px solid #00695c;
  background: #fff;
  color: #00695c;
  font-family: inherit;
  white-space: nowrap;
  transition: all 0.15s;
}
.coord-btn:hover {
  background: #e0f7fa;
}

/* 表单选择器和checkbox */
.form-field {
  padding: 10px 16px;
  display: flex;
  align-items: center;
  gap: 10px;
}
.form-field-label {
  font-size: 12px;
  color: #666;
  white-space: nowrap;
  min-width: 60px;
}
.form-select {
  flex: 1;
  padding: 8px 10px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  font-size: 13px;
  color: #333;
  background: #fff;
  font-family: inherit;
  outline: none;
  appearance: auto;
  cursor: pointer;
}
.form-select:focus {
  border-color: #00695c;
}
.form-checkbox {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #555;
  cursor: pointer;
}
.form-checkbox input[type="checkbox"] {
  width: 16px;
  height: 16px;
  accent-color: #00695c;
  cursor: pointer;
}

/* 类型快捷芯片 */
.st-type-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 0 16px 10px;
}
.st-type-chip {
  padding: 4px 14px;
  border-radius: 14px;
  font-size: 12px;
  background: #f0f2f5;
  color: #666;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.15s;
  user-select: none;
}
.st-type-chip:hover {
  border-color: #b2dfdb;
  color: #00695c;
}
.st-type-chip.active {
  background: #00695c;
  color: #fff;
  border-color: #00695c;
}

/* 地理编码搜索 */
.geocode-wrap {
  padding: 16px 20px 24px;
}
.geocode-wrap h4 {
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 12px;
}
.geo-item {
  padding: 10px 0;
  border-bottom: 1px solid #f5f5f5;
  cursor: pointer;
}
.geo-item:hover {
  color: #00695c;
}
.geo-label {
  display: block;
  font-size: 13px;
  color: #333;
}
.geo-coord {
  font-size: 10px;
  color: #999;
}
.geo-empty {
  text-align: center;
  color: #999;
  font-size: 13px;
  padding: 20px 0;
}

/* leaflet 弹窗覆盖层 z-index */
.leaflet-popup {
  z-index: 1001;
}
</style>
