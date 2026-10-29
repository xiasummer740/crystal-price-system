p="client/src/views/MapAddresses.vue"
s=open(p,encoding="utf-8").read()

# 1) 过滤条
old='''        <!-- 区域分组筛选（省→市层级） -->'''
new='''        <!-- 定位状态筛选（全部/已定位/未定位） -->
        <div class="loc-filter">
          <span class="loc-chip" :class="{ active: locFilter === 'all' }" @click="locFilter = 'all'">全部 {{ customers.length }}</span>
          <span class="loc-chip" :class="{ active: locFilter === 'located' }" @click="locFilter = 'located'">已定位 {{ locatedCount }}</span>
          <span class="loc-chip" :class="{ active: locFilter === 'unlocated' }" @click="locFilter = 'unlocated'">未定位 {{ unlocatedCount }}</span>
        </div>

        <!-- 区域分组筛选（省→市层级） -->'''
assert old in s
s=s.replace(old,new,1)

# 2) 卡片快捷操作
old2='''                  <span v-if="c.phone" class="cc-tel">📞 {{ c.phone }}</span>
                </div>'''
new2='''                  <span v-if="c.phone" class="cc-tel">📞 {{ c.phone }}</span>
                </div>
                <div class="cc-actions">
                  <button v-if="c.phone" @click.stop="callCustomer(c)" title="打电话">📞 电话</button>
                  <button v-if="c.latitude && c.longitude" @click.stop="navCustomer(c)" title="用高德导航过去">🧭 导航</button>
                  <button v-if="c.address" @click.stop="copyAddr(c)" title="复制地址">📋 地址</button>
                </div>'''
assert old2 in s
s=s.replace(old2,new2,1)

# 3) 脚本状态与函数
old3='''const filteredCustomers = computed(() => {
  let list = customers.value;'''
new3='''const locFilter = ref('all')
const locatedCount = computed(() => customers.value.filter(c => c.latitude && c.longitude).length)
const unlocatedCount = computed(() => customers.value.length - locatedCount.value)

const filteredCustomers = computed(() => {
  let list = customers.value;
  if (locFilter.value === 'located') list = list.filter(c => c.latitude && c.longitude)
  else if (locFilter.value === 'unlocated') list = list.filter(c => !c.latitude || !c.longitude)'''
assert old3 in s
s=s.replace(old3,new3,1)

# 4) 函数
old4='''function toggleRegion(region) {'''
new4='''function callCustomer(c) {
  if (!c.phone) return
  window.location.href = 'tel:' + String(c.phone).replace(/[^\\d+]/g, '')
}
function navCustomer(c) {
  if (!c.latitude || !c.longitude) return
  const gcj = wgs84ToGcj02(c.latitude, c.longitude)
  const url = `https://uri.amap.com/marker?position=${gcj.lng},${gcj.lat}&name=${encodeURIComponent(c.name)}&src=crystal&coordinate=gaode&callnative=1`
  if (window.electronAPI?.openExternal) window.electronAPI.openExternal(url)
  else window.open(url, '_blank')
}
async function copyAddr(c) {
  if (!c.address) return
  try { await navigator.clipboard.writeText(c.address); showToast('地址已复制') }
  catch { showToast('复制失败') }
}

function toggleRegion(region) {'''
assert old4 in s
s=s.replace(old4,new4,1)

# 5) CSS 放在 <style 后
style_anchor = "<style"
idx = s.index(style_anchor)
insert_at = s.index(">", idx) + 1
css = '''
/* 定位状态筛选 */
.loc-filter { display: flex; gap: 6px; padding: 8px 10px 4px; flex-wrap: wrap; }
.loc-chip { font-size: 12px; padding: 3px 10px; border-radius: 12px; background: #f2f4f7; color: #475467; cursor: pointer; user-select: none; }
.loc-chip.active { background: var(--color-primary, #1677ff); color: #fff; }
.cc-actions { display: flex; gap: 6px; margin-top: 6px; }
.cc-actions button { border: 1px solid #e4e7ec; background: #fff; color: #475467; border-radius: 5px; font-size: 11px; padding: 2px 7px; cursor: pointer; }
.cc-actions button:hover { border-color: var(--color-primary, #1677ff); color: var(--color-primary, #1677ff); }
'''
s = s[:insert_at] + css + s[insert_at:]

open(p,"w",encoding="utf-8",newline="").write(s)
print("ok")
