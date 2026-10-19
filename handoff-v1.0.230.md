# 接力文档 v1.0.230

> 起因：祥哥发来「新增样品」的截图，说「这些页面填入都是要一个个手打，就不能联想选择输入吗，
> 效率更高一些吧？其它需要输入的页面能做成这样的，都可以做吧？」
> 本版把这个能力做成**通用组件 + 统一接口**，先接了两个最费手打的页面：
> **样品登记**（截图那一页，全字段）和**客户物料**（料号/工厂/客户料号）。
> 旧 tag: v1.0.229 · 本次 tag: v1.0.230

## 一句话

录入框点一下就出历史候选（按用得多的排前面），敲字自动过滤，↑↓ + Enter 或鼠标点选；
**选中已有料号会把名称/规格/频点等参数一次带出来**。也可以照旧手打新值，不被候选限制。

## 一、做了什么

### 1. 通用组件 `client/src/components/SuggestField.vue`

| 能力 | 说明 |
|---|---|
| 两种外观 | Vant 表单（`:label`）或原生 input（`plain` + `input-class`，给客户物料那种自定义表单用） |
| 出候选 | 聚焦即出；敲字按「完全相同 > 开头相同 > 包含」排序，命中字高亮 |
| 键盘 | ↑↓ 移动、Enter 选中、Esc 只关下拉、Tab 收起 |
| 触屏 | 候选行加高到 42px、字号 14px |
| 不裁剪 | 下拉 `<Teleport to="body">` + `position:fixed`，在 van-popup / 可滚动弹窗里也不会被切掉；贴底自动翻到上方 |
| 不强制 | 候选只是加速，手打新值照常保存（录新料号是第一需求） |
| 安全 | 候选来自数据库（用户数据），拼高亮前先 HTML 转义，单测钉住 |

### 2. 后端 `server/src/utils/suggest.js` + `/api/suggest`

| 接口 | 用途 |
|---|---|
| `GET /api/suggest/form?scope=samples\|materials[&customer=]` | 整张表单的候选（字段值 + 物料档案），打开表单拉一次，前端本地过滤（敲字零延迟、离线不卡） |
| `GET /api/suggest/field/:field?scope=&kw=&limit=` | 单字段历史值（按次数倒序） |
| `GET /api/suggest/codes?scope=&kw=` | 物料档案（料号 + 名称 + 规格 + 参数），选中后回填用 |

数据来源（都是「已经录过的」）：

- `material_prices`（报价）：品牌/尺寸/PIN/频点/负载/电压/模式/频偏/工厂 + 料号档案
- `material_samples`（样品）：同上
- `customer_materials`（客户物料）：料号（`jkx_code`/`material_code`）、名称、工厂、**客户自己的物料编码**

三个刻意的处理：

1. **白名单**：`scope` / `field` 先对照常量，所有表名列名都是代码里写死的，请求参数**从不拼进 SQL**；
   单测里有一条 `field=brand;DROP TABLE ...` 必须 400。
2. **TRIM**：真实数据里有「前后带空格」的值（手打/Excel 粘贴留下的）。候选统一 trim，
   不然会出现「看起来一样、选中却多一个空格」的两条。
3. **客户隔离**：客户物料编码是每个客户自己的一套，带了 `customer` 就只在这个客户里联想；
   前端还会用请求序号防「慢的旧请求覆盖新请求」。

### 3. 样品登记（截图那页）

- 12 个输入项接入联想：品牌、尺寸规格、PIN脚、频点、负载、电压、模式、频偏、物料编码、物料名称、规格、工厂。
- 候选里带「N 次」小字（用得多的在前），打开表单顶部有一行操作提示。
- **选已有料号 → 自动带出**名称/规格/品牌/尺寸/PIN/频点/负载/电压/模式/频偏/工厂（**只填空项**，不覆盖手改），
  并 toast「已带出该料号的 N 项参数」。

### 4. 客户物料

- 接入：客户物料编码（按当前客户）、晶科鑫料号、物料编码、工厂，以及「备选物料/工厂」每一行的料号与工厂。
- 选料号 → 带出物料名称/工厂（只填空项）。
- 料号很长，下拉给了 `drop-width=420`，不再把料号截断成 `6M34012000M12010...`。

## 二、验证（全部真跑）

- 后端：**167 pass**（新增 `tests/api-suggest.test.js` 18 条：跨表次数合并、软删除排除、关键字/limit、
  料号元数据、客户隔离、白名单/注入、`%` 按字面匹配、TRIM 合并）。
- 前端：**12 pass**（新增 `client/src/__tests__/suggest-field.spec.js` 9 条：聚焦出候选、
  大小写过滤、完全匹配优先、↑↓+Enter、Esc、手打新值、HTML 转义、点击选中）。
- 真机（headless Chrome + 沙箱服务端 3399，1386×893）：**27/27**，证据截图在仓库根目录：
  - `suggest-samples-brand.png`：品牌下拉（SJK 81 次在最前）
  - `suggest-samples-autofill.png`：选料号后 8 项参数自动带出
  - `suggest-materials-dropdown.png`：客户物料弹窗里的料号联想（不被裁剪、料号完整）
  - `suggest-materials-autofill.png`：选料号后带出物料名称
  - 还验了：下拉挂在 body、落在视口内、Esc 不会把新增弹窗一起关掉、提交后新记录进列表、
    客户物料编码只出当前客户的料号。
- **打包版（win-unpacked / asar）实跑 5/5**：`--remote-debugging-port` + CDP 连进打包版窗口，
  验证样品页能开、下拉出候选、SJK 在首位、选料号带出参数（截图 `suggest-packaged-app.png`）。
  启动日志确认 `DATA_DIR: D:\temp\suggest-verify\data`（沙箱）、`Window bounds` 正常；
  跑完核对生产配置：`user-config.json` 的 dataDir、`data-dir.txt`、生产 `data.db` md5
  （`39D1245F3482C0E120607C6CBA1D77DE`）三项全未变。
- 发版：`v1.0.230` → https://github.com/xiasummer740/crystal-price-system/releases/tag/v1.0.230
  （安装包 119281505 B / blockmap / latest.yml 三样齐全，`latest.yml` 的 sha512 与实际安装包逐字节核对一致，
  `releases/latest` 返回 v1.0.230）。

## 三、踩过的坑（下次别再踩）

1. **下拉不能留在原地**：样品表单在 `van-popup` 里、还带 `overflow-y:auto`，下拉留在组件内会被裁掉。
   必须 Teleport 到 body + fixed 定位（这也是为什么「客户物料」页以前的客户下拉没出事、而这里会出事）。
2. **受控组件别在 props 变化时自动弹层**：选完值会 emit 回 v-model，watcher 一弹就又打开了。
   本组件只在 focus/输入/点击时开，选完就关。
3. **别用「同一份候选」服务不同客户的字段**：客户物料编码必须带 customer 重新拉，
   且要防旧请求晚到覆盖（用序号）。
4. **只填空项**：自动带出如果把用户已经手改的值冲掉，比不带出更糟。

## 四、遗留 / 下次

- 报价录入（AddRecord）和记事（NoteForm）**本来就有**自己的联想下拉，这次没动 —— 它们是老实现
  （只有鼠标点选、没有键盘、下拉留在原地）。要统一成 `SuggestField` 的话是纯前端替换，
  风险中等，建议单独一版做，别和这次混。
- 其它输入页若也想接：只要在 `server/src/utils/suggest.js` 的 `FIELD_SOURCES` 里加一个 scope/字段，
  页面里把 `<input>` / `<van-field>` 换成 `<SuggestField>` 即可（客户资料抬头、行程客户名等都可以）。
- 📌 仍挂着：**「规格书翻译」页中文文件名乱码**（`translator.js:93`，`ISSUES.md` 里「⏳ 待修」那行）。
