# 🛑 停工快照（手写，非自动生成）

> 2026-10-15 收工 · **v1.0.229 已发版**（tag `v1.0.229` → 提交 `9f85ca7`；其后是文档提交，见 `git log`）
> 详细交接见 `handoff-v1.0.229.md`（本版）· `228`（公司资料主体）/ `227`（客户账期）/ `226`（数据安全）/ `225`（停留·看板·汇总）/ `224` / `223` / `222`

## ⏭️ 下个对话从这里接着干（最重要，先读这段）

**v1.0.229 公司资料补强**（祥哥追问「不能拖动或快捷粘贴吗、不支持各种图片格式吗」）：
- **整页拖拽**（亮「松手就传到 XX」遮罩、松手即传、拖到哪个 tab 归哪类）+ **Ctrl+V 粘贴截图**（document 级）
- 格式放宽：**HEIC/HEIF**（iPhone 照片）、**OFD**（电子发票）、**WPS 三件套**、tif/tiff
- ⚠️ **故意不收 svg/html**（同源打开会被脚本读走 token ⇒ XSS 跳板）；HEIC 可存但**不当图片预览**（会破图）
- 三条上传路径共用同一个 `uploadFiles`；真机 **23/23**

**v1.0.228 公司资料（开票资料库）**：入口三处（首页 nav「🏢 公司资料」· 客户物料页头「📄 开票资料」· 手机版 tabbar）；
存 `<数据目录>/公司资料/{客户|自己公司}/<归属名>/` + `company_docs` 表；自己公司开票字段在 `company_profiles`（多家抬头）。

**v1.0.227 客户账期**：客户物料页头显示「账期/对账付款时间/备注」，点它就地编辑；名册管理可批量维护。
结构化（每月对账日 + 账期天数，自动滚动）+ 手填具体日期（**优先**，过期会标红让更新）。

### 下次开工先问祥哥

1. **1.0.222~228 用起来怎么样**：客户名册清理、物料时间线、记事关联物料、停留/待跟进/看板/汇总、客户账期、公司资料
2. 开票资料要不要**接到报价单/对账单导出**（自动带开票资料页脚，一劳永逸）—— 他自己提过「客户会发图片/PDF」
3. 要不要把「公司资料」用到**客户资料齐全度**提示（缺税号/账号时提醒）

### 遗留清单

- 📌 **规格书翻译页的中文文件名乱码**（与公司资料同一根因，`translator.js:93`）—— 下次把 `fixFileName` 抽到共享 util 修掉。
- 📌 客户物料软删后界面不可见（当前 8 条）—— 祥哥 2026-10-15 明确「**不用做回收站**」，别再提议。
- ⚠️ **状态推进类数据自 2026-10-14 起才有**：月度汇总早的月份为空、看板初期「停留」多为估算（带 `*`），属正常。
- ⚠️ **Draft release** 累积（1.0.220~1.0.228）；要清**按 release id 删**，别用 `gh release delete <tag>`。
- ⚠️ 三个杀软（火绒 + 电脑管家 + Defender）是启动偶发慢的根子。
- 📌 **验证脚本别按进程名杀浏览器**：本会话清理无头 Chrome 时用过
  `Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | taskkill /F` —— 这会**误杀祥哥自己开着的浏览器**。
  正确做法：只杀**自己起的 PID**（用 `--user-data-dir=<临时目录>` 或 `--remote-debugging-port=9222` 区分），
  或直接 `Stop-Process -Id $自己记录的PID`。
- 📌 沙箱 Electron 起不来是**正常的**：`main.js` 有单实例锁，他的软件在跑时脚本起的实例会立刻退出
  （还会把他窗口弹前台）⇒ 验证统一走「独立服务端 + 无头 Chrome」（见上）。

**v1.0.223 全流程走完**：开发 ✅ 单测 ✅ 真机验证 ✅ 发版 ✅ 在线更新实测 ✅。本次两件事：

1. **物料进展**（祥哥要的「什么时候报价/送样/给规格书、价格怎么变」）
   - 新表 `material_events`：**只追加、永不覆盖**，按字段 diff 记录
     建档/状态流转/报价变化/成本价/规格书/编码/客户/工厂变更
   - `utils/materialTimeline.js` 聚合已有数据：报价记录 + **price_logs 的 828 条改价** +
     送样 + 规格书 + 自建流水；客户物料每行新增「⏱ 进展」按钮
   - **记事默认不进时间线**，只有被显式关联的才进
2. **记事关联物料**（祥哥要的「某物料下单多少、备货多少、哪个要送样」）
   - `notes.material_refs`：物料 + 动作（下单/备货/送样/报价/其它）+ 数量 + 单位，**带名称/料号快照**
   - 记事编辑页有选择器；记事详情显示标签；被关联的记事出现在对应物料的进展里、可点开

### 🔜 可做的下一步（待祥哥用完反馈）

- 他先用一段时间，看时间线的字段够不够（比如要不要「阶段停留时长」统计：「卡在送样 18 天」）
- 若要阶段看板 / 客户维度汇总（这个月报价几个、送样几个、下单几个），再开一版
- ⚠️ 提醒他：**状态流转的历史追不回来**（`material_events` 是本版才开始记的），
  刚装上时时间线里「状态流转」条目少是正常的

### 下次开工先问祥哥

1. **1.0.223 用起来怎么样**：时间线（⏱）看着够不够、记事的关联物料好不好用
2. 还缺什么展示（阶段停留时长 / 看板 / 汇总）

### 遗留清单

- ⚠️ **仓库里有多余 Draft release**（1.0.220~1.0.223 各一个，0 资产）：electron-builder
  读到 `publish` 配置自动建的草稿，只对所有者可见、不影响在线更新。要清请**按 release id 删**，
  别用 `gh release delete <tag>`（同 tag 会命中正式那条）。
- ⚠️ **三个杀软**（火绒 + 电脑管家 + Defender）是「偶尔启动很慢」的根子：
  196 次启动里 17 次超 30 秒、最慢 164 秒。建议只留一个 + 给程序/数据目录加白名单。
- 📌 生产备份（可自行删除）：`生产数据备份-2026-10-14`（340.63 MB）、
  `生产库备份-客户名清理前-20261014-112828.db`、`生产库备份-替换前副本-20261014-112907.db`
- 📌 **生产数据口径**：`data.db` md5 **每用一次软件都会变**（整库导出）。
  跨使用时改看：文件数 **1102**、报价记录 **516**、客户物料 **307**、名册 **137**。
- 📌 每次 `npm run package` 后记得 `git checkout -- dist-exe/latest.yml client/components.d.ts`
  （发版那次例外，latest.yml 要跟着更新并单独提交）。

---

## ✅ v1.0.222 发版结果（2026-10-14）

| 项 | 值 |
|---|---|
| tag → 提交 | `v1.0.222` → `02b1fa8` |
| 安装包 | `crystal-price-system-setup-1.0.222.exe` · 119,237,679 B |
| blockmap / latest.yml | 125,203 B / 378 B（sha512 与 size 与实传资产逐字节一致） |
| 在线更新实测 | 装着的 1.0.221 → 「发现新版本 v1.0.222」+ 工具栏红点 |
| 新增测试 | 后端 `tests/customer-manage.test.js` 7 条；真机 `verify-customer-registry-cdp.mjs` 14/14；后端全量 104 pass |

---

## 发版链路（本机已通，换机器照抄）

`npm run release -- 1.0.223` 一把梭（bump → 打包 → tag → push → 上传三样资产）。前置：

1. **GitHub 凭据**：`gh` 已装（winget）；token 在 Windows 凭据管理器里，脚本用 `gh auth token` 取。
2. **winCodeSign 缓存**（换机器必做，否则打包卡在符号链接）：
   `%LOCALAPPDATA%\electron-builder\Cache\winCodeSign\winCodeSign-2.6.0\`，
   用 `7za x -bd "-x!darwin"` 解压（详见 `handoff-v1.0.221.md` 第一节）。
3. **代理**：`$env:HTTP_PROXY="http://127.0.0.1:10808"; $env:HTTPS_PROXY="http://127.0.0.1:10808"`。

---

> v1.0.221 的交接见 `handoff-v1.0.221.md`；v1.0.220 见 `handoff-v1.0.220.md`。



### ✅ 已全部完成（上一版列的四步待办）

| 步骤 | 结果 |
|---|---|
| 备份祥哥数据 | ✅ `D:\dsh-workspace\晶振报价软件\生产数据备份-2026-10-14`（317 目录 / 1102 文件 / 340.63 MB；`data.db` md5 与源一致） |
| 装 `gh` CLI + 登录 | ✅ `gh` 已装（winget 用户级，在 `%LOCALAPPDATA%\Microsoft\WinGet\Packages\GitHub.cli_…\bin`）；**不需要 `gh auth login`** —— Windows 凭据管理器里有旧 token，脚本 `gh auth token` 直接取到 |
| `npm run release` | ✅ 一把梭跑通（bump → 打包 → tag → push → 上传三样） |
| 沙箱验「检查更新」 | ✅ 用装着的 **1.0.220** 实测：发现 1.0.221 → **差量下载 64%** → 下完 119,234,250 B（与线上资产逐字节一致）→ 页面「已下载完成 / 立即重启安装」+ 工具栏红点 |

> 打包卡点的完整根因与「换机器怎么补缓存」写在 `handoff-v1.0.221.md` 第一节；
> 发版脚本两处静默失败（`System.Web.HttpUtility`、`.ps1` 缺 BOM）也已修并入库。

### ⚠️ 打包的两个副作用（每次打包后都要还原）

`npm run package` 会**覆盖仓库里已跟踪的两个生成文件**：`dist-exe/latest.yml`（线上资产元数据）
和 `client/components.d.ts`（自动生成类型）。打完包执行：
```powershell
git checkout -- dist-exe/latest.yml client/components.d.ts
```
> 例外：**发版那次就该让它更新** —— 发版后单独提交一次「同步 latest.yml 元数据」（见 `92aa066` 那次的做法）。

### 网络（每次打包都要带代理）

GitHub 被墙，`npm run package` / 发版都要带：
```powershell
$env:HTTP_PROXY="http://127.0.0.1:10808"; $env:HTTPS_PROXY="http://127.0.0.1:10808"
```
本机 10808 端口实测在线；Electron 二进制（33.4.11）与 NSIS 工具本机缓存里已有。
注意 `ELECTRON_CACHE` 环境变量**不生效**（electron-builder 用自己的缓存目录结构）。

### 数据安全（已逐条查证，可放心）

祥哥最关心「更新会不会丢数据」。查了 `build/installer.nsh` + `electron/updater.js`：
- 更新走「运行新版安装包」，**不执行卸载器**；删数据那段（`RMDir /r`）只在**卸载**流程里
- `data-dir.txt` 已存在 ⇒ 安装器**跳过**改数据目录那步
- 数据在 `D:\software\晶振报价管理系统`，**不在程序安装目录内**
- 即便真跑卸载器：删前要在目标目录找到 `data.db`/`.crystal-marker`，两次确认**默认都是「否/保留」**

> 结论：**在线更新不会丢数据**。但仍建议先备份（第 1 步）。

---

> 2026-09-28 的 v1.0.220 已发版，那份交接见根目录 `handoff-v1.0.220.md`。

**停在哪**：v1.0.220 全流程走完——开发 ✅ 单测 ✅ 真机验证 ✅ 独立对抗复审 ✅ 发版 ✅。
无半截活。详细交接见根目录 `handoff-v1.0.220.md`。

**下次开工第一件事**：**问祥哥另一台电脑装 220 的结果**——
① 装完能正常打开吗？② 还卡启动动画的话，要 `logs\startup.log`。

**从哪读起**：`handoff-v1.0.220.md`（本次全记录）→ `PROGRESS.md` 头部（v1.0.220 段）。

**红线提醒**：跑 Electron 一律带 `DATA_DIR=<沙箱>`；启动后先查日志的 `Window bounds:`
确认开的是沙箱再动手。对照实验写纯 Node 单元探针，**不许**起真 Electron 凑对照。

**环境迁移（2026-10-13）**：项目开始**两地接力开发**（家里 F 盘 ↔ 公司电脑）。
- 搬迁一律用 `git clone`（实测 6.35 MB / 186 文件），**不要拷文件夹** —— 原目录 14.2 GB 里
  12.5 GB 是 `dist-exe/` 堆积的 107 个历史安装包，已清理，只留 v1.0.220 全套。
- 本文件等接力笔记**已纳入 git**（commit `7ef2044`），换电脑 `git pull` 即可拿到；
  本机配置（`settings*.json` / `startup-status.json` / `local/`）仍不入库。
- **公司电脑落地三步**：① `npm install`（根 + server + client 三处）② `npm run build`
  ③ 配数据目录 —— 生产数据在本机 `G:\Users\Documents\晶振报价管理系统`，**不在仓库里**，需单独搬或重配 `dataDir`。
- **一处要改**：`.claude/settings.json` 的 hook 写死了 `C:/Users/Administrator/.claude/hooks/reminder-filter.sh`，
  公司电脑用户名不同就得改（其余配置无 `.env`，不丢东西）。
  > 补记：本机 `settings.json` 根本不在（`.claude/*` 默认不入库），这条只在家里那台适用。

---

## ✅ 公司电脑落地完成（2026-10-13 实测）· 详见 `docs/公司电脑接力开发-落地记录.md`

**上面第 ③ 条写错了，以这里为准**：本机生产数据**不在** `G:\...`（本机没有 G 盘），而是：

- **生产数据目录 = `D:\software\晶振报价管理系统`**（1101 文件 / 340.6 MB，祥哥**正在用**）
- 装机版 exe 也在 `D:\software\crystal-price-system\`，其 `%APPDATA%` 配置的 `dataDir` 指向上面这个目录
- **这台机器同时是开发机和一台在用生产机 → 开发调试绝不能碰那个目录**

**生产库基线指纹**（每次验证后核对）：`data.db` md5 = `9F76631CCDFA01203FFA3BF3673F33FC`，文件数 1101。
指纹文件在仓库外：`D:\dsh-workspace\晶振报价软件\dev-data\生产库基线指纹.txt`

**两个依赖坑（换电脑必复现，都已解决）**：
1. `better-sqlite3` —— 从 v1.0.13 起就没被 import 过的废弃依赖，却要编译 C++，导致 server 依赖**全部装不上**。
   已从 `server/package.json` 删除，删后 `npm install` 干净通过。
2. Electron 二进制**静默解压失败**（`install.js` 退出 0 但 `dist` 只有一个 LICENSE）。
   已从本机缓存 zip 手动解压 + 补 `path.txt` 解决，`electron --version` = v33.4.11。

**新的起法（一律走沙箱）**：
```powershell
.\scripts\dev-sandbox.ps1 server    # 后端
.\scripts\dev-sandbox.ps1 app       # 完整 Electron 真机验证
```
脚本强制 `DATA_DIR=..\dev-data`，并带护栏：指向生产目录会**拒绝启动**（已实测退出码 1）。

**本机两个环境坑**：① `.ps1` 必须存 **UTF-8 with BOM**，否则 PowerShell 5.1 按 GBK 读中文→语法错；
② 本机存在 `ELECTRON_RUN_AS_NODE=1`，会让 electron.exe 退化成 Node 不弹窗口（脚本已清）。

**验证结论**：依赖安装 ✅ / 构建 ✅ 26.77s / 后端测试 81 pass ✅ / 前端 3 pass ✅ /
沙箱后端 ✅ / 沙箱 Electron 真机启动 ✅ / **生产库 md5 与文件数均未变 ✅**。

**待办（本机若要发版才需要）**：本机没装 `gh` CLI，`scripts\release.ps1` 靠 `gh auth token`
建 Release —— 要在这台机器发版需先装 gh 并 `gh auth login`。

---

## 🆕 未发版改动：客户物料「图片右键复制」（2026-10-13，已真机验证，**待发版**）

**背景**：祥哥反馈「客户物料里点开图片按钮，图片不能复制」。—— 浏览器内核自带的右键菜单
在图片上只有「图片另存为 / 在新标签页打开」，**没有「复制图片」**，不是代码写错。

**做法**（祥哥拍板：**只要「复制图片」一项**）：
- 新增 `client/src/components/ImageContextMenu.vue`（右键菜单组件）+ `client/src/utils/imageCopy.js`（取图转 PNG dataURL）
- `client/src/views/Materials.vue`：菜单挂到**两个**图片预览上（列表行的 📷、编辑弹窗里的）
- `electron/preload.cjs` + `electron/main.js`：新增 `image:copy`，用 `clipboard.writeImage(nativeImage)` 真正写进 Windows 剪贴板

**⚠️ 踩过的坑（改这块必看）**：第一版用「图片数组 + 当前下标」取 URL，**取到空串** ——
菜单能弹出来，但点复制报「复制失败：没有图片地址」。改成**直接从被右键的那个 `<img>` 读 `src`**：
更可靠，且左右滑动切图后天然正确。**别再改回按下标取。**

**验证证据**：
- 祥哥**亲手**右键→复制→粘贴到外部软件**成功**；日志 `image:copy 成功（image.png，1395x69）`
- 自动化回归 `tests/manual/verify-image-copy-cdp.mjs` **6/6 通过**（真实软件 + CDP，沙箱数据）
- **逐像素比对**：系统剪贴板里的图与页面上那张图 **1395x69、toBitmap() 逐字节一致**

**发版时**：这是纯功能新增、无数据迁移，不需要碰生产数据。

---

## 🆕 未发版改动：客户名做成全系统统一名册（2026-10-13，已真机验证，**待发版**）

**背景**：祥哥问「所有页面的公司名联想打通了吗」。审计发现**没打通**，而且比他举的 3 个页面更多：

- 客户名散在 **5 张表**：`customers`(名册) · `notes` · `map_customers` · `material_prices` · `customer_materials`
- **12 个读口**各读各的（客户物料读 5 表并集；记事只读 2 表；地图读自己；报价压根没联想）
- **9 个录入点**里只有 2 个会写名册（记事 Excel 导入、地图新建）
- 实测存量已经裂开：只在客户物料里有、记事/地图搜不到的 **16 个**；只在记事里有、客户物料下拉看不到的 **85 个**

**做法（方案 B，祥哥拍板「做全一点」）**：

1. 新增 `server/src/utils/customerNames.js` —— 唯一名册模块
   - 写：`upsertOne/upsertMany`（去重、跳过空名、只真有新增才落盘）
   - 回填：`syncFromAllTables()`（把 5 张表存量名字补进名册，幂等，**启动时自动跑一次**）
   - 读：`resolveSuggest/resolveSuggestWithMaterialMatch/listAll` —— 查询范围是「名册 ∪ 5 表活跃名」的**并集**，带各来源计数
2. 新增统一读口 `/api/customers/suggest`、`/api/customers/list`（`limit_as_list=1` 返回纯名字数组）
3. **9 个录入点全部补写名册**：物料新增/编辑/导入、报价新增/编辑/批量改规格、记事新增/编辑、地图新建/改名/导入
4. 前端 12 处接入（含**给报价记录新增了客户名联想** —— 那处从前是纯文本框）：
   `NoteForm` · `Notes` · `MapAddresses` · `AddRecord` · `MobileHome` · `TripPlan` · `Materials`
5. **修掉两处隐藏 bug**：`Notes.vue` / `MapAddresses.vue` 原来写 `r.data?.data`，而 `api.js` 拦截器
   已经 `return res.data` ⇒ **多取一层恒为 undefined，联想其实一直是哑的**

**⚠️ 坑（改这块必看）**：`api.js` 的响应拦截器 `return res.data`，所以拿到的是**响应体**，
候选在 `r.data` 而**不是** `r.data.data`。新代码别再写两层。

**⚠️ 另一个坑（害我查了很久）**：改完前端必须**重启软件**才看得到效果 ——
只 `Page.reload` 不行，Chromium 会继续用缓存的旧 bundle（实测服务已下发新 `index-XXXX.js`，
但页面仍执行旧脚本，表现为「代码明明改了却没生效」）。

**验证证据**：
- 后端集成测试 `tests/customer-names.test.js` **9/9**（断言：在任一模块新建的客户，其余所有入口都能搜到 + 回填 + 幂等 + 归一）
- 前端真机 `tests/manual/verify-unified-customers-cdp.mjs` **4/4**（记事下拉、报价联想、统一接口带计数、客户物料下拉含无物料客户）
- 全量：后端 **90** + 前端 **3** 全绿
- 存量效果：客户物料下拉从 52 → **149 个**（把别处录过的名字都纳入了），其中 98 个是「无物料」客户

**护栏（防再次误测生产）**：`scripts/dev-sandbox.ps1` 新增**端口占用检查** ——
3266 被非本沙箱进程占用时**拒绝启动**并提示。
> 起因：2026-10-13 我跑「沙箱实证」时没确认端口归属，而装机版正开着占着 3266，
> 请求全打到正式软件上，往生产库写了 2 条测试记录（已删除、扫描确认零残留，
> 但 `data.db` md5 因此变了：`9F76631C…` → `3709341197…`）。
> **教训：跑验证前先确认端口属于谁，别假设。**

---

# 技术债务清单

> 自动追踪自 2026-08-17

- [ ] `F:\summer\vs-code\crystal-price-system\server\src\db.js:164` — status          TEXT DEFAULT 'todo',
- [ ] `F:\summer\vs-code\crystal-price-system\server\src\index.js:328` — const r = execute(`UPDATE notes SET status = 'todo' WHERE status = 'in_progress' AND is_deleted = 0`)
- [ ] `F:\summer\vs-code\crystal-price-system\server\src\utils\archiveSync.js:404` — const STATUS_TEXT = { todo: '待办', done: '已完成', follow_up: '跟进后续' }
- [ ] `F:\summer\vs-code\crystal-price-system\server\src\utils\export.js:180` — const statusMap = { todo: '待办', done: '已完成', follow_up: '跟进后续' }
- [ ] `F:\summer\vs-code\crystal-price-system\server\src\utils\export.js:219` — const statusMap = { todo: '待办', done: '已完成', follow_up: '跟进后续' }
- [ ] `F:\summer\vs-code\crystal-price-system\server\src\utils\archiveSync.js:394` — const STATUS_TEXT = { todo: '待办', done: '已完成', follow_up: '跟进后续' }
- [ ] `F:\summer\vs-code\crystal-price-system\server\src\utils\export.js:181` — const statusMap = { todo: '待办', done: '已完成', follow_up: '跟进后续' }
- [ ] `F:\summer\vs-code\crystal-price-system\server\src\utils\export.js:220` — const statusMap = { todo: '待办', done: '已完成', follow_up: '跟进后续' }
- [ ] `F:\summer\vs-code\crystal-price-system\server\src\utils\export.js:178` — const statusMap = { todo: '待办', done: '已完成', follow_up: '跟进后续' }
- [ ] `F:\summer\vs-code\crystal-price-system\server\src\utils\export.js:217` — const statusMap = { todo: '待办', done: '已完成', follow_up: '跟进后续' }
- [ ] `F:\summer\vs-code\crystal-price-system\client\src\views\NoteForm.vue:164` — const statusLabel = computed(() => ({ todo: '待办', done: '已完成', follow_up: '跟进后续' })[form.status] || '待办')
- [ ] `F:\summer\vs-code\crystal-price-system\client\src\views\NoteDetail.vue:51` — {{ {todo:'待办',done:'已完成',follow_up:'跟进后续'}[note.status] || '待办' }}
- [ ] `F:\summer\vs-code\crystal-price-system\client\src\views\NoteDetail.vue:78` — {{ {todo:'待办',done:'已完成',follow_up:'跟进后续'}[u.status] || '' }}
- [ ] `F:\summer\vs-code\crystal-price-system\server\src\utils\export.js:185` — const statusMap = { todo: '待办', done: '已完成', follow_up: '跟进后续' }
- [ ] `F:\summer\vs-code\crystal-price-system\server\src\utils\export.js:224` — const statusMap = { todo: '待办', done: '已完成', follow_up: '跟进后续' }
- [ ] `F:\summer\vs-code\crystal-price-system\server\src\utils\export.js:187` — const statusMap = { todo: '待办', done: '已完成', follow_up: '跟进后续' }
- [ ] `F:\summer\vs-code\crystal-price-system\server\src\utils\export.js:226` — const statusMap = { todo: '待办', done: '已完成', follow_up: '跟进后续' }
- [ ] `F:\summer\vs-code\crystal-price-system\server\src\utils\archiveSync.js:409` — const STATUS_TEXT = { todo: '待办', done: '已完成', follow_up: '跟进后续' }
- [ ] `F:\summer\vs-code\crystal-price-system\server\src\utils\archiveSync.js:416` — const STATUS_TEXT = { todo: '待办', done: '已完成', follow_up: '跟进后续' }
- [ ] `F:\summer\vs-code\crystal-price-system\server\src\utils\archiveSync.js:435` — const STATUS_TEXT = { todo: '待办', done: '已完成', follow_up: '跟进后续' }
- [ ] `F:\summer\vs-code\crystal-price-system\server\src\utils\archiveSync.js:438` — const STATUS_TEXT = { todo: '待办', done: '已完成', follow_up: '跟进后续' }
- [ ] `F:\summer\vs-code\crystal-price-system\server\src\utils\archiveSync.js:439` — const STATUS_TEXT = { todo: '待办', done: '已完成', follow_up: '跟进后续' }
- [ ] `F:\summer\vs-code\crystal-price-system\server\src\utils\archiveSync.js:440` — const STATUS_TEXT = { todo: '待办', done: '已完成', follow_up: '跟进后续' }
- [ ] `F:\summer\vs-code\crystal-price-system\server\src\utils\archiveSync.js:452` — const STATUS_TEXT = { todo: '待办', done: '已完成', follow_up: '跟进后续' }
- [ ] `F:\summer\vs-code\crystal-price-system\server\src\utils\archiveSync.js:464` — const STATUS_TEXT = { todo: '待办', done: '已完成', follow_up: '跟进后续' }
- [ ] `F:\summer\vs-code\crystal-price-system\server\src\utils\archiveSync.js:467` — const STATUS_TEXT = { todo: '待办', done: '已完成', follow_up: '跟进后续' }
- [ ] `F:\summer\vs-code\crystal-price-system\server\src\utils\archiveSync.js:468` — const STATUS_TEXT = { todo: '待办', done: '已完成', follow_up: '跟进后续' }
- [ ] `F:\summer\vs-code\crystal-price-system\server\src\utils\archiveSync.js:469` — const STATUS_TEXT = { todo: '待办', done: '已完成', follow_up: '跟进后续' }
- [ ] `F:\summer\vs-code\crystal-price-system\server\src\utils\archiveSync.js:476` — const STATUS_TEXT = { todo: '待办', done: '已完成', follow_up: '跟进后续' }
- [ ] `F:\summer\vs-code\crystal-price-system\server\src\utils\archiveSync.js:478` — const STATUS_TEXT = { todo: '待办', done: '已完成', follow_up: '跟进后续' }
