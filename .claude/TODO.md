# 🛑 停工快照（手写，非自动生成）

> 2026-10-14 续工 · 代码到 **2c44378**（与远端同步）· **打包卡点已解决**（本机实测 exit 0）
> 现在只差「发版 v1.0.221」这一步，步骤见下方「打包通了之后要做的」

## ⏭️ 下个对话从这里接着干（最重要，先读这段）

**代码全干完了、也全部推上 GitHub 了（远端 = 本地 = 2c44378）。打包环境也通了。唯一没做完的是「发版」。**

### ✅ 打包卡点已解决（2026-10-14 08:56 本机实测）

原报错：`ERROR: Cannot create symbolic link : 客户端没有所需的特权 …\winCodeSign\…\darwin\10.12\lib\libcrypto.dylib`

- **根因（已复现证实）**：electron-builder 把「下载+解压」委托给 Go 版 `app-builder.exe`，
  它**无条件**下 `winCodeSign` 工具包（版本 **2.6.0**，URL 实测为
  `https://github.com/electron-userland/electron-builder-binaries/releases/download/winCodeSign-2.6.0/winCodeSign-2.6.0.7z`），
  且解压时带 `-snl`（把符号链接建成真链接）⇒ 包内 2 个 macOS 软链
  （`darwin/10.12/lib/{libcrypto,libssl}.dylib`）建不出来 ⇒ `exit status 2` ⇒ 整包中止。
- 本机**未开**开发者模式（`AllowDevelopmentWithoutDevLicense` 缺失）、当前进程**非管理员**
  ⇒ 实测 `New-Item -ItemType SymbolicLink` 报「此操作需要管理员权限」。**这不是项目配置问题**：
  `sign:false` / `forceCodeSigning:false` 都**不能**阻止它下载该工具包。
- **采用的解法 = 路 B（缓存预置，已落地并验通）**：把该工具包**排除 darwin** 解压到
  electron-builder 期望的缓存目录 **`%LOCALAPPDATA%\electron-builder\Cache\winCodeSign\winCodeSign-2.6.0\`**
  （判据：`app-builder.exe download-artifact --name winCodeSign` 直接打印该路径且 **exit 0、不再下载**）。
  目录名必须是 `winCodeSign-2.6.0`（= 7z 的 basename）；**随机数字目录是失败残留，不认**。
  解压后应有 **58 个文件**：`rcedit-x64.exe`、`windows-10\{x64,ia32}\signtool.exe` 齐备、**无 `darwin`**。
  复现命令（换机器照抄）：
  ```powershell
  $repo="<repo>"; $cache="$env:LOCALAPPDATA\electron-builder\Cache\winCodeSign"
  $seven="$repo\node_modules\7zip-bin\win\x64\7za.exe"
  $arc=Get-ChildItem $cache -Filter *.7z | Select-Object -First 1   # 5.6MB，md5=06EA32242279AD33BABA1870CAA084D8
  & $seven x -bd "-x!darwin" $arc.FullName "-o$cache\winCodeSign-2.6.0"
  ```
  （`-x!darwin` 是关键。**注意 `-snl` 语义相反**——它是"把符号链接存为链接"，用了照样失败。）
- **实测结果**：`npm run package` **exit 0**，产出
  `dist-exe\crystal-price-system-setup-1.0.220.exe`（119,230,217 B）+ `.blockmap` + `latest.yml`；
  日志 `signing with signtool.exe … no signing info identified, signing is skipped`（跳过签名，符合预期）。
- **路 A 仍更干净（未做，可选）**：开 Windows「开发者模式」后不必预置缓存。本机 `admin` 在
  Administrators 组里（只是当前进程没提权），管理员 PowerShell：
  `reg add "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock" /t REG_DWORD /f /v AllowDevelopmentWithoutDevLicense /d 1`

### ⚠️ 打包的两个副作用（每次打包后都要还原）

`npm run package` 会**覆盖仓库里已跟踪的两个生成文件**，它们是「线上 v1.0.220 资产元数据」/「自动生成类型」，
不该被本地构建结果顶掉 —— 打完包后执行：
```powershell
git checkout -- dist-exe/latest.yml client/components.d.ts
```
（本次实测：`latest.yml` 被改成新构建的 sha512/size=119230217，与已发布的 120451155 不符；已还原。）

### 网络（已解决，每次打包都要带）

GitHub 被墙，`npm run package` 必须带代理环境变量：
```powershell
$env:HTTP_PROXY="http://127.0.0.1:10808"; $env:HTTPS_PROXY="http://127.0.0.1:10808"
```
本机 10808 端口实测**在线**；Electron 二进制（33.4.11）本机缓存里已有。
注意 `ELECTRON_CACHE` 环境变量**不生效**（electron-builder 用自己的缓存目录结构）。

### 打包通了之后要做的

1. **先备份祥哥的数据**：`D:\software\晶振报价管理系统` → 复制一份留底（340MB）
2. 装 `gh` CLI（`winget install GitHub.cli`）并 `gh auth login`（走手机设备码）
   —— `scripts/release.ps1` 靠 `gh auth token` 建 Release
3. `npm run release -- 1.0.221`（会：bump 版本 → 打包 → tag → push → 上传
   **安装包 / blockmap / latest.yml** 三样，缺一在线更新就会失败）
4. 在沙箱验证「检查更新」能发现 1.0.221

> 📌 现在 `dist-exe\` 里的 `crystal-price-system-setup-1.0.220.exe`（119,230,217 B）是
> **2026-10-14 08:56 的「打通打包」验证产物，不是一次发版**（版本号仍是 1.0.220，未 tag、未上传）。
> 其余两个待发版改动（图片右键复制、客户名统一名册）都还没进正式版本，发 1.0.221 时才带出去。

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
