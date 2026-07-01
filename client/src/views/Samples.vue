<template>
  <div class="app-wrap">
    <header class="topbar">
      <div class="topbar-left"><span class="logo-dot"></span><span class="logo-text">样品登记</span></div>
      <div class="topbar-right">
        <router-link to="/" class="nav-btn">报价管理</router-link>
      </div>
    </header>
    <div class="main-area">
      <div class="toolbar">
        <div class="search-box">
          <svg class="search-icon" viewBox="0 0 24 24" width="15" height="15" fill="#999"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
          <input v-model="keyword" placeholder="搜索编码、名称、品牌…" @input="onSearchDebounced" @keydown.enter="reload" class="search-input" />
          <span v-if="keyword" class="search-clear" @click="keyword='';reload()">&#10005;</span>
        </div>
        <van-button v-if="checkedIds.length" type="danger" size="small" @click="batchDelete">删除({{checkedIds.length}})</van-button>
        <van-button type="primary" icon="plus" size="small" @click="openAdd">新增</van-button>
        <van-button icon="orders-o" size="small" @click="handleImport">导入</van-button>
        <van-button icon="description" size="small" plain @click="downloadTemplate">模板</van-button>
        <van-button icon="down" size="small" @click="handleExport">导出</van-button>
        <van-button icon="filter-o" size="small" @click="showAdvFilter = true">高级筛选</van-button>
        <input ref="fileInput" type="file" accept=".xlsx,.xls" hidden @change="onFileChange" />
      </div>
      <div class="info-row">
        <div class="filter-group">
          <van-dropdown-menu active-color="var(--color-primary)">
            <van-dropdown-item v-model="filterFactory" :options="factoryOptions" title="工厂" @change="reload" />
            <van-dropdown-item v-model="filterBrand" :options="brandOptions" title="品牌" @change="reload" />
          </van-dropdown-menu>
        </div>
        <span class="stat-text">共 <b>{{ total }}</b> 条</span>
      </div>

      <!-- 列筛选标签 -->
      <div class="col-filter-tags" v-if="activeFilters.length">
        <span v-for="f in activeFilters" :key="f.column" class="cf-tag">
          {{ colLabels[f.column] || f.column }}: {{ f.value }}
          <span class="cf-tag-close" @click="removeColFilter(f.column)">×</span>
        </span>
        <button class="cf-clear" @click="clearAllColFilters">清除全部</button>
      </div>

      <div class="table-shell" ref="shellRef">
        <table class="dt" ref="tableRef">
          <thead><tr>
            <th style="width:32px;text-align:center"><input type="checkbox" @change="toggleAll" :checked="allChecked" style="cursor:pointer"></th>
            <th data-col="0">时间<span class="resize-handle" @mousedown.prevent="startResize($event,0)"></span></th>
            <th data-col="1">品牌<span class="col-filter" @click.stop="openColFilter('brand','品牌')">▾</span><span class="resize-handle" @mousedown.prevent="startResize($event,1)"></span></th>
            <th data-col="2">尺寸<span class="col-filter" @click.stop="openColFilter('dimension','尺寸')">▾</span><span class="resize-handle" @mousedown.prevent="startResize($event,2)"></span></th>
            <th data-col="3">频点<span class="col-filter" @click.stop="openColFilter('frequency','频点')">▾</span><span class="resize-handle" @mousedown.prevent="startResize($event,3)"></span></th>
            <th data-col="4">负载<span class="col-filter" @click.stop="openColFilter('load_cap','负载')">▾</span><span class="resize-handle" @mousedown.prevent="startResize($event,4)"></span></th>
            <th data-col="5">模式<span class="col-filter" @click.stop="openColFilter('mode','模式')">▾</span><span class="resize-handle" @mousedown.prevent="startResize($event,5)"></span></th>
            <th data-col="6">物料编码<span class="col-filter" @click.stop="openColFilter('material_code','物料编码')">▾</span><span class="resize-handle" @mousedown.prevent="startResize($event,6)"></span></th>
            <th data-col="7">物料名称<span class="col-filter" @click.stop="openColFilter('material_name','物料名称')">▾</span><span class="resize-handle" @mousedown.prevent="startResize($event,7)"></span></th>
            <th data-col="8">本价含税<span class="resize-handle" @mousedown.prevent="startResize($event,8)"></span></th>
            <th data-col="9">工厂<span class="resize-handle" @mousedown.prevent="startResize($event,9)"></span></th>
            <th data-col="10">库存<span class="resize-handle" @mousedown.prevent="startResize($event,10)"></span></th>
            <th data-col="11">备注<span class="resize-handle" @mousedown.prevent="startResize($event,11)"></span></th>
            <th data-col="12">操作<span class="resize-handle" @mousedown.prevent="startResize($event,12)"></span></th>
          </tr></thead>
          <tbody>
            <tr v-if="loadError"><td colspan="14" class="empty" style="color:#e53935">{{ loadError }}</td></tr>
            <tr v-else-if="loading"><td colspan="14" class="empty"><van-loading size="20" /></td></tr>
            <tr v-else-if="!list.length"><td colspan="14" class="empty"><van-empty description="暂无数据" /></td></tr>
            <tr v-for="item in list" :key="item.id">
              <td style="text-align:center"><input type="checkbox" v-model="checkedIds" :value="item.id" style="cursor:pointer"></td>
              <td>{{ (item.created_at||'').slice(0,10) }}</td>
              <td>{{ item.brand||'-' }}</td>
              <td class="muted">{{ item.dimension||'-' }}</td>
              <td>{{ item.frequency||'-' }}</td>
              <td class="muted">{{ item.load_cap||'-' }}</td>
              <td>{{ item.mode||'-' }}</td>
              <td class="copyable" @click="copyText(item.material_code)" :title="item.material_code?'点击复制: '+item.material_code:''">{{ item.material_code||'-' }}</td>
              <td class="copyable" @click="copyText(item.material_name)" :title="item.material_name?'点击复制: '+item.material_name:''">{{ item.material_name||'-' }}</td>
              <td class="f-red">{{ fmtP(item.cost_price) }}</td>
              <td>{{ item.factory_code||'-' }}</td>
              <td :class="item.stock_quantity<10?'low-stock':''">{{ item.stock_quantity||0 }}</td>
              <td class="ellip" :title="item.remarks">{{ item.remarks||'-' }}</td>
              <td class="act-col">
                <button class="row-btn edit" @click="openEdit(item)">改</button>
                <button class="row-btn del" @click="handleDelete(item)">删</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="pager-bar">
        <div class="pager" v-if="total>pageSize">
          <button class="pg-btn" :disabled="page<=1" @click="page=1;reload()">首页</button>
          <button class="pg-btn" :disabled="page<=1" @click="page--;reload()">上一页</button>
          <span class="pg-info">{{ page }} / {{ Math.ceil(total/pageSize)||1 }}</span>
          <button class="pg-btn" :disabled="page>=Math.ceil(total/pageSize)" @click="page++;reload()">下一页</button>
          <button class="pg-btn" :disabled="page>=Math.ceil(total/pageSize)" @click="page=Math.ceil(total/pageSize);reload()">尾页</button>
        </div>
        <select class="ps-select" :value="pageSize" @change="pageSize=Number($event.target.value);localStorage.setItem('crystal_samples_pageSize',$event.target.value);page=1;reload()">
          <option v-for="s in [20,50,100,200,500,1000,5000,10000]" :key="s" :value="s">{{ s }}条/页</option>
        </select>
      </div>
    </div>

    <!-- 高级筛选 -->
    <van-popup v-model:show="showAdvFilter" round position="bottom" :style="{ height:'65%' }" closeable safe-area-inset-bottom>
      <div class="adv-wrap">
        <h4 class="adv-title">高级筛选</h4>
        <div class="adv-rows">
          <div v-for="(f, i) in advFilters" :key="i" class="adv-row">
            <select v-model="f.field" class="adv-sel"><option value="">选择字段</option><option v-for="o in advFieldOptions" :key="o.value" :value="o.value">{{ o.label }}</option></select>
            <select v-model="f.op" class="adv-sel adv-op"><option value="contains">包含</option><option value="equals">等于</option><option value="starts">开头是</option><option value="ends">结尾是</option><option value="gt">&gt;</option><option value="lt">&lt;</option><option value="empty">为空</option><option value="nempty">不为空</option></select>
            <input v-if="f.op!=='empty'&&f.op!=='nempty'" v-model="f.value" class="adv-input" placeholder="输入值" />
            <button class="adv-del" @click="advFilters.splice(i,1)">×</button>
          </div>
        </div>
        <button class="adv-add" @click="advFilters.push({field:'',op:'contains',value:''})">＋ 添加条件</button>
        <div class="adv-btns"><button class="adv-reset" @click="resetAdvFilter">重置</button><button class="adv-apply" @click="applyAdvFilter">应用筛选</button></div>
      </div>
    </van-popup>

    <!-- 列筛选弹出层 -->
    <van-popup v-model:show="showColFilter" round position="bottom" :style="{ height:'60%' }" closeable @closed="colFilterClosed">
      <div class="cf-pop">
        <div class="cf-pop-head">
          <h4>筛选「{{ colFilterLabel }}」</h4>
          <van-search v-model="colFilterKw" shape="round" placeholder="搜索值..." @update:model-value="onColFilterSearch" />
        </div>
        <div class="cf-pop-list" v-if="colFilterValues.length">
          <div class="cf-pop-item" v-for="v in colFilterValues" :key="v" @click="applyColFilter(v)">{{ v }}</div>
        </div>
        <div class="cf-pop-empty" v-else-if="!colFilterLoading">
          <van-empty description="无匹配数据" />
        </div>
        <div class="cf-pop-loading" v-if="colFilterLoading" style="text-align:center;padding:20px">
          <van-loading size="20" />
        </div>
      </div>
    </van-popup>

    <!-- 新增/编辑 -->
    <van-popup v-model:show="showForm" position="right" :style="{ width:'88%', height:'100%' }" closeable>
      <div class="form-panel">
        <h3>{{ editingId?'编辑':'新增' }}样品</h3>
        <van-field v-model="form.brand" label="品牌" placeholder="如：TXC" />
        <van-field v-model="form.dimension" label="尺寸规格" placeholder="如：3.2×2.5mm" />
        <van-field v-model="form.pin_count" label="PIN脚" placeholder="如：4PIN" />
        <van-field v-model="form.frequency" label="频点" placeholder="如：32.768KHz" />
        <van-field v-model="form.load_cap" label="负载" placeholder="如：12.5pF" />
        <van-field v-model="form.voltage" label="电压" placeholder="如：3.3V" />
        <van-field v-model="form.mode" label="模式" placeholder="如：基频" />
        <van-field v-model="form.freq_tol" label="频偏" placeholder="如：±20ppm" />
        <van-field v-model="form.material_code" label="物料编码" placeholder="物料编码" />
        <van-field v-model="form.material_name" label="物料名称" placeholder="物料名称" />
        <van-field v-model="form.material_spec" label="规格" placeholder="规格型号" />
        <van-field v-model.number="form.price_with_tax" label="含税价" type="number" placeholder="含税价" @change="onPriceWithTaxChangeS" />
        <van-field v-model.number="form.cost_price" label="本价含税" type="number" placeholder="本价含税" @change="onCostPriceChangeS" />
        <van-field v-model="form.factory_code" label="工厂" placeholder="工厂编号" />
        <van-field v-model.number="form.stock_quantity" label="库存数量" type="digit" placeholder="0" />
        <van-field v-model="form.spec_document" label="规格书" placeholder="链接或路径" />
        <van-field v-model="form.remarks" label="备注" placeholder="备注" type="textarea" rows="2" autosize />
        <div class="form-btns">
          <van-button block plain @click="showForm=false">取消</van-button>
          <van-button block type="primary" :loading="saving" @click="handleSave">{{ editingId?'保存':'提交' }}</van-button>
        </div>
      </div>
    </van-popup>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { http, importSamples } from '../utils/api.js'
import { showToast, showConfirmDialog } from 'vant'

const list = ref([])
const total = ref(0)
const loading = ref(false)
const loadError = ref('')
const keyword = ref('')
const filterFactory = ref('')
const filterBrand = ref('')
const page = ref(1)
const pageSize = ref(Number(localStorage.getItem('crystal_samples_pageSize')) || 50)
const factoryOptions = ref([])
const brandOptions = ref([])
const showForm = ref(false)
const editingId = ref(null)
const saving = ref(false)
const fileInput = ref(null)
const checkedIds = ref([])
const tableRef = ref(null)
// 列筛选状态
const showColFilter = ref(false)
const colFilterCol = ref('')
const colFilterLabel = ref('')
const colFilterValues = ref([])
const colFilterKw = ref('')
const colFilterLoading = ref(false)
let colFilterTimer = null
const columnFilters = ref({})
const activeFilters = ref([])
const colLabels = { brand:'品牌',dimension:'尺寸',pin_count:'PIN脚',frequency:'频点',load_cap:'负载',mode:'模式',voltage:'电压',freq_tol:'频偏',material_code:'物料编码',material_name:'物料名称',material_spec:'规格',factory_code:'工厂' }
// 高级筛选
const showAdvFilter = ref(false)
const advFilters = ref([{field:'',op:'contains',value:''}])
const advMultiFilter = ref('')
const advFieldOptions = [
  {label:'物料编码',value:'material_code'},{label:'物料名称',value:'material_name'},{label:'物料规格',value:'material_spec'},
  {label:'品牌',value:'brand'},{label:'尺寸',value:'dimension'},{label:'频点',value:'frequency'},
  {label:'负载',value:'load_cap'},{label:'模式',value:'mode'},{label:'含税价',value:'price_with_tax'},
  {label:'本价',value:'cost_price'},{label:'工厂',value:'factory_code'},{label:'库存',value:'stock_quantity'},{label:'备注',value:'remarks'}
]
function applyAdvFilter() {
  const valid = advFilters.value.filter(f => f.field)
  advMultiFilter.value = valid.length ? JSON.stringify(valid) : ''
  showAdvFilter.value = false
  page.value = 1
  reload()
}
function resetAdvFilter() {
  advFilters.value = [{field:'',op:'contains',value:''}]
  advMultiFilter.value = ''
  showAdvFilter.value = false
  page.value = 1
  reload()
}

const allChecked = computed(() => list.value.length>0 && checkedIds.value.length===list.value.length)
function toggleAll(e) { checkedIds.value = e.target.checked ? list.value.map(r=>r.id) : [] }
async function batchDelete() { if(!checkedIds.value.length)return;try { await showConfirmDialog({title:'批量删除',message:`确定删除已选中的 ${checkedIds.value.length} 条记录？`}) } catch { return }; try { await http.post('/samples/batch-delete',{ids:checkedIds.value}); checkedIds.value=[]; showToast('已删除'); reload() } catch(e) { showToast('删除失败: '+(e.message||'未知错误')) } }
const form = ref({ material_code:'',material_name:'',material_spec:'',brand:'',dimension:'',pin_count:'',frequency:'',load_cap:'',voltage:'',mode:'',freq_tol:'',price_with_tax:null,cost_price:null,factory_code:'',stock_quantity:0,spec_document:'',remarks:'' })

function fmtP(v) { return v!=null&&v!==''?'¥'+Number(v).toFixed(4):'-' }
const autoTaxRateS = () => Number(localStorage.getItem('crystal_taxRate')) || 13
function onPriceWithTaxChangeS() { const v = form.value.price_with_tax; if (v && !form.value.cost_price) { form.value.cost_price = parseFloat((v / (1 + autoTaxRateS()/100)).toFixed(4)) } }
function onCostPriceChangeS() { const v = form.value.cost_price; if (v && !form.value.price_with_tax) { form.value.price_with_tax = parseFloat((v * (1 + autoTaxRateS()/100)).toFixed(4)) } }
async function reload() { loadError.value=''; loading.value=true; try { const params={page:page.value,pageSize:pageSize.value,keyword:keyword.value,factory:filterFactory.value,brand:filterBrand.value,...columnFilters.value}; if(advMultiFilter.value) params.multiFilter=advMultiFilter.value; const r=await http.get('/samples',{params}); list.value=r.data.list; total.value=r.data.total } catch(e){ loadError.value='加载失败: '+(e.message||'未知错误') } finally{loading.value=false} }
let searchTimer = null
function onSearchDebounced() { clearTimeout(searchTimer); searchTimer = setTimeout(() => { page.value = 1; reload() }, 350) }
async function loadOptions() { try{const r=await http.get('/samples/meta/options');factoryOptions.value=[{text:'全部工厂',value:''},...r.data.factories.map(f=>({text:f,value:f}))];brandOptions.value=[{text:'全部品牌',value:''},...r.data.brands.map(b=>({text:b,value:b}))]}catch(e){ loadError.value='选项加载失败: '+(e.message||'') } }

// 列筛选
async function openColFilter(col, label) {
  colFilterCol.value = col; colFilterLabel.value = label; colFilterKw.value = ''; colFilterValues.value = []; colFilterLoading.value = true; showColFilter.value = true
  try { const r = await http.get(`/samples/column-values/${col}`); colFilterValues.value = r.data || [] } catch (e) { showToast('加载失败') }
  colFilterLoading.value = false
}
function onColFilterSearch(kw) {
  clearTimeout(colFilterTimer)
  colFilterTimer = setTimeout(async () => {
    colFilterLoading.value = true
    try { const r = await http.get(`/samples/column-values/${colFilterCol.value}?keyword=${encodeURIComponent(kw)}`); colFilterValues.value = r.data || [] } catch {}
    colFilterLoading.value = false
  }, 300)
}
function applyColFilter(v) {
  columnFilters.value[colFilterCol.value] = v
  const existing = activeFilters.value.findIndex(f => f.column === colFilterCol.value)
  if (existing >= 0) activeFilters.value[existing].value = v
  else activeFilters.value.push({ column: colFilterCol.value, value: v })
  showColFilter.value = false; page.value = 1; reload()
}
function removeColFilter(col) {
  delete columnFilters.value[col]
  activeFilters.value = activeFilters.value.filter(f => f.column !== col)
  page.value = 1; reload()
}
function clearAllColFilters() {
  columnFilters.value = {}
  activeFilters.value = []
  page.value = 1; reload()
}
function colFilterClosed() { colFilterCol.value = ''; colFilterValues.value = []; colFilterKw.value = '' }
// 复制
function copyText(t) { if(!t) return; navigator.clipboard?.writeText(t).then(()=>showToast('已复制')).catch(()=>{}) }
// 列宽拖拽
let resizing=null
function startResize(e,colIdx){if(!tableRef.value)return;const ths=tableRef.value.querySelectorAll('th');const th=ths[Number(colIdx)+1];if(!th)return;resizing={colIdx,startX:e.clientX,startW:th.offsetWidth||80,th};document.addEventListener('mousemove',onResize);document.addEventListener('mouseup',stopResize);document.body.style.cursor='col-resize';document.body.style.userSelect='none'}
function onResize(e){if(!resizing)return;const diff=e.clientX-resizing.startX;const newW=Math.max(40,resizing.startW+diff);resizing.th.style.width=newW+'px';resizing.th.style.minWidth=newW+'px'}
function stopResize(){resizing=null;document.removeEventListener('mousemove',onResize);document.removeEventListener('mouseup',stopResize);document.body.style.cursor='';document.body.style.userSelect=''}
function openAdd(){editingId.value=null;form.value={material_code:'',material_name:'',material_spec:'',brand:'',dimension:'',pin_count:'',frequency:'',load_cap:'',voltage:'',mode:'',freq_tol:'',price_with_tax:null,cost_price:null,factory_code:'',stock_quantity:0,spec_document:'',remarks:''};showForm.value=true}
function openEdit(item){editingId.value=item.id;form.value={...item};showForm.value=true}
async function handleSave(){saving.value=true;try{if(editingId.value){await http.put(`/samples/${editingId.value}`,form.value);showToast('修改成功')}else{await http.post('/samples',form.value);showToast('新增成功')}showForm.value=false;reload()}catch(e){showToast('操作失败')}finally{saving.value=false}}
async function handleDelete(item){try{await showConfirmDialog({title:'确认删除',message:`删除样品「${item.material_code||item.material_name}」？`})}catch{return};try{await http.delete(`/samples/${item.id}`);showToast('已删除');reload()}catch(e){showToast('删除失败: '+(e.message||'未知错误'))}}
function downloadTemplate(){const a=document.createElement('a');a.href='/api/samples/template';a.download='样品导入模板.xlsx';a.click()}
function handleImport(){fileInput.value?.click()}
async function onFileChange(e){const f=e.target.files[0];if(!f)return;const d=new FormData();d.append('file',f);try{const r=await importSamples(d);showToast(r.msg||'导入成功');reload()}catch(e){showToast('导入失败: '+(e.message||''))};fileInput.value.value=''}
function handleExport(){const p=new URLSearchParams();if(keyword.value)p.set('keyword',keyword.value);if(filterFactory.value)p.set('factory',filterFactory.value);if(filterBrand.value)p.set('brand',filterBrand.value);for(const [k,v] of Object.entries(columnFilters.value)) p.set(k,v);window.open('/api/samples/export?'+p.toString(),'_blank')}
onMounted(()=>{loadOptions();reload()})
</script>

<style scoped>
.app-wrap{display:flex;flex-direction:column;height:100vh;background:#f0f2f5}
.topbar{display:flex;align-items:center;justify-content:space-between;padding:0 20px;height:44px;background:linear-gradient(135deg,#1a1a2e,#16213e);flex-shrink:0}
.topbar-left{display:flex;align-items:center;gap:8px}
.logo-dot{width:8px;height:8px;border-radius:50%;background:#4fc3f7;box-shadow:0 0 6px rgba(79,195,247,.5)}
.logo-text{font-size:15px;font-weight:500;color:#e8e8e8;letter-spacing:1px}
.nav-btn{background:transparent;color:#ccc;border:1px solid rgba(255,255,255,.25);border-radius:4px;padding:4px 10px;font-size:12px;cursor:pointer;font-family:inherit;text-decoration:none;display:inline-block}
.nav-btn:hover{color:#fff;border-color:rgba(255,255,255,.5)}
.row-btn{padding:2px 8px;border-radius:3px;font-size:11px;cursor:pointer;border:1px solid;font-family:inherit}
.row-btn.edit{background:#fff;color:var(--color-primary);border-color:var(--color-primary)}
.row-btn.del{background:#fff;color:#ee0a24;border-color:#ee0a24}
.main-area{flex:1;overflow:auto;padding:0 10px 16px;display:flex;flex-direction:column}
.toolbar{display:flex;align-items:center;gap:6px;padding:8px 0 6px}
.search-box{display:flex;align-items:center;background:#f5f6f8;border-radius:6px;padding:0 10px;flex:1;max-width:300px;height:34px;gap:6px}
.search-box:focus-within{background:#fff;box-shadow:0 0 0 1px var(--color-primary)}
.search-icon{flex-shrink:0}
.search-input{flex:1;border:none;outline:none;background:transparent;font-size:13px;color:#323233;font-family:inherit;height:100%}
.search-input::placeholder{color:#bbb}
.search-clear{cursor:pointer;color:#999;font-size:14px;line-height:1;flex-shrink:0}
.search-clear:hover{color:#ee0a24}
.info-row{display:flex;align-items:center;justify-content:space-between;background:#fff;padding:3px 10px;border-radius:6px;margin-bottom:4px;box-shadow:0 1px 2px rgba(0,0,0,.03)}
.filter-group{display:flex;align-items:center;gap:4px}
.stat-text{font-size:12px;color:#888}.stat-text b{color:#323233;font-weight:600}
.table-shell{background:#fff;border-radius:6px;box-shadow:0 1px 4px rgba(0,0,0,.05);overflow:visible;flex:1}
.dt{width:max-content;min-width:100%;border-collapse:collapse;font-size:12px}
.dt th{background:#f5f6f8;color:#666;font-weight:600;padding:7px 6px;text-align:left;white-space:nowrap;border-bottom:2px solid #e8e8e8;font-size:11px;position:relative}
.dt td{padding:5px 6px;border-bottom:1px solid #f0f0f0;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dt tbody tr:hover td{background:#e3f0fc}
.resize-handle{position:absolute;right:0;top:0;bottom:0;width:5px;cursor:col-resize;z-index:3}
.resize-handle:hover{background:rgba(var(--color-primary-rgb),.25)}
.copyable{cursor:pointer}.copyable:hover{background:#fff9c4}
.empty{text-align:center!important;padding:48px 0!important}
.muted{color:#aaa}
.f-red{color:#e53935;font-weight:600}
.low-stock{color:#e53935;font-weight:600}
.act-col{white-space:nowrap;display:flex;align-items:center;gap:2px}
.ellip{overflow:hidden;text-overflow:ellipsis}
.pager{display:flex;justify-content:center;align-items:center;gap:6px;padding:8px 0 4px;white-space:nowrap}
.pg-btn{padding:4px 10px;border-radius:4px;font-size:11px;cursor:pointer;border:1px solid #d9d9d9;background:#fff;color:#555;font-family:inherit}
.pg-btn:hover:not(:disabled){color:var(--color-primary);border-color:var(--color-primary)}
.pg-btn:disabled{color:#ccc;cursor:not-allowed;background:#f5f5f5}
.pg-info{font-size:12px;color:#888;padding:0 4px}
.form-panel{padding:20px 16px;overflow-y:auto;height:100%}
.form-panel h3{font-size:18px;margin-bottom:14px}
.form-btns{display:flex;gap:12px;margin-top:16px}
/* 列筛选 */
.col-filter{display:inline-block;color:#ccc;cursor:pointer;font-size:11px;margin-left:2px;padding:1px 3px;border-radius:2px;vertical-align:middle;position:relative;z-index:1}
.col-filter:hover{color:var(--color-primary);background:rgba(var(--color-primary-rgb),.08)}
.col-filter-tags{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:4px}
.cf-tag{display:inline-flex;align-items:center;gap:4px;background:rgba(var(--color-primary-rgb),.08);color:var(--color-primary);padding:2px 8px;border-radius:4px;font-size:11px}
.cf-tag-close{cursor:pointer;font-weight:600;font-size:13px;line-height:1}
.cf-tag-close:hover{color:#ee0a24}
.cf-clear{background:transparent;border:1px solid #e8e8e8;color:#999;padding:2px 8px;border-radius:4px;font-size:11px;cursor:pointer;font-family:inherit}
.cf-clear:hover{color:#ee0a24;border-color:#ee0a24}
.cf-pop{display:flex;flex-direction:column;height:100%}
.cf-pop-head{padding:12px 16px 0;flex-shrink:0}
.cf-pop-head h4{font-size:16px;margin:0 0 8px}
.cf-pop-head :deep(.van-search){padding:0!important;margin-bottom:8px}
.cf-pop-list{flex:1;overflow-y:auto;padding:0 16px 16px}
.cf-pop-item{padding:10px 12px;border-bottom:1px solid #f5f5f5;font-size:13px;cursor:pointer;color:#323233}
.cf-pop-item:hover{background:#f5f6f8;color:var(--color-primary)}
.cf-pop-item:last-child{border-bottom:none}
.cf-pop-empty{flex:1;display:flex;align-items:center;justify-content:center}
/* 高级筛选 */
.adv-wrap{padding:20px 16px;height:100%;display:flex;flex-direction:column}
.adv-title{font-size:16px;font-weight:600;margin:0 0 12px}
.adv-rows{flex:1;overflow-y:auto}
.adv-row{display:flex;gap:6px;margin-bottom:8px}
.adv-sel{padding:6px 8px;border-radius:4px;border:1px solid #d9d9d9;font-size:12px;font-family:inherit;background:#fff;outline:none}
.adv-sel:focus{border-color:var(--color-primary)}
.adv-op{width:80px;flex-shrink:0}
.adv-input{flex:1;padding:6px 8px;border-radius:4px;border:1px solid #d9d9d9;font-size:12px;outline:none;font-family:inherit;min-width:0}
.adv-input:focus{border-color:var(--color-primary)}
.adv-del{width:28px;height:28px;border-radius:4px;border:none;background:#ffebee;color:#c62828;cursor:pointer;font-size:14px;flex-shrink:0;font-family:inherit}
.adv-del:hover{background:#ffcdd2}
.adv-add{display:inline-flex;align-items:center;gap:4px;padding:6px 14px;border-radius:4px;border:1px dashed #d9d9d9;background:#fff;color:var(--color-primary);font-size:12px;cursor:pointer;margin-top:8px;font-family:inherit}
.adv-add:hover{border-color:var(--color-primary);background:rgba(var(--color-primary-rgb),.08)}
.adv-btns{display:flex;gap:10px;margin-top:12px;padding-top:12px;border-top:1px solid #f0f0f0}
.adv-reset{flex:1;padding:8px;border-radius:6px;border:1px solid #d9d9d9;background:#fff;color:#666;font-size:13px;cursor:pointer;font-family:inherit}
.adv-apply{flex:1;padding:8px;border-radius:6px;border:none;background:var(--color-primary);color:#fff;font-size:13px;cursor:pointer;font-family:inherit}
.adv-apply:hover{background:#1676d9}
</style>
