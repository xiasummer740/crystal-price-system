<template>
  <div>
    <div class="table-shell" ref="shellRef">
      <table class="dt" ref="tableRef">
        <thead>
          <tr>
            <th style="width:32px;text-align:center"><input type="checkbox" @change="toggleAll" :checked="allChecked" style="cursor:pointer"></th>
            <th data-col="0">登记时间<span class="resize-handle" @mousedown.prevent="startResize($event,0)"></span></th>
            <th data-col="1">物料编码<span class="col-filter" @click.stop="openColFilter('material_code','物料编码')">▾</span><span class="resize-handle" @mousedown.prevent="startResize($event,1)"></span></th>
            <th data-col="2">物料名称<span class="col-filter" @click.stop="openColFilter('material_name','物料名称')">▾</span><span class="resize-handle" @mousedown.prevent="startResize($event,2)"></span></th>
            <th data-col="3">规格<span class="col-filter" @click.stop="openColFilter('material_spec','规格')">▾</span><span class="resize-handle" @mousedown.prevent="startResize($event,3)"></span></th>
            <th data-col="4">品类<span class="col-filter" @click.stop="openColFilter('category','品类')">▾</span><span class="resize-handle" @mousedown.prevent="startResize($event,4)"></span></th>
            <th data-col="5">品牌<span class="col-filter" @click.stop="openColFilter('brand','品牌')">▾</span><span class="resize-handle" @mousedown.prevent="startResize($event,5)"></span></th>
            <th data-col="6">尺寸<span class="col-filter" @click.stop="openColFilter('dimension','尺寸')">▾</span><span class="resize-handle" @mousedown.prevent="startResize($event,6)"></span></th>
            <th data-col="7">PIN脚<span class="col-filter" @click.stop="openColFilter('pin_count','PIN脚')">▾</span><span class="resize-handle" @mousedown.prevent="startResize($event,7)"></span></th>
            <th data-col="8">频点<span class="col-filter" @click.stop="openColFilter('frequency','频点')">▾</span><span class="resize-handle" @mousedown.prevent="startResize($event,8)"></span></th>
            <th data-col="9">负载<span class="col-filter" @click.stop="openColFilter('load_cap','负载')">▾</span><span class="resize-handle" @mousedown.prevent="startResize($event,9)"></span></th>
            <th data-col="10">电压<span class="col-filter" @click.stop="openColFilter('voltage','电压')">▾</span><span class="resize-handle" @mousedown.prevent="startResize($event,10)"></span></th>
            <th data-col="11">模式<span class="col-filter" @click.stop="openColFilter('mode','模式')">▾</span><span class="resize-handle" @mousedown.prevent="startResize($event,11)"></span></th>
            <th data-col="12">频偏<span class="col-filter" @click.stop="openColFilter('freq_tol','频偏')">▾</span><span class="resize-handle" @mousedown.prevent="startResize($event,12)"></span></th>
            <th data-col="13">温度<span class="col-filter" @click.stop="openColFilter('temperature','温度')">▾</span><span class="resize-handle" @mousedown.prevent="startResize($event,13)"></span></th>
            <th data-col="14">含税价<span class="resize-handle" @mousedown.prevent="startResize($event,14)"></span></th>
            <th data-col="15">未税价<span class="resize-handle" @mousedown.prevent="startResize($event,15)"></span></th>
            <th data-col="16">币种<span class="resize-handle" @mousedown.prevent="startResize($event,16)"></span></th>
            <th data-col="17">工厂<span class="resize-handle" @mousedown.prevent="startResize($event,17)"></span></th>
            <th data-col="18">报价人<span class="resize-handle" @mousedown.prevent="startResize($event,18)"></span></th>
            <th data-col="19">交期<span class="col-filter" @click.stop="openColFilter('standard_lead_time','交期')">▾</span><span class="resize-handle" @mousedown.prevent="startResize($event,19)"></span></th>
            <th data-col="20">最小包装<span class="resize-handle" @mousedown.prevent="startResize($event,20)"></span></th>
            <th data-col="21">客户<span class="col-filter" @click.stop="openColFilter('first_inquiry_customer','客户')">▾</span><span class="resize-handle" @mousedown.prevent="startResize($event,21)"></span></th>
            <th data-col="22">备注<span class="resize-handle" @mousedown.prevent="startResize($event,22)"></span></th>
            <th data-col="23">操作<span class="resize-handle" @mousedown.prevent="startResize($event,23)"></span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading"><td colspan="25" class="empty"><van-loading size="20" /></td></tr>
          <tr v-else-if="!list.length"><td colspan="25" class="empty"><van-empty description="暂无数据" /></td></tr>
          <tr v-for="item in list" :key="item.id" :style="{ background: rowBg(item.material_code) }">
            <td style="text-align:center"><input type="checkbox" :checked="checkedIds.includes(item.id)" @change="toggleCheck(item.id)" style="cursor:pointer"></td>
            <td>{{ (item.created_at||'').slice(0,10) }}</td>
            <td><a v-if="item.material_code" class="clink" @click.stop="$emit('showDetail', item)">{{ item.material_code }}</a><span v-else class="clink" @click.stop="$emit('showDetail', item)">—</span></td>
            <td class="copyable" @click="copyText(item.material_name)" :title="'点击复制: '+item.material_name">{{ item.material_name||'-' }}</td>
            <td class="muted copyable" @click="copyText(item.material_spec)" :title="item.material_spec?'点击复制: '+item.material_spec:''">{{ item.material_spec||'-' }}</td>
            <td>{{ item.category||'-' }}</td>
            <td class="muted">{{ item.brand||'-' }}</td>
            <td class="muted">{{ item.dimension||'-' }}</td>
            <td class="muted">{{ item.pin_count||'-' }}</td>
            <td>{{ item.frequency||'-' }}</td>
            <td class="muted">{{ item.load_cap||'-' }}</td>
            <td class="muted">{{ item.voltage||'-' }}</td>
            <td class="muted">{{ item.mode||'-' }}</td>
            <td class="muted">{{ item.freq_tol||'-' }}</td>
            <td class="muted">{{ item.temperature||'-' }}</td>
            <td :class="item.currency==='USD'?'f-usd':'f-red'">{{ fmtPriceWithCNY(item.price_with_tax,item.currency) }}</td>
            <td :class="item.currency==='USD'?'f-usd-sub':'f-orange'">{{ fmtPrice(item.price_without_tax,item.currency) }}</td>
            <td><span class="ctag" :class="item.currency==='USD'?'u':'c'">{{ item.currency==='USD'?'USD':'CNY' }}</span></td>
            <td>{{ item.factory_code||'-' }}</td>
            <td>{{ item.quoter||'-' }}</td>
            <td>{{ item.standard_lead_time||'-' }}</td>
            <td class="muted">{{ item.min_package ? item.min_package+' pcs' : '-' }}</td>
            <td class="ellip" :title="item.first_inquiry_customer">{{ item.first_inquiry_customer||'-' }}</td>
            <td class="ellip" :title="item.remarks">{{ item.remarks||'-' }}</td>
            <td class="act-col">
              <a v-if="item.spec_document" class="spec-link" :href="item.spec_document" target="_blank" @click.prevent="openExternal(item.spec_document)">📄</a>
              <a v-if="rimgCount(item)" class="rimg-link" title="备注图片" @click.stop="previewRImgs(item)">📷<em v-if="rimgCount(item)>1">{{ rimgCount(item) }}</em></a>
              <span v-if="item.record_count>1 && item.factory_count>0" class="group-badge" @click.stop="$emit('showDetail', item)">{{ item.factory_count||0 }}厂 {{ item.record_count||0 }}条</span>
              <router-link v-if="item.record_count<=1" :to="'/edit/'+item.id" class="row-btn edit" @click.stop>改</router-link>
              <button v-if="item.record_count>1" class="row-btn edit" @click.stop="$emit('groupEdit', item)">改</button>
              <button class="row-btn del" @click.stop="$emit('delete', item)">删</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <van-image-preview v-model:show="showRPreview" :images="previewImgs" :start-position="previewIdx" closeable close-on-click-overlay @change="previewIdx = $event" />
    <div class="pager-bar">
      <div class="pager" v-if="total > pageSize">
        <button class="pg-btn" :disabled="page<=1" @click="$emit('pageChange', 1)">首页</button>
        <button class="pg-btn" :disabled="page<=1" @click="$emit('pageChange', page-1)">上一页</button>
        <span class="pg-info">{{ page }} / {{ Math.ceil(total/pageSize)||1 }}</span>
        <button class="pg-btn" :disabled="page>=Math.ceil(total/pageSize)" @click="$emit('pageChange', page+1)">下一页</button>
        <button class="pg-btn" :disabled="page>=Math.ceil(total/pageSize)" @click="$emit('pageChange', Math.ceil(total/pageSize))">尾页</button>
      </div>
      <select class="ps-select" :value="pageSize" @change="$emit('pageSizeChange', Number($event.target.value))">
        <option v-for="s in [20,50,100,200,500,1000,5000,10000]" :key="s" :value="s">{{ s }}条/页</option>
      </select>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
function openExternal(url) {
  if (!url) return
  if (url.startsWith('/api/specs/')) {
    window.electronAPI?.openSpec?.(url)
  } else {
    const fullUrl = url.startsWith('http') ? url : window.location.origin + url
    window.electronAPI?.openExternal?.(fullUrl) || window.open(fullUrl, '_blank')
  }
}

const props = defineProps({
  list: { type: Array, default: () => [] },
  total: { type: Number, default: 0 },
  loading: { type: Boolean, default: false },
  page: { type: Number, default: 1 },
  pageSize: { type: Number, default: 50 },
  checkedIds: { type: Array, default: () => [] },
})
const emit = defineEmits(['showDetail', 'delete', 'groupEdit', 'pageChange', 'pageSizeChange', 'update:checkedIds', 'openColFilter'])
const $router = useRouter()

const groupColors = ['#ffffff','#f4f7fb','#faf8f3','#f3f8f4','#f9f4f8']
function rowBg(code) { if(!code) return '#fff'; let h=0; for(let i=0;i<code.length;i++) h=((h<<5)-h)+code.charCodeAt(i)|0; return groupColors[Math.abs(h)%5] }
function fmtPrice(val, cur) { if(val==null||val==='') return '-'; return (cur==='USD'?'$':'¥')+Number(val).toFixed(4) }
function fmtPriceWithCNY(val, cur) { if(val==null||val==='') return '-'; if(cur==='USD'){const fx=Number(localStorage.getItem('crystal_rate'))||7;return '¥'+(val*fx).toFixed(4)}return (cur==='USD'?'$':'¥')+Number(val).toFixed(4) }
function copyText(t) { if(t) navigator.clipboard.writeText(String(t)).catch(()=>{}) }

const allChecked = computed(() => props.list.length>0 && props.checkedIds.length===props.list.length)
function toggleAll(e) { emit('update:checkedIds', e.target.checked ? props.list.map(r=>r.id) : []) }
function toggleCheck(id) {
  const ids = [...props.checkedIds]
  const idx = ids.indexOf(id)
  idx >= 0 ? ids.splice(idx, 1) : ids.push(id)
  emit('update:checkedIds', ids)
}

// 备注图片预览（主列表 📷 标识）
const showRPreview = ref(false)
const previewImgs = ref([])
const previewIdx = ref(0)
function parseRImgs(str) {
  try { const a = JSON.parse(str || '[]'); return Array.isArray(a) ? a : [] } catch { return [] }
}
function rimgCount(item) { return item && item.remark_images ? parseRImgs(item.remark_images).length : 0 }
function previewRImgs(item) {
  previewImgs.value = parseRImgs(item.remark_images)
  previewIdx.value = 0
  if (previewImgs.value.length) showRPreview.value = true
}
const shellRef = ref(null)
const tableRef = ref(null)
let resizeCol = -1
function startResize(e, col) { resizeCol = col; document.addEventListener('mousemove', onResize); document.addEventListener('mouseup', stopResize) }
function onResize(e) { if (resizeCol<0||!tableRef.value) return; const ths = tableRef.value.querySelectorAll('th'); if (ths[resizeCol]) ths[resizeCol].style.width = Math.max(40, e.clientX - ths[resizeCol].getBoundingClientRect().left) + 'px' }
function stopResize() { resizeCol = -1; document.removeEventListener('mousemove', onResize); document.removeEventListener('mouseup', stopResize) }
function openColFilter(col, label) { emit('openColFilter', col, label) }
</script>

<style>
.table-shell{background:#fff;border-radius:8px;border:1px solid #e8e8e8;overflow:visible;flex:1;display:flex;flex-direction:column}
.dt{width:max-content;min-width:100%;border-collapse:collapse;font-size:12px}
.dt th{background:#fafafa;color:#888;font-weight:500;padding:8px 6px;text-align:left;white-space:nowrap;border-bottom:1px solid #e8e8e8;font-size:11px;position:sticky;top:0;z-index:2}
.dt td{padding:6px;border-bottom:1px solid #f5f5f5;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dt tbody tr:hover td{background:rgba(var(--color-primary-rgb),.04)!important}
.resize-handle{position:absolute;right:0;top:0;bottom:0;width:5px;cursor:col-resize;z-index:3}
.resize-handle:hover{background:rgba(var(--color-primary-rgb),.25)}
.empty{text-align:center!important;padding:48px 0!important}
.f-red{color:#e53935;font-weight:600;font-family:'SF Mono','Consolas',monospace}
.f-orange{color:#ef6c00;font-weight:500}
.f-usd{color:#0d47a1;font-weight:600;font-family:'SF Mono','Consolas',monospace}
.f-usd-sub{color:#1976d2;font-weight:500}
.clink{color:#1565c0;cursor:pointer;font-weight:600}.clink:hover{text-decoration:underline}
.copyable{cursor:pointer}.copyable:hover{background:#fff9c4}
.ctag{display:inline-block;padding:0 5px;border-radius:3px;font-size:10px;font-weight:600}
.ctag.c{background:#fff0f0;color:#c62828}.ctag.u{background:#e8f4fd;color:#0d47a1}
.act-col{white-space:nowrap;display:flex;align-items:center;gap:3px;flex-wrap:wrap}
.row-btn{padding:1px 7px;border-radius:3px;font-size:10px;cursor:pointer;border:1px solid;font-family:inherit;background:#fff;line-height:1.4}
.row-btn.edit{color:var(--color-primary);border-color:var(--color-primary);text-decoration:none}.row-btn.edit:hover{background:rgba(var(--color-primary-rgb),.06)}
.row-btn.del{color:#ee0a24;border-color:#ee0a24}.row-btn.del:hover{background:#fff0f0}
.group-badge{display:inline-block;padding:2px 6px;border-radius:4px;font-size:10px;cursor:pointer;background:#fff3e0;color:#e65100;border:1px solid #ffcc80;white-space:nowrap}
.group-badge:hover{background:#ffe0b2}
.rimg-link{display:inline-block;text-decoration:none;cursor:pointer;font-size:12px;line-height:1;position:relative;padding:2px}
.rimg-link em{position:absolute;top:-4px;right:-6px;background:#ee0a24;color:#fff;font-size:8px;font-style:normal;border-radius:8px;padding:0 3px;line-height:12px}
.rimg-link:hover{opacity:.7}
.col-filter{display:inline-block;color:#ccc;cursor:pointer;font-size:11px;margin-left:2px;padding:1px 3px;border-radius:2px;vertical-align:middle;position:relative;z-index:1}
.col-filter:hover{color:var(--color-primary);background:rgba(var(--color-primary-rgb),.08)}
.pager-bar{display:flex;justify-content:center;align-items:center;gap:16px;padding:12px 0 4px;white-space:nowrap}
.pager{display:flex;align-items:center;gap:6px}
.pg-btn{padding:4px 12px;border-radius:4px;font-size:12px;cursor:pointer;border:1px solid #d9d9d9;background:#fff;color:#555;font-family:inherit}
.pg-btn:hover:not(:disabled){color:var(--color-primary);border-color:var(--color-primary)}
.pg-btn:disabled{color:#ccc;cursor:not-allowed;background:#f5f5f5}
.pg-info{font-size:12px;color:#888;padding:0 4px}
.ps-select{padding:3px 6px;border-radius:4px;border:1px solid #d9d9d9;font-size:11px;color:#888;background:#fff;cursor:pointer;font-family:inherit;outline:none}
.ps-select:focus{border-color:var(--color-primary)}

/* ===== 移动端适配 ===== */
@media (max-width: 768px) {
  .table-shell{overflow-x:auto!important;-webkit-overflow-scrolling:touch}
  .table-shell::after{content:'← 左右滑动查看全部列 →';display:block;text-align:center;font-size:10px;color:#bbb;padding:4px 0;background:#fafafa;border-top:1px solid #f0f0f0;position:sticky;left:0}
  .dt{font-size:11px}
  .dt th,.dt td{padding:4px 3px;font-size:10px;white-space:nowrap}
  .dt th{font-size:10px}
  .act-col{gap:2px}
  .row-btn{font-size:9px;padding:1px 4px}
  .group-badge{font-size:9px;padding:1px 4px}
  .col-filter{font-size:9px}
  .pager-bar{flex-wrap:wrap;gap:8px;padding:8px 0}
  .pg-btn{font-size:10px;padding:3px 8px}
  .pg-info{font-size:11px}
  .ps-select{font-size:10px;padding:2px 4px}
  .ctag{font-size:9px;padding:0 3px}
  .resize-handle{display:none}
}
</style>
