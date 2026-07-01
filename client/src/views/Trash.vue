<template>
  <div class="app-wrap">
    <header class="topbar">
      <div class="topbar-left"><span class="logo-dot" style="background:#e53935"></span><span class="logo-text">回收站</span></div>
      <div class="topbar-right">
        <router-link to="/" class="nav-btn">报价管理</router-link>
      </div>
    </header>
    <div class="main-area">
      <div class="info-row" style="margin-bottom:10px">
        <span class="stat-text">最近删除：<b>{{ list.length }}</b> 条（最多保留200条）</span>
        <button class="tb-btn danger" v-if="list.length" @click="clearAll">清空回收站</button>
      </div>
      <div class="table-shell">
        <table class="dt">
          <thead><tr>
            <th>时间</th><th>物料编码</th><th>物料名称</th><th>规格</th><th>含税价</th><th>未税价</th><th>币种</th><th>工厂</th><th>报价人</th><th>操作</th>
          </tr></thead>
          <tbody>
            <tr v-if="loading"><td colspan="10" class="empty"><van-loading size="20" /></td></tr>
            <tr v-else-if="!list.length"><td colspan="10" class="empty"><van-empty description="回收站为空" /></td></tr>
            <tr v-for="item in list" :key="item.id">
              <td>{{ (item.created_at||'').slice(0,10) }}</td>
              <td>{{ item.material_code||'-' }}</td>
              <td class="ellip">{{ item.material_name||'-' }}</td>
              <td class="muted">{{ item.material_spec||'-' }}</td>
              <td class="f-red">{{ item.price_with_tax!=null ? (item.currency==='USD'?'$':'¥')+Number(item.price_with_tax).toFixed(4) : '-' }}</td>
              <td class="f-orange">{{ item.price_without_tax!=null ? (item.currency==='USD'?'$':'¥')+Number(item.price_without_tax).toFixed(4) : '-' }}</td>
              <td>{{ item.currency||'CNY' }}</td>
              <td>{{ item.factory_code||'-' }}</td>
              <td>{{ item.quoter||'-' }}</td>
              <td class="act-col">
                <button class="row-btn edit" @click="restore(item.id)">恢复</button>
                <button class="row-btn del" @click="permanentDelete(item.id)">彻底删除</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { http } from '../utils/api'
import { showToast, showConfirmDialog } from 'vant'

const list = ref([])
const loading = ref(false)

async function loadTrash() {
  loading.value = true
  try { const r = await http.get('/prices/trash/list'); list.value = r.data.list } catch (e) { showToast('加载失败: ' + (e.message || '未知错误')) }
  loading.value = false
}
async function restore(id) {
  try { await http.post(`/prices/trash/restore/${id}`); showToast('已恢复'); loadTrash() } catch (e) { showToast('恢复失败: ' + (e.message || '未知错误')) }
}
async function permanentDelete(id) {
  try { await showConfirmDialog({ title: '彻底删除', message: '此操作不可恢复，确定？' }) } catch { return }
  try { await http.delete(`/prices/trash/${id}`); showToast('已删除'); loadTrash() } catch (e) { showToast('删除失败: ' + (e.message || '未知错误')) }
}
async function clearAll() {
  try { await showConfirmDialog({ title: '清空回收站', message: `确定彻底删除全部 ${list.value.length} 条？` }) } catch { return }
  try { await http.post('/prices/trash/clear'); showToast('已清空'); loadTrash() } catch (e) { showToast('清空失败: ' + (e.message || '未知错误')) }
}
onMounted(loadTrash)
</script>

<style scoped>
.app-wrap{display:flex;flex-direction:column;height:100vh;background:#f0f2f5}
.topbar{display:flex;align-items:center;justify-content:space-between;padding:0 20px;height:44px;background:#fff;border-bottom:1px solid #e8e8e8;flex-shrink:0}
.topbar-left{display:flex;align-items:center;gap:8px}
.logo-dot{width:8px;height:8px;border-radius:50%}
.logo-text{font-size:15px;font-weight:600;color:#323233}
.topbar-right{display:flex;align-items:center}
.nav-btn{background:transparent;color:#666;border:1px solid #d9d9d9;border-radius:4px;padding:4px 10px;font-size:12px;cursor:pointer;font-family:inherit;text-decoration:none}
.nav-btn:hover{color:var(--color-primary);border-color:var(--color-primary)}
.main-area{flex:1;overflow-y:auto;padding:16px 20px}
.info-row{display:flex;align-items:center;justify-content:space-between;background:#fff;padding:6px 14px;border-radius:8px;border:1px solid #e8e8e8}
.stat-text{font-size:12px;color:#888}.stat-text b{color:#323233;font-weight:600}
.table-shell{background:#fff;border-radius:8px;border:1px solid #e8e8e8;overflow:auto}
.dt{width:100%;border-collapse:collapse;font-size:12px}
.dt th{background:#fafafa;color:#888;font-weight:500;padding:8px 6px;text-align:left;white-space:nowrap;border-bottom:1px solid #e8e8e8;font-size:11px}
.dt td{padding:6px;border-bottom:1px solid #f5f5f5;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.empty{text-align:center!important;padding:48px 0!important}
.muted{color:#aaa}
.f-red{color:#e53935;font-weight:600}
.f-orange{color:#ef6c00;font-weight:500}
.ellip{overflow:hidden;text-overflow:ellipsis}
.act-col{display:flex;gap:3px}
.row-btn{padding:1px 7px;border-radius:3px;font-size:10px;cursor:pointer;border:1px solid;font-family:inherit;background:#fff}
.row-btn.edit{color:var(--color-primary);border-color:var(--color-primary)}.row-btn.edit:hover{background:rgba(var(--color-primary-rgb),.08)}
.row-btn.del{color:#ee0a24;border-color:#ee0a24}.row-btn.del:hover{background:#fff0f0}
.tb-btn{padding:4px 12px;border-radius:4px;font-size:11px;cursor:pointer;border:1px solid #d9d9d9;background:#fff;color:#555;font-family:inherit}
.tb-btn.danger{color:#ee0a24;border-color:#ee0a24}.tb-btn.danger:hover{background:#fff0f0}
</style>
