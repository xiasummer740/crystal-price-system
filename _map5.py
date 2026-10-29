p="client/src/views/MapAddresses.vue"
s=open(p,encoding="utf-8").read()

# import
s=s.replace("  updateMapCustomer,", "  updateMapCustomer,\n  fetchMapAddressHistory,", 1)

# 排序状态 + 地址历史
s=s.replace("const locFilter = ref('all')", "const locFilter = ref('all')\nconst sortBy = ref('default')\nconst addressHistory = ref([])", 1)

# 排序 + 分组
old_group = '''const groupedByRegion = computed(() => {
  const groups = {};
  for (const c of filteredCustomers.value) {'''
new_group = '''function distanceKm(c) {
  if (!c.latitude || !c.longitude || !map) return Infinity
  try {
    const ctr = map.getCenter()
    const R = 6371
    const toRad = (d) => d * Math.PI / 180
    const dLat = toRad(c.latitude - ctr.lat)
    const dLng = toRad(c.longitude - ctr.lng)
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(ctr.lat)) * Math.cos(toRad(c.latitude)) * Math.sin(dLng / 2) ** 2
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  } catch { return Infinity }
}

const sortedCustomers = computed(() => {
  const list = [...filteredCustomers.value]
  if (sortBy.value === 'updated') {
    list.sort((a, b) => String(b.updated_at || b.created_at || '').localeCompare(String(a.updated_at || a.created_at || '')))
  } else if (sortBy.value === 'unlocated') {
    list.sort((a, b) => {
      const la = a.latitude && a.longitude ? 1 : 0
      const lb = b.latitude && b.longitude ? 1 : 0
      if (la !== lb) return la - lb
      return String(a.name).localeCompare(String(b.name), 'zh')
    })
  } else if (sortBy.value === 'distance') {
    list.sort((a, b) => distanceKm(a) - distanceKm(b))
  }
  return list
})

const groupedByRegion = computed(() => {
  if (sortBy.value !== 'default') {
    return [{ name: '', items: sortedCustomers.value }]
  }
  const groups = {};
  for (const c of sortedCustomers.value) {'''
assert old_group in s
s=s.replace(old_group,new_group,1)

# 模板：排序条
old_tpl = '''        <!-- 区域分组筛选（省→市层级） -->'''
new_tpl = '''        <!-- 排序 -->
        <div class="sort-row">
          <span class="sort-label">排序</span>
          <select v-model="sortBy" class="sort-select">
            <option value="default">按地区</option>
            <option value="updated">最近更新</option>
            <option value="unlocated">未定位优先</option>
            <option value="distance">离地图中心近</option>
          </select>
        </div>

        <!-- 区域分组筛选（省→市层级） -->'''
assert old_tpl in s
s=s.replace(old_tpl,new_tpl,1)

# 卡片：缺地址/默认收货点
old_card = '''                  <span v-if="c.latitude && c.longitude" class="cc-badge">已定位</span>
                  <span v-else class="cc-badge muted">未定位</span>'''
new_card = '''                  <span v-if="c.latitude && c.longitude" class="cc-badge">已定位</span>
                  <span v-else class="cc-badge muted">未定位</span>
                  <span v-if="!c.address" class="cc-badge warn">缺地址</span>
                  <span v-else-if="!/(市|区|县|镇|路|街|号)/.test(c.address)" class="cc-badge warn">地址待补全</span>'''
assert old_card in s
s=s.replace(old_card,new_card,1)

old_addr = '''                <div class="cc-addr" v-if="c.address">📍 {{ truncate(c.address, 35) }}</div>'''
new_addr = '''                <div class="cc-addr" v-if="c.address">📍 {{ truncate(c.address, 35) }}</div>
                <div class="cc-site" v-if="c.default_site_address">🏭 {{ c.default_site_name || '默认收货点' }}：{{ truncate(c.default_site_address, 28) }}</div>'''
assert old_addr in s
s=s.replace(old_addr,new_addr,1)

# 编辑弹窗：地址变更记录
old_form = '''        <div class="form-btns">'''
new_form = '''        <div v-if="addressHistory.length" class="addr-history">
          <div class="ah-title">地址变更记录</div>
          <div v-for="h in addressHistory.slice(0, 5)" :key="h.id" class="ah-row">
            <span class="ah-time">{{ (h.changed_at || '').slice(0, 10) }}</span>
            <span class="ah-text" :title="'旧：' + (h.old_address || '（空）') + ' → 新：' + h.new_address">
              {{ truncate(h.old_address || '（空）', 16) }} → {{ truncate(h.new_address, 24) }}
            </span>
          </div>
        </div>

        <div class="form-btns">'''
assert old_form in s
s=s.replace(old_form,new_form,1)

# editCustomer 加载历史
old_edit = '''  customerContacts.value = [];
  showCustomerForm.value = true;'''
new_edit = '''  customerContacts.value = [];
  addressHistory.value = [];
  if (c.id) {
    fetchMapAddressHistory(c.id)
      .then((r) => { addressHistory.value = r.data || []; })
      .catch(() => {});
  }
  showCustomerForm.value = true;'''
assert old_edit in s
s=s.replace(old_edit,new_edit,1)

open(p,"w",encoding="utf-8",newline="").write(s)
print("ok")
