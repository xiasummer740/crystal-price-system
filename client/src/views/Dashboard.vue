<template>
  <div class="app-wrap">
    <header class="topbar">
      <div class="topbar-left"><span class="logo-dot"></span><span class="logo-text">晶振报价系统</span><span class="version-badge">v{{ appVersion }}</span><span v-if="isDev" class="dev-badge">开发版</span></div>
      <!-- PC端导航按钮 -->
      <div class="topbar-right">
        <span class="clock-display" :title="clockDate">
          <span class="clock-dot"></span>{{ clockTime }}
        </span>
        <button class="nav-btn hide-mobile" style="margin-right:6px;background:#fff7e6;color:#d48806;border-color:#ffe58f;cursor:pointer" @click="openNotesWin">📝 记事</button>
        <button class="nav-btn hide-mobile" style="margin-right:6px;background:#e0f7fa;color:#00695c;border-color:#b2dfdb;cursor:pointer" @click="openMapWin">🗺️ 地图地址</button>
        <button class="nav-btn hide-mobile" style="margin-right:6px;background:#e8f5e9;color:#2e7d32;border-color:#c8e6c9;cursor:pointer" @click="openPerfWin">📊 绩效明细</button>
        <router-link to="/translator" class="nav-btn hide-mobile" style="margin-right:6px;background:#f0f6ff;color:#1565c0;border-color:#bbdefb">规格书翻译</router-link>
        <router-link to="/samples" class="nav-btn hide-mobile" style="margin-right:6px">样品登记</router-link>
        <router-link to="/trash" class="nav-btn hide-mobile" style="margin-right:6px;color:#e53935;border-color:#ffcdd2">回收站</router-link>
        <router-link to="/reports" class="nav-btn hide-mobile" style="background:#f9f0ff;color:#722ed1;border-color:#d3adf7">📊 汇报</router-link>
        <router-link to="/mobile" class="nav-btn hide-mobile">手机版</router-link>
        <button class="nav-btn hide-mobile" style="margin-left:6px;background:#f6ffed;color:#52c41a;border-color:#b7eb8f" @click="openDataFolder">📁 数据目录</button>
        <!-- 移动端汉堡菜单 -->
        <button class="mobile-menu-btn" @click="showMobileMenu = !showMobileMenu">
          <span class="menu-bar"></span>
          <span class="menu-bar"></span>
          <span class="menu-bar"></span>
        </button>
      </div>
      <!-- 移动端下拉菜单 -->
      <div class="mobile-dropdown" v-if="showMobileMenu">
        <div class="mobile-dropdown-backdrop" @click="showMobileMenu = false"></div>
        <div class="mobile-dropdown-panel">
          <button class="nav-btn mobile-nav-item" @click="showMobileMenu = false;openNotesWin()">📝 记事</button>
          <button class="nav-btn mobile-nav-item" @click="showMobileMenu = false;openMapWin()">🗺️ 地图地址</button>
          <button class="nav-btn mobile-nav-item" @click="showMobileMenu = false;openPerfWin()">📊 绩效明细</button>
          <router-link to="/translator" class="nav-btn mobile-nav-item" @click="showMobileMenu = false">规格书翻译</router-link>
          <router-link to="/samples" class="nav-btn mobile-nav-item" @click="showMobileMenu = false">样品登记</router-link>
          <router-link to="/trash" class="nav-btn mobile-nav-item" @click="showMobileMenu = false">回收站</router-link>
          <router-link to="/reports" class="nav-btn mobile-nav-item" @click="showMobileMenu = false">📊 汇报</router-link>
          <button class="nav-btn mobile-nav-item" @click="showMobileMenu = false;openDataFolder()">📁 数据目录</button>
        </div>
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
        <button class="tb-btn" @click="reload">⟳ 刷新</button>
        <button class="tb-btn" @click="downloadTemplate">模板</button>
        <button class="tb-btn" @click="handleExport">导出</button>
        <button class="tb-btn adv-btn" @click="showAdvFilter = true">高级筛选</button>
        <span class="settings-btn-wrap">
          <button class="tb-btn" @click="showSettings = true">⚙</button>
          <span v-if="hasUpdate" class="update-dot"></span>
        </span>
        <button class="tb-btn calc-btn" @click="showCalc = true">&#128290; 报价计算器</button>
        <SaveStatusBadge />
        <input ref="fileInput" type="file" accept=".xlsx,.xls" hidden @change="onFileChange" />
      </div>

      <!-- 筛选 + 统计 -->
      <div class="info-row">
        <div class="filter-group">
          <van-dropdown-menu active-color="var(--color-primary)">
            <van-dropdown-item v-model="store.filters.factory" :options="factoryOptions" :title="store.filters.factory || '工厂'" @change="reload" />
            <van-dropdown-item v-model="store.filters.quoter" :options="quoterOptions" :title="store.filters.quoter || '报价人'" @change="reload" />
            <van-dropdown-item v-model="store.filters.currency" :options="currencyOptions" :title="store.filters.currency || '币种'" @change="reload" />
            <van-dropdown-item v-model="store.filters.category" :options="catFilterOptions" :title="store.filters.category || '品类'" @change="reload" />
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

      <!-- 价格表格 -->
      <PriceTable
        :list="store.list"
        :total="store.total"
        :loading="store.loading"
        :page="store.filters.page"
        :pageSize="store.filters.pageSize"
        v-model:checkedIds="checkedIds"
        @showDetail="showDetail"
        @delete="handleDelete"
        @groupEdit="openGroupEdit"
        @pageChange="store.setFilter('page',$event);reload()"
        @pageSizeChange="store.setPageSize($event);reload()"
        @openColFilter="openColFilter"
      />

      <div class="lan-tip">手机端访问：同一 WiFi，浏览器访问 <strong>http://{{ localIp }}:3266</strong> ｜ <a href="/使用手册.html" target="_blank" style="color:var(--color-primary)">使用手册</a></div>
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
        <van-field v-model="settingsAmapKey" label="高德地图 Key" placeholder="留空则使用 OpenStreetMap" @update:model-value="saveSettingsDebounced">
          <template #extra><a href="https://console.amap.com/" target="_blank" style="color:var(--color-primary);font-size:11px">申请</a></template>
        </van-field>
        <van-field v-model="settingsAmapJscode" label="安全密钥" placeholder="jscode（选填）" @update:model-value="saveSettingsDebounced">
          <template #extra><a href="https://console.amap.com/" target="_blank" style="color:var(--color-primary);font-size:11px">查看</a></template>
        </van-field>
        <p class="set-hint" :style="{color: amapKeyStatus}">{{ amapKeyHint }}</p>
        <div class="set-divider"></div>
        <h4>版本升级</h4>
        <div class="update-area">
          <template v-if="updateStatus === 'idle' || updateStatus === 'not-available' || updateStatus === 'error'">
            <button class="update-btn" @click="onCheckUpdate">
              🔍 检查更新
            </button>
            <a v-if="updateStatus === 'error'" :href="'https://github.com/xiasummer740/crystal-price-system/releases/latest'" target="_blank" class="manual-link" @click.stop>⬇ 手动下载</a>
            <span class="update-status" v-if="updateStatus === 'not-available'">已是最新版本</span>
            <span class="update-status" v-if="updateStatus === 'error' && updateError" style="color:#e53935;font-size:12px;margin-top:4px">{{ updateError }}</span>
          </template>

          <template v-else-if="updateStatus === 'checking'">
            <button class="update-btn checking" disabled>⏳ 检查中...</button>
          </template>

          <template v-else-if="updateStatus === 'available'">
            <div class="update-info">发现新版本 v{{ updateVersion }}</div>
            <button class="update-btn" @click="onDownloadUpdate">⬇ 下载更新</button>
            <div v-if="releaseNotes" class="rn-wrap">
              <div class="rn-toggle" @click="showRn = !showRn">{{ showRn ? '▼' : '▶' }} 更新说明</div>
              <pre v-if="showRn" class="rn-body">{{ releaseNotes }}</pre>
            </div>
          </template>

          <template v-else-if="updateStatus === 'downloading'">
            <div class="dl-info">
              <span class="dl-icon">⏳</span>
              <span class="dl-status">下载中</span>
              <span v-if="downloadSpeed" class="dl-speed">{{ downloadSpeed }}</span>
            </div>
            <div class="dl-bar-wrap">
              <div class="dl-bar-fill" :style="{ width: (updatePercent > 0 ? updatePercent : 0) + '%' }"></div>
              <span class="dl-pct">{{ updatePercent > 0 ? updatePercent + '%' : '连接中...' }}</span>
            </div>
          </template>

          <template v-else-if="updateStatus === 'downloaded'">
            <button class="update-btn" @click="onInstall">⚡ 立即安装</button>
            <span class="update-status">下载完成，点击安装后应用将自动重启</span>
          </template>

          <template v-else-if="updateStatus === 'installing'">
            <button class="update-btn checking" disabled>⏳ 正在安装...</button>
          </template>

          </div>

        <div class="set-divider"></div>
        <h4>日志管理</h4>
        <div class="log-mgr-area">
          <button class="tb-btn" style="margin-bottom:8px" @click="openLogViewer">📋 查看日志</button>
          <p class="set-hint">日志文件按日期轮转，位于数据目录下的 logs 文件夹。</p>
        </div>
      </div>
    </van-popup>

    <!-- 日志查看器 -->
    <van-popup v-model:show="showLogViewer" round position="bottom" :style="{ height:'75%' }" closeable @closed="onLogViewerClose">
      <div class="log-viewer-wrap">
        <h3 style="margin:16px 20px 8px;font-size:16px">日志文件列表</h3>
        <div v-if="logsLoading" style="text-align:center;padding:40px 0;color:#999">加载中...</div>
        <div v-else-if="logsError" style="text-align:center;padding:40px 0;color:#e53935">{{ logsError }}</div>
        <div v-else-if="!logFiles.length" style="text-align:center;padding:40px 0;color:#999">暂无日志文件</div>
        <template v-else>
          <div class="log-file-list">
            <div v-for="f in logFiles" :key="f.name" class="log-file-item" :class="{ active: selectedLog === f.name }" @click="loadLogContent(f.name)">
              <div class="log-file-name">{{ f.name }}</div>
              <div class="log-file-meta">{{ formatSize(f.size) }} &middot; {{ formatTime(f.mtime) }}</div>
            </div>
          </div>
          <div class="log-actions">
            <button class="tb-btn" @click="refreshLogs" :disabled="logsLoading">🔄 刷新</button>
            <button class="tb-btn danger" @click="clearAllLogs">🗑 清空日志</button>
          </div>
          <!-- 日志内容 -->
          <div v-if="logContent" class="log-content-area">
            <div class="log-content-header">
              <span>{{ selectedLog }}</span>
              <span class="log-content-info">{{ logContent.total }} 行，显示最近 {{ logContent.showing }} 行</span>
              <a :href="`/api/logs/${selectedLog}/download`" class="log-download-link" download>下载</a>
            </div>
            <pre class="log-content">{{ logContent.content || '(空)' }}</pre>
          </div>
        </template>
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
        <!-- 以下参数字段带输入联想，从已有数据中匹配 -->
        <div class="sug-wrapper" v-for="f in specSugFields" :key="f.key">
          <van-field v-model="specEditForm[f.key]" :label="f.label" :placeholder="f.label"
            @focus="openSpecSug(f.key)" @input="filterSpecSug(f.key)" />
          <div class="sug-drop" v-if="activeSpecSug===f.key && (specSugFiltered[f.key]||[]).length">
            <div v-for="v in specSugFiltered[f.key]" :key="v" class="sug-item" @click="pickSpecSug(f.key,v)">{{ v }}</div>
          </div>
        </div>
        <van-field v-model="specEditForm.temperature" label="温度" readonly is-link placeholder="选择温度范围" @click="showSpecTempPicker=true" />
        <div class="spec-zone" style="margin-top:8px" @dragenter.prevent="specEditDragOver=true" @dragover.prevent="specEditDragOver=true" @dragleave.prevent="specEditDragOver=false" @drop.prevent="onSpecEditDrop" :class="{'drag-active':specEditDragOver}">
          <van-field v-model="specEditForm.spec_document" label="规格书" placeholder="粘贴链接 / 拖入文件 / 上传">
            <template #button>
              <van-button v-if="specEditForm.spec_document" size="small" type="danger" plain @click="specEditForm.spec_document=''">删除</van-button>
              <van-button size="small" type="primary" @click="specEditFileInput?.click()">上传</van-button>
            </template>
          </van-field>
          <input ref="specEditFileInput" type="file" hidden @change="onSpecEditUpload" />
        </div>
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
            <td @click.stop style="display:flex;gap:2px;flex-wrap:wrap">
              <router-link :to="'/edit/'+q.id" class="row-btn edit" style="font-size:9px">改</router-link>
              <button class="row-btn del" style="font-size:9px" @click.stop="deletePopupRecord(q)">删</button>
            </td>
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
            <span v-if="l.field_name!=='currency' && l.old_value && l.new_value" class="log-pct" :class="logPctClass(l)">{{ logPctText(l) }}</span>
          </div>
        </div>
      </div>
    </van-popup>
  </div>

</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { usePriceStore } from '../stores/price.js'
import { importExcel, http, saveSettings as saveSettingsApi, fetchSettings } from '../utils/api.js'
import { showToast, showConfirmDialog } from 'vant'
import SaveStatusBadge from '../components/SaveStatusBadge.vue'
import PriceTable from '../components/PriceTable.vue'

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
function openMapWin() {
  const isElectron = navigator.userAgent.indexOf('Electron') !== -1
  const win = window.open('/#/map-addresses?standalone=1', '_blank')
  // Electron: setWindowOpenHandler 拦截成功
  if (!win || win.closed) {
    if (!isElectron) router.push('/map-addresses')
  }
}
function openPerfWin() {
  const isElectron = navigator.userAgent.indexOf('Electron') !== -1
  const win = window.open('/#/performance?standalone=1', '_blank')
  if (!win || win.closed) {
    if (!isElectron) router.push('/performance')
  }
}
const showMobileMenu = ref(false)
const showPopup = ref(false)
const md = ref(null)
const checkedIds = ref([])
// 列筛选状态
const showColFilter = ref(false)
const colFilterCol = ref('')
const colFilterLabel = ref('')
const colFilterValues = ref([])
const colFilterKw = ref('')
const colFilterLoading = ref(false)
let colFilterTimer = null

const factoryCount = computed(() => new Set(store.list.map(r=>r.factory_code).filter(Boolean)).size)
const materialKinds = computed(() => new Set(store.list.map(r=>r.material_code)).size)
const hasFilter = computed(() => store.filters.factory||store.filters.quoter||store.filters.currency||store.filters.category||store.filters.startDate||store.filters.endDate||store.hasColumnFilters)
const factoryOptions = computed(() => [{text:'全部工厂',value:''},...store.metaOptions.factories.map(f=>({text:f,value:f}))])
const quoterOptions = computed(() => [{text:'全部报价人',value:''},...store.metaOptions.quoters.map(q=>({text:q,value:q}))])
const currencyOptions = [{text:'全部币种',value:''},{text:'人民币',value:'CNY'},{text:'美元',value:'USD'}]
const catFilterOptions = computed(() => { const cats=[...new Set([...store.metaOptions.categories||[], ...store.list.map(r=>r.category).filter(Boolean)])]; return [{text:'全部分类',value:''},...cats.map(c=>({text:c,value:c}))] })
function fmtPrice(val,cur) { if(val==null||val==='') return '-'; return (cur==='USD'?'$':'¥')+Number(val).toFixed(4) }
function fmtPriceWithCNY(val,cur) { if(val==null||val==='') return '-'; if(cur==='USD'){const fx=Number(localStorage.getItem('crystal_rate'))||7;return '¥'+(val*fx).toFixed(4)}return (cur==='USD'?'$':'¥')+Number(val).toFixed(4) }
function logPct(l) {
  if (l.field_name==='currency' || !l.old_value || !l.new_value) return null
  const oldV = parseFloat(l.old_value), newV = parseFloat(l.new_value)
  if (isNaN(oldV) || isNaN(newV) || oldV === 0) return null
  return (newV - oldV) / oldV * 100
}
function logPctText(l) { const p = logPct(l); if (p == null) return ''; return (p > 0 ? '↑' : '↓') + Math.abs(p).toFixed(2) + '%' }
function logPctClass(l) { const p = logPct(l); if (p == null) return ''; return p > 0 ? 'pct-up' : 'pct-down' }
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
async function batchDelete() { if(!checkedIds.value.length) return; try { const msg = `确定删除已选中的 ${checkedIds.value.length} 条记录？`; await showConfirmDialog({title:'批量删除',message:msg}); await http.post('/prices/batch-delete',{ids:checkedIds.value}); checkedIds.value=[]; showToast('已删除'); reload() } catch(e) { if (e?.message?.includes('cancel') || e === 'cancel') return; showToast('删除失败: '+(e.response?.data?.msg||e.message)) } }
function openGroupEdit(item){showDetail(item)}
// 编辑产品参数
const showSpecEdit = ref(false); const showSpecTempPicker = ref(false); const specSaving = ref(false)
const specEditForm = ref({material_code:'',material_name:'',material_spec:'',category:'',brand:'',dimension:'',pin_count:'',frequency:'',load_cap:'',voltage:'',mode:'',freq_tol:'',temperature:'',spec_document:''})
const specEditFileInput = ref(null)
const specEditDragOver = ref(false)
const specSource = ref({})
const tempOptions = [{text:'-20/70℃',value:'-20/70℃'},{text:'-40~85℃',value:'-40~85℃'},{text:'-40/105℃',value:'-40/105℃'},{text:'-40/125℃',value:'-40/125℃'},{text:'-55/150℃',value:'-55/150℃'}]
// 产品参数联想
const specSuggestions = ref({})
const specSugFiltered = ref({})
const activeSpecSug = ref(null)
const specSugFields = [
  { key:'category', label:'品类' }, { key:'brand', label:'品牌' },
  { key:'dimension', label:'尺寸' }, { key:'pin_count', label:'PIN脚' },
  { key:'frequency', label:'频点' }, { key:'load_cap', label:'负载' },
  { key:'voltage', label:'电压' }, { key:'mode', label:'模式' },
  { key:'freq_tol', label:'频偏' },
]
function openSpecSug(field) {
  activeSpecSug.value = field
  const val = (specEditForm.value[field] || '').toLowerCase()
  specSugFiltered.value[field] = (specSuggestions.value[field] || []).filter(v => v.toLowerCase().includes(val))
}
function filterSpecSug(field) {
  if (activeSpecSug.value !== field) return
  const val = (specEditForm.value[field] || '').toLowerCase()
  specSugFiltered.value[field] = (specSuggestions.value[field] || []).filter(v => v.toLowerCase().includes(val))
}
function pickSpecSug(field, val) {
  specEditForm.value[field] = val
  activeSpecSug.value = null
}
function onSpecSugClickOutside(e) {
  if (!e.target.closest('.sug-wrapper')) activeSpecSug.value = null
}
function onSpecEditDrop(e) { specEditDragOver.value=false; const file=e.dataTransfer?.files?.[0]; if(file) uploadSpecEditFile(file) }
async function onSpecEditUpload(e) { const file=e.target.files[0]; if(file) uploadSpecEditFile(file); specEditFileInput.value && (specEditFileInput.value.value='') }
async function uploadSpecEditFile(file) {
  const fd=new FormData(); fd.append('file',file)
  try { const r=await http.post('/upload-spec',fd); specEditForm.value.spec_document=r.data.url; showToast('上传成功') } catch { showToast('上传失败') }
}
function editGroupSpecs() {
  const fk = Object.keys(md.value.factories)[0]; const q = md.value.factories[fk]?.[0]
  if (!q) return; specSource.value = q
  const techs = ['material_code','material_name','material_spec','category','brand','dimension','pin_count','frequency','load_cap','voltage','mode','freq_tol','temperature','spec_document']
  techs.forEach(t => { specEditForm.value[t] = q[t] || '' })
  showSpecEdit.value = true
  // 加载参数字段联想列表
  http.get('/prices/form-suggestions').then(r => {
    if (r?.data) { specSuggestions.value = r.data; specSugFiltered.value = { ...r.data } }
  }).catch(() => {})
}
async function saveSpecs() {
  specSaving.value = true
  try { const r = await http.post('/prices/batch-update-specs', {...specEditForm.value, source: specSource.value}); showSpecEdit.value = false; showToast(r.msg || '保存成功'); reload(); setTimeout(() => showDetail(specEditForm.value), 400) }
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
async function deletePopupRecord(q) {
  try {
    await showConfirmDialog({title:'确认删除',message:`确定删除 ${(q.created_at||'').slice(0,10)} 的报价记录？\n含税价: ${fmtPrice(q.price_with_tax,q.currency)}`})
    await store.remove(q.id)
    showToast('已删除')
    // 从弹出数据中移除已删除的记录
    if (md.value) {
      for (const f of Object.keys(md.value.factories)) {
        const idx = md.value.factories[f].findIndex(r => r.id === q.id)
        if (idx >= 0) {
          md.value.factories[f].splice(idx, 1)
          md.value.total--
          break
        }
      }
    }
  } catch(e) {
    if(e==='cancel'||e?.message?.includes('cancel')) return
    showToast('删除失败:'+(e.response?.data?.msg||e.message))
  }
}
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
const settingsAmapKey = ref(localStorage.getItem('crystal_amap_key') || '')
const settingsAmapJscode = ref(localStorage.getItem('crystal_amap_jscode') || '')
function saveSettings() {
  localStorage.setItem('crystal_taxRate', settingsTaxRate.value)
  localStorage.setItem('crystal_rate', settingsFxRate.value)
  localStorage.setItem('crystal_amap_key', settingsAmapKey.value)
  localStorage.setItem('crystal_amap_jscode', settingsAmapJscode.value)
  // 同步到服务器，跨升级保留
  saveSettingsApi({ crystal_amap_key: settingsAmapKey.value, crystal_amap_jscode: settingsAmapJscode.value }).catch(() => {})
}
let saveTimer = null
function saveSettingsDebounced() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(saveSettings, 300)
}
const amapKeyStatus = computed(() => settingsAmapKey.value ? '#52c41a' : '#999')
const amapKeyHint = computed(() => settingsAmapKey.value
  ? '✅ Key 已保存，地图搜索将使用高德定位'
  : '填写高德地图 API Key 后，地图搜索和地址定位更精准（免费，5000次/天）。不填则使用 OpenStreetMap 定位。')
// 打开设置时重新加载值
watch(showSettings, (v) => { if (v) { settingsAmapKey.value = localStorage.getItem('crystal_amap_key') || ''; settingsAmapJscode.value = localStorage.getItem('crystal_amap_jscode') || '' } })

// 日志查看器
const showLogViewer = ref(false)
const logsLoading = ref(false)
const logsError = ref('')
const logFiles = ref([])
const selectedLog = ref('')
const logContent = ref(null)
async function fetchLogs() {
  logsLoading.value = true
  logsError.value = ''
  try {
    const res = await (await fetch('/api/logs')).json()
    if (res.code === 0) logFiles.value = res.data
    else logsError.value = res.msg || '加载失败'
  } catch (e) { logsError.value = '网络错误: ' + e.message }
  finally { logsLoading.value = false }
}
async function loadLogContent(name) {
  selectedLog.value = name
  logContent.value = null
  try {
    const res = await (await fetch(`/api/logs/${name}?lines=500`)).json()
    if (res.code === 0) logContent.value = res.data
  } catch (e) { /* ignore */ }
}
async function clearAllLogs() {
  if (!confirm('确定要清空所有日志文件吗？')) return
  try {
    const res = await (await fetch('/api/logs', { method: 'DELETE' })).json()
    if (res.code === 0) { logFiles.value = []; logContent.value = null; selectedLog.value = '' }
    alert(res.msg || '已清空')
  } catch (e) { alert('清空失败: ' + e.message) }
}
function refreshLogs() { fetchLogs() }
function openLogViewer() {
  showLogViewer.value = true
  logContent.value = null
  selectedLog.value = ''
  fetchLogs()
}
function onLogViewerClose() { logContent.value = null; selectedLog.value = '' }
function formatSize(bytes) {
  if (!bytes) return '0 B'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1024 / 1024).toFixed(1) + ' MB'
}
function formatTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// 在线升级（与 xnowpost 完全一致）
const updateStatus = ref('idle') // idle | checking | available | downloading | downloaded | installing | not-available | error
const updateVersion = ref('')
const updatePercent = ref(0)
const downloadSpeed = ref('')
const updateError = ref('')
const releaseNotes = ref('')
const showRn = ref(false)

function fmtSpeed(v) {
  if (!v || v <= 0) return ''
  return v > 1024 * 1024 ? (v / 1024 / 1024).toFixed(1) + 'MB/s'
    : v > 1024 ? Math.round(v / 1024) + 'KB/s'
    : Math.round(v) + 'B/s'
}

const hasUpdate = computed(() =>
  ['available', 'downloading', 'downloaded', 'installing'].includes(updateStatus.value)
)

// 检查更新
function onCheckUpdate() {
  if (updateStatus.value === 'checking') return
  updateStatus.value = 'checking'
  window.electronAPI?.checkUpdate?.()
  // 30s 超时兜底（国内访问 GitHub API 较慢）
  const checkTimer = setTimeout(() => {
    if (updateStatus.value === 'checking') {
      updateStatus.value = 'error'
      updateError.value = '检查超时，请检查网络后重试'
    }
  }, 30000)
  // 任何事件都能清除超时
  const clearTimer = () => clearTimeout(checkTimer)
  const unsubs = []
  if (window.electronAPI?.onUpdateAvailable) unsubs.push(window.electronAPI.onUpdateAvailable(clearTimer))
  if (window.electronAPI?.onUpdateNotAvailable) unsubs.push(window.electronAPI.onUpdateNotAvailable(clearTimer))
  if (window.electronAPI?.onUpdateError) unsubs.push(window.electronAPI.onUpdateError(clearTimer))
}

// 下载更新
function onDownloadUpdate() {
  updateStatus.value = 'downloading'
  window.electronAPI?.downloadUpdate?.()
}

// 立即安装
function onInstall() {
  updateStatus.value = 'installing'
  window.electronAPI?.installUpdate?.()
}

// 事件监听
if (window.electronAPI?.onUpdateAvailable) {
  window.electronAPI.onUpdateAvailable((info) => {
    updateStatus.value = 'available'
    if (info?.version) updateVersion.value = info.version
    if (info?.releaseNotes) releaseNotes.value = info.releaseNotes
  })
  window.electronAPI.onUpdateNotAvailable(() => {
    updateStatus.value = 'not-available'
  })
  window.electronAPI.onUpdateProgress((progress) => {
    updateStatus.value = 'downloading'
    if (progress?.percent !== undefined) updatePercent.value = progress.percent
    if (progress?.bytesPerSecond) downloadSpeed.value = fmtSpeed(progress.bytesPerSecond)
  })
  window.electronAPI.onUpdateDownloaded(() => {
    updateStatus.value = 'downloaded'
    updatePercent.value = 100
  })
  window.electronAPI.onUpdateError((err) => {
    updateStatus.value = 'error'
    updateError.value = err?.message || '检查失败'
  })
}

// 打开设置时重置状态（不自动检查，等用户点按钮）

// 暴露给主进程菜单
window.__checkUpdate = onCheckUpdate

onMounted(async () => {
  store.setFilter('page', 1)
  await store.loadMetaOptions()
  await store.loadGroupedList()
  localIp.value = window.electronAPI ? window.electronAPI.getLanIp() : (window.location.hostname || '127.0.0.1')
  // 启动后自动检查更新（小红点提示）
  setTimeout(() => { if (['idle'].includes(updateStatus.value)) onCheckUpdate() }, 8000)
  // 从服务器同步设置到 localStorage（跨升级保留）
  try {
    const r = await fetchSettings()
    const s = r.data || {}
    if (s.crystal_amap_key && !localStorage.getItem('crystal_amap_key')) localStorage.setItem('crystal_amap_key', s.crystal_amap_key)
    if (s.crystal_amap_jscode && !localStorage.getItem('crystal_amap_jscode')) localStorage.setItem('crystal_amap_jscode', s.crystal_amap_jscode)
  } catch {}
})
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
onMounted(() => { updateClock(); clockTimer = setInterval(updateClock, 1000); document.addEventListener('click', onSpecSugClickOutside) })
onUnmounted(() => { if (clockTimer) clearInterval(clockTimer); if (colFilterTimer) clearTimeout(colFilterTimer); if (searchTimer) clearTimeout(searchTimer); document.removeEventListener('click', onSpecSugClickOutside) })
</script>

<style scoped>
.app-wrap{display:flex;flex-direction:column;height:100vh;background:#f0f2f5}
.topbar{display:flex;align-items:center;justify-content:space-between;padding:0 20px;height:44px;background:linear-gradient(135deg,#e8f5e9 0%,#c8e6c9 100%);flex-shrink:0}
.topbar-left{display:flex;align-items:center;gap:8px}
.logo-dot{width:8px;height:8px;border-radius:50%;background:var(--color-primary)}
.logo-text{font-size:15px;font-weight:600;color:#323233;letter-spacing:.5px}
.topbar-right{display:flex;align-items:center}
.clock-display{display:inline-flex;align-items:center;gap:6px;margin-right:12px;padding:4px 12px;background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);color:#00ff88;font-family:'Consolas','Courier New',monospace;font-size:14px;font-weight:600;letter-spacing:1px;border-radius:4px;box-shadow:inset 0 0 8px rgba(0,255,136,0.15);user-select:none;cursor:default}
.clock-dot{width:6px;height:6px;border-radius:50%;background:#00ff88;box-shadow:0 0 6px #00ff88;animation:clockPulse 1s ease-in-out infinite}
@keyframes clockPulse{0%,100%{opacity:1}50%{opacity:0.3}}
.main-area{flex:1;overflow:auto;padding:16px 20px;display:flex;flex-direction:column}

/* 工具条 */
.toolbar{display:flex;align-items:center;gap:8px;margin-bottom:12px}
.search-box{display:flex;align-items:center;flex:1;max-width:360px;background:#fff;border:1px solid #e0e0e0;border-radius:8px;padding:0 12px;height:36px;transition:border-color .2s}
.search-box:focus-within{border-color:var(--color-primary);box-shadow:0 0 0 3px rgba(var(--color-primary-rgb),.1)}
.search-icon{flex-shrink:0;margin-right:6px}
.search-input{flex:1;border:none;outline:none;font-size:13px;color:#323233;background:transparent;font-family:inherit}
.search-input::placeholder{color:#bbb}
.search-clear{color:#bbb;cursor:pointer;font-size:14px;padding:2px;flex-shrink:0}
.search-clear:hover{color:#666}
.tb-btn{padding:6px 14px;border-radius:6px;font-size:12px;cursor:pointer;border:1px solid #d9d9d9;background:#fff;color:#555;font-family:inherit;white-space:nowrap;transition:all .15s}
.tb-btn:hover{color:var(--color-primary);border-color:var(--color-primary)}
.tb-btn.primary{background:var(--color-primary);color:#fff;border-color:var(--color-primary)}
.tb-btn.primary:hover{background:var(--color-primary-dark)}
.tb-btn.danger{background:#ee0a24;color:#fff;border-color:#ee0a24}
.tb-btn.danger:hover{background:#d40e1f}

/* 筛选 */
.info-row{display:flex;align-items:center;justify-content:space-between;background:#fff;padding:8px 16px;border-radius:8px;margin-bottom:10px;border:1px solid #e8e8e8;gap:12px}
.filter-group{display:flex;align-items:center;gap:6px;flex:1;min-width:0;overflow-x:auto}
.filter-group :deep(.van-dropdown-menu){display:flex;flex-shrink:0}
.filter-group :deep(.van-dropdown-menu__item){flex:0 0 auto;min-width:68px}
.filter-group :deep(.van-dropdown-menu__title){font-size:13px!important;padding:0 8px!important}
.fdiv{width:1px;height:20px;background:#e8e8e8;flex-shrink:0}
.date-field{width:135px;padding:0!important;font-size:12px;border:none!important;flex-shrink:0}
.date-field :deep(input){font-size:13px!important;padding:4px 8px!important}
.date-arrow{color:#bbb;font-size:14px;flex-shrink:0}
.reset-btn{padding:4px 12px;border-radius:4px;font-size:12px;cursor:pointer;border:1px solid #d9d9d9;background:#fff;color:#666;font-family:inherit;transition:all .15s;flex-shrink:0}
.reset-btn:hover{color:var(--color-primary);border-color:var(--color-primary)}
.stat-group{font-size:13px;color:#888;white-space:nowrap;flex-shrink:0}
.stat-group b{color:#323233;font-weight:600}
.stat-dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:#52c41a;margin-right:4px;vertical-align:middle}

.lan-tip{padding:8px;color:#ad8b00;font-size:11px;text-align:center}
.nav-btn{background:rgba(255,255,255,0.6);color:#555;border:1px solid rgba(0,0,0,0.1);border-radius:4px;padding:4px 10px;font-size:12px;cursor:pointer;font-family:inherit;text-decoration:none;display:inline-block;transition:all .15s}
.dev-badge{display:inline-block;padding:1px 6px;border-radius:3px;font-size:10px;font-weight:600;background:#ff6b35;color:#fff;margin-left:6px;line-height:1.4;vertical-align:middle}
.version-badge{display:inline-block;padding:1px 5px;border-radius:3px;font-size:10px;font-weight:500;background:#e8e8e8;color:#888;margin-left:6px;line-height:1.4;vertical-align:middle;user-select:none}
.nav-btn:hover{color:var(--color-primary);border-color:var(--color-primary)}
/* 汉堡菜单 */
.mobile-menu-btn{display:none;flex-direction:column;gap:3px;background:transparent;border:1px solid rgba(0,0,0,.1);border-radius:4px;padding:6px 7px;cursor:pointer;margin-left:4px;flex-shrink:0}
.menu-bar{display:block;width:16px;height:2px;background:#555;border-radius:1px}
.mobile-dropdown{display:none;position:absolute;top:100%;right:0;left:0;z-index:1000}
.mobile-dropdown-backdrop{position:fixed;inset:0;background:transparent;z-index:1}
.mobile-dropdown-panel{position:relative;z-index:2;margin:4px 8px;background:#fff;border:1px solid #e0e0e0;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.12);padding:6px}
.mobile-nav-item{display:block!important;width:100%;text-align:left;padding:10px 14px!important;margin:0!important;border:none!important;background:transparent!important;font-size:13px!important;color:#333!important;border-radius:6px}
.mobile-nav-item:hover{background:#f5f6f8!important;color:var(--color-primary)!important}
@media(max-width:768px){.mobile-menu-btn{display:flex}.mobile-dropdown{display:block}}
.pop-inner{padding:16px;overflow-y:auto;height:100%}
.pop-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
.pop-head h3{font-size:16px;margin:0}.pbadge{font-size:12px;color:#999;font-weight:400}
.fg{margin-bottom:12px}
.fh{font-weight:600;font-size:13px;padding:6px 10px;background:#fafafa;border-radius:4px;display:flex;align-items:center;gap:8px}
.fct{font-size:10px;background:var(--color-primary);color:#fff;padding:1px 6px;border-radius:8px}
.pop-code{color:#1565c0;cursor:pointer}.pop-code:hover{text-decoration:underline}
.mtw{border:1px solid #e8e8e8;border-radius:4px;overflow-x:auto}
.mt{width:100%;table-layout:fixed;border-collapse:collapse;font-size:10px}
.mt th{background:#fafafa;padding:4px 6px;border-bottom:1px solid #e8e8e8;font-size:10px;color:#888;overflow:hidden;text-overflow:ellipsis}
.mt td{padding:4px 6px;border-bottom:1px solid #f5f5f5;overflow:hidden;text-overflow:ellipsis}
.w-tm{width:68px}.w-pr{width:62px}.w-cu{width:34px}.w-ld{width:44px}.w-pk{width:44px}.w-qt{width:44px}.w-cs{width:52px}
.cr{cursor:pointer}.cr:hover td{background:rgba(var(--color-primary-rgb),.08)}
/* 价格变更日志 */
.log-section{margin-top:16px;padding-top:12px;border-top:2px solid #f0f0f0}
.log-title{font-size:13px;font-weight:600;color:#323233;margin-bottom:8px}
.log-item{display:flex;align-items:center;gap:8px;padding:4px 0;font-size:11px;color:#888}
.log-time{color:#bbb;min-width:100px}
.log-field{min-width:48px}
.log-old{color:#e53935;text-decoration:line-through;min-width:48px;text-align:right}
.log-arrow{color:#bbb}
.log-new{color:#52c41a;font-weight:600;min-width:48px}
.log-pct{font-size:10px;font-weight:600;min-width:56px}
.log-pct.pct-up{color:#e53935}
.log-pct.pct-down{color:#52c41a}
/* 列筛选 */
.col-filter{display:inline-block;color:#ccc;cursor:pointer;font-size:11px;margin-left:2px;padding:1px 3px;border-radius:2px;vertical-align:middle;position:relative;z-index:1}
.col-filter:hover{color:var(--color-primary);background:rgba(var(--color-primary-rgb),.08)}
.col-filter.active{color:var(--color-primary);font-weight:600}
.col-filter-tags{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:8px}
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
.calc-input:focus{border-color:var(--color-primary);box-shadow:0 0 0 3px rgba(var(--color-primary-rgb),.1)}
.calc-input.short{max-width:100px;flex:none}
.calc-unit{font-size:13px;color:#999;flex-shrink:0}
.calc-hint{font-size:12px;color:var(--color-primary);font-weight:500}
.calc-fx-label{font-size:13px;color:#999;white-space:nowrap}
/* 切换按钮 */
.calc-toggle{display:flex;border-radius:6px;overflow:hidden;border:1px solid #d9d9d9;flex:1}
.calc-toggle button{padding:7px 18px;border:none;background:#fff;color:#888;font-size:13px;cursor:pointer;font-family:inherit;transition:all .2s;flex:1;text-align:center;white-space:nowrap}
.calc-toggle button.active{background:var(--color-primary);color:#fff}
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
.calc-reverse-info{font-size:12px;color:var(--color-primary);margin-top:2px}
.calc-reverse-info b{font-size:15px}
/* 利润快捷按钮 */
.calc-profit-btns{display:flex;gap:5px;flex-wrap:wrap}
.calc-pbtn{padding:4px 10px;border-radius:6px;border:1px solid #d9d9d9;background:#fff;color:#888;font-size:12px;cursor:pointer;font-family:inherit;transition:all .15s}
.calc-pbtn:hover{border-color:var(--color-primary);color:var(--color-primary)}
.calc-pbtn.active{background:var(--color-primary);color:#fff;border-color:var(--color-primary)}
/* 批量计算结果 */
.calc-batch-info{margin-top:6px}
.calc-batch-row{font-size:12px;color:#888;padding:3px 0;display:flex;align-items:center;gap:6px}
.calc-batch-row b{color:#323233;font-size:14px;font-family:'SF Mono','Consolas',monospace}
.calc-batch-row b.cr-profit{color:#2e7d32}
.calc-batch-row.batch-commission b{color:#e6a23c}
.batch-note{font-size:10px;color:#bbb}
.calc-batch-placeholder{font-size:11px;color:#ccc;margin-top:4px}
/* 结果大框 */
.calc-result-box{background:linear-gradient(135deg,rgba(var(--color-primary-rgb),.04),#e8f5e9);border-radius:12px;padding:16px 18px;border:1px solid rgba(var(--color-primary-rgb),.06)}
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
.cr-copy:hover{color:var(--color-primary);border-color:var(--color-primary)}
/* 重置按钮 */
.calc-actions{margin-top:4px;text-align:center}
.calc-reset-btn{padding:8px 28px;border-radius:8px;border:1px solid #d9d9d9;background:#fff;color:#888;font-size:13px;cursor:pointer;font-family:inherit;transition:all .15s}
.calc-reset-btn:hover{color:var(--color-primary);border-color:var(--color-primary);background:#f5f8ff}
/* 高级筛选 */
.adv-btn{background:rgba(var(--color-primary-rgb),.06);color:var(--color-primary);border-color:rgba(var(--color-primary-rgb),.2)}
.adv-btn:hover{background:rgba(var(--color-primary-rgb),.12)}
/* 系统设置 */
.set-wrap{padding:20px 24px 24px}
.set-wrap h3{font-size:18px;font-weight:600;margin:0 0 12px}
.set-wrap :deep(.van-field){padding:10px 0}
.set-hint{font-size:11px;color:#999;margin-top:12px;line-height:1.6}
.set-divider{height:1px;background:#f0f0f0;margin:16px 0}
.set-wrap h4{font-size:14px;font-weight:600;margin:0 0 8px;color:#555}
.update-area{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.update-btn{display:inline-flex;align-items:center;gap:6px;padding:8px 16px;border-radius:6px;border:1px solid var(--color-primary);font-size:13px;cursor:pointer;font-family:inherit;transition:all .2s;background:#e8f4fd;color:var(--color-primary)}
.update-btn:hover{background:#d0ebfa}
.update-btn:disabled{opacity:.6;cursor:not-allowed}
.update-btn.checking{background:#f5f6f8;border-color:#d9d9d9;color:#999}
.update-btn-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.update-progress-wrap{display:flex;align-items:center;gap:10px;padding:4px 0}
.update-progress-wrap :deep(.van-progress){flex:1}
.update-pct{font-size:11px;color:#666;white-space:nowrap;min-width:36px;text-align:right}
@keyframes indeterminate{0%{left:-30%}100%{left:100%}}
.update-progress-bar-indeterminate{height:6px;border-radius:3px;background:#e8e8e8;overflow:hidden;flex:1;position:relative}
.update-progress-bar-indeterminate::after{content:'';position:absolute;top:0;left:-30%;height:100%;width:30%;border-radius:3px;background:linear-gradient(90deg,transparent,#1989fa,transparent);animation:indeterminate 1.5s ease-in-out infinite}
.update-status{font-size:12px;color:#666}
.manual-link{font-size:12px;color:var(--color-primary);text-decoration:none;padding:2px 8px;border-radius:4px;border:1px solid var(--color-primary)}
.manual-link:hover{background:var(--color-primary);color:#fff}
/* 设置按钮红点 badge */
.settings-btn-wrap{position:relative;display:inline-flex}
.update-dot{position:absolute;top:2px;right:0;width:8px;height:8px;border-radius:50%;background:#ff4d4f;border:2px solid #fff;box-shadow:0 0 3px rgba(255,77,79,.3);animation:dotPulse 2s infinite}
@keyframes dotPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.15)}}
.spec-edit-wrap{padding:16px 20px 20px;overflow-y:auto;height:100%}
.spec-edit-wrap h3{font-size:18px;font-weight:600;margin:0 0 4px}
.spec-edit-hint{font-size:11px;color:#e6a23c;margin:0 0 12px}
.spec-zone{border-radius:6px;transition:all .2s;border:2px solid transparent}
.spec-zone.drag-active{border-color:var(--color-primary);background:rgba(var(--color-primary-rgb),.04)}
/* 产品参数联想下拉 */
.sug-wrapper{position:relative}
.sug-drop{position:absolute;top:100%;left:0;right:0;background:#fff;border:1px solid #e8e8e8;border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,.1);z-index:999;max-height:180px;overflow-y:auto}
.sug-item{padding:8px 14px;font-size:13px;color:#323233;cursor:pointer;border-bottom:1px solid #f5f5f5}
.sug-item:last-child{border-bottom:none}
.sug-item:hover{background:rgba(var(--color-primary-rgb),.04);color:var(--color-primary)}
.adv-wrap{padding:20px 20px 24px;display:flex;flex-direction:column;height:100%}
.adv-title{font-size:18px;font-weight:600;margin:0 0 12px}
.adv-rows{flex:1;overflow-y:auto}
.adv-row{display:flex;align-items:center;gap:6px;margin-bottom:8px}
.adv-sel{padding:6px 8px;border-radius:6px;border:1px solid #e0e0e0;font-size:12px;color:#333;background:#fff;font-family:inherit;outline:none;min-width:80px}
.adv-sel:focus{border-color:var(--color-primary)}
.adv-op{min-width:64px}
.adv-input{flex:1;padding:6px 10px;border-radius:6px;border:1px solid #e0e0e0;font-size:12px;font-family:inherit;outline:none;min-width:80px}
.adv-input:focus{border-color:var(--color-primary)}
.adv-del{width:24px;height:24px;border-radius:50%;border:none;background:#fff0f0;color:#e53935;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.adv-add{padding:8px;border-radius:6px;border:1px dashed #d9d9d9;background:transparent;color:var(--color-primary);font-size:12px;cursor:pointer;font-family:inherit;margin-bottom:12px}
.adv-add:hover{border-color:var(--color-primary);background:rgba(var(--color-primary-rgb),.04)}
.adv-btns{display:flex;gap:10px}
.adv-reset{flex:1;padding:10px;border-radius:8px;border:1px solid #d9d9d9;background:#fff;color:#666;font-size:14px;cursor:pointer;font-family:inherit}
.adv-apply{flex:1;padding:10px;border-radius:8px;border:none;background:var(--color-primary);color:#fff;font-size:14px;cursor:pointer;font-family:inherit}
/* 日志管理 */
.log-mgr-area{padding:0 4px}
.log-viewer-wrap{height:100%;display:flex;flex-direction:column;overflow:hidden}
.log-file-list{flex:1;overflow-y:auto;margin:0 20px;border:1px solid #eee;border-radius:8px}
.log-file-item{display:flex;justify-content:space-between;align-items:center;padding:10px 12px;cursor:pointer;border-bottom:1px solid #f5f5f5;transition:background .15s}
.log-file-item:last-child{border-bottom:none}
.log-file-item:hover{background:#f9fbff}
.log-file-item.active{background:#e6f7ff;border-left:3px solid var(--color-primary)}
.log-file-name{font-size:13px;font-weight:500;color:#333}
.log-file-meta{font-size:11px;color:#999}
.log-actions{display:flex;gap:8px;padding:12px 20px}
.log-content-area{margin:12px 20px 20px;border:1px solid #eee;border-radius:8px;display:flex;flex-direction:column}
.log-content-header{display:flex;align-items:center;gap:12px;padding:8px 12px;background:#fafafa;border-bottom:1px solid #eee;font-size:12px;color:#666;flex-wrap:wrap}
.log-content-info{flex:1;text-align:right;color:#999}
.log-download-link{color:var(--color-primary);text-decoration:none;font-weight:500}
.log-download-link:hover{text-decoration:underline}
.log-content{flex:1;overflow-y:auto;padding:12px;font-size:11px;line-height:1.6;color:#333;background:#fcfcfc;margin:0;max-height:300px;white-space:pre-wrap;word-break:break-all;font-family:Consolas,'Courier New',monospace}


/* 更新说明 */
.rn-wrap{margin-top:6px;border:1px solid #e8e8e8;border-radius:6px;overflow:hidden}
.rn-toggle{padding:5px 8px;font-size:12px;cursor:pointer;background:#fafafa;user-select:none}
.rn-toggle:hover{background:#f0f0f0}
.rn-body{margin:0;padding:6px 8px;font-size:11px;line-height:1.6;color:#555;max-height:150px;overflow-y:auto;white-space:pre-wrap;word-break:break-word;background:#fff}

/* 下载进度动画 */
.dl-info{display:flex;align-items:center;gap:6px;margin-bottom:6px}
.dl-icon{font-size:16px}
.dl-status{font-size:13px;font-weight:500;color:#333}
.dl-speed{font-size:11px;color:#999;margin-left:auto}
.dl-bar-wrap{position:relative;height:20px;background:#f0f0f0;border-radius:10px;overflow:hidden}
.dl-bar-fill{height:100%;border-radius:10px;background:linear-gradient(90deg,#1989fa,#00d4ff,#1989fa);background-size:200% 100%;animation:dlShine 2s linear infinite;transition:width .3s ease}
@keyframes dlShine{0%{background-position:200% 0}100%{background-position:-200% 0}}
.dl-pct{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:11px;color:#666;font-weight:500}

/* ===== 移动端适配 ===== */
@media (max-width: 768px) {
  .app-wrap{overflow-x:hidden}
  .topbar{flex-wrap:wrap;padding:0 10px;height:auto;min-height:44px;gap:4px;position:relative}
  .topbar-right{flex-wrap:nowrap;gap:4px}
  .topbar-right .clock-display{display:none}
  .topbar-right .hide-mobile{display:none!important}
  .topbar-right .nav-btn{font-size:10px;padding:3px 6px;margin:0!important}
  .version-badge{font-size:8px;padding:0 4px}
  .dev-badge{font-size:8px;padding:0 4px}
  .topbar-left .logo-text{font-size:14px}
  .main-area{padding:10px 8px;overflow-x:hidden}

  /* 工具条 */
  .toolbar{flex-wrap:wrap;gap:6px;margin-bottom:8px}
  .search-box{max-width:100%;flex:1 1 100%;order:-1;margin-bottom:4px;height:40px}
  .tb-btn{padding:8px 12px;font-size:12px;flex-shrink:0}

  /* 筛选行 */
  .info-row{flex-wrap:wrap;gap:6px;padding:8px 10px}
  .filter-group{flex-wrap:wrap;gap:4px;overflow-x:visible}
  .filter-group :deep(.van-dropdown-menu__item){min-width:58px}
  .filter-group :deep(.van-dropdown-menu__title){font-size:11px!important;padding:0 5px!important}
  .date-field{width:auto;flex:1;min-width:80px}
  .date-field :deep(input){font-size:12px!important}
  .date-arrow{display:none}
  .fdiv{display:none}
  .stat-group{font-size:11px;white-space:normal}

  /* 列筛选标签 */
  .col-filter-tags{gap:4px}
  .cf-tag{font-size:10px;padding:2px 6px}
  .lan-tip{font-size:10px;padding:6px;word-break:break-all}

  /* 弹出层 - 报价详情表格 */
  .pop-inner{padding:12px}
  .pop-head{flex-wrap:wrap;gap:4px}
  .pop-head h3{font-size:14px}
  .mtw{overflow-x:auto;-webkit-overflow-scrolling:touch}
  .mt{font-size:9px;min-width:500px}
  .mt th,.mt td{padding:3px 4px;white-space:nowrap}
  .fg{margin-bottom:8px}
  .fh{font-size:12px;padding:4px 8px;flex-wrap:wrap}
  .pop-code{font-size:12px}
  .row-btn{padding:3px 6px;font-size:10px!important}

  /* 报价计算器 */
  .calc-wrap{padding:16px}
  .calc-title{font-size:16px}
  .calc-profit-wrap{flex-direction:column;gap:8px}
  .calc-profit-mid{min-width:0;flex:none}
  .calc-profit-right{min-width:0;flex:none}
  .calc-row{flex-wrap:wrap;gap:6px}
  .calc-row label{min-width:50px;font-size:12px}
  .calc-input{font-size:14px;padding:8px 10px}
  .calc-input.short{max-width:none;flex:1}
  .calc-toggle button{padding:6px 12px;font-size:12px}
  .calc-profit-btns{gap:4px}
  .calc-pbtn{padding:4px 8px;font-size:11px}
  .cr-final-price{font-size:24px}
  .cr-row{font-size:12px}

  /* 系统设置 */
  .set-wrap{padding:16px}
  .set-wrap h3{font-size:16px}
  .update-area{gap:6px}
  .update-btn{padding:6px 12px;font-size:12px}

  /* 高级筛选 */
  .adv-title{font-size:16px}
  .adv-row{flex-wrap:wrap;gap:4px}
  .adv-sel{min-width:60px;font-size:11px}
  .adv-input{min-width:60px;font-size:11px}

  /* 规格批量编辑 */
  .spec-edit-wrap{padding:12px}
  .spec-edit-wrap h3{font-size:16px}

  /* 日志查看器 */
  .log-file-item{padding:8px 10px;font-size:12px}
  .log-file-name{font-size:12px}
  .log-content-header{flex-wrap:wrap;gap:6px}
  .log-content{font-size:10px;padding:8px;max-height:200px}
  .log-actions{gap:4px;padding:8px 12px}
  .log-actions .tb-btn{font-size:11px;padding:6px 10px}

  /* 更新区域 */
  .set-divider{margin:12px 0}
  .rn-body{font-size:10px;max-height:120px}

  /* 价格变更日志 */
  .log-item{flex-wrap:wrap;gap:4px;font-size:10px}
  .log-time{min-width:70px}
}
</style>
