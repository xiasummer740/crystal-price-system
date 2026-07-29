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
function openExternal(url) { window.electronAPI?.openExternal?.(url) || window.open(url, '_blank') }
import { showConfirmDialog, showToast } from 'vant'

const route = useRoute()
const router = useRouter()
const store = usePriceStore()
const detail = ref(null)

function fmtP(val,cur) { return (cur==='USD'?'$':'¥')+Number(val).toFixed(4) }
function viewAllQuotes() { if(detail.value) { store.setFilter('keyword', detail.value.material_code||''); store.setFilter('page', 1); router.push('/') } }
async function handleDelete() { try { await showConfirmDialog({title:'确认删除',message:`删除物料「${detail.value.material_code}」的报价？`}); await store.remove(detail.value.id); showToast('已删除'); router.push('/') } catch{} }
onMounted(async ()=>{ detail.value = await store.loadDetail(route.params.id) })
</script>

<style scoped>
.price-text{color:#e53935;font-weight:600;font-size:16px}
.spec-link{color:var(--color-primary);text-decoration:none;word-break:break-all;font-size:13px}
.spec-link:hover{text-decoration:underline}
.detail-btn{display:block;width:100%;padding:10px;border-radius:24px;font-size:14px;font-weight:500;cursor:pointer;text-align:center;border:none;font-family:inherit}
.detail-btn.primary{background:var(--color-primary);color:#fff}
.detail-btn.outline{background:transparent;color:var(--color-primary);border:1px solid var(--color-primary)}
.detail-btn.danger{background:transparent;color:#ee0a24;border:1px solid #ee0a24}

/* ===== 移动端适配 ===== */
@media (max-width: 768px) {
  .detail-btn{font-size:13px;padding:10px}
  .price-text{font-size:15px}
  .spec-link{font-size:12px}
}
</style>
