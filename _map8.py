p="client/src/views/MapAddresses.vue"
s=open(p,encoding="utf-8").read()

# 1) 搜索选点：GCJ02 → WGS84 再入表单/标记（修复钉子偏移）
old1='''  if (selectedMode.value === 'pick' && r.lat && r.lng) {
    setFormCoords(r.lat, r.lng);
    placePickMarker(r.lat, r.lng);
    mapSetView(r.lat, r.lng, 16);
  } else {'''
new1='''  if (selectedMode.value === 'pick' && r.lat && r.lng) {
    const w = gcj02ToWgs84(r.lat, r.lng);
    setFormCoords(w.lat, w.lng);
    placePickMarker(w.lat, w.lng);
    mapSetView(r.lat, r.lng, 16);
    fillAddressFromCoords(w.lat, w.lng);
  } else {'''
assert old1 in s
s=s.replace(old1,new1,1)

# 2) 替换 Leaflet 的 map.setView
s=s.replace('map.setView(ll(slat, slng), 16);','mapSetView(wgs84ToGcj02(slat, slng).lat, wgs84ToGcj02(slat, slng).lng, 16);')

# 3) 坐标反查地址函数
old3='''function centerMapForPick() {'''
new3='''async function fillAddressFromCoords(lat, lng) {
  if (!lat || !lng) return;
  if (String(customerForm.address || '').trim()) return;
  try {
    const r = await myReverseGeocode(lat, lng);
    const addr = r?.data?.address || '';
    if (addr) {
      customerForm.address = addr;
      showToast('已按坐标带出地址');
    }
  } catch {}
}

function centerMapForPick() {'''
assert old3 in s
s=s.replace(old3,new3,1)

# 4) 点地图后自动带地址
old4='''  setFormCoords(wgs.lat, wgs.lng);'''
new4='''  setFormCoords(wgs.lat, wgs.lng);
  fillAddressFromCoords(wgs.lat, wgs.lng);'''
assert old4 in s
s=s.replace(old4,new4,1)

# 5) 编辑已有客户：有坐标没地址 → 自动反查
old5='''  addressHistory.value = [];
  if (c.id) {'''
new5='''  addressHistory.value = [];
  if (c.latitude && c.longitude && !String(c.address || '').trim()) {
    fillAddressFromCoords(c.latitude, c.longitude);
  }
  if (c.id) {'''
assert old5 in s
s=s.replace(old5,new5,1)

# 6) 表单加「按坐标补地址」按钮
old6='''        <div class="coord-pick-simple">
          <button class="coord-btn" @click="startCoordPick">📍 在地图选点定位</button>
        </div>'''
new6='''        <div class="coord-pick-simple">
          <button class="coord-btn" @click="startCoordPick">📍 在地图选点定位</button>
          <button v-if="customerForm.latitude && customerForm.longitude" class="coord-btn" @click="fillAddressFromCoords(customerForm.latitude, customerForm.longitude)" title="用当前坐标反查地址">🏠 按坐标补地址</button>
        </div>'''
assert old6 in s
s=s.replace(old6,new6,1)
open(p,"w",encoding="utf-8",newline="").write(s)
print("ok")
