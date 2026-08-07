<template>
  <div class="page-container">
    <div class="page-header"><van-icon name="arrow-left" class="back-btn" @click="$router.back()" />报价详情</div>
    <div class="page-content" v-if="detail">
      <van-cell-group inset title="基本信息">
        <van-cell title="物料编码" :value="detail.material_code||'-'" />
        <van-cell title="物料名称" :value="detail.material_name||'-'" />
        <van-cell title="物料规格" :value="detail.material_spec||'-'" />
        <van-cell title="物料品类" :value="detail.category||'-'" />
        <van-cell title="登记时间" :value="(detail.created_at||'').slice(0,10)" />
      </van-cell-group>

      <van-cell-group inset title="技术参数">
        <van-cell title="品牌" :value="detail.brand||'-'" />
        <van-cell title="尺寸规格" :value="detail.dimension||'-'" />
        <van-cell title="PIN脚" :value="detail.pin_count||'-'" />
        <van-cell title="频点" :value="detail.frequency||'-'" />
        <van-cell title="负载" :value="detail.load_cap||'-'" />
        <van-cell title="电压" :value="detail.voltage||'-'" />
        <van-cell title="模式" :value="detail.mode||'-'" />
        <van-cell title="频偏" :value="detail.freq_tol||'-'" />
      </van-cell-group>

      <van-cell-group inset title="价格信息">
        <van-cell title="含税价"><template #value><span class="price-text">{{ detail.price_with_tax!=null?fmtP(detail.price_with_tax,detail.currency):'-' }}</span></template></van-cell>
        <van-cell title="未税价"><template #value><span class="price-text">{{ detail.price_without_tax!=null?fmtP(detail.price_without_tax,detail.currency):'-' }}</span></template></van-cell>
        <van-cell title="币种" :value="detail.currency==='USD'?'美元 (USD)':'人民币 (CNY)'" />
      </van-cell-group>

      <van-cell-group inset title="工厂与人员">
        <van-cell title="工厂编号" :value="detail.factory_code||'-'" />
        <van-cell title="报价人" :value="detail.quoter||'-'" />
      </van-cell-group>

      <van-cell-group inset title="其他信息">
        <van-cell title="标准交期" :value="detail.standard_lead_time||'-'" />
        <van-cell title="规格书"><template #value><a v-if="detail.spec_document" :href="detail.spec_document" target="_blank" class="spec-link" @click.prevent="openExternal(detail.spec_document)">{{ decodeURIComponent(detail.spec_document.replace('/api/specs/','')) }}</a><span v-else>-</span></template></van-cell>
        <van-cell title="初次询价客户" :value="detail.first_inquiry_customer||'-'" />
        <van-cell title="备注" :label="detail.remarks||''" />
      </van-cell-group>

      <van-cell-group v-if="detail.remarkImages && detail.remarkImages.length" inset title="备注图片/文件">
        <div class="rimg-grid">
          <div v-for="(url,i) in detail.remarkImages" :key="i" class="rimg-item">
            <template v-if="isRImg(url)">
              <img :src="url" @click="rPreview=i; showRPreview=true" loading="lazy" />
            </template>
            <template v-else>
              <div class="rfile" @click="openRFile(url)">
                <span class="rfile-icon">{{ rFileIcon(url) }}</span>
                <span class="rfile-name">{{ rFileName(url) }}</span>
              </div>
            </template>
          </div>
        </div>
      </van-cell-group>
      <van-image-preview v-model:show="showRPreview" :images="detail.remarkImages || []" :start-position="rPreview" @change="rPreview = $event" />

      <div style="margin:24px 16px;display:flex;flex-direction:column;gap:10px">
        <button class="detail-btn primary" @click="router.push('/edit/'+detail.id)">编辑报价</button>
        <button class="detail-btn outline" @click="viewAllQuotes">查看此物料所有报价</button>
        <button class="detail-btn danger" @click="handleDelete">删除此条</button>
      </div>
    </div>
    <div v-else style="text-align:center;padding:60px;color:#999">加载中...</div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { usePriceStore } from '../stores/price.js'
function openExternal(url) {
  if (!url) return
  if (url.startsWith('/api/specs/')) {
    window.electronAPI?.openSpec?.(url)
  } else {
    const fullUrl = url.startsWith('http') ? url : window.location.origin + url
    window.electronAPI?.openExternal?.(fullUrl) || window.open(fullUrl, '_blank')
  }
}
import { showConfirmDialog, showToast } from 'vant'

const route = useRoute()
const router = useRouter()
const store = usePriceStore()
const detail = ref(null)

const showRPreview = ref(false)
const rPreview = ref(0)
function isRImg(url) {
  return /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?|$)/i.test(url)
}
function rFileIcon(url) {
  const ext = url.split('?')[0].split('.').pop()?.toLowerCase() || ''
  if (['pdf'].includes(ext)) return '📄'
  if (['doc','docx'].includes(ext)) return '📝'
  if (['xls','xlsx','csv'].includes(ext)) return '📊'
  if (['zip','rar','7z'].includes(ext)) return '📦'
  if (['txt','json','xml','md'].includes(ext)) return '📃'
  return '📎'
}
function rFileName(url) {
  const nameMatch = url.match(/[?&]name=([^&]+)/)
  if (nameMatch) { try { return decodeURIComponent(nameMatch[1]) } catch {} }
  const p = url.split('?')[0].split('/').pop()
  try { return decodeURIComponent(p) } catch { return p }
}
function openRFile(url) {
  const name = rFileName(url)
  fetch(url).then(r => r.blob()).then(blob => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = name
    a.click()
    URL.revokeObjectURL(a.href)
  }).catch(() => window.open(url, '_blank'))
}

function fmtP(val,cur) { return (cur==='USD'?'$':'¥')+Number(val).toFixed(4) }
function viewAllQuotes() { if(detail.value) { store.setFilter('keyword', detail.value.material_code||''); store.setFilter('page', 1); router.push('/') } }
async function handleDelete() { try { await showConfirmDialog({title:'确认删除',message:`删除物料「${detail.value.material_code}」的报价？`}); await store.remove(detail.value.id); showToast('已删除'); router.push('/') } catch{} }
onMounted(async ()=>{
  detail.value = await store.loadDetail(route.params.id)
  try { const a = JSON.parse(detail.value.remark_images || '[]'); detail.value.remarkImages = Array.isArray(a) ? a : [] } catch { detail.value.remarkImages = [] }
})
</script>

<style scoped>
.price-text{color:#e53935;font-weight:600;font-size:16px}
.spec-link{color:var(--color-primary);text-decoration:none;word-break:break-all;font-size:13px}
.spec-link:hover{text-decoration:underline}
.detail-btn{display:block;width:100%;padding:10px;border-radius:24px;font-size:14px;font-weight:500;cursor:pointer;text-align:center;border:none;font-family:inherit}
.detail-btn.primary{background:var(--color-primary);color:#fff}
.detail-btn.outline{background:transparent;color:var(--color-primary);border:1px solid var(--color-primary)}
.detail-btn.danger{background:transparent;color:#ee0a24;border:1px solid #ee0a24}

/* ===== 备注图片/文件 ===== */
.rimg-grid { display: flex; flex-wrap: wrap; gap: 8px; padding: 10px 16px; }
.rimg-item { position: relative; width: 72px; height: 72px; border-radius: 8px; overflow: hidden; border: 1px solid #eee; background: #fafafa; }
.rimg-item img { width: 100%; height: 100%; object-fit: cover; cursor: pointer; }
.rimg-item .rfile { width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer; color: #666; }
.rimg-item .rfile-icon { font-size: 22px; }
.rimg-item .rfile-name { font-size: 9px; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 0 2px; }

/* ===== 移动端适配 ===== */
@media (max-width: 768px) {
  .detail-btn{font-size:13px;padding:10px}
  .price-text{font-size:15px}
  .spec-link{font-size:12px}
}
</style>
