p="client/src/views/MapAddresses.vue"
s=open(p,encoding="utf-8").read()

# 1) 覆盖概览卡片
old='''        <!-- 定位状态筛选（全部/已定位/未定位） -->'''
new='''        <!-- 覆盖概览 -->
        <div class="coverage-card">
          <div class="cv-item"><b>{{ customers.length }}</b><span>客户</span></div>
          <div class="cv-item"><b>{{ locatedCount }}</b><span>已定位</span></div>
          <div class="cv-item"><b>{{ locatedRate }}%</b><span>定位率</span></div>
          <div class="cv-item"><b>{{ monthNew }}</b><span>本月新增</span></div>
          <div class="cv-top" v-if="topProvinces.length">覆盖：{{ topProvinces.join(' · ') }}</div>
        </div>

        <!-- 定位状态筛选（全部/已定位/未定位） -->'''
assert old in s
s=s.replace(old,new,1)

# 2) 附近按钮
old2='''                  <button v-if="c.latitude && c.longitude" @click.stop="navCustomer(c)" title="用高德导航过去">🧭 导航</button>'''
new2='''                  <button v-if="c.latitude && c.longitude" @click.stop="openNearby(c)" title="看 50 公里内的其他客户">📍 附近</button>
                  <button v-if="c.latitude && c.longitude" @click.stop="navCustomer(c)" title="用高德导航过去">🧭 导航</button>'''
assert old2 in s
s=s.replace(old2,new2,1)

# 3) 附近弹窗（放在客户表单弹窗前）
old3='''    <!-- ===== 客户表单弹出层 ===== -->'''
new3='''    <!-- ===== 附近客户 ===== -->
    <van-popup v-model:show="showNearby" round position="bottom" :style="{ maxHeight: '70%' }" closeable>
      <div class="nearby-wrap">
        <h3>附近客户 <small v-if="nearbyBase">（{{ nearbyBase.name }} 周边 50km）</small></h3>
        <div v-if="!nearbyList.length" class="inline-empty">50 公里内没有其他已定位客户</div>
        <div v-for="n in nearbyList" :key="n.c.id" class="nearby-row">
          <div class="nearby-main" @click="locateCustomer(n.c); showNearby = false">
            <div class="nearby-name">{{ n.c.name }}</div>
            <div class="nearby-sub">{{ n.km.toFixed(1) }} km · {{ truncate(n.c.address || '', 26) }}</div>
          </div>
          <button class="nearby-btn" @click="navCustomer(n.c)">🧭 导航</button>
        </div>
      </div>
    </van-popup>

    <!-- ===== 客户表单弹出层 ===== -->'''
assert old3 in s
s=s.replace(old3,new3,1)

# 4) 状态 + 计算 + 函数
old4='''const addressHistory = ref([])'''
new4='''const addressHistory = ref([])
const showNearby = ref(false)
const nearbyBase = ref(null)
const nearbyList = ref([])

const locatedRate = computed(() => customers.value.length ? Math.round(locatedCount.value / customers.value.length * 100) : 0)
const monthNew = computed(() => {
  const ym = new Date().toISOString().slice(0, 7)
  return customers.value.filter(c => String(c.created_at || '').startsWith(ym)).length
})
const topProvinces = computed(() => {
  const map = {}
  for (const c of customers.value) {
    const p = extractProvince(c.address) || '其他'
    map[p] = (map[p] || 0) + 1
  }
  return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([p, n]) => `${p} ${n}`)
})'''
assert old4 in s
s=s.replace(old4,new4,1)

old5='''function callCustomer(c) {'''
new5='''function openNearby(c) {
  if (!c.latitude || !c.longitude) return showToast('该客户还没有坐标')
  nearbyBase.value = c
  const list = []
  for (const o of customers.value) {
    if (o.id === c.id || !o.latitude || !o.longitude) continue
    const R = 6371
    const toRad = (d) => d * Math.PI / 180
    const dLat = toRad(o.latitude - c.latitude)
    const dLng = toRad(o.longitude - c.longitude)
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(c.latitude)) * Math.cos(toRad(o.latitude)) * Math.sin(dLng / 2) ** 2
    const km = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    if (km <= 50) list.push({ c: o, km })
  }
  list.sort((a, b) => a.km - b.km)
  nearbyList.value = list.slice(0, 12)
  showNearby.value = true
}

function callCustomer(c) {'''
assert old5 in s
s=s.replace(old5,new5,1)

# 5) CSS
css = '''
/* 覆盖概览 */
.coverage-card { margin: 8px 10px 2px; padding: 8px; border-radius: 8px; background: #f7f9fc; border: 1px solid #eef2f7; }
.cv-item { display: inline-flex; flex-direction: column; align-items: center; min-width: 56px; margin-right: 8px; }
.cv-item b { font-size: 15px; color: #1f2937; }
.cv-item span { font-size: 10px; color: #98a2b3; }
.cv-top { margin-top: 4px; font-size: 11px; color: #667085; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* 附近客户 */
.nearby-wrap { padding: 16px; }
.nearby-wrap h3 { margin: 0 0 8px; font-size: 15px; }
.nearby-wrap h3 small { color: #98a2b3; font-size: 11px; font-weight: normal; }
.nearby-row { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px dashed #eef0f3; }
.nearby-main { flex: 1; min-width: 0; cursor: pointer; }
.nearby-name { font-size: 13px; color: #1f2937; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nearby-sub { font-size: 11px; color: #98a2b3; margin-top: 2px; }
.nearby-btn { border: 1px solid #d0d5dd; background: #fff; border-radius: 6px; padding: 4px 8px; font-size: 12px; cursor: pointer; }
'''
idx=s.rfind("</style>")
s=s[:idx]+css+"\n"+s[idx:]
open(p,"w",encoding="utf-8",newline="").write(s)
print("ok")
