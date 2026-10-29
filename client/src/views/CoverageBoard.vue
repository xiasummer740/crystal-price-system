<template>
  <div class="cov-page">
    <header class="cov-header">
      <button class="back-btn" @click="$router.back()">‹</button>
      <h3>覆盖看板</h3>
      <span class="cov-sub">客户分布 / 定位率 / 本月新增</span>
      <button class="cov-btn" @click="load" :disabled="loading">{{ loading ? '刷新中…' : '刷新' }}</button>
    </header>

    <main class="cov-main">
      <section class="cov-cards">
        <div class="cov-card"><b>{{ total }}</b><span>客户总数</span></div>
        <div class="cov-card"><b>{{ located }}</b><span>已定位</span></div>
        <div class="cov-card"><b>{{ rate }}%</b><span>定位率</span></div>
        <div class="cov-card"><b>{{ monthNew }}</b><span>本月新增</span></div>
        <div class="cov-card"><b>{{ provinces.length }}</b><span>覆盖省份</span></div>
        <div class="cov-card"><b>{{ cities.length }}</b><span>覆盖城市</span></div>
      </section>

      <section class="cov-grid">
        <div class="cov-panel">
          <div class="cov-panel-head"><h4>按省份</h4><span>客户数 / 已定位</span></div>
          <div v-for="p in provinces" :key="p.name" class="cov-row">
            <span class="cov-name">{{ p.name }}</span>
            <div class="cov-bar"><i :style="{ width: p.rate + '%' }"></i></div>
            <span class="cov-num">{{ p.located }}/{{ p.total }} · {{ p.rate }}%</span>
          </div>
          <div v-if="!provinces.length" class="cov-empty">暂无数据</div>
        </div>

        <div class="cov-panel">
          <div class="cov-panel-head"><h4>按城市 Top 12</h4><span>客户数</span></div>
          <div v-for="c in cities" :key="c.name" class="cov-row">
            <span class="cov-name">{{ c.name }}</span>
            <div class="cov-bar city"><i :style="{ width: c.pct + '%' }"></i></div>
            <span class="cov-num">{{ c.total }}</span>
          </div>
          <div v-if="!cities.length" class="cov-empty">暂无数据</div>
        </div>
      </section>

      <section class="cov-panel" v-if="unlocatedList.length">
        <div class="cov-panel-head"><h4>未定位客户</h4><span>{{ unlocatedList.length }} 家</span></div>
        <div class="cov-unlocated">
          <div v-for="c in unlocatedList.slice(0, 60)" :key="c.id" class="cov-ul-row">
            <span class="cov-ul-name">{{ c.name }}</span>
            <span class="cov-ul-addr">{{ c.address || '（没填地址）' }}</span>
            <a class="cov-ul-link" :href="'#/map-addresses'" @click.prevent="goMap(c.name)">去地图处理</a>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { showNotify } from 'vant'
import { fetchMapCustomers } from '../utils/api.js'

const router = useRouter()
const list = ref([])
const loading = ref(false)

const PROVINCES = ['北京', '天津', '上海', '重庆', '河北', '山西', '辽宁', '吉林', '黑龙江', '江苏', '浙江', '安徽', '福建', '江西', '山东', '河南', '湖北', '湖南', '广东', '海南', '四川', '贵州', '云南', '陕西', '甘肃', '青海', '台湾', '内蒙古', '广西', '西藏', '宁夏', '新疆', '香港', '澳门']

function provinceOf(address) {
  const s = String(address || '')
  for (const p of PROVINCES) if (s.includes(p)) return p
  return '其他'
}
function cityOf(address) {
  const s = String(address || '')
  const m = s.match(/([\u4e00-\u9fa5]{2,8}市)/)
  return m ? m[1] : ''
}
function isLocated(c) { return !!(c.latitude && c.longitude) }

const total = computed(() => list.value.length)
const located = computed(() => list.value.filter(isLocated).length)
const rate = computed(() => total.value ? Math.round(located.value / total.value * 100) : 0)
const monthNew = computed(() => {
  const ym = new Date().toISOString().slice(0, 7)
  return list.value.filter(c => String(c.created_at || '').startsWith(ym)).length
})

const provinces = computed(() => {
  const map = new Map()
  for (const c of list.value) {
    const p = provinceOf(c.address)
    if (!map.has(p)) map.set(p, { name: p, total: 0, located: 0 })
    const o = map.get(p)
    o.total++
    if (isLocated(c)) o.located++
  }
  return [...map.values()]
    .map(o => ({ ...o, rate: o.total ? Math.round(o.located / o.total * 100) : 0 }))
    .sort((a, b) => b.total - a.total)
})

const cities = computed(() => {
  const map = new Map()
  for (const c of list.value) {
    const city = cityOf(c.address)
    if (!city) continue
    map.set(city, (map.get(city) || 0) + 1)
  }
  const arr = [...map.entries()].map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total).slice(0, 12)
  const max = arr[0]?.total || 1
  return arr.map(x => ({ ...x, pct: Math.round(x.total / max * 100) }))
})

const unlocatedList = computed(() => list.value.filter(c => !isLocated(c)))

function goMap(name) {
  router.push({ path: '/map-addresses', query: { q: name } })
}

async function load() {
  loading.value = true
  try {
    const r = await fetchMapCustomers({})
    list.value = r.data || []
  } catch (e) {
    showNotify({ type: 'danger', message: '读取失败：' + (e.message || '未知错误') })
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.cov-page { min-height: 100vh; background: #f0f2f5; }
.cov-header { background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); color: #e8e8e8; padding: 10px 20px; display: flex; align-items: center; gap: 10px; position: sticky; top: 0; z-index: 20; }
.back-btn { background: rgba(255,255,255,.12); border: none; color: #fff; width: 30px; height: 30px; border-radius: 50%; font-size: 18px; cursor: pointer; }
.cov-header h3 { margin: 0; font-size: 16px; }
.cov-sub { color: #98a2b3; font-size: 12px; flex: 1; }
.cov-btn { border: 1px solid rgba(255,255,255,.2); background: rgba(255,255,255,.1); color: #e5e7eb; border-radius: 6px; padding: 6px 12px; font-size: 12px; cursor: pointer; }
.cov-main { max-width: 1200px; margin: 0 auto; padding: 14px 16px 40px; }
.cov-cards { display: grid; grid-template-columns: repeat(6, 1fr); gap: 10px; margin-bottom: 12px; }
.cov-card { background: #fff; border-radius: 10px; padding: 14px 10px; text-align: center; box-shadow: 0 1px 2px rgba(16,24,40,.05); }
.cov-card b { display: block; font-size: 22px; color: #1f2937; }
.cov-card span { color: #98a2b3; font-size: 11px; }
.cov-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; }
.cov-panel { background: #fff; border-radius: 10px; padding: 14px 16px; box-shadow: 0 1px 2px rgba(16,24,40,.05); }
.cov-panel-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 8px; }
.cov-panel-head h4 { margin: 0; font-size: 14px; }
.cov-panel-head span { color: #98a2b3; font-size: 11px; }
.cov-row { display: flex; align-items: center; gap: 8px; padding: 5px 0; font-size: 12px; }
.cov-name { flex: 0 0 72px; color: #344054; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cov-bar { flex: 1; height: 8px; background: #f2f4f7; border-radius: 4px; overflow: hidden; }
.cov-bar i { display: block; height: 100%; background: linear-gradient(90deg, #36cfc9, #1677ff); border-radius: 4px; }
.cov-bar.city i { background: linear-gradient(90deg, #ffd666, #fa8c16); }
.cov-num { flex: 0 0 96px; text-align: right; color: #667085; font-size: 11px; }
.cov-empty { color: #98a2b3; font-size: 12px; padding: 12px 0; }
.cov-unlocated { display: flex; flex-direction: column; }
.cov-ul-row { display: flex; align-items: center; gap: 10px; padding: 6px 0; border-bottom: 1px dashed #eef0f3; font-size: 12px; }
.cov-ul-name { flex: 0 0 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cov-ul-addr { flex: 1; color: #98a2b3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cov-ul-link { color: #1677ff; text-decoration: none; }
@media (max-width: 900px) {
  .cov-cards { grid-template-columns: repeat(3, 1fr); }
  .cov-grid { grid-template-columns: 1fr; }
  .cov-ul-name { flex-basis: 120px; }
}
</style>
