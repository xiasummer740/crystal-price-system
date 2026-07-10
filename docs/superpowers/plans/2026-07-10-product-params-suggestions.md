# 产品参数编辑 + 联想输入 + 参数/报价分离方案

> **For agentic workers:** 实现时使用 `superpowers:subagent-driven-development`
> 步骤采用 `- [ ]` 语法

**目标:** 为编辑产品参数弹窗添加输入联想选择，并设计参数修改与报价修改的分离方案

**架构:** 后端扩展 form-suggestions API 返回技术参数字段的去重值，前端 Dashboard.vue 的 spec edit 弹窗改用 sug-wrapper 下拉选择模式（复用 AddRecord.vue 现有模式）

**涉及文件:**
- `server/src/routes/prices.js` — 扩展 form-suggestions API
- `client/src/views/Dashboard.vue` — spec edit 弹窗添加联想下拉
- `client/src/views/AddRecord.vue` — 技术参数字段也加上联想（可选）

---

## Part A — 分离方案设计（祥哥请确认）

当前现状分析：

| 编辑入口 | 修改范围 | 包含字段 |
|---------|---------|---------|
| 报价弹窗「产品参数」按钮 | 同编码全部记录 | 仅技术参数（13个字段） |
| `/edit/:id` 编辑单条报价 | 仅本条记录 | 价格+参数全部字段 |
| 新增报价 `/add` | 新增记录 | 价格+参数全部字段 |

**问题:** 在 `/edit/:id` 里改了技术参数，只保存到当前记录，不会同步到其他同编码记录，导致同编码记录参数不一致。

### 推荐方案 A（最简单，改动最小）

保持现有编辑流程不变，只做 2 件事：
1. **产品参数弹窗**加联想输入（今天的活）
2. **技术参数 / 报价编辑的分离靠 UI 区分**：
   - 编辑单条记录时，在技术参数区域加黄底提示条：⚠️ 修改技术参数请使用「产品参数」按钮批量同步
   - 技术参数字段在编辑模式下变为 `readonly`，引导用户去弹窗统一修改

### 备选方案 B（更彻底）

**拆分 `/edit/:id` 为两步**：
1. 点击「改」默认只编辑价格信息（含税价、未税价、币种、工厂、报价人等）
2. 如果需要修改参数，点「✎ 同步修改参数」按钮 → 弹出产品参数编辑弹窗（batch-update）

**优点:** 完全杜绝不一致问题
**缺点:** 需要改 AddRecord.vue 的编辑逻辑，工作量略大

---

## Part B — 执行计划（联想输入）

### Task 1: 后端 — 扩展 form-suggestions API

**Files:**
- Modify: `server/src/routes/prices.js:126-132`

向 `GET /api/prices/form-suggestions` 响应中添加技术参数字段的去重值列表：

```javascript
// 在现有 categories/factories/quoters/leadTimes 后面追加
const brands = queryAll("SELECT DISTINCT brand FROM material_prices WHERE is_deleted = 0 AND brand != '' ORDER BY brand").map(r => r.brand)
const dimensions = queryAll("SELECT DISTINCT dimension FROM material_prices WHERE is_deleted = 0 AND dimension != '' ORDER BY dimension").map(r => r.dimension)
const pinCounts = queryAll("SELECT DISTINCT pin_count FROM material_prices WHERE is_deleted = 0 AND pin_count != '' ORDER BY pin_count").map(r => r.pin_count)
const frequencies = queryAll("SELECT DISTINCT frequency FROM material_prices WHERE is_deleted = 0 AND frequency != '' ORDER BY frequency").map(r => r.frequency)
const loadCaps = queryAll("SELECT DISTINCT load_cap FROM material_prices WHERE is_deleted = 0 AND load_cap != '' ORDER BY load_cap").map(r => r.load_cap)
const voltages = queryAll("SELECT DISTINCT voltage FROM material_prices WHERE is_deleted = 0 AND voltage != '' ORDER BY voltage").map(r => r.voltage)
const modes = queryAll("SELECT DISTINCT mode FROM material_prices WHERE is_deleted = 0 AND mode != '' ORDER BY mode").map(r => r.mode)
const freqTols = queryAll("SELECT DISTINCT freq_tol FROM material_prices WHERE is_deleted = 0 AND freq_tol != '' ORDER BY freq_tol").map(r => r.freq_tol)
const temperatures = queryAll("SELECT DISTINCT temperature FROM material_prices WHERE is_deleted = 0 AND temperature != '' ORDER BY temperature").map(r => r.temperature)

res.json({ code: 0, data: { categories, factories, quoters, leadTimes, brands, dimensions, pinCounts, frequencies, loadCaps, voltages, modes, freqTols, temperatures } })
```

**验证:** `curl http://localhost:3266/api/prices/form-suggestions | jq '.data | keys'` 应看到新字段名

### Task 2: 前端 — Dashboard.vue spec edit 弹窗添加联想下拉

**Files:**
- Modify: `client/src/views/Dashboard.vue` (~line 380-403)

将 spec edit 弹窗中每个 `van-field` 改为 `sug-wrapper` 模式（复用 AddRecord.vue 的现成模式）：

1. **在 script 中**: 添加 `specSuggestions` 和 `specSugFiltered` 响应式数据
2. **在 `editGroupSpecs()` 中**: 调用 `/prices/form-suggestions` 加载建议列表
3. **在 template 中**: 每个参数字段用 `sug-wrapper` 包裹，添加下拉浮层
4. 温度字段保持 picker 不变（已有选择器）

示例如下：

```vue
<!-- 改造前 -->
<van-field v-model="specEditForm.brand" label="品牌" placeholder="品牌" />

<!-- 改造后 -->
<div class="sug-wrapper">
  <van-field v-model="specEditForm.brand" label="品牌" placeholder="品牌" 
    @focus="openSpecSug('brand')" @input="filterSpecSug('brand')" />
  <div class="sug-drop" v-if="activeSpecSug==='brand' && specSugFiltered.brand.length">
    <div v-for="v in specSugFiltered.brand" :key="v" class="sug-item" @click="pickSpecSug('brand',v)">{{ v }}</div>
  </div>
</div>
```

script 部分：
```javascript
// 产品参数联想
const specSuggestions = ref({})
const specSugFiltered = ref({})
const activeSpecSug = ref(null)
const sugFields = ['category','brand','dimension','pin_count','frequency','load_cap','voltage','mode','freq_tol','temperature']

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
// 修改 editGroupSpecs 加载建议
async function editGroupSpecs() {
  // ...现有逻辑...
  // 追加加载建议列表
  try {
    const r = await http.get('/prices/form-suggestions')
    if (r?.data) {
      specSuggestions.value = r.data
      specSugFiltered.value = { ...r.data }
    }
  } catch {}
}
// 点击外部关闭
function onSpecSugClickOutside(e) {
  if (!e.target.closest('.sug-wrapper')) activeSpecSug.value = null
}
// 在 onMounted/onUnmounted 添加/移除监听
```

### Task 3: 前端 — AddRecord.vue 技术参数也加上联想（可选但推荐）

**Files:**
- Modify: `client/src/views/AddRecord.vue`

在 AddRecord.vue 中，品牌/尺寸/PIN脚/频点/负载/电压/模式/频偏 也加上 sug-wrapper 模式（品类已经有了）。

沿用现有的 `sugAll`/`sugFiltered` 机制，只需：
1. 扩展 `sugAll` 添加参数字段
2. 在 `loadSuggestions()` 中自动加载
3. 每个参数字段用 sug-wrapper 包裹

---

## 执行顺序

1. Task 1（后端 API 扩展）→ 验证
2. Task 2（Dashboard.vue spec edit 联想）→ 验证
3. Task 3（AddRecord.vue 技术参数联想）→ 验证（可选）

## 验证方法

1. `npm run dev` 启动开发环境
2. 打开报价弹窗 → 点击「产品参数」→ 点击各输入框应弹出联想下拉列表
3. 选择联想值应正确填入输入框
4. 保存后确认参数正确更新
