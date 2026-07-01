<template>
  <div class="page-container">
    <div class="page-header">
      <van-icon name="arrow-left" class="back-btn" @click="$router.back()" />
      记录列表
    </div>
    <div class="page-content">
      <van-search v-model="store.filters.keyword" shape="round" placeholder="搜索..." @search="onSearch" @clear="onSearch" />

      <div class="filter-bar">
        <van-dropdown-menu>
          <van-dropdown-item v-model="store.filters.factory" :options="factoryOptions" title="工厂" placeholder="全部" @change="reload" />
          <van-dropdown-item v-model="store.filters.quoter" :options="quoterOptions" title="报价人" placeholder="全部" @change="reload" />
          <van-dropdown-item v-model="store.filters.currency" :options="currencyOptions" title="币种" placeholder="全部" @change="reload" />
        </van-dropdown-menu>
      </div>

      <van-pull-refresh v-model="refreshing" @refresh="onRefresh">
        <van-list v-model:loading="store.loading" :finished="finished" finished-text="没有更多了" @load="onLoadMore">
          <div v-if="!store.list.length && !store.loading">
            <van-empty description="暂无数据" />
          </div>
          <div v-for="item in store.list" :key="item.id" class="record-card" @click="router.push('/detail/'+item.id)">
            <div class="row"><span class="label">编码</span><span class="value">{{ item.material_code }}</span></div>
            <div class="row"><span class="label">名称</span><span class="value">{{ item.material_name }}</span></div>
            <div class="row"><span class="label">规格</span><span class="value">{{ item.material_spec || '-' }}</span></div>
            <div class="row"><span class="label">品类</span><span class="value">{{ item.category || '-' }}</span></div>
            <div class="row"><span class="label">含税价</span><span class="value price">{{ formatPrice(item.price_with_tax, item.currency) }}</span></div>
            <div class="row"><span class="label">未税价</span><span class="value price">{{ formatPrice(item.price_without_tax, item.currency) }}</span></div>
            <div class="row"><span class="label">币种</span><span class="value">{{ item.currency === 'USD' ? 'USD' : 'CNY' }}</span></div>
            <div class="row"><span class="label">工厂</span><span class="value">{{ item.factory_code || '-' }}</span></div>
            <div class="row"><span class="label">报价人</span><span class="value">{{ item.quoter || '-' }}</span></div>
            <div class="row"><span class="label">交期</span><span class="value">{{ item.standard_lead_time || '-' }}</span></div>
            <div class="row"><span class="label">客户</span><span class="value">{{ item.first_inquiry_customer || '-' }}</span></div>
            <div class="row"><span class="label">时间</span><span class="value">{{ (item.created_at||'').slice(0,10) }}</span></div>
            <div class="row" v-if="item.remarks"><span class="label">备注</span><span class="value">{{ item.remarks }}</span></div>
            <div class="card-actions">
              <button class="row-btn edit" @click.stop="router.push('/edit/'+item.id)">编辑</button>
              <button class="row-btn del" @click.stop="handleDelete(item)">删除</button>
            </div>
          </div>
        </van-list>
      </van-pull-refresh>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { usePriceStore } from '../stores/price.js'
import { showToast, showConfirmDialog } from 'vant'

const router = useRouter()
const store = usePriceStore()
const refreshing = ref(false)
let page = 1

const finished = computed(() => store.list.length >= store.total && store.total > 0)

const factoryOptions = computed(() => [{text:'全部工厂',value:''},...store.metaOptions.factories.map(f=>({text:f,value:f}))])
const quoterOptions = computed(() => [{text:'全部报价人',value:''},...store.metaOptions.quoters.map(q=>({text:q,value:q}))])
const currencyOptions = [{ text: '人民币', value: 'CNY' }, { text: '美元', value: 'USD' }]

function formatPrice(val, currency) {
  if (val == null) return '-'
  return (currency === 'USD' ? '$' : '¥') + Number(val).toFixed(4)
}

function reload() {
  page = 1
  store.setFilter('page', 1)
  store.loadList()
}

async function onRefresh() {
  page = 1
  store.setFilter('page', 1)
  await store.loadList()
  refreshing.value = false
}

async function onLoadMore() {
  page++
  store.setFilter('page', page)
  await store.loadList(true)
}

function onSearch() { reload() }

async function handleDelete(item) {
  try {
    await showConfirmDialog({ title: '确认删除', message: `确定要删除物料 ${item.material_code} 的报价吗？` })
    await store.remove(item.id)
    showToast('已删除')
    reload()
  } catch { /* cancelled */ }
}

onMounted(async () => {
  await store.loadMetaOptions()
  await store.loadList()
})
</script>

<style scoped>
.card-actions { display: flex; gap: 8px; margin-top: 8px; justify-content: flex-end; }
.row-btn{padding:2px 8px;border-radius:3px;font-size:11px;cursor:pointer;border:1px solid;font-family:inherit}
.row-btn.edit{background:#fff;color:var(--color-primary);border-color:var(--color-primary)}
.row-btn.del{background:#fff;color:#ee0a24;border-color:#ee0a24}
</style>
