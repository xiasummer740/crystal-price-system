<template>
  <div class="app-wrap">
    <header class="topbar">
      <div class="topbar-left"><span class="logo-dot"></span><span class="logo-text">晶振报价系统</span><span class="version-badge">v{{ appVersion }}</span><span v-if="isDev" class="dev-badge">开发版</span></div>
      <div class="topbar-right">
        <span class="clock-display" :title="clockDate">
          <span class="clock-dot"></span>{{ clockTime }}
        </span>
        <button class="nav-btn" style="margin-right:6px;background:#fff7e6;color:#d48806;border-color:#ffe58f;cursor:pointer" @click="openNotesWin">📝 记事</button>
        <router-link to="/translator" class="nav-btn" style="margin-right:6px;background:#f0f6ff;color:#1565c0;border-color:#bbdefb">规格书翻译</router-link>
        <router-link to="/samples" class="nav-btn" style="margin-right:6px">样品登记</router-link>
        <router-link to="/trash" class="nav-btn" style="margin-right:6px;color:#e53935;border-color:#ffcdd2">回收站</router-link>
        <router-link to="/mobile" class="nav-btn">手机版</router-link>
	        <button class="nav-btn" style="margin-left:6px;background:#f6ffed;color:#52c41a;border-color:#b7eb8f" @click="openDataFolder">📁 数据目录</button>
      </div>
    </header>

    <div class="main-area">
      <!-- 工具条 -->
      <div class="toolbar">
        <div class="search-box">
          <svg class="search-icon" viewBox="0 0 24 24" width="15" height="15" fill="#999"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
          <input v-model="store.filters.keyword" placeholder="搜索编码、名称、品牌…" @input="onSearchDebounced" @keydown.enter="onSearch" class="search-input" />
          <span v-if="store.filters.keyword" class="search-clear" @click="store.filters.keyword='';onSearch()">&#10005;</span>
        </div>
        <button v-if="checkedIds.length" class="tb-btn danger" @click="batchDelete">删除 {{ checkedIds.length }}</button>
        <router-link to="/add" class="tb-btn primary" style="text-decoration:none">&#65291; 新增报价</router-link>
        <button class="tb-btn" @click="handleImport">导入</button>
        <button class="tb-btn" @click="downloadTemplate">模板</button>
        <button class="tb-btn" @click="handleExport">导出</button>
        <button class="tb-btn adv-btn" @click="showAdvFilter = true">高级筛选</button>
        <button class="tb-btn" @click="showSettings = true">⚙</button>
        <button class="tb-btn calc-btn" @click="showCalc = true">&#128290; 报价计算器</button>
        <input ref="fileInput" type="file" accept=".xlsx,.xls" hidden @change="onFileChange" />
      </div>

      <!-- 筛选 + 统计 -->
      <div class="info-row">
        <div class="filter-group">
          <van-dropdown-menu active-color="#1989fa">
            <van-dropdown-item v-model="store.filters.factory" :options="factoryOptions" title="工厂" @change="reload" />
            <van-dropdown-item v-model="store.filters.quoter" :options="quoterOptions" title="报价人" @change="reload" />
            <van-dropdown-item v-model="store.filters.currency" :options="currencyOptions" title="币种" @change="reload" />
            <van-dropdown-item v-model="store.filters.category" :options="catFilterOptions" title="品类" @change="reload" />
          </van-dropdown-menu>
          <span class="fdiv"></span>
          <van-field v-model="store.filters.startDate" type="date" placeholder="起始日期" class="date-field" @change="reload" />
          <span class="date-arrow">&#8594;</span>
          <van-field v-model="store.filters.endDate" type="date" placeholder="截止日期" class="date-field" @change="reload" />
          <button v-if="hasFilter" class="reset-btn" @click="resetAll">&#8634; 重置</button>
        </div>
        <div class="stat-group">
          <span class="stat-dot"></span> 共 <b>{{ store.total }}</b> 条 &#183; <b>{{ factoryCount }}</b> 工厂 &#183; <b>{{ materialKinds }}</b> 物料
        </div>
      </div>

      <!-- 列筛选标签 -->
      <div class="col-filter-tags" v-if="store.activeColumnFilters.length">
        <span v-for="f in store.activeColumnFilters" :key="f.column" class="cf-tag">
          {{ colLabel(f.column) }}: {{ f.value }}
          <span class="cf-tag-close" @click="removeColFilter(f.column)">×</span>
        </span>
        <button class="cf-clear" @click="clearAllColFilters">清除全部</button>
      </div>

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
            <tr v-if="store.loading"><td colspan="25" class="empty"><van-loading size="20" /></td></tr>
            <tr v-else-if="!store.list.length"><td colspan="25" class="empty"><van-empty description="暂无数据" /></td></tr>
            <tr v-for="item in store.list" :key="item.id" :style="{ background: rowBg(item.material_code) }">
              <td style="text-align:center"><input type="checkbox" v-model="checkedIds" :value="item.id" style="cursor:pointer"></td>
              <td>{{ (item.created_at||'').slice(0,10) }}</td>
              <td><a v-if="item.material_code" class="clink" @click.stop="showDetail(item)">{{ item.material_code }}</a><span v-else class="clink" @click.stop="router.push('/detail/'+item.id)">—</span></td>
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
                <a v-if="item.spec_document" class="spec-link" :href="item.spec_document" target="_blank">&#128196;</a>
                <span v-if="item.record_count>1 && item.factory_count>0" class="group-badge" @click.stop="showDetail(item)">{{ item.factory_count||0 }}厂 {{ item.record_count||0 }}条</span>
                <router-link v-if="item.record_count<=1" :to="'/edit/'+item.id" class="row-btn edit" @click.stop>改</router-link>
                <button v-if="item.record_count>1" class="row-btn edit" @click.stop="openGroupEdit(item)">改</button>
                <button class="row-btn del" @click.stop="handleDelete(item)">删</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="pager-bar">
        <div class="pager" v-if="store.total > store.filters.pageSize">
          <button class="pg-btn" :disabled="store.filters.page<=1" @click="store.setFilter('page',1);reload()">首页</button>
          <button class="pg-btn" :disabled="store.filters.page<=1" @click="store.setFilter('page',store.filters.page-1);reload()">上一页</button>
          <span class="pg-info">{{ store.filters.page }} / {{ Math.ceil(store.total/store.filters.pageSize)||1 }}</span>
          <button class="pg-btn" :disabled="store.filters.page>=Math.ceil(store.total/store.filters.pageSize)" @click="store.setFilter('page',store.filters.page+1);reload()">下一页</button>
          <button class="pg-btn" :disabled="store.filters.page>=Math.ceil(store.total/store.filters.pageSize)" @click="store.setFilter('page',Math.ceil(store.total/store.filters.pageSize));reload()">尾页</button>
        </div>
        <select class="ps-select" :value="store.filters.pageSize" @change="store.setPageSize(Number($event.target.value));reload()">
          <option v-for="s in [20,50,100,200,500,1000,5000,10000]" :key="s" :value="s">{{ s }}条/页</option>
        </select>
      </div>
      <div class="lan-tip">手机端访问：同一 WiFi，浏览器访问 <strong>http://{{ localIp }}:3266</strong> ｜ <a href="/使用手册.html" target="_blank" style="color:#1989fa">使用手册</a></div>
    </div>

    <!-- 列筛选弹出层 -->
    <van-popup v-model:show="showColFilter" round position="bottom" :style="{ height:'60%' }" closeable @closed="colFilterClosed">
      <div class="cf-pop">
        <div class="cf-pop-head">
          <h4>筛选「{{ colFilterLabel }}」</h4>
          <van-search v-model="colFilterKw" shape="round" placeholder="搜索值..." @update:model-value="onColFilterSearch" />
        </div>
        <div class="cf-pop-list" v-if="colFilterValues.length">
          <div class="cf-pop-item" v-for="v in colFilterValues" :key="v" @click="applyColFilter(v)">
            {{ v }}
          </div>
        </div>
        <div class="cf-pop-empty" v-else-if="!colFilterLoading">
          <van-empty description="无匹配数据" />
        </div>
        <div class="cf-pop-loading" v-if="colFilterLoading" style="text-align:center;padding:20px">
          <van-loading size="20" />
        </div>
      </div>
    </van-popup>

    <!-- 报价计算器 -->
    <van-popup v-model:show="showCalc" round position="bottom" :style="{ height:'auto', maxHeight:'85%' }" closeable>
      <div class="calc-wrap">
        <h3 class="calc-title">💎 报价计算器</h3>
        <p class="calc-desc">成本 → 利润 → 含税人民币报价</p>

        <!-- 成本信息 -->
        <div class="calc-section">
          <div class="calc-section-title">📦 成本信息</div>
          <!-- 币种切换 -->
          <div class="calc-row">
            <label>成本币种</label>
            <div class="calc-toggle">
              <button :class="{active: calcCurrency==='CNY'}" @click="switchCurrency('CNY')">CNY ¥</button>
              <button :class="{active: calcCurrency==='USD'}" @click="switchCurrency('USD')">USD $</button>
            </div>
          </div>
          <!-- 税种模式 -->
          <div class="calc-row">
            <label>成本类型</label>
            <div class="calc-toggle">
              <button :class="{active: calcTaxMode==='ex'}" @click="calcTaxMode='ex';doCalc()">未税成本</button>
              <button :class="{active: calcTaxMode==='in'}" :disabled="calcCurrency==='USD'" @click="calcTaxMode='in';doCalc()">含税成本</button>
            </div>
          </div>
          <!-- 金额 -->
          <div class="calc-row">
            <label>成本金额</label>
            <input v-model.number="calcCost" type="number" step="0.0001" :placeholder="'输入'+(calcTaxMode==='ex'?'未税':'含税')+'成本'" class="calc-input" @input="doCalc" />
          </div>
          <!-- 税率（仅未税模式） -->
          <div class="calc-row" v-if="calcTaxMode==='ex'">
            <label>税率</label>
            <input v-model.number="calcTaxRate" type="number" step="0.1" class="calc-input short" @input="doCalc" />
            <span class="calc-unit">%</span>
          </div>
          <!-- 汇率（始终显示） -->
          <div class="calc-row">
            <label>汇率</label>
            <span class="calc-fx-label">1 USD =</span>
            <input v-model.number="calcRate" type="number" step="0.01" class="calc-input short" @input="doCalc" />
            <span class="calc-unit">CNY</span>
          </div>
        </div>

        <!-- 利润设定 + 批量计算（左右并排） -->
        <div class="calc-section">
          <div class="calc-section-title">📈 利润设定</div>
          <div class="calc-profit-wrap">
            <!-- 左侧：利润设定 -->
            <div class="calc-profit-left">
              <div class="calc-row">
                <label>快捷</label>
                <div class="calc-profit-btns">
                  <button v-for="p in presetProfits" :key="p" :class="['calc-pbtn', {active: calcProfit===p}]" @click="setProfit(p)">{{ p }}个点</button>
                </div>
              </div>
              <div class="calc-row">
                <label>自定义</label>
                <input v-model.number="calcProfit" type="number" step="0.1" class="calc-input short" @input="doCalc" />
                <span class="calc-unit">个点</span>
                <span class="calc-hint">= {{ calcProfitRate }}%</span>
              </div>
            </div>
            <!-- 中间：反向计算 -->
            <div class="calc-profit-mid">
              <div class="calc-row">
                <label>含税报价</label>
                <input v-model.number="calcTargetPrice" type="number" step="0.0001" placeholder="目标含税报价" class="calc-input short" @input="reverseCalc" />
                <span class="calc-unit">CNY</span>
              </div>
              <div v-if="calcResult.reverseProfit" class="calc-reverse-info">→ 对应利润 <b class="cr-profit">{{ calcResult.reverseProfit }}</b> 个点</div>
            </div>
            <!-- 右侧：批量计算 -->
            <div class="calc-profit-right">
              <div class="calc-row">
                <label>数量</label>
                <input v-model.number="calcQty" type="number" step="1" class="calc-input short" placeholder="数量" @input="doCalc" />
                <span class="calc-unit">个</span>
              </div>
              <div v-if="calcResult.totalPrice" class="calc-batch-info">
                <div class="calc-batch-row">含税总价 <b>{{ calcResult.totalPrice }}</b></div>
                <div class="calc-batch-row">未税总利润 <b class="cr-profit">{{ calcResult.totalProfit }}</b></div>
                <div class="calc-batch-row batch-commission">未税总提成 <b>{{ calcResult.commission }}</b> <span class="batch-note">利润×10%</span></div>
              </div>
              <div v-else class="calc-batch-placeholder">输入数量显示总价/总利润/总提成</div>
            </div>
          </div>
        </div>

        <!-- 报价结果 -->
        <div class="calc-section">
          <div class="calc-section-title">💰 报价结果（含税人民币）</div>
          <div v-if="calcResult.priceInTaxRaw" class="calc-result-box">
            <div class="cr-final-label">含税报价</div>
            <div class="cr-final-price">{{ calcResult.priceInTax }}</div>
            <div class="cr-row"><span class="cr-row-label">含税成本</span><span class="cr-row-val">{{ calcResult.costCny }}</span></div>
            <div class="cr-row"><span class="cr-row-label">未税毛利</span><span class="cr-row-val cr-profit">{{ calcResult.profitAmount }} <span class="cr-badge" :class="calcResult.profitRate>=0?'badge-up':'badge-down'">{{ calcResult.profitRateText }}</span></span></div>
            <div class="cr-row cr-row-usd"><span class="cr-row-label">折合 USD</span><span class="cr-row-val cr-usd">{{ calcResult.usd }}</span><button class="cr-copy" @click="copyText(calcResult.usdRaw)">复制</button></div>
          </div>
          <div v-else class="calc-result-empty">输入成本金额后自动计算</div>
        </div>

        <!-- 底部操作 -->
        <div class="calc-actions">
          <button class="calc-reset-btn" @click="resetCalc">🔄 重置</button>
        </div>
      </div>
    </van-popup>

    <!-- 系统设置 -->
    <van-popup v-model:show="showSettings" round position="bottom" :style="{ height:'auto', maxHeight:'50%' }" closeable>
      <div class="set-wrap">
        <h3>系统设置</h3>
        <van-field v-model.number="settingsTaxRate" label="税率 (%)" type="number" placeholder="13" @change="saveSettings">
          <template #extra>%</template>
        </van-field>
        <van-field v-model.number="settingsFxRate" label="汇率" placeholder="7" @change="saveSettings">
          <template #extra>1 USD = ? CNY</template>
        </van-field>
        <p class="set-hint">税率用于含税/未税自动换算，汇率用于美金人民币折合显示。修改后即时生效。</p>
        <div class="set-divider"></div>
        <h4>版本升级</h4>
        <div class="update-area">
          <button class="update-btn" :class="updateBtnClass" @click="onUpdateClick" :title="updateTooltip" :disabled="disabled">
            <span class="update-icon">{{ updateIcon }}</span>
            <span class="update-text">{{ updateBtnText }}</span>
            <span v-if="updatePercent > 0" class="update-pct">{{ updatePercent }}%</span>
          </button>
          <p class="set-hint">当前版本 v{{ appVersion }}</p>
        </div>
      </div>
    </van-popup>

    <!-- 高级筛选 -->
    <van-popup v-model:show="showAdvFilter" round position="bottom" :style="{ height:'65%' }" closeable @closed="advFilterClosed">
      <div class="adv-wrap">
        <h4 class="adv-title">高级筛选</h4>
        <div class="adv-rows">
          <div v-for="(f, i) in advFilters" :key="i" class="adv-row">
            <select v-model="f.field" class="adv-sel">
              <option value="">选择字段</option>
              <option v-for="o in advFieldOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
            <select v-model="f.op" class="adv-sel adv-op">
              <option value="contains">包含</option>
              <option value="equals">等于</option>
              <option value="starts">开头是</option>
              <option value="ends">结尾是</option>
              <option value="gt">&gt;</option>
              <option value="lt">&lt;</option>
              <option value="empty">为空</option>
              <option value="nempty">不为空</option>
            </select>
            <input v-if="f.op!=='empty'&&f.op!=='nempty'" v-model="f.value" class="adv-input" placeholder="输入值" />
            <button class="adv-del" @click="advFilters.splice(i,1)">×</button>
          </div>
        </div>
        <button class="adv-add" @click="advFilters.push({field:'',op:'contains',value:''})">＋ 添加条件</button>
        <div class="adv-btns">
          <button class="adv-reset" @click="resetAdvFilter">重置</button>
          <button class="adv-apply" @click="applyAdvFilter">应用筛选</button>
        </div>
      </div>
    </van-popup>

    <!-- 编辑产品参数 -->
    <van-popup v-model:show="showSpecEdit" round position="bottom" :style="{ height:'70%' }" closeable>
      <div class="spec-edit-wrap">
        <h3>编辑产品参数</h3>
        <p class="spec-edit-hint">修改后该物料所有记录的技术参数同步更新</p>
        <van-field v-model="specEditForm.material_code" label="物料编码" placeholder="物料编码" />
        <van-field v-model="specEditForm.material_name" label="物料名称" placeholder="物料名称" />
        <van-field v-model="specEditForm.material_spec" label="规格" placeholder="规格" />
        <van-field v-model="specEditForm.category" label="品类" placeholder="品类" />
        <van-field v-model="specEditForm.brand" label="品牌" placeholder="品牌" />
        <van-field v-model="specEditForm.dimension" label="尺寸" placeholder="尺寸" />
        <van-field v-model="specEditForm.pin_count" label="PIN脚" placeholder="PIN脚" />
        <van-field v-model="specEditForm.frequency" label="频点" placeholder="频点" />
        <van-field v-model="specEditForm.load_cap" label="负载" placeholder="负载" />
        <van-field v-model="specEditForm.voltage" label="电压" placeholder="电压" />
        <van-field v-model="specEditForm.mode" label="模式" placeholder="模式" />
        <van-field v-model="specEditForm.freq_tol" label="频偏" placeholder="频偏" />
        <van-field v-model="specEditForm.temperature" label="温度" readonly is-link placeholder="选择温度范围" @click="showSpecTempPicker=true" />
        <div style="margin:16px 0"><van-button block round type="primary" :loading="specSaving" @click="saveSpecs">保存参数（更新全部记录）</van-button></div>
      </div>
      <van-popup v-model:show="showSpecTempPicker" position="bottom" round>
        <van-picker :columns="tempOptions" @confirm="onSpecTempConfirm" @cancel="showSpecTempPicker=false" />
      </van-popup>
    </van-popup>

    <van-popup v-model:show="showPopup" round position="bottom" :style="{ height:'72%' }" closeable>
      <div class="pop-inner" v-if="md">
        <div class="pop-head">
          <h3><span class="pop-code" @click="copyText(md.code)" :title="'点击复制: '+md.code">{{ md.code||'无编码' }}</span> <span class="pbadge">{{ md.total }}条 · {{ Object.keys(md.factories).filter(k=>k!=='未指定工厂').length || Object.keys(md.factories).length }}个工厂</span></h3>
          <button class="tb-btn primary" @click="quickAddFromPopup">＋ 新增报价</button>
          <button class="tb-btn" style="margin-left:4px" @click="editGroupSpecs">✎ 产品参数</button>
        </div>
        <div v-for="(qs, f) in md.factories" :key="f" class="fg">
          <div class="fh">{{ f }} <span class="fct">{{ qs.length }}条</span></div>
          <div class="mtw"><table class="mt"><thead><tr><th class="w-tm">时间</th><th class="w-pr">含税价</th><th class="w-pr">未税价</th><th class="w-cu">币种</th><th class="w-ld">交期</th><th class="w-pk">包装</th><th class="w-qt">报价人</th><th class="w-cs">客户</th><th>备注</th></tr></thead>
          <tbody><tr v-for="q in qs" :key="q.id" @click="router.push('/detail/'+q.id)" class="cr">
            <td>{{ (q.created_at||'').slice(0,10) }}</td>
            <td :class="q.currency==='USD'?'f-usd':'f-red'">{{ fmtPrice(q.price_with_tax,q.currency) }}</td>
            <td :class="q.currency==='USD'?'f-usd-sub':'f-orange'">{{ fmtPrice(q.price_without_tax,q.currency) }}</td>
            <td><span class="ctag" :class="q.currency==='USD'?'u':'c'">{{ q.currency }}</span></td>
            <td>{{ q.standard_lead_time||'-' }}</td><td class="muted">{{ q.min_package ? q.min_package+'pcs' : '-' }}</td><td>{{ q.quoter||'-' }}</td>
            <td class="ellip" :title="q.first_inquiry_customer">{{ q.first_inquiry_customer||'-' }}</td><td class="ellip" :title="q.remarks">{{ q.remarks||'-' }}</td>
            <td @click.stop><router-link :to="'/edit/'+q.id" class="row-btn edit" style="font-size:9px">改</router-link></td>
          </tr></tbody></table></div>
        </div>
        <div v-if="md.logs && md.logs.length" class="log-section">
          <div class="log-title">📋 价格变更记录</div>
          <div v-for="l in md.logs.slice(0,10)" :key="l.id" class="log-item">
            <span class="log-time">{{ (l.changed_at||'').slice(0,16) }}</span>
            <span class="log-field">{{ l.field_name==='price_with_tax'?'含税价':l.field_name==='price_without_tax'?'未税价':'币种' }}</span>
            <span class="log-old">{{ l.old_value||'空' }}</span>
            <span class="log-arrow">→</span>
            <span class="log-new">{{ l.new_value||'空' }}</span>
          </div>
        </div>
      </div>
    </van-popup>
  </div>

</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { usePriceStore } from '../stores/price.js'
import { importExcel, http } from '../utils/api.js'
import { showToast, showConfirmDialog } from 'vant'


const store = usePriceStore()
const router = useRouter()
const fileInput = ref(null)
const exporting = ref(false)
const localIp = ref('127.0.0.1')
const isDev = ref(new URLSearchParams(window.location.search).get('packaged') === 'false')
const appVersion = ref(new URLSearchParams(window.location.search).get('v') || __APP_VERSION__)
const isElectron = ref(!!window.electronAPI)
async function openDataFolder() {
  try { await http.get('/open-data-folder') } catch { showToast('此功能仅在桌面端可用') }
}
function openNotesWin() {
  const isElectron = navigator.userAgent.indexOf('Electron') !== -1
  const win = window.open('/#/notes?standalone=1', '_blank')
  // Electron: setWindowOpenHandler 拦截成功，win 为 null，但已创建桌面窗口
  // 浏览器: window.open 被拦截或关掉 → 页面内跳转
  if (!win || win.closed) {
    if (!isElectron) router.push('/notes')
  }
}
const showPopup = ref(false)
const md = ref(null)
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

const allChecked = computed(() => store.list.length>0 && checkedIds.value.length===store.list.length)
const factoryCount = computed(() => new Set(store.list.map(r=>r.factory_code).filter(Boolean)).size)
const materialKinds = computed(() => new Set(store.list.map(r=>r.material_code)).size)
const hasFilter = computed(() => store.filters.factory||store.filters.quoter||store.filters.currency||store.filters.category||store.filters.startDate||store.filters.endDate||store.hasColumnFilters)
const factoryOptions = computed(() => [{text:'全部工厂',value:''},...store.metaOptions.factories.map(f=>({text:f,value:f}))])
const quoterOptions = computed(() => [{text:'全部报价人',value:''},...store.metaOptions.quoters.map(q=>({text:q,value:q}))])
const currencyOptions = [{text:'全部币种',value:''},{text:'人民币',value:'CNY'},{text:'美元',value:'USD'}]
const catFilterOptions = computed(() => { const cats=[...new Set([...store.metaOptions.categories||[], ...store.list.map(r=>r.category).filter(Boolean)])]; return [{text:'全部分类',value:''},...cats.map(c=>({text:c,value:c}))] })
const groupColors = ['#ffffff','#f4f7fb','#faf8f3','#f3f8f4','#f9f4f8']
function rowBg(code) { if(!code) return '#fff'; let h=0; for(let i=0;i<code.length;i++) h=((h<<5)-h)+code.charCodeAt(i)|0; return groupColors[Math.abs(h)%5] }
function fmtPrice(val,cur) { if(val==null||val==='') return '-'; return (cur==='USD'?'$':'¥')+Number(val).toFixed(4) }
function fmtPriceWithCNY(val,cur) { if(val==null||val==='') return '-'; if(cur==='USD'){const fx=Number(localStorage.getItem('crystal_rate'))||7;return '¥'+(val*fx).toFixed(4)}return (cur==='USD'?'$':'¥')+Number(val).toFixed(4) }
function copyText(t) { if(!t) return; navigator.clipboard?.writeText(t).then(()=>showToast('已复制')).catch(()=>{}) }
function reload() { checkedIds.value = []; store.loadGroupedList() }
function onSearch() { store.setFilter('page',1); reload() }
let searchTimer = null
function onSearchDebounced() { clearTimeout(searchTimer); searchTimer = setTimeout(() => onSearch(), 350) }
function resetAll() { store.resetFilters(); reload() }
// 列筛选
const colLabelMap = { material_code:'物料编码',material_name:'物料名称',material_spec:'规格',category:'品类',brand:'品牌',dimension:'尺寸',pin_count:'PIN脚',frequency:'频点',load_cap:'负载',voltage:'电压',mode:'模式',freq_tol:'频偏',temperature:'温度',standard_lead_time:'交期',first_inquiry_customer:'客户' }
function colLabel(c) { return colLabelMap[c]||c }
async function openColFilter(col, label) {
  colFilterCol.value = col; colFilterLabel.value = label; colFilterKw.value = ''; colFilterValues.value = []; colFilterLoading.value = true; showColFilter.value = true
  try { colFilterValues.value = await store.loadColumnValues(col) } catch (e) { showToast('加载失败') }
  colFilterLoading.value = false
}
function onColFilterSearch(kw) {
  clearTimeout(colFilterTimer)
  colFilterTimer = setTimeout(async () => {
    colFilterLoading.value = true
    try { colFilterValues.value = await store.loadColumnValues(colFilterCol.value, kw) } catch (e) { showToast('筛选加载失败') }
    colFilterLoading.value = false
  }, 300)
}
function applyColFilter(v) {
  store.setColumnFilter(colFilterCol.value, v); showColFilter.value = false; reload()
}
function removeColFilter(col) { store.removeColumnFilter(col); reload() }
function clearAllColFilters() { store.clearColumnFilters(); reload() }
function colFilterClosed() { colFilterCol.value = ''; colFilterValues.value = []; colFilterKw.value = '' }
function downloadTemplate() { const a=document.createElement('a'); a.href='/api/template'; a.download='报价导入模板.xlsx'; a.click() }
function toggleAll(e) { checkedIds.value = e.target.checked ? store.list.map(r=>r.id) : [] }
async function batchDelete() { if(!checkedIds.value.length) return; try { const msg = `确定删除已选中的 ${checkedIds.value.length} 条记录？`; await showConfirmDialog({title:'批量删除',message:msg}); await http.post('/prices/batch-delete',{ids:checkedIds.value}); checkedIds.value=[]; showToast('已删除'); reload() } catch(e) { if (e?.message?.includes('cancel') || e === 'cancel') return; showToast('删除失败: '+(e.response?.data?.msg||e.message)) } }
function openGroupEdit(item){showDetail(item)}
// 编辑产品参数
const showSpecEdit = ref(false); const showSpecTempPicker = ref(false); const specSaving = ref(false)
const specEditForm = ref({material_code:'',material_name:'',material_spec:'',category:'',brand:'',dimension:'',pin_count:'',frequency:'',load_cap:'',voltage:'',mode:'',freq_tol:'',temperature:''})
const specSource = ref({})
const tempOptions = [{text:'-20/70℃',value:'-20/70℃'},{text:'-40~85℃',value:'-40~85℃'},{text:'-40/105℃',value:'-40/105℃'},{text:'-40/125℃',value:'-40/125℃'},{text:'-55/150℃',value:'-55/150℃'}]
function editGroupSpecs() {
  const fk = Object.keys(md.value.factories)[0]; const q = md.value.factories[fk]?.[0]
  if (!q) return; specSource.value = q
  const techs = ['material_code','material_name','material_spec','category','brand','dimension','pin_count','frequency','load_cap','voltage','mode','freq_tol','temperature']
  techs.forEach(t => { specEditForm.value[t] = q[t] || '' })
  showSpecEdit.value = true
}
async function saveSpecs() {
  specSaving.value = true
  try { await http.post('/prices/batch-update-specs', {...specEditForm.value, source: specSource.value}); showSpecEdit.value = false; showToast('参数已批量更新'); setTimeout(() => showDetail(specEditForm.value), 400) }
  catch (e) { showToast('保存失败: '+(e.response?.data?.msg||e.message)) }
  finally { specSaving.value = false }
}
function onSpecTempConfirm({selectedOptions}) { specEditForm.value.temperature = selectedOptions[0].value; showSpecTempPicker.value = false }
function goDetail(id){showPopup.value=false;router.push('/detail/'+id)}
function quickAddFromPopup(){showPopup.value=false;const fk=Object.keys(md.value.factories)[0];const q=md.value.factories[fk]?.[0];if(q){router.push({path:'/add',query:{code:q.material_code||'',name:q.material_name||'',spec:q.material_spec||'',cat:q.category||'',brand:q.brand||'',dim:q.dimension||'',pin:q.pin_count||'',freq:q.frequency||'',load:q.load_cap||'',volt:q.voltage||'',mode:q.mode||'',ftol:q.freq_tol||''}})}}
async function showDetail(item){try{const code=item.material_code||'_empty_';const tfs=['material_name','material_spec','category','brand','dimension','pin_count','frequency','load_cap','voltage','mode','freq_tol'];const qs=new URLSearchParams();tfs.forEach(t=>{if(item[t])qs.set(t,item[t])});const qstr=qs.toString();const [r, lr] = await Promise.all([http.get(`/prices/by-material/${encodeURIComponent(code)}${qstr?'?'+qstr:''}`), http.get(`/prices/price-logs/${encodeURIComponent(code)}`).catch(()=>({data:[]}))]);const d=r.data;for(const f of Object.keys(d.factories)){const seen=new Set();d.factories[f]=d.factories[f].filter(q=>{const k=q.price_with_tax+'|'+q.price_without_tax+'|'+q.currency+'|'+q.factory_code+'|'+q.quoter+'|'+q.standard_lead_time+'|'+q.first_inquiry_customer+'|'+(q.remarks||'');if(seen.has(k))return false;seen.add(k);return true});d.factories[f].sort((a,b)=>(a.price_with_tax??a.price_without_tax??999999)-(b.price_with_tax??b.price_without_tax??999999))}d.total=Object.values(d.factories).reduce((s,a)=>s+a.length,0);d.logs=lr.data||[];md.value=d;showPopup.value=true}catch(e){showToast('加载失败: '+(e.response?.data?.msg||e.message||'网络错误'))}}
async function handleExport(){exporting.value=true;try{const p=new URLSearchParams();const f=store.filters;if(f.keyword)p.set('keyword',f.keyword);if(f.factory)p.set('factory',f.factory);if(f.quoter)p.set('quoter',f.quoter);if(f.currency)p.set('currency',f.currency);if(f.category)p.set('category',f.category);if(f.startDate)p.set('startDate',f.startDate);if(f.endDate)p.set('endDate',f.endDate);for(const [k,v] of Object.entries(store.columnFilters)) p.set(k,v);window.open('/api/export?'+p.toString(),'_blank');showToast('导出成功')}catch(e){showToast('导出失败')}finally{exporting.value=false}}
function handleImport(){fileInput.value?.click()}
async function onFileChange(e){const f=e.target.files[0];if(!f)return;const d=new FormData();d.append('file',f);try{const r=await importExcel(d);showToast(r.msg||'导入成功');reload()}catch(e){showToast('导入失败:'+e.message)};fileInput.value.value=''}
async function handleDelete(item){try{await showConfirmDialog({title:'确认删除',message:`删除物料「${item.material_code||item.material_name}」的报价？`});await store.remove(item.id);showToast('已删除');reload()}catch(e){if(e==='cancel'||e?.message?.includes('cancel')) return; showToast('删除失败:'+(e.response?.data?.msg||e.message))}}
let resizing=null
function startResize(e,colIdx){if(!tableRef.value)return;const ths=tableRef.value.querySelectorAll('th');const th=ths[Number(colIdx)+1];if(!th)return;resizing={colIdx,startX:e.clientX,startW:th.offsetWidth||100,th};document.addEventListener('mousemove',onResize);document.addEventListener('mouseup',stopResize);document.body.style.cursor='col-resize';document.body.style.userSelect='none'}
function onResize(e){if(!resizing)return;const diff=e.clientX-resizing.startX;const newW=Math.max(40,resizing.startW+diff);resizing.th.style.width=newW+'px';resizing.th.style.minWidth=newW+'px'}
function stopResize(){resizing=null;document.removeEventListener('mousemove',onResize);document.removeEventListener('mouseup',stopResize);document.body.style.cursor='';document.body.style.userSelect=''}
// 报价计算器
const showCalc = ref(false)
const calcTaxMode = ref('ex')
const calcCost = ref(null)
const calcTaxRate = ref(Number(localStorage.getItem('crystal_taxRate')) || 13)
const calcProfit = ref(Number(localStorage.getItem('crystal_profit')) || 10)
const calcCurrency = ref(localStorage.getItem('crystal_currency') || 'CNY')
const calcRate = ref(Number(localStorage.getItem('crystal_rate')) || 7)
const presetProfits = [10, 20, 30, 40, 50]
function switchCurrency(curr) { calcCurrency.value = curr; if (curr === 'USD') { calcTaxMode.value = 'ex' }; doCalc() }
const calcQty = ref(null)
const calcTargetPrice = ref(null)
const calcResult = reactive({ priceInTax: '', priceInTaxRaw: '', costCny: '', profitAmount: '', profitRate: 0, profitRateText: '', usd: '', usdRaw: '', totalPrice: '', totalProfit: '', commission: '', reverseProfit: '' })
const calcProfitRate = computed(() => calcProfit.value ? (calcProfit.value).toFixed(1) : '0.0')
function setProfit(p) { calcProfit.value = p; doCalc() }
function doCalc() {
  const rawCost = Number(calcCost.value)
  const taxRate = Number(calcTaxRate.value) || 13
  const profitPoints = Number(calcProfit.value) || 0
  const fx = Number(calcRate.value) || 7
  // 持久化
  localStorage.setItem('crystal_taxRate', calcTaxRate.value)
  localStorage.setItem('crystal_profit', calcProfit.value)
  localStorage.setItem('crystal_currency', calcCurrency.value)
  localStorage.setItem('crystal_rate', calcRate.value)
  if (!rawCost || rawCost <= 0) {
    calcResult.priceInTax = ''; calcResult.priceInTaxRaw = ''; calcResult.costCny = ''; calcResult.profitAmount = ''; calcResult.profitRate = 0; calcResult.profitRateText = ''; calcResult.usd = ''; calcResult.usdRaw = ''
    return
  }
  // 1. 币种换算：成本统一为 CNY
  const cnyCost = calcCurrency.value === 'USD' ? rawCost * fx : rawCost
  // 2. 换算为未税 CNY 成本
  const costExTax = calcTaxMode.value === 'in' ? cnyCost / (1 + taxRate / 100) : cnyCost
  // 3. 报价计算 — 除法：报价 = 成本 ÷ (1 - 点数/100)，上限 99.99 个点
  const profitRate = profitPoints / 100
  if (profitRate >= 1) {
    calcResult.priceInTax = ''; calcResult.priceInTaxRaw = ''; calcResult.costCny = ''; calcResult.profitAmount = ''; calcResult.profitRate = 0; calcResult.profitRateText = ''; calcResult.usd = ''; calcResult.usdRaw = ''; calcResult.totalPrice = ''; calcResult.totalProfit = ''; calcResult.commission = ''; calcResult.reverseProfit = ''
    return
  }
  const priceExTaxVal = costExTax / (1 - profitRate)
  const priceInTaxVal = priceExTaxVal * (1 + taxRate / 100)
  const profitVal = priceExTaxVal - costExTax
  const actualProfitRate = profitPoints
  // 4. 结果一律显示为含税 CNY
  const costInTaxCny = cnyCost * (1 + taxRate / 100)
  calcResult.priceInTax = '¥' + priceInTaxVal.toFixed(4)
  calcResult.priceInTaxRaw = priceInTaxVal.toFixed(4)
  calcResult.costCny = '¥' + costInTaxCny.toFixed(4)
  calcResult.profitAmount = '¥' + profitVal.toFixed(4)
  calcResult.profitRate = actualProfitRate
  calcResult.profitRateText = actualProfitRate.toFixed(1) + '%'
  // 折合 USD = 含税 CNY / 汇率
  calcResult.usd = '$' + (priceInTaxVal / fx).toFixed(4)
  calcResult.usdRaw = (priceInTaxVal / fx).toFixed(4)
  // 5. 批量计算（数量 × 单价）
  const qty = Number(calcQty.value) || 0
  if (qty > 0) {
    const tp = priceInTaxVal * qty
    const tpf = profitVal * qty
    calcResult.totalPrice = '¥' + tp.toFixed(4)
    calcResult.totalProfit = '¥' + tpf.toFixed(4)
    calcResult.commission = '¥' + (tpf * 0.1).toFixed(4)
  } else {
    calcResult.totalPrice = ''; calcResult.totalProfit = ''; calcResult.commission = ''
  }
}
// 反向计算：输入含税报价 → 反推利润点数
function reverseCalc() {
  const tp = Number(calcTargetPrice.value)
  if (!tp || tp <= 0) { calcResult.reverseProfit = ''; return }
  const rawCost = Number(calcCost.value)
  if (!rawCost || rawCost <= 0) { calcResult.reverseProfit = ''; return }
  const taxRate = Number(calcTaxRate.value) || 13
  const fx = Number(calcRate.value) || 7
  const cnyCost = calcCurrency.value === 'USD' ? rawCost * fx : rawCost
  const costExTax = calcTaxMode.value === 'in' ? cnyCost / (1 + taxRate / 100) : cnyCost
  const priceExTax = tp / (1 + taxRate / 100)
  if (priceExTax <= costExTax) { calcResult.reverseProfit = ''; return }
  const rp = ((priceExTax - costExTax) / priceExTax) * 100
  if (rp >= 100) { calcResult.reverseProfit = ''; return }
  calcResult.reverseProfit = rp.toFixed(2)
}
function resetCalc() {
  calcTaxMode.value = 'ex'
  calcCost.value = null
  calcTaxRate.value = 13
  calcProfit.value = 10
  calcCurrency.value = 'CNY'
  calcRate.value = 7
  calcQty.value = null
  calcTargetPrice.value = null
  calcResult.priceInTax = ''; calcResult.priceInTaxRaw = ''; calcResult.costCny = ''; calcResult.profitAmount = ''; calcResult.profitRate = 0; calcResult.profitRateText = ''; calcResult.usd = ''; calcResult.usdRaw = ''; calcResult.totalPrice = ''; calcResult.totalProfit = ''; calcResult.commission = ''; calcResult.reverseProfit = ''
  localStorage.setItem('crystal_taxRate', 13)
  localStorage.setItem('crystal_profit', 10)
  localStorage.setItem('crystal_currency', 'CNY')
  localStorage.setItem('crystal_rate', 7)
}
// 高级筛选
const showAdvFilter = ref(false)
const advFilters = ref([{field:'',op:'contains',value:''}])
const advMultiFilter = ref('')
const advFieldOptions = [
  {label:'物料编码',value:'material_code'},{label:'物料名称',value:'material_name'},{label:'物料规格',value:'material_spec'},
  {label:'品类',value:'category'},{label:'品牌',value:'brand'},{label:'尺寸',value:'dimension'},{label:'PIN脚',value:'pin_count'},
  {label:'频点',value:'frequency'},{label:'负载',value:'load_cap'},{label:'电压',value:'voltage'},{label:'模式',value:'mode'},
  {label:'频偏',value:'freq_tol'},{label:'含税价',value:'price_with_tax'},{label:'未税价',value:'price_without_tax'},
  {label:'币种',value:'currency'},{label:'工厂',value:'factory_code'},{label:'报价人',value:'quoter'},
  {label:'交期',value:'standard_lead_time'},{label:'客户',value:'first_inquiry_customer'},{label:'备注',value:'remarks'},
]
function applyAdvFilter() {
  const valid = advFilters.value.filter(f => f.field)
  advMultiFilter.value = valid.length ? JSON.stringify(valid) : ''
  store.multiFilter = advMultiFilter.value
  showAdvFilter.value = false
  store.clearColumnFilters()
  reload()
}
function resetAdvFilter() {
  advFilters.value = [{field:'',op:'contains',value:''}]
  advMultiFilter.value = ''
  store.multiFilter = ''
  showAdvFilter.value = false
  store.clearColumnFilters()
  reload()
}
function advFilterClosed() { if (!advMultiFilter.value) advFilters.value = [{field:'',op:'contains',value:''}] }
// 系统设置
const showSettings = ref(false)
const settingsTaxRate = ref(Number(localStorage.getItem('crystal_taxRate')) || 13)
const settingsFxRate = ref(Number(localStorage.getItem('crystal_rate')) || 7)
function saveSettings() { localStorage.setItem('crystal_taxRate', settingsTaxRate.value); localStorage.setItem('crystal_rate', settingsFxRate.value) }

// 在线升级状态
const updateStatus = ref('idle') // idle | checking | available | downloading | downloaded | not-available | error
const updateVersion = ref('')
const updatePercent = ref(0)
const updateError = ref('')

const disabled = computed(() => updateStatus.value === 'checking' || updateStatus.value === 'downloading')
const updateBtnClass = computed(() => {
  const s = updateStatus.value
  return { idle: s === 'idle', available: s === 'available', downloading: s === 'downloading', downloaded: s === 'downloaded', checking: s === 'checking', error: s === 'error', latest: s === 'not-available' }
})
const updateIcon = computed(() => {
  const m = { idle: '⬇', available: '🔄', downloading: '⏳', downloaded: '✅', checking: '🔍', error: '⚠️', 'not-available': '✓' }
  return m[updateStatus.value] || '⬇'
})
const updateBtnText = computed(() => {
  const t = {
    idle: '检查更新', available: '下载更新 v' + updateVersion.value,
    downloading: '正在下载...', downloaded: '立即安装',
    checking: '检查中...', error: '检查失败，点击重试',
    'not-available': '已是最新版'
  }
  return t[updateStatus.value] || '检查更新'
})
const updateTooltip = computed(() => {
  if (updateStatus.value === 'available') return `发现新版本 v${updateVersion.value}，点击下载更新`
  if (updateStatus.value === 'downloaded') return `新版本 v${updateVersion.value} 已下载，点击安装并重启`
  if (updateStatus.value === 'error') return updateError.value || '更新检查失败'
  if (updateStatus.value === 'not-available') return '当前已是最新版本'
  return ''
})

function onUpdateClick() {
  const s = updateStatus.value
  if (s === 'idle' || s === 'error' || s === 'not-available') {
    updateStatus.value = 'checking'
    window.electronAPI?.checkUpdate()
  } else if (s === 'available') {
    updateStatus.value = 'downloading'
    window.electronAPI?.downloadUpdate()
  } else if (s === 'downloaded') {
    window.electronAPI?.installUpdate()
  }
}

// 监听升级状态事件（来自 Electron 主进程）
if (window.electronAPI?.onUpdateStatus) {
  window.electronAPI.onUpdateStatus((data) => {
    updateStatus.value = data.status
    if (data.version) updateVersion.value = data.version
    if (data.percent !== undefined) updatePercent.value = data.percent
    if (data.message) updateError.value = data.message
  })
}

// 暴露检查更新函数供主进程菜单调用
window.__checkUpdate = () => {
  if (updateStatus.value === 'idle' || updateStatus.value === 'not-available' || updateStatus.value === 'error') {
    updateStatus.value = 'checking'
    window.electronAPI?.checkUpdate()
  }
}

onMounted(async()=>{store.setFilter('page',1);await store.loadMetaOptions();await store.loadGroupedList();localIp.value=window.electronAPI?window.electronAPI.getLanIp():(window.location.hostname||'127.0.0.1')})

// 实时时钟（每秒刷新）
const clockTime = ref('')
const clockDate = ref('')
let clockTimer = null
function updateClock() {
  const d = new Date()
  const pad = n => String(n).padStart(2, '0')
  clockTime.value = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  const weekDays = ['日', '一', '二', '三', '四', '五', '六']
  clockDate.value = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} 星期${weekDays[d.getDay()]}`
}
onMounted(() => { updateClock(); clockTimer = setInterval(updateClock, 1000) })
onUnmounted(() => { if (clockTimer) clearInterval(clockTimer); if (colFilterTimer) clearTimeout(colFilterTimer); if (searchTimer) clearTimeout(searchTimer) })
</script>

<style scoped>
.app-wrap{display:flex;flex-direction:column;height:100vh;background:#f0f2f5}
.topbar{display:flex;align-items:center;justify-content:space-between;padding:0 20px;height:44px;background:#fff;border-bottom:1px solid #e8e8e8;flex-shrink:0}
.topbar-left{display:flex;align-items:center;gap:8px}
.logo-dot{width:8px;height:8px;border-radius:50%;background:#1989fa}
.logo-text{font-size:15px;font-weight:600;color:#323233;letter-spacing:.5px}
.topbar-right{display:flex;align-items:center}
.clock-display{display:inline-flex;align-items:center;gap:6px;margin-right:12px;padding:4px 12px;background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);color:#00ff88;font-family:'Consolas','Courier New',monospace;font-size:14px;font-weight:600;letter-spacing:1px;border-radius:4px;box-shadow:inset 0 0 8px rgba(0,255,136,0.15);user-select:none;cursor:default}
.clock-dot{width:6px;height:6px;border-radius:50%;background:#00ff88;box-shadow:0 0 6px #00ff88;animation:clockPulse 1s ease-in-out infinite}
@keyframes clockPulse{0%,100%{opacity:1}50%{opacity:0.3}}
.main-area{flex:1;overflow:auto;padding:16px 20px;display:flex;flex-direction:column}

/* 工具条 */
.toolbar{display:flex;align-items:center;gap:8px;margin-bottom:12px}
.search-box{display:flex;align-items:center;flex:1;max-width:360px;background:#fff;border:1px solid #e0e0e0;border-radius:8px;padding:0 12px;height:36px;transition:border-color .2s}
.search-box:focus-within{border-color:#1989fa;box-shadow:0 0 0 3px rgba(25,137,250,.1)}
.search-icon{flex-shrink:0;margin-right:6px}
.search-input{flex:1;border:none;outline:none;font-size:13px;color:#323233;background:transparent;font-family:inherit}
.search-input::placeholder{color:#bbb}
.search-clear{color:#bbb;cursor:pointer;font-size:14px;padding:2px;flex-shrink:0}
.search-clear:hover{color:#666}
.tb-btn{padding:6px 14px;border-radius:6px;font-size:12px;cursor:pointer;border:1px solid #d9d9d9;background:#fff;color:#555;font-family:inherit;white-space:nowrap;transition:all .15s}
.tb-btn:hover{color:#1989fa;border-color:#1989fa}
.tb-btn.primary{background:#1989fa;color:#fff;border-color:#1989fa}
.tb-btn.primary:hover{background:#1676d9}
.tb-btn.danger{background:#ee0a24;color:#fff;border-color:#ee0a24}

/* 筛选 */
.info-row{display:flex;align-items:center;justify-content:space-between;background:#fff;padding:6px 14px;border-radius:8px;margin-bottom:10px;border:1px solid #e8e8e8}
.filter-group{display:flex;align-items:center;gap:4px;flex-wrap:wrap}
.fdiv{width:1px;height:20px;background:#e8e8e8;margin:0 4px}
.date-field{width:115px;padding:0!important;font-size:12px;border:none!important}
.date-field :deep(input){font-size:12px!important;padding:4px 8px!important}
.date-arrow{color:#bbb;font-size:12px;margin:0 2px}
.reset-btn{padding:3px 10px;border-radius:4px;font-size:11px;cursor:pointer;border:1px solid #e8e8e8;background:#fafafa;color:#888;font-family:inherit}
.reset-btn:hover{color:#1989fa;border-color:#1989fa}
.stat-group{font-size:12px;color:#888;white-space:nowrap;flex-shrink:0}
.stat-group b{color:#323233;font-weight:600}
.stat-dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:#52c41a;margin-right:4px;vertical-align:middle}

/* 表格 */
.table-shell{background:#fff;border-radius:8px;border:1px solid #e8e8e8;overflow:visible;flex:1;display:flex;flex-direction:column}
.dt{width:max-content;min-width:100%;border-collapse:collapse;font-size:12px}
.dt th{background:#fafafa;color:#888;font-weight:500;padding:8px 6px;text-align:left;white-space:nowrap;border-bottom:1px solid #e8e8e8;font-size:11px;position:sticky;top:0;z-index:2}
.dt td{padding:6px;border-bottom:1px solid #f5f5f5;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dt tbody tr:hover td{background:#e6f4ff!important}
.resize-handle{position:absolute;right:0;top:0;bottom:0;width:5px;cursor:col-resize;z-index:3}
.resize-handle:hover{background:rgba(25,137,250,.25)}
.empty{text-align:center!important;padding:48px 0!important}
.sortable{cursor:pointer;user-select:none}.sortable:hover{color:#1989fa}
.muted{color:#aaa}
.f-red{color:#e53935;font-weight:600;font-family:'SF Mono','Consolas',monospace}
.f-orange{color:#ef6c00;font-weight:500}
.f-usd{color:#0d47a1;font-weight:600;font-family:'SF Mono','Consolas',monospace}
.f-usd-sub{color:#1976d2;font-weight:500}
.usd-cny{color:#999;font-size:10px;display:block}
.clink{color:#1565c0;cursor:pointer;font-weight:600}.clink:hover{text-decoration:underline}
.copyable{cursor:pointer}.copyable:hover{background:#fff9c4}
.ellip{overflow:hidden;text-overflow:ellipsis}
.ctag{display:inline-block;padding:0 5px;border-radius:3px;font-size:10px;font-weight:600}
.ctag.c{background:#fff0f0;color:#c62828}.ctag.u{background:#e8f4fd;color:#0d47a1}
.act-col{white-space:nowrap;display:flex;align-items:center;gap:3px;flex-wrap:wrap}
.spec-link{text-decoration:none;font-size:14px}
.row-btn{padding:1px 7px;border-radius:3px;font-size:10px;cursor:pointer;border:1px solid;font-family:inherit;background:#fff;line-height:1.4}
.row-btn.edit{color:#1989fa;border-color:#1989fa;text-decoration:none}.row-btn.edit:hover{background:#e6f4ff}
.row-btn.del{color:#ee0a24;border-color:#ee0a24}.row-btn.del:hover{background:#fff0f0}
.row-btn-detail{padding:3px 10px;border-radius:4px;font-size:11px;cursor:pointer;background:#e6f4ff;color:#1989fa;border:1px solid #b3d8f5;font-family:inherit;white-space:nowrap}
.row-btn-detail:hover{background:#cce8ff}
.group-badge{display:inline-block;padding:2px 6px;border-radius:4px;font-size:10px;cursor:pointer;background:#fff3e0;color:#e65100;border:1px solid #ffcc80;white-space:nowrap}
.group-badge:hover{background:#ffe0b2}
.pager-bar{display:flex;justify-content:center;align-items:center;gap:16px;padding:12px 0 4px;white-space:nowrap}
.pager{display:flex;align-items:center;gap:6px}
.pg-btn{padding:4px 12px;border-radius:4px;font-size:12px;cursor:pointer;border:1px solid #d9d9d9;background:#fff;color:#555;font-family:inherit}
.pg-btn:hover:not(:disabled){color:#1989fa;border-color:#1989fa}
.pg-btn:disabled{color:#ccc;cursor:not-allowed;background:#f5f5f5}
.pg-info{font-size:12px;color:#888;padding:0 4px}
.ps-select{padding:3px 6px;border-radius:4px;border:1px solid #d9d9d9;font-size:11px;color:#888;background:#fff;cursor:pointer;font-family:inherit;outline:none}
.ps-select:focus{border-color:#1989fa}
.lan-tip{padding:8px;color:#ad8b00;font-size:11px;text-align:center}
.nav-btn{background:transparent;color:#666;border:1px solid #d9d9d9;border-radius:4px;padding:4px 10px;font-size:12px;cursor:pointer;font-family:inherit;text-decoration:none;display:inline-block}
.dev-badge{display:inline-block;padding:1px 6px;border-radius:3px;font-size:10px;font-weight:600;background:#ff6b35;color:#fff;margin-left:6px;line-height:1.4;vertical-align:middle}
.version-badge{display:inline-block;padding:1px 5px;border-radius:3px;font-size:10px;font-weight:500;background:#e8e8e8;color:#888;margin-left:6px;line-height:1.4;vertical-align:middle;user-select:none}
.nav-btn:hover{color:#1989fa;border-color:#1989fa}
.pop-inner{padding:16px;overflow-y:auto;height:100%}
.pop-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
.pop-head h3{font-size:16px;margin:0}.pbadge{font-size:12px;color:#999;font-weight:400}
.fg{margin-bottom:12px}
.fh{font-weight:600;font-size:13px;padding:6px 10px;background:#fafafa;border-radius:4px;display:flex;align-items:center;gap:8px}
.fct{font-size:10px;background:#1989fa;color:#fff;padding:1px 6px;border-radius:8px}
.pop-code{color:#1565c0;cursor:pointer}.pop-code:hover{text-decoration:underline}
.mtw{border:1px solid #e8e8e8;border-radius:4px;overflow-x:auto}
.mt{width:100%;table-layout:fixed;border-collapse:collapse;font-size:10px}
.mt th{background:#fafafa;padding:4px 6px;border-bottom:1px solid #e8e8e8;font-size:10px;color:#888;overflow:hidden;text-overflow:ellipsis}
.mt td{padding:4px 6px;border-bottom:1px solid #f5f5f5;overflow:hidden;text-overflow:ellipsis}
.w-tm{width:68px}.w-pr{width:62px}.w-cu{width:34px}.w-ld{width:44px}.w-pk{width:44px}.w-qt{width:44px}.w-cs{width:52px}
.cr{cursor:pointer}.cr:hover td{background:#e6f4ff}
/* 价格变更日志 */
.log-section{margin-top:16px;padding-top:12px;border-top:2px solid #f0f0f0}
.log-title{font-size:13px;font-weight:600;color:#323233;margin-bottom:8px}
.log-item{display:flex;align-items:center;gap:8px;padding:4px 0;font-size:11px;color:#888}
.log-time{color:#bbb;min-width:100px}
.log-field{min-width:48px}
.log-old{color:#e53935;text-decoration:line-through;min-width:48px;text-align:right}
.log-arrow{color:#bbb}
.log-new{color:#52c41a;font-weight:600;min-width:48px}
/* 列筛选 */
.col-filter{display:inline-block;color:#ccc;cursor:pointer;font-size:11px;margin-left:2px;padding:1px 3px;border-radius:2px;vertical-align:middle;position:relative;z-index:1}
.col-filter:hover{color:#1989fa;background:#e6f4ff}
.col-filter.active{color:#1989fa;font-weight:600}
.col-filter-tags{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:8px}
.cf-tag{display:inline-flex;align-items:center;gap:4px;background:#e6f4ff;color:#1989fa;padding:2px 8px;border-radius:4px;font-size:11px}
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
.cf-pop-item:hover{background:#f5f6f8;color:#1989fa}
.cf-pop-item:last-child{border-bottom:none}
.cf-pop-empty{flex:1;display:flex;align-items:center;justify-content:center}
/* 报价计算器 */
.calc-btn{background:#fff9e6;color:#e6a23c;border-color:#f5dab1}
.calc-btn:hover{color:#d48b1a;border-color:#e6a23c;background:#fff5d9}
.calc-wrap{padding:20px 24px 28px}
.calc-title{font-size:18px;font-weight:600;margin:0 0 2px;color:#323233}
.calc-desc{font-size:12px;color:#999;margin:0 0 18px}
.calc-section{margin-bottom:16px}
.calc-section-title{font-size:13px;font-weight:600;color:#555;margin-bottom:10px;padding-bottom:6px;border-bottom:2px solid #f0f0f0}
.calc-row{display:flex;align-items:center;gap:10px;margin-bottom:10px}
.calc-row label{font-size:13px;color:#666;white-space:nowrap;min-width:60px}
.calc-input{flex:1;padding:8px 12px;border:1px solid #e0e0e0;border-radius:8px;font-size:15px;font-family:inherit;outline:none;transition:border-color .2s;min-width:0}
.calc-input:focus{border-color:#1989fa;box-shadow:0 0 0 3px rgba(25,137,250,.1)}
.calc-input.short{max-width:100px;flex:none}
.calc-unit{font-size:13px;color:#999;flex-shrink:0}
.calc-hint{font-size:12px;color:#1989fa;font-weight:500}
.calc-fx-label{font-size:13px;color:#999;white-space:nowrap}
/* 切换按钮 */
.calc-toggle{display:flex;border-radius:6px;overflow:hidden;border:1px solid #d9d9d9;flex:1}
.calc-toggle button{padding:7px 18px;border:none;background:#fff;color:#888;font-size:13px;cursor:pointer;font-family:inherit;transition:all .2s;flex:1;text-align:center;white-space:nowrap}
.calc-toggle button.active{background:#1989fa;color:#fff}
.calc-toggle button:disabled{background:#f5f5f5;color:#ccc;cursor:not-allowed}
/* 利润 + 反向 + 批量 三列并排 */
.calc-profit-wrap{display:flex;gap:12px}
.calc-profit-left{flex:1;min-width:0}
.calc-profit-mid{flex:0 0 auto;min-width:160px;background:#fafafa;border-radius:10px;padding:10px 14px;border:1px solid #f0f0f0}
.calc-profit-mid .calc-row{margin-bottom:4px}
.calc-profit-mid .calc-row label{min-width:50px}
.calc-profit-right{flex:0 0 auto;min-width:180px;background:#fafafa;border-radius:10px;padding:10px 14px;border:1px solid #f0f0f0}
.calc-profit-right .calc-row{margin-bottom:6px}
.calc-profit-right .calc-row label{min-width:36px}
.calc-reverse-info{font-size:12px;color:#1989fa;margin-top:2px}
.calc-reverse-info b{font-size:15px}
/* 利润快捷按钮 */
.calc-profit-btns{display:flex;gap:5px;flex-wrap:wrap}
.calc-pbtn{padding:4px 10px;border-radius:6px;border:1px solid #d9d9d9;background:#fff;color:#888;font-size:12px;cursor:pointer;font-family:inherit;transition:all .15s}
.calc-pbtn:hover{border-color:#1989fa;color:#1989fa}
.calc-pbtn.active{background:#1989fa;color:#fff;border-color:#1989fa}
/* 批量计算结果 */
.calc-batch-info{margin-top:6px}
.calc-batch-row{font-size:12px;color:#888;padding:3px 0;display:flex;align-items:center;gap:6px}
.calc-batch-row b{color:#323233;font-size:14px;font-family:'SF Mono','Consolas',monospace}
.calc-batch-row b.cr-profit{color:#2e7d32}
.calc-batch-row.batch-commission b{color:#e6a23c}
.batch-note{font-size:10px;color:#bbb}
.calc-batch-placeholder{font-size:11px;color:#ccc;margin-top:4px}
/* 结果大框 */
.calc-result-box{background:linear-gradient(135deg,#f0f6ff,#e8f5e9);border-radius:12px;padding:16px 18px;border:1px solid #dceeff}
.calc-result-empty{text-align:center;padding:24px;color:#bbb;font-size:13px;background:#fafafa;border-radius:10px}
.cr-final-label{font-size:12px;color:#999;margin-bottom:4px}
.cr-final-price{font-size:32px;font-weight:800;color:#0d47a1;font-family:'SF Mono','Consolas',monospace;margin-bottom:12px;letter-spacing:1px}
.cr-row{display:flex;align-items:center;justify-content:space-between;padding:5px 0;font-size:13px}
.cr-row+.cr-row{border-top:1px solid rgba(0,0,0,.05)}
.cr-row-label{color:#888}
.cr-row-val{font-weight:600;color:#323233;display:flex;align-items:center;gap:6px}
.cr-row-val.cr-profit{color:#2e7d32}
.cr-row-val.cr-usd{color:#1565c0}
.cr-row-usd{border-top:1px dashed rgba(0,0,0,.1)!important;margin-top:4px;padding-top:8px!important}
.cr-badge{font-size:11px;padding:1px 6px;border-radius:4px;font-weight:600}
.cr-badge.badge-up{background:#c8e6c9;color:#2e7d32}
.cr-badge.badge-down{background:#ffcdd2;color:#c62828}
.cr-copy{padding:3px 10px;border-radius:4px;font-size:11px;cursor:pointer;border:1px solid #d9d9d9;background:#fff;color:#666;font-family:inherit;white-space:nowrap;flex-shrink:0}
.cr-copy:hover{color:#1989fa;border-color:#1989fa}
/* 重置按钮 */
.calc-actions{margin-top:4px;text-align:center}
.calc-reset-btn{padding:8px 28px;border-radius:8px;border:1px solid #d9d9d9;background:#fff;color:#888;font-size:13px;cursor:pointer;font-family:inherit;transition:all .15s}
.calc-reset-btn:hover{color:#1989fa;border-color:#1989fa;background:#f5f8ff}
/* 高级筛选 */
.adv-btn{background:#f0f6ff;color:#1989fa;border-color:#b3d8f5}
.adv-btn:hover{background:#dceeff}
/* 系统设置 */
.set-wrap{padding:20px 24px 24px}
.set-wrap h3{font-size:18px;font-weight:600;margin:0 0 12px}
.set-wrap :deep(.van-field){padding:10px 0}
.set-hint{font-size:11px;color:#999;margin-top:12px;line-height:1.6}
.set-divider{height:1px;background:#f0f0f0;margin:16px 0}
.set-wrap h4{font-size:14px;font-weight:600;margin:0 0 8px;color:#555}
.update-area{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.update-btn{display:inline-flex;align-items:center;gap:6px;padding:8px 16px;border-radius:6px;border:1px solid #d9d9d9;font-size:13px;cursor:pointer;font-family:inherit;transition:all .2s;background:#f5f6f8;color:#666}
.update-btn:hover{border-color:#1989fa;color:#1989fa}
.update-btn:disabled{opacity:.6;cursor:not-allowed}
.update-btn.available{background:#fff3e0;border-color:#ffa726;color:#e65100}
.update-btn.available:hover{background:#ffe0b2}
.update-btn.downloading{background:#e3f2fd;border-color:#42a5f5;color:#1565c0}
.update-btn.downloaded{background:#e8f5e9;border-color:#66bb6a;color:#2e7d32}
.update-btn.error{background:#ffebee;border-color:#ef5350;color:#c62828}
.update-btn.latest{background:#f5f6f8;border-color:#d9d9d9;color:#999;cursor:default}
.update-btn.latest:hover{border-color:#d9d9d9;color:#999}
.update-icon{font-size:16px;line-height:1}
.update-pct{font-size:11px;color:#666}
.spec-edit-wrap{padding:16px 20px 20px;overflow-y:auto;height:100%}
.spec-edit-wrap h3{font-size:18px;font-weight:600;margin:0 0 4px}
.spec-edit-hint{font-size:11px;color:#e6a23c;margin:0 0 12px}
.adv-wrap{padding:20px 20px 24px;display:flex;flex-direction:column;height:100%}
.adv-title{font-size:18px;font-weight:600;margin:0 0 12px}
.adv-rows{flex:1;overflow-y:auto}
.adv-row{display:flex;align-items:center;gap:6px;margin-bottom:8px}
.adv-sel{padding:6px 8px;border-radius:6px;border:1px solid #e0e0e0;font-size:12px;color:#333;background:#fff;font-family:inherit;outline:none;min-width:80px}
.adv-sel:focus{border-color:#1989fa}
.adv-op{min-width:64px}
.adv-input{flex:1;padding:6px 10px;border-radius:6px;border:1px solid #e0e0e0;font-size:12px;font-family:inherit;outline:none;min-width:80px}
.adv-input:focus{border-color:#1989fa}
.adv-del{width:24px;height:24px;border-radius:50%;border:none;background:#fff0f0;color:#e53935;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.adv-add{padding:8px;border-radius:6px;border:1px dashed #d9d9d9;background:transparent;color:#1989fa;font-size:12px;cursor:pointer;font-family:inherit;margin-bottom:12px}
.adv-add:hover{border-color:#1989fa;background:#f0f6ff}
.adv-btns{display:flex;gap:10px}
.adv-reset{flex:1;padding:10px;border-radius:8px;border:1px solid #d9d9d9;background:#fff;color:#666;font-size:14px;cursor:pointer;font-family:inherit}
.adv-apply{flex:1;padding:10px;border-radius:8px;border:none;background:#1989fa;color:#fff;font-size:14px;cursor:pointer;font-family:inherit}
</style>
